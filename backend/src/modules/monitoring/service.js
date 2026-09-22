import { prisma } from '../../db.js';
import { esc, notify, tgSend } from '../../lib/notify.js';
import { CHECKS, LOCATION_FREE, runChecks, runRemote } from './checks.js';

export async function getIranConfig() {
  const [u, t] = await Promise.all([
    prisma.setting.findUnique({ where: { key: 'monitor.iranUrl' } }),
    prisma.setting.findUnique({ where: { key: 'monitor.iranToken' } }),
  ]);
  return u?.value && t?.value ? { url: u.value, token: t.value } : null;
}

/** نتیجه‌ی هر چک را با محل اجرا (local/remote/general) برمی‌گرداند */
export async function collect(domain, names, location, iran) {
  const loc = iran ? location : 'out';
  const local = names.filter((n) => loc !== 'iran' || LOCATION_FREE.has(n));
  const remote = names.filter((n) => loc !== 'out' && !LOCATION_FREE.has(n));
  const [localRes, remoteRes] = await Promise.all([
    local.length ? runChecks(domain, local) : {},
    remote.length && iran
      ? runRemote(iran.url, iran.token, domain, remote).catch((e) =>
          Object.fromEntries(remote.map((n) => [n, { ok: false, detail: e?.message || String(e) }])),
        )
      : {},
  ]);
  const out = {};
  for (const [n, r] of Object.entries(localRes)) out[n] = { ...r, origin: LOCATION_FREE.has(n) ? 'general' : 'local' };
  for (const [n, r] of Object.entries(remoteRes)) out[n] = { ...r, origin: 'remote' };
  return out;
}

export function formatTelegramMessage(domain, rows, recovered) {
  const bad = Object.entries(rows).filter(([, r]) => r.ok === false);
  const good = Object.entries(rows).filter(([, r]) => r.ok === true).length;
  let head = bad.length
    ? `🔴 <b>${esc(domain)}</b>\n${bad.length} مشکل پیدا شد`
    : `🟢 <b>${esc(domain)}</b>\nهمه‌چیز سالم است (${good} چک)`;
  if (recovered) head = `🎉 <b>بازیابی شد</b>\n${head}`;
  const lines = bad.map(([n, r]) => `❌ ${CHECKS[n]} — ${esc(r.detail)}`);
  return lines.length ? `${head}\n\n${lines.join('\n')}` : head;
}

/** یک بار چک را اجرا، لاگ را ثبت و در صورت لزوم اطلاع‌رسانی می‌کند */
export async function processDomain(m, iran) {
  const names = (m.checks || '').split(',').filter((n) => CHECKS[n]);
  if (!names.length) return null;
  const rows = await collect(m.domain, names, m.location, iran);
  const ok = Object.values(rows).every((r) => r.ok !== false);
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
    const bad = Object.entries(rows).filter(([, r]) => r.ok === false).map(([n]) => CHECKS[n]);
    await notify(project.members.map((x) => x.userId), {
      type: 'monitor',
      title: ok ? `دامنه ${m.domain} بازیابی شد` : `مشکل در دامنه ${m.domain}`,
      body: ok ? '' : bad.join('، '),
      link: `/projects/${m.projectId}?tab=monitoring`,
    });
  }
  return { ok, rows };
}
