import { prisma } from '../../db.js';
import { httpError, isInternal, visibleTasksWhere } from '../../lib/access.js';

const csv = (rows) =>
  '﻿' + rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`).join(',')).join('\r\n');

export default async function reports(app) {
  // داشبورد کلی به تفکیک پروژه (محدود به تسک‌های قابل‌مشاهده)
  app.get('/reports/overview', async (req) => {
    const tw = await visibleTasksWhere(req.user);
    const now = new Date();
    const tasks = await prisma.task.findMany({
      where: { AND: [tw, { archivedAt: null }] },
      select: { projectId: true, dueDate: true, column: { select: { isDone: true } }, project: { select: { name: true } } },
    });
    const byProject = {};
    for (const t of tasks) {
      const p = (byProject[t.projectId] ??= { projectId: t.projectId, name: t.project.name, open: 0, closed: 0, overdue: 0 });
      if (t.column.isDone) p.closed++;
      else {
        p.open++;
        if (t.dueDate && t.dueDate < now) p.overdue++;
      }
    }
    const rows = Object.values(byProject).map((p) => ({ ...p, rate: p.open + p.closed ? Math.round((p.closed / (p.open + p.closed)) * 100) : 0 }));
    return {
      totals: rows.reduce((a, r) => ({ open: a.open + r.open, closed: a.closed + r.closed, overdue: a.overdue + r.overdue }), { open: 0, closed: 0, overdue: 0 }),
      projects: rows,
    };
  });

  // عملکرد اعضا (کادر داخلی)
  app.get('/reports/members', async (req) => {
    if (!isInternal(req.user)) throw httpError(403, 'دسترسی کافی ندارید');
    const tw = await visibleTasksWhere(req.user);
    const rows = await prisma.taskAssignee.findMany({
      where: { task: { AND: [tw, { archivedAt: null }] } },
      select: { user: { select: { id: true, name: true } }, task: { select: { createdAt: true, completedAt: true, dueDate: true, column: { select: { isDone: true } } } } },
    });
    const m = {};
    const now = new Date();
    for (const r of rows) {
      const s = (m[r.user.id] ??= { user: r.user, open: 0, done: 0, overdue: 0, totalMs: 0 });
      if (r.task.column.isDone) {
        s.done++;
        if (r.task.completedAt) s.totalMs += r.task.completedAt - r.task.createdAt;
      } else {
        s.open++;
        if (r.task.dueDate && r.task.dueDate < now) s.overdue++;
      }
    }
    return { members: Object.values(m).map(({ totalMs, ...s }) => ({ ...s, avgHours: s.done ? Math.round(totalMs / s.done / 36e5) : 0 })) };
  });

  // روند ۱۴ روز اخیر: ساخته‌شده / انجام‌شده
  app.get('/reports/trend', async (req) => {
    const tw = await visibleTasksWhere(req.user);
    const since = new Date(Date.now() - 14 * 864e5);
    since.setHours(0, 0, 0, 0);
    const tasks = await prisma.task.findMany({
      where: { AND: [tw, { OR: [{ createdAt: { gte: since } }, { completedAt: { gte: since } }] }] },
      select: { createdAt: true, completedAt: true },
    });
    const days = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(since.getTime() + i * 864e5);
      days.push({ date: d.toISOString().slice(0, 10), created: 0, done: 0 });
    }
    const idx = (d) => Math.floor((new Date(d).setHours(0, 0, 0, 0) - since.getTime()) / 864e5);
    for (const t of tasks) {
      const a = idx(t.createdAt);
      if (days[a]) days[a].created++;
      if (t.completedAt) { const b = idx(t.completedAt); if (days[b]) days[b].done++; }
    }
    return { days };
  });

  // فید فعالیت‌های اخیر روی پروژه‌های قابل‌مشاهده
  app.get('/activity', async (req) => {
    const tw = await visibleTasksWhere(req.user);
    const rows = await prisma.activityLog.findMany({
      where: { task: tw }, orderBy: { createdAt: 'desc' }, take: 12,
      include: { user: { select: { name: true } }, task: { select: { id: true, number: true, title: true } } },
    });
    return { activity: rows };
  });

  // بار کاری کل (کادر داخلی)
  app.get('/reports/workload', async (req) => {
    if (!isInternal(req.user)) throw httpError(403, 'دسترسی کافی ندارید');
    const tw = await visibleTasksWhere(req.user);
    const g = await prisma.taskAssignee.groupBy({ by: ['userId'], _count: true, where: { task: { AND: [tw, { archivedAt: null, column: { isDone: false } }] } } });
    const us = await prisma.user.findMany({ where: { id: { in: g.map((x) => x.userId) } }, select: { id: true, name: true } });
    return { workload: g.map((x) => ({ user: us.find((u) => u.id === x.userId), open: x._count })).sort((a, b) => b.open - a.open) };
  });

  // خروجی CSV (Excel با BOM UTF-8 فارسی را درست نشان می‌دهد)
  app.get('/reports/export.csv', async (req, reply) => {
    const AND = [await visibleTasksWhere(req.user)];
    if (req.query.projectId) AND.push({ projectId: req.query.projectId });
    const tasks = await prisma.task.findMany({
      where: { AND }, orderBy: [{ projectId: 'asc' }, { number: 'asc' }], take: 20000,
      include: { project: { select: { name: true } }, column: { select: { name: true } }, category: { select: { name: true } }, createdBy: { select: { name: true } }, assignees: { select: { user: { select: { name: true } } } } },
    });
    const rows = [['پروژه', 'شماره', 'عنوان', 'وضعیت', 'گروه', 'اولویت', 'اساین', 'سازنده', 'ددلاین', 'تاریخ ساخت', 'تاریخ تکمیل']];
    for (const t of tasks) {
      rows.push([t.project.name, t.number, t.title, t.column.name, t.category?.name, t.priority, t.assignees.map((a) => a.user.name).join('، '), t.createdBy.name, t.dueDate?.toISOString().slice(0, 10), t.createdAt.toISOString().slice(0, 10), t.completedAt?.toISOString().slice(0, 10)]);
    }
    return reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', 'attachment; filename="tasks.csv"').send(csv(rows));
  });
}
