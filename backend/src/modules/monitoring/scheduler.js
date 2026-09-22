import { prisma, redis } from '../../db.js';
import { getIranConfig, processDomain, purgeLogs } from './service.js';

const TICK_MS = 20000;
const CLEANUP_MS = 3600000; // هر یک ساعت
const MAX_PARALLEL = 5;

/** استخر ساده برای اجرای همزمان محدود بدون وابستگی خارجی */
async function pool(items, worker, size) {
  const it = items[Symbol.iterator]();
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      for (let x = it.next(); !x.done; x = it.next()) {
        await worker(x.value).catch(() => {});
      }
    }),
  );
}

/** هر ۲۰ ثانیه دامنه‌هایی که موعد چکشان رسیده را پیدا و اجرا می‌کند */
export function startMonitorScheduler(log) {
  const tick = async () => {
    if (!(await redis.set('lock:monitor-tick', '1', 'PX', TICK_MS - 3000, 'NX'))) return;
    try {
      const now = Date.now();
      const domains = await prisma.monitorDomain.findMany({ where: { enabled: true, project: { deletedAt: null } } });
      const due = domains.filter((m) => !m.lastRunAt || now - new Date(m.lastRunAt).getTime() >= m.intervalMin * 60000);
      if (!due.length) return;
      const iran = await getIranConfig();
      await pool(due, (m) => processDomain(m, iran), MAX_PARALLEL);
    } catch (e) {
      log.error(e, 'monitor scheduler failed');
    }
  };

  // پاک‌سازی خودکار لاگ‌های قدیمی، طبق بازه‌ی نگهداریِ هر دامنه
  const cleanup = async () => {
    if (!(await redis.set('lock:monitor-cleanup', '1', 'PX', CLEANUP_MS - 60000, 'NX'))) return;
    try {
      const domains = await prisma.monitorDomain.findMany({ where: { logRetentionDays: { gt: 0 } }, select: { id: true, logRetentionDays: true } });
      for (const d of domains) await purgeLogs(d.id, d.logRetentionDays).catch(() => {});
    } catch (e) {
      log.error(e, 'monitor log cleanup failed');
    }
  };

  setTimeout(tick, 10000);
  setInterval(tick, TICK_MS).unref();
  setTimeout(cleanup, 30000);
  setInterval(cleanup, CLEANUP_MS).unref();
}
