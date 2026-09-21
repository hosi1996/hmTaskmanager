import { z } from 'zod';
import { prisma, redis } from '../../db.js';
import { config, mimeAllowed } from '../../config.js';
import { httpError, isOwner } from '../../lib/access.js';
import { saveBuffer } from '../../lib/files.js';
import { esc } from '../../lib/notify.js';
import { createTask } from '../tasks/service.js';
import { notify } from '../../lib/notify.js';

const getSetting = async (key, def) => (await prisma.setting.findUnique({ where: { key } }))?.value ?? def;

async function downloadTelegramFile(fileId) {
  const meta = await (await fetch(`https://api.telegram.org/bot${config.botToken}/getFile?file_id=${encodeURIComponent(fileId)}`)).json();
  if (!meta.ok) return null;
  if (meta.result.file_size > config.maxUploadBytes) return null;
  const r = await fetch(`https://api.telegram.org/file/bot${config.botToken}/${meta.result.file_path}`);
  return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
}

const ownerRow = () => prisma.user.findFirst({ where: { role: 'OWNER' }, orderBy: { createdAt: 'asc' } });

export default async function telegram(app) {
  // ═══════ API داخلی بات (فقط با x-bot-token؛ از nginx عبور داده نمی‌شود) ═══════
  app.get('/internal/bot/settings', async () => ({
    command: await getSetting('bot.command', 'task'),
    notifyBack: await getSetting('bot.notifyBack', true),
  }));

  app.post('/internal/bot/chat', async (req) => {
    const b = z.object({ chatId: z.union([z.string(), z.number()]).transform(String), title: z.string().default('بدون نام'), type: z.string().default('group'), active: z.boolean().default(true) }).parse(req.body);
    await prisma.telegramGroup.upsert({ where: { chatId: b.chatId }, update: { title: b.title, active: b.active }, create: b });
    return { ok: true };
  });

  app.post('/internal/bot/message', async (req) => {
    const b = z.object({
      chatId: z.union([z.string(), z.number()]).transform(String), messageId: z.union([z.string(), z.number()]).transform(String),
      fromId: z.union([z.string(), z.number()]).transform(String).optional(), fromName: z.string(),
      text: z.string().max(10000), replyToId: z.union([z.string(), z.number()]).transform(String).optional(),
    }).parse(req.body);
    const g = await prisma.telegramGroup.findUnique({ where: { chatId: b.chatId } });
    if (!g) return { ok: false };
    await prisma.telegramMessage.upsert({ where: { chatId_messageId: { chatId: b.chatId, messageId: b.messageId } }, update: { text: b.text }, create: b });
    return { ok: true };
  });

  // ساخت تسک از ریپلای + دستور
  app.post('/internal/bot/task', async (req) => {
    const b = z.object({
      chatId: z.union([z.string(), z.number()]).transform(String), messageId: z.union([z.string(), z.number()]).transform(String),
      fromName: z.string(), text: z.string().max(20000).default(''),
      commandFromId: z.union([z.string(), z.number()]).transform(String).optional(),
      files: z.array(z.object({ fileId: z.string(), name: z.string(), mime: z.string() })).default([]),
      link: z.string().optional(),
    }).parse(req.body);

    const g = await prisma.telegramGroup.findUnique({ where: { chatId: b.chatId } });
    if (!g?.projectId) return { ok: false, reason: 'این گروه هنوز به پروژه‌ای متصل نشده است.' };

    const linked = b.commandFromId ? await prisma.user.findUnique({ where: { telegramUserId: b.commandFromId } }) : null;
    const mgr = await prisma.projectMember.findFirst({ where: { projectId: g.projectId, role: 'MANAGER' }, select: { userId: true } });
    const creatorId = linked?.id ?? mgr?.userId ?? (await ownerRow()).id;

    const firstLine = (b.text.split('\n').find((l) => l.trim()) || (b.files[0]?.name ?? 'پیام تلگرام')).trim();
    const title = firstLine.length > 120 ? firstLine.slice(0, 117) + '…' : firstLine;
    const desc = `${b.text}\n\n— ارسال‌شده توسط **${b.fromName}** در تلگرام${b.link ? `\n[پیام اصلی](${b.link})` : ''}`;
    const task = await createTask(g.projectId, creatorId, { title, description: desc }, {
      telegramChatId: b.chatId, telegramMessageId: b.messageId, telegramSender: b.fromName,
    });

    for (const f of b.files) {
      try {
        const buf = await downloadTelegramFile(f.fileId);
        if (buf && mimeAllowed(f.mime)) await saveBuffer(task.id, buf, { name: f.name, mime: f.mime, userId: creatorId });
      } catch (e) {
        req.log.warn({ err: e }, 'telegram file download failed');
      }
    }
    const mgrs = await prisma.projectMember.findMany({ where: { projectId: g.projectId, role: 'MANAGER' }, select: { userId: true } });
    await notify(mgrs.map((m) => m.userId), { type: 'task_created', title: 'تسک جدید از تلگرام', body: title, link: `/tasks/${task.id}` }, creatorId);
    return { ok: true, task: { id: task.id, number: task.number, title }, url: `${config.appUrl}/tasks/${task.id}` };
  });

  // اتصال حساب: /start CODE در چت خصوصی
  app.post('/internal/bot/link', async (req) => {
    const b = z.object({ code: z.string(), tgUserId: z.union([z.string(), z.number()]).transform(String), chatId: z.union([z.string(), z.number()]).transform(String) }).parse(req.body);
    const uid = await redis.get(`tglink:${b.code.toUpperCase()}`);
    if (!uid) return { ok: false };
    await prisma.user.update({ where: { id: uid }, data: { telegramUserId: b.tgUserId, telegramChatId: b.chatId } });
    await redis.del(`tglink:${b.code.toUpperCase()}`);
    const u = await prisma.user.findUnique({ where: { id: uid }, select: { name: true } });
    return { ok: true, name: u.name };
  });

  app.post('/internal/bot/mytasks', async (req) => {
    const { tgUserId } = z.object({ tgUserId: z.union([z.string(), z.number()]).transform(String) }).parse(req.body);
    const u = await prisma.user.findUnique({ where: { telegramUserId: tgUserId } });
    if (!u) return { linked: false, tasks: [] };
    const tasks = await prisma.task.findMany({
      where: { deletedAt: null, archivedAt: null, assignees: { some: { userId: u.id } }, column: { isDone: false } },
      orderBy: { dueDate: { sort: 'asc', nulls: 'last' } }, take: 15,
      select: { id: true, number: true, title: true, dueDate: true, project: { select: { name: true } } },
    });
    return { linked: true, tasks: tasks.map((t) => ({ ...t, url: `${config.appUrl}/tasks/${t.id}` })) };
  });

  app.post('/internal/bot/done', async (req) => {
    const b = z.object({ tgUserId: z.union([z.string(), z.number()]).transform(String), chatId: z.union([z.string(), z.number()]).transform(String), number: z.number().int() }).parse(req.body);
    const u = await prisma.user.findUnique({ where: { telegramUserId: b.tgUserId } });
    if (!u) return { ok: false, reason: 'حساب تلگرام شما به پنل متصل نیست.' };
    const g = await prisma.telegramGroup.findUnique({ where: { chatId: b.chatId } });
    if (!g?.projectId) return { ok: false, reason: 'گروه به پروژه‌ای متصل نیست.' };
    const m = isOwner(u) ? { role: 'MANAGER' } : await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId: g.projectId, userId: u.id } } });
    const task = await prisma.task.findFirst({ where: { projectId: g.projectId, number: b.number, deletedAt: null }, include: { assignees: true } });
    if (!task || !m) return { ok: false, reason: 'تسک یافت نشد.' };
    const mine = task.createdById === u.id || task.assignees.some((a) => a.userId === u.id);
    if (m.role !== 'MANAGER' && !mine) return { ok: false, reason: 'اجازه بستن این تسک را ندارید.' };
    const col = await prisma.boardColumn.findFirst({ where: { projectId: g.projectId, isDone: true }, orderBy: { position: 'asc' } });
    await prisma.task.update({ where: { id: task.id }, data: { columnId: col.id, completedAt: new Date() } });
    return { ok: true, title: task.title };
  });

  // ═══════ پنل ادمین ═══════
  app.get('/api/telegram/groups', async (req) => {
    if (!isOwner(req.user)) throw httpError(403, 'فقط مالک سیستم');
    return { groups: await prisma.telegramGroup.findMany({ include: { project: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } }) };
  });

  app.patch('/api/telegram/groups/:id', async (req) => {
    if (!isOwner(req.user)) throw httpError(403, 'فقط مالک سیستم');
    const { projectId } = z.object({ projectId: z.string().uuid().nullable() }).parse(req.body);
    try {
      return { group: await prisma.telegramGroup.update({ where: { id: req.params.id }, data: { projectId } }) };
    } catch (e) {
      if (e.code === 'P2002') throw httpError(409, 'این پروژه قبلاً به گروه دیگری متصل است');
      throw e;
    }
  });

  app.get('/api/telegram/groups/:id/messages', async (req) => {
    if (!isOwner(req.user)) throw httpError(403, 'فقط مالک سیستم');
    const g = await prisma.telegramGroup.findUnique({ where: { id: req.params.id } });
    if (!g) throw httpError(404, 'گروه یافت نشد');
    return { messages: await prisma.telegramMessage.findMany({ where: { chatId: g.chatId }, orderBy: { createdAt: 'desc' }, take: 100 }) };
  });

  app.get('/api/settings', async (req) => {
    if (!isOwner(req.user)) throw httpError(403, 'فقط مالک سیستم');
    return { 'bot.command': await getSetting('bot.command', 'task'), 'bot.notifyBack': await getSetting('bot.notifyBack', true) };
  });
  app.patch('/api/settings', async (req) => {
    if (!isOwner(req.user)) throw httpError(403, 'فقط مالک سیستم');
    const b = z.object({ 'bot.command': z.string().regex(/^[a-z0-9_]{1,32}$/i).optional(), 'bot.notifyBack': z.boolean().optional() }).parse(req.body);
    for (const [key, value] of Object.entries(b)) await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
    return { ok: true };
  });

  void esc;
}
