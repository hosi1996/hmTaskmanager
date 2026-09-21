import { Bot } from 'grammy';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API = (process.env.BACKEND_URL || 'http://backend:3111') + '/internal/bot';
const INTERNAL = process.env.BOT_INTERNAL_TOKEN;
const log = (o) => console.log(JSON.stringify({ time: new Date().toISOString(), ...o }));

async function api(path, body) {
  const r = await fetch(API + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', 'x-bot-token': INTERNAL },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`backend ${path} → ${r.status}`);
  return r.json();
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const nameOf = (u) => [u?.first_name, u?.last_name].filter(Boolean).join(' ') || u?.username || 'ناشناس';
const isGroup = (c) => c.type === 'group' || c.type === 'supergroup';

async function start() {
  const bot = new Bot(TOKEN);
  let command = 'task';
  const refresh = async () => {
    try {
      command = (await api('/settings')).command;
    } catch (e) {
      log({ level: 'warn', msg: 'settings fetch failed', err: e.message });
    }
  };
  await refresh();
  setInterval(refresh, 60_000).unref();

  // افزوده/حذف شدن بات از گروه → ثبت در پنل «گروه‌های متصل»
  bot.on('my_chat_member', async (ctx) => {
    const c = ctx.chat;
    if (!isGroup(c)) return;
    const status = ctx.myChatMember.new_chat_member.status;
    await api('/chat', { chatId: c.id, title: c.title, type: c.type, active: !['left', 'kicked'].includes(status) }).catch((e) => log({ level: 'error', err: e.message }));
  });

  bot.command('start', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    const code = ctx.match?.trim();
    if (!code) return ctx.reply('برای اتصال حساب، از پنل > تنظیمات > تلگرام کد بگیرید و /start CODE بفرستید.');
    const r = await api('/link', { code, tgUserId: ctx.from.id, chatId: ctx.chat.id }).catch(() => ({ ok: false }));
    return ctx.reply(r.ok ? `✅ حساب ${r.name} متصل شد.` : 'کد نامعتبر یا منقضی است.');
  });

  bot.command('mytasks', async (ctx) => {
    const r = await api('/mytasks', { tgUserId: ctx.from.id }).catch(() => null);
    if (!r) return;
    if (!r.linked) return ctx.reply('حساب تلگرام شما به پنل متصل نیست.');
    if (!r.tasks.length) return ctx.reply('تسک بازی ندارید 🎉');
    return ctx.reply(r.tasks.map((t) => `• #${t.number} <a href="${t.url}">${esc(t.title)}</a> (${esc(t.project.name)})`).join('\n'), { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
  });

  bot.command('done', async (ctx) => {
    const n = parseInt(ctx.match, 10);
    if (!n || !isGroup(ctx.chat)) return ctx.reply('استفاده: /done شماره‌ی‌تسک (داخل گروه)');
    const r = await api('/done', { tgUserId: ctx.from.id, chatId: ctx.chat.id, number: n }).catch(() => null);
    return ctx.reply(r?.ok ? `✅ «${r.title}» بسته شد.` : r?.reason || 'خطا');
  });

  // ثبت همه‌ی پیام‌های متنی گروه (فقط لاگ، بدون پاسخ) + دستور ساخت تسک (قابل تغییر از تنظیمات)
  bot.on(['message', 'channel_post'], async (ctx) => {
    const m = ctx.message ?? ctx.channelPost;
    if (!isGroup(ctx.chat)) return;
    const text = m.text ?? m.caption ?? '';
    const from = nameOf(m.from);

    // گروه ناشناخته را هم ثبت کن (اگر بات قبل از دیپلوی اضافه شده بود)
    const isCmd = new RegExp(`^/${command}(@\\w+)?(\\s|$)`, 'i').test(text) && m.reply_to_message;
    if (!isCmd) {
      await api('/chat', { chatId: ctx.chat.id, title: ctx.chat.title, type: ctx.chat.type }).catch(() => {});
      if (text) {
        await api('/message', { chatId: ctx.chat.id, messageId: m.message_id, fromId: m.from?.id, fromName: from, text, replyToId: m.reply_to_message?.message_id }).catch(() => {});
      }
      return;
    }

    const src = m.reply_to_message;
    const files = [];
    if (src.photo?.length) files.push({ fileId: src.photo.at(-1).file_id, name: `photo-${src.message_id}.jpg`, mime: 'image/jpeg' });
    if (src.document) files.push({ fileId: src.document.file_id, name: src.document.file_name ?? `file-${src.message_id}`, mime: src.document.mime_type ?? 'application/octet-stream' });
    const pub = ctx.chat.username ? `https://t.me/${ctx.chat.username}/${src.message_id}` : String(ctx.chat.id).startsWith('-100') ? `https://t.me/c/${String(ctx.chat.id).slice(4)}/${src.message_id}` : undefined;

    try {
      const r = await api('/task', {
        chatId: ctx.chat.id, messageId: src.message_id, fromName: nameOf(src.from),
        text: src.text ?? src.caption ?? '', commandFromId: m.from?.id, files, link: pub,
      });
      if (!r.ok) return ctx.reply(r.reason, { reply_parameters: { message_id: m.message_id } });
      await ctx.reply(`✅ تسک #${r.task.number} ساخته شد:\n<a href="${r.url}">${esc(r.task.title)}</a>`, {
        parse_mode: 'HTML', reply_parameters: { message_id: src.message_id }, link_preview_options: { is_disabled: true },
      });
    } catch (e) {
      log({ level: 'error', msg: 'create task failed', err: e.message });
      await ctx.reply('❌ ساخت تسک ناموفق بود.');
    }
  });

  bot.catch((e) => log({ level: 'error', msg: 'bot error', err: String(e.error ?? e) }));
  process.once('SIGTERM', () => bot.stop());
  await bot.start({
    allowed_updates: ['message', 'channel_post', 'my_chat_member'],
    onStart: (i) => log({ msg: 'bot started', username: i.username }),
  });
}

if (!TOKEN) {
  log({ level: 'warn', msg: 'TELEGRAM_BOT_TOKEN تنظیم نشده؛ بات غیرفعال است' });
  setInterval(() => {}, 1 << 30); // کانتینر بالا بماند تا restart-loop نشود
} else {
  await start();
}
