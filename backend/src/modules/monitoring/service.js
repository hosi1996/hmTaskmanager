import { prisma } from '../../db.js';
import { esc, notify, tgSend } from '../../lib/notify.js';
import { CHECKS, LOCATION_FREE, REMOTE_UNSUPPORTED, runChecks, runRemote } from './checks.js';

export async function getIranConfig() {
  const [u, t] = await Promise.all([
    prisma.setting.findUnique({ where: { key: 'monitor.iranUrl' } }),
    prisma.setting.findUnique({ where: { key: 'monitor.iranToken' } }),
  ]);
  return u?.value && t?.value ? { url: u.value, token: t.value } : null;
}

/**
 * نتیجه‌ی هر چک را برمی‌گرداند، به‌صورت آرایه (نه شیء کلیدشده با نام چک).
 * دلیل آرایه‌بودن: وقتی محل چک «هر دو» است، همان چک هم از این سرور و هم از ایران اجرا می‌شود
 * و باید هر دو نتیجه، جدا از هم، نگه داشته شوند (نه اینکه یکی جای دیگری را بگیرد).
 */
export async function collect(domain, names, location, iran, opts = {}) {
  const loc = iran ? location : 'out';
  const local = names.filter((n) => loc !== 'iran' || LOCATION_FREE.has(n) || REMOTE_UNSUPPORTED.has(n));
  const remote = names.filter((n) => loc !== 'out' && !LOCATION_FREE.has(n) && !REMOTE_UNSUPPORTED.has(n));
  const [localRes, remoteRes] = await Promise.all([
    local.length ? runChecks(domain, local, opts) : {},
    remote.length && iran
      ? runRemote(iran.url, iran.token, domain, remote).catch((e) =>
          Object.fromEntries(remote.map((n) => [n, { ok: false, detail: e?.message || String(e) }])),
        )
      : {},
  ]);
  const rows = [];
  for (const [n, r] of Object.entries(localRes)) rows.push({ name: n, ok: r.ok, detail: r.detail, origin: LOCATION_FREE.has(n) ? 'general' : 'local' });
  for (const [n, r] of Object.entries(remoteRes)) rows.push({ name: n, ok: r.ok, detail: r.detail, origin: 'remote' });
  return rows;
}

const ORIGIN_FA = { local: 'خارج', remote: 'ایران', general: 'عمومی' };

export function formatTelegramMessage(domain, rows, recovered) {
  const bad = rows.filter((r) => r.ok === false);
  const good = rows.filter((r) => r.ok === true).length;
  const counts = rows.reduce((m, r) => ((m[r.name] = (m[r.name] || 0) + 1), m), {});
  let head = bad.length
    ? `🔴 <b>${esc(domain)}</b>\n${bad.length} مشکل پیدا شد`
    : `🟢 <b>${esc(domain)}</b>\nهمه‌چیز سالم است (${good} چک)`;
  if (recovered) head = `🎉 <b>بازیابی شد</b>\n${head}`;
  const lines = bad.map((r) => `❌ ${CHECKS[r.name]}${counts[r.name] > 1 ? ` (${ORIGIN_FA[r.origin]})` : ''} — ${esc(r.detail)}`);
  return lines.length ? `${head}\n\n${lines.join('\n')}` : head;
}

/** یک بار چک را اجرا، لاگ را ثبت و در صورت لزوم اطلاع‌رسانی می‌کند */
export async function processDomain(m, iran) {
  const names = (m.checks || '').split(',').filter((n) => CHECKS[n]);
  if (!names.length) return null;
  const rows = await collect(m.domain, names, m.location, iran, { keyword: m.keyword, port: m.port });
  const ok = rows.every((r) => r.ok !== false);
  const recovered = ok && m.lastOk === false;

  await prisma.$transaction([
    prisma.monitorLog.create({ data: { domainId: m.id, ok, results: rows } }),
    prisma.monitorDomain.update({ where: { id: m.id }, data: { lastRunAt: new Date(), lastOk: ok } }),
  ]);

  if (ok && m.onlyProblems && !recovered) return { ok, rows };

  const project = await prisma.project.findUnique({
    where: { id: m.projectId },
    select: { telegram: { select: { chatId: true } }, members: { where: { role: 'MANAGER' }, select: { userId: true } } },
  });
  if (m.notifyTelegram && project?.telegram?.chatId) {
    await tgSend(project.telegram.chatId, formatTelegramMessage(m.domain, rows, recovered));
  }
  if (m.notifyPanel && project?.members?.length) {
    const bad = [...new Set(rows.filter((r) => r.ok === false).map((r) => CHECKS[r.name]))];
    await notify(project.members.map((x) => x.userId), {
      type: 'monitor',
      title: ok ? `دامنه ${m.domain} بازیابی شد` : `مشکل در دامنه ${m.domain}`,
      body: ok ? '' : bad.join('، '),
      link: `/projects/${m.projectId}?tab=monitoring`,
    });
  }
  return { ok, rows };
}

/** حذف لاگ‌های قدیمی‌تر از بازه‌ی نگهداریِ خودِ دامنه (0 یعنی هرگز پاک نشود) */
export async function purgeLogs(domainId, retentionDays) {
  if (!retentionDays) return 0;
  const cutoff = new Date(Date.now() - retentionDays * 86400000);
  const { count } = await prisma.monitorLog.deleteMany({ where: { domainId, createdAt: { lt: cutoff } } });
  return count;
}
