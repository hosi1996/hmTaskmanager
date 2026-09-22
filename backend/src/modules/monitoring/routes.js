import { z } from 'zod';
import { prisma } from '../../db.js';
import { httpError, isOwner, requireProjectRole } from '../../lib/access.js';
import { CHECKS, DEFAULT_CHECKS, INTERVALS, RETENTIONS, parseDomain } from './checks.js';
import { collect, getIranConfig, purgeLogs } from './service.js';

const validChecks = (arr) => {
  const list = [...new Set(arr)].filter((n) => CHECKS[n]);
  if (!list.length) throw httpError(400, 'حداقل یک چک را انتخاب کنید');
  return list;
};

const dto = (m, log, uptime24h) => ({
  id: m.id,
  projectId: m.projectId,
  domain: m.domain,
  intervalMin: m.intervalMin,
  checks: (m.checks || '').split(',').filter(Boolean),
  enabled: m.enabled,
  onlyProblems: m.onlyProblems,
  location: m.location,
  notifyTelegram: m.notifyTelegram,
  notifyPanel: m.notifyPanel,
  keyword: m.keyword ?? '',
  port: m.port ?? null,
  logRetentionDays: m.logRetentionDays,
  lastRunAt: m.lastRunAt,
  lastOk: m.lastOk,
  createdAt: m.createdAt,
  lastLog: log ? { ok: log.ok, results: log.results, createdAt: log.createdAt } : null,
  uptime24h: uptime24h ?? null,
});

/** درصد سالم‌بودن در ۲۴ ساعت اخیر، بر اساس لاگ‌های ثبت‌شده */
async function uptimeFor(domainId) {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [total, ok] = await Promise.all([
    prisma.monitorLog.count({ where: { domainId, createdAt: { gte: since } } }),
    prisma.monitorLog.count({ where: { domainId, createdAt: { gte: since }, ok: true } }),
  ]);
  return total ? Math.round((ok / total) * 100) : null;
}

const baseBody = {
  intervalMin: z.number().int().optional(),
  checks: z.array(z.string()).optional(),
  location: z.enum(['out', 'iran', 'both']).optional(),
  onlyProblems: z.boolean().optional(),
  notifyTelegram: z.boolean().optional(),
  notifyPanel: z.boolean().optional(),
  keyword: z.string().max(200).nullable().optional(),
  port: z.number().int().min(1).max(65535).nullable().optional(),
  logRetentionDays: z.number().int().optional(),
};

const checkRetention = (v) => {
  if (v !== undefined && !RETENTIONS.includes(v)) throw httpError(400, 'بازه‌ی نگهداری لاگ نامعتبر است');
};

async function loadMonitor(req) {
  const m = await prisma.monitorDomain.findUnique({ where: { id: req.params.id } });
  if (!m) throw httpError(404, 'دامنه یافت نشد');
  await requireProjectRole(req.user, m.projectId, 'MANAGER');
  return m;
}

export default async function monitoring(app) {
  // فهرست همه‌ی دامنه‌های قابل‌مدیریت کاربر، برای داشبورد کلی مانیتورینگ (مالک: همه، مدیر پروژه: پروژه‌های خودش)
  app.get('/monitors', async (req) => {
    const pw = isOwner(req.user) ? {} : { members: { some: { userId: req.user.id, role: 'MANAGER' } } };
    const domains = await prisma.monitorDomain.findMany({
      where: { project: { deletedAt: null, ...pw } },
      include: { project: { select: { id: true, name: true, color: true, icon: true } } },
      orderBy: { domain: 'asc' },
    });
    const [logs, uptimes] = await Promise.all([
      Promise.all(domains.map((m) => prisma.monitorLog.findFirst({ where: { domainId: m.id }, orderBy: { createdAt: 'desc' } }))),
      Promise.all(domains.map((m) => uptimeFor(m.id))),
    ]);
    return {
      domains: domains.map((m, i) => ({ ...dto(m, logs[i], uptimes[i]), project: m.project })),
      checks: CHECKS,
      iranEnabled: !!(await getIranConfig()),
    };
  });

  app.get('/projects/:id/monitors', async (req) => {
    await requireProjectRole(req.user, req.params.id, 'MANAGER');
    const domains = await prisma.monitorDomain.findMany({ where: { projectId: req.params.id }, orderBy: { domain: 'asc' } });
    const [logs, uptimes] = await Promise.all([
      Promise.all(domains.map((m) => prisma.monitorLog.findFirst({ where: { domainId: m.id }, orderBy: { createdAt: 'desc' } }))),
      Promise.all(domains.map((m) => uptimeFor(m.id))),
    ]);
    return {
      domains: domains.map((m, i) => dto(m, logs[i], uptimes[i])),
      checks: CHECKS,
      intervals: INTERVALS,
      retentions: RETENTIONS,
      iranEnabled: !!(await getIranConfig()),
    };
  });

  app.post('/projects/:id/monitors', async (req) => {
    await requireProjectRole(req.user, req.params.id, 'MANAGER');
    const b = z.object({ domain: z.string().min(3).max(253), ...baseBody }).parse(req.body);
    const domain = parseDomain(b.domain);
    if (!domain) throw httpError(400, 'دامنه معتبر نیست (مثال درست: example.com)');
    const intervalMin = b.intervalMin ?? 5;
    if (!INTERVALS.includes(intervalMin)) throw httpError(400, 'بازه‌ی زمانی نامعتبر');
    checkRetention(b.logRetentionDays);
    try {
      const m = await prisma.monitorDomain.create({
        data: {
          projectId: req.params.id,
          domain,
          intervalMin,
          checks: validChecks(b.checks ?? DEFAULT_CHECKS).join(','),
          location: b.location ?? 'both',
          onlyProblems: b.onlyProblems ?? true,
          notifyTelegram: b.notifyTelegram ?? true,
          notifyPanel: b.notifyPanel ?? true,
          keyword: b.keyword || null,
          port: b.port ?? null,
          logRetentionDays: b.logRetentionDays ?? 30,
        },
      });
      return { domain: dto(m, null) };
    } catch (e) {
      if (e.code === 'P2002') throw httpError(409, 'این دامنه قبلاً در این پروژه ثبت شده است');
      throw e;
    }
  });

  app.patch('/monitors/:id', async (req) => {
    const m = await loadMonitor(req);
    const b = z.object({ ...baseBody, enabled: z.boolean().optional() }).parse(req.body);
    if (b.intervalMin && !INTERVALS.includes(b.intervalMin)) throw httpError(400, 'بازه‌ی زمانی نامعتبر');
    checkRetention(b.logRetentionDays);
    const { checks, keyword, ...rest } = b;
    const data = { ...rest };
    if (checks) data.checks = validChecks(checks).join(',');
    if (keyword !== undefined) data.keyword = keyword || null;
    const updated = await prisma.monitorDomain.update({ where: { id: m.id }, data });
    return { domain: dto(updated, null) };
  });

  app.delete('/monitors/:id', async (req) => {
    const m = await loadMonitor(req);
    await prisma.monitorDomain.delete({ where: { id: m.id } });
    return { ok: true };
  });

  // بررسی فوری (خارج از زمان‌بندی)؛ نتیجه لاگ می‌شود ولی برای جلوگیری از اسپم پیام تلگرام نمی‌فرستد
  app.post('/monitors/:id/run', async (req) => {
    const m = await loadMonitor(req);
    const names = (m.checks || '').split(',').filter((n) => CHECKS[n]);
    if (!names.length) throw httpError(400, 'هیچ چکی برای این دامنه انتخاب نشده است');
    const iran = await getIranConfig();
    const rows = await collect(m.domain, names, m.location, iran, { keyword: m.keyword, port: m.port });
    const ok = rows.every((r) => r.ok !== false);
    await prisma.$transaction([
      prisma.monitorLog.create({ data: { domainId: m.id, ok, results: rows } }),
      prisma.monitorDomain.update({ where: { id: m.id }, data: { lastRunAt: new Date(), lastOk: ok } }),
    ]);
    return { ok, results: rows };
  });

  app.get('/monitors/:id/logs', async (req) => {
    const m = await loadMonitor(req);
    const logs = await prisma.monitorLog.findMany({ where: { domainId: m.id }, orderBy: { createdAt: 'desc' }, take: Math.min(+req.query.limit || 30, 100) });
    return { logs };
  });

  // پاک‌سازی فوری لاگ‌های قدیمی‌تر از بازه‌ی نگهداری تنظیم‌شده‌ی همین دامنه
  app.post('/monitors/:id/purge-logs', async (req) => {
    const m = await loadMonitor(req);
    if (!m.logRetentionDays) throw httpError(400, 'برای این دامنه «هرگز پاک نشود» تنظیم شده است');
    const deleted = await purgeLogs(m.id, m.logRetentionDays);
    return { ok: true, deleted };
  });

  // تنظیمات چک‌کننده‌ی مستقر در ایران (فقط مالک سیستم)
  app.get('/monitor-settings', async (req) => {
    if (!isOwner(req.user)) throw httpError(403, 'فقط مالک سیستم');
    const [u, t] = await Promise.all([
      prisma.setting.findUnique({ where: { key: 'monitor.iranUrl' } }),
      prisma.setting.findUnique({ where: { key: 'monitor.iranToken' } }),
    ]);
    return { iranUrl: u?.value ?? '', iranTokenSet: !!t?.value };
  });
  app.patch('/monitor-settings', async (req) => {
    if (!isOwner(req.user)) throw httpError(403, 'فقط مالک سیستم');
    const b = z.object({ iranUrl: z.string().max(500).optional(), iranToken: z.string().max(300).optional() }).parse(req.body);
    if (b.iranUrl !== undefined) {
      await prisma.setting.upsert({ where: { key: 'monitor.iranUrl' }, update: { value: b.iranUrl }, create: { key: 'monitor.iranUrl', value: b.iranUrl } });
    }
    if (b.iranToken) {
      await prisma.setting.upsert({ where: { key: 'monitor.iranToken' }, update: { value: b.iranToken }, create: { key: 'monitor.iranToken', value: b.iranToken } });
    }
    return { ok: true };
  });
}
