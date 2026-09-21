import { prisma, redis } from './db.js';
import { notify } from './lib/notify.js';

/** یادآوری ددلاین (۲۴ ساعت مانده) هر ۱۵ دقیقه + خلاصه‌ی روزانه‌ی تسک‌های عقب‌افتاده. قفل Redis از اجرای دوگانه جلوگیری می‌کند. */
export function startScheduler(log) {
  const tick = async () => {
    if (!(await redis.set('lock:scheduler', '1', 'EX', 600, 'NX'))) return;
    try {
      const soon = await prisma.task.findMany({
        where: { deletedAt: null, archivedAt: null, dueNotifiedAt: null, dueDate: { gt: new Date(), lt: new Date(Date.now() + 864e5) }, column: { isDone: false } },
        select: { id: true, title: true, number: true, createdById: true, assignees: { select: { userId: true } } },
      });
      for (const t of soon) {
        await notify([...t.assignees.map((a) => a.userId), ...(t.assignees.length ? [] : [t.createdById])], { type: 'deadline', title: `ددلاین تسک #${t.number} نزدیک است`, body: t.title, link: `/tasks/${t.id}` });
        await prisma.task.update({ where: { id: t.id }, data: { dueNotifiedAt: new Date() } });
      }
      const today = new Date().toISOString().slice(0, 10);
      if (new Date().getHours() >= 8 && (await redis.set(`digest:${today}`, '1', 'EX', 90000, 'NX'))) {
        const users = await prisma.user.findMany({ where: { active: true }, select: { id: true, notifyPrefs: true } });
        for (const u of users) {
          if (u.notifyPrefs?.digest?.enabled !== true) continue; // اختیاری (opt-in)
          const n = await prisma.task.count({ where: { deletedAt: null, archivedAt: null, dueDate: { lt: new Date() }, column: { isDone: false }, assignees: { some: { userId: u.id } } } });
          if (n) await notify([u.id], { type: 'digest', title: 'خلاصه‌ی روزانه', body: `${n} تسک عقب‌افتاده دارید`, link: '/' });
        }
      }
    } catch (e) {
      log.error(e, 'scheduler failed');
    }
  };
  setTimeout(tick, 20000);
  setInterval(tick, 15 * 60 * 1000).unref();
}
