import { prisma } from '../db.js';
import { config } from '../config.js';

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function tgSend(chatId, html) {
  if (!config.botToken || !chatId) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * اعلان درون‌پنل + تلگرام، طبق تنظیمات هر کاربر.
 * notifyPrefs کاربر: { [type]: { panel: bool, telegram: bool } } — پیش‌فرض هر دو روشن
 */
export async function notify(userIds, n, exceptUserId) {
  const ids = [...new Set(userIds)].filter((id) => id && id !== exceptUserId);
  if (!ids.length) return;
  const users = await prisma.user.findMany({
    where: { id: { in: ids }, active: true },
    select: { id: true, notifyPrefs: true, telegramChatId: true },
  });
  const link = n.link ? config.appUrl + n.link : '';
  for (const u of users) {
    const p = u.notifyPrefs?.[n.type] ?? {};
    if (p.panel !== false) {
      await prisma.notification.create({
        data: { userId: u.id, type: n.type, title: n.title, body: n.body ?? '', link: n.link ?? '' },
      });
    }
    if (p.telegram !== false && u.telegramChatId) {
      tgSend(u.telegramChatId, `<b>${esc(n.title)}</b>${n.body ? '\n' + esc(n.body) : ''}${link ? `\n${link}` : ''}`);
    }
  }
}

export const logActivity = (client, { projectId, taskId, userId, action, data = {} }) =>
  client.activityLog.create({ data: { projectId, taskId, userId, action, data } });

export async function taskAudience(taskId) {
  const t = await prisma.task.findUnique({
    where: { id: taskId },
    select: { createdById: true, assignees: { select: { userId: true } }, watchers: { select: { userId: true } } },
  });
  if (!t) return [];
  return [t.createdById, ...t.assignees.map((a) => a.userId), ...t.watchers.map((a) => a.userId)];
}
