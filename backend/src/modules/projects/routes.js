import { z } from 'zod';
import { prisma } from '../../db.js';
import { httpError, isOwner, isInternal, projectRole, requireProjectRole, visibleProjectsWhere, visibleTasksWhere } from '../../lib/access.js';
import { logActivity, notify } from '../../lib/notify.js';

export const DEFAULT_COLUMNS = [
  { name: 'جدید', isDefault: true },
  { name: 'در حال انجام' },
  { name: 'در انتظار بررسی' },
  { name: 'انجام‌شده', isDone: true },
];

const projectBody = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(20000).optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED']).optional(),
  color: z.string().max(20).optional(),
  icon: z.string().max(8).optional(),
  type: z.string().max(60).optional(),
  startDate: z.coerce.date().nullable().optional(),
  deadline: z.coerce.date().nullable().optional(),
});
const roleEnum = z.enum(['VIEWER', 'REPORTER', 'CONTRIBUTOR', 'MANAGER']);

async function createColumns(tx, projectId, cols = DEFAULT_COLUMNS) {
  await tx.boardColumn.createMany({
    data: cols.map((c, i) => ({ projectId, name: c.name, position: (i + 1) * 1000, isDone: !!c.isDone, isDefault: !!c.isDefault })),
  });
}

export default async function projects(app) {
  app.get('/categories', async () => ({ categories: await prisma.category.findMany({ orderBy: { position: 'asc' } }) }));
  app.post('/categories', async (req) => {
    if (!isOwner(req.user)) throw httpError(403, 'فقط مالک سیستم');
    const b = z.object({ name: z.string().min(1), color: z.string().optional() }).parse(req.body);
    const n = await prisma.category.count();
    return { category: await prisma.category.create({ data: { ...b, key: 'custom-' + Date.now(), position: n + 1 } }) };
  });
  app.patch('/categories/:id', async (req) => {
    if (!isOwner(req.user)) throw httpError(403, 'فقط مالک سیستم');
    const b = z.object({ name: z.string().min(1).optional(), color: z.string().optional() }).parse(req.body);
    return { category: await prisma.category.update({ where: { id: req.params.id }, data: b }) };
  });

  app.get('/projects', async (req) => {
    const where = { ...visibleProjectsWhere(req.user) };
    if (req.query.status) where.status = req.query.status;
    const list = await prisma.project.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: { members: { where: { userId: req.user.id }, select: { role: true } } },
    });
    const tw = await visibleTasksWhere(req.user);
    const groups = await prisma.task.groupBy({
      by: ['projectId', 'columnId'],
      where: { AND: [tw, { archivedAt: null }] },
      _count: true,
    });
    const cols = await prisma.boardColumn.findMany({ where: { projectId: { in: list.map((p) => p.id) } }, select: { id: true, isDone: true } });
    const done = new Set(cols.filter((c) => c.isDone).map((c) => c.id));
    return {
      projects: list.map(({ members, ...p }) => {
        const g = groups.filter((x) => x.projectId === p.id);
        const total = g.reduce((s, x) => s + x._count, 0);
        const closed = g.filter((x) => done.has(x.columnId)).reduce((s, x) => s + x._count, 0);
        return { ...p, myRole: isOwner(req.user) ? 'MANAGER' : members[0]?.role, total, closed };
      }),
    };
  });

  app.post('/projects', async (req) => {
    if (!isInternal(req.user)) throw httpError(403, 'دسترسی کافی ندارید');
    const b = projectBody.extend({ templateId: z.string().uuid().optional() }).parse(req.body);
    const { templateId, ...data } = b;
    const project = await prisma.$transaction(async (tx) => {
      const p = await tx.project.create({ data });
      if (!isOwner(req.user)) await tx.projectMember.create({ data: { projectId: p.id, userId: req.user.id, role: 'MANAGER' } });
      const tpl = templateId ? await tx.project.findFirst({ where: { id: templateId, isTemplate: true }, include: { columns: true, labels: true, taskTemplates: true } }) : null;
      if (tpl) {
        await createColumns(tx, p.id, tpl.columns.sort((a, c) => a.position - c.position));
        await tx.label.createMany({ data: tpl.labels.map((l) => ({ projectId: p.id, name: l.name, color: l.color })) });
        await tx.taskTemplate.createMany({ data: tpl.taskTemplates.map((t) => ({ projectId: p.id, name: t.name, data: t.data })) });
      } else await createColumns(tx, p.id);
      await logActivity(tx, { projectId: p.id, userId: req.user.id, action: 'project.created' });
      return p;
    });
    return { project };
  });

  app.get('/projects/:id', async (req) => {
    const role = await requireProjectRole(req.user, req.params.id);
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: {
        columns: { orderBy: { position: 'asc' } },
        labels: true,
        milestones: true,
        members: { include: { user: { select: { id: true, name: true, username: true, role: true } } } },
        telegram: { select: { chatId: true, title: true } },
      },
    });
    if (!project) throw httpError(404, 'پروژه یافت نشد');
    // مشتری فهرست اعضای دیگر را نمی‌بیند جز کادر داخلی
    if (req.user.role === 'CLIENT') project.members = project.members.filter((m) => m.user.role !== 'CLIENT' || m.userId === req.user.id);
    const tw = { AND: [await visibleTasksWhere(req.user), { projectId: project.id, archivedAt: null }] };
    const now = new Date();
    const doneCols = project.columns.filter((c) => c.isDone).map((c) => c.id);
    const [total, closed, overdue, recent] = await Promise.all([
      prisma.task.count({ where: tw }),
      prisma.task.count({ where: { AND: [tw, { columnId: { in: doneCols } }] } }),
      prisma.task.count({ where: { AND: [tw, { columnId: { notIn: doneCols }, dueDate: { lt: now } }] } }),
      prisma.activityLog.findMany({
        where: { projectId: project.id, ...(role === 'MANAGER' || (role === 'CONTRIBUTOR' && req.user.role !== 'CLIENT') ? {} : { userId: req.user.id }) },
        orderBy: { createdAt: 'desc' }, take: 15, include: { user: { select: { name: true } }, task: { select: { number: true, title: true } } },
      }),
    ]);
    return { project, myRole: role, stats: { total, closed, open: total - closed, overdue }, recent };
  });

  app.patch('/projects/:id', async (req) => {
    await requireProjectRole(req.user, req.params.id, 'MANAGER');
    const b = projectBody.partial().parse(req.body);
    const project = await prisma.project.update({ where: { id: req.params.id }, data: b });
    await logActivity(prisma, { projectId: project.id, userId: req.user.id, action: 'project.updated', data: b });
    return { project };
  });

  app.delete('/projects/:id', async (req) => {
    await requireProjectRole(req.user, req.params.id, 'MANAGER');
    await prisma.project.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    return { ok: true };
  });

  // ─── قالب پروژه ───
  app.get('/project-templates', async (req) => {
    if (!isInternal(req.user)) return { templates: [] };
    return { templates: await prisma.project.findMany({ where: { isTemplate: true, deletedAt: null }, select: { id: true, name: true } }) };
  });
  app.post('/projects/:id/save-template', async (req) => {
    await requireProjectRole(req.user, req.params.id, 'MANAGER');
    const { name } = z.object({ name: z.string().min(1) }).parse(req.body);
    const src = await prisma.project.findUnique({ where: { id: req.params.id }, include: { columns: true, labels: true, taskTemplates: true } });
    const tpl = await prisma.$transaction(async (tx) => {
      const t = await tx.project.create({ data: { name, isTemplate: true, color: src.color, icon: src.icon, type: src.type, description: src.description } });
      await tx.boardColumn.createMany({ data: src.columns.map((c) => ({ projectId: t.id, name: c.name, position: c.position, isDone: c.isDone, isDefault: c.isDefault })) });
      await tx.label.createMany({ data: src.labels.map((l) => ({ projectId: t.id, name: l.name, color: l.color })) });
      await tx.taskTemplate.createMany({ data: src.taskTemplates.map((x) => ({ projectId: t.id, name: x.name, data: x.data })) });
      return t;
    });
    return { template: { id: tpl.id, name: tpl.name } };
  });

  // ─── اعضا و دسترسی ───
  app.put('/projects/:id/members/:userId', async (req) => {
    await requireProjectRole(req.user, req.params.id, 'MANAGER');
    const { role } = z.object({ role: roleEnum }).parse(req.body);
    const target = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!target || !target.active) throw httpError(404, 'کاربر یافت نشد');
    const key = { projectId_userId: { projectId: req.params.id, userId: target.id } };
    const existed = await prisma.projectMember.findUnique({ where: key });
    const m = await prisma.projectMember.upsert({ where: key, update: { role }, create: { projectId: req.params.id, userId: target.id, role } });
    if (!existed) {
      const p = await prisma.project.findUnique({ where: { id: req.params.id }, select: { name: true } });
      await notify([target.id], { type: 'project_added', title: 'به یک پروژه اضافه شدید', body: p.name, link: `/projects/${req.params.id}` }, req.user.id);
    }
    return { member: m };
  });
  app.delete('/projects/:id/members/:userId', async (req) => {
    await requireProjectRole(req.user, req.params.id, 'MANAGER');
    await prisma.projectMember.delete({ where: { projectId_userId: { projectId: req.params.id, userId: req.params.userId } } });
    return { ok: true };
  });

  // ─── ستون‌های برد ───
  app.post('/projects/:id/columns', async (req) => {
    await requireProjectRole(req.user, req.params.id, 'MANAGER');
    const b = z.object({ name: z.string().min(1).max(50), isDone: z.boolean().optional() }).parse(req.body);
    const last = await prisma.boardColumn.findFirst({ where: { projectId: req.params.id }, orderBy: { position: 'desc' } });
    return { column: await prisma.boardColumn.create({ data: { ...b, projectId: req.params.id, position: (last?.position ?? 0) + 1000 } }) };
  });
  app.patch('/columns/:id', async (req) => {
    const col = await prisma.boardColumn.findUnique({ where: { id: req.params.id } });
    if (!col) throw httpError(404, 'ستون یافت نشد');
    await requireProjectRole(req.user, col.projectId, 'MANAGER');
    const b = z.object({ name: z.string().min(1).max(50).optional(), position: z.number().optional(), isDone: z.boolean().optional() }).parse(req.body);
    return { column: await prisma.boardColumn.update({ where: { id: col.id }, data: b }) };
  });
  app.delete('/columns/:id', async (req) => {
    const col = await prisma.boardColumn.findUnique({ where: { id: req.params.id } });
    if (!col) throw httpError(404, 'ستون یافت نشد');
    await requireProjectRole(req.user, col.projectId, 'MANAGER');
    if (await prisma.task.count({ where: { columnId: col.id } })) throw httpError(400, 'ابتدا تسک‌های این ستون را جابه‌جا کنید');
    await prisma.boardColumn.delete({ where: { id: col.id } });
    return { ok: true };
  });

  // ─── برچسب‌ها و milestone ───
  app.post('/projects/:id/labels', async (req) => {
    await requireProjectRole(req.user, req.params.id, 'CONTRIBUTOR');
    const b = z.object({ name: z.string().min(1).max(40), color: z.string().optional() }).parse(req.body);
    return { label: await prisma.label.upsert({ where: { projectId_name: { projectId: req.params.id, name: b.name } }, update: { color: b.color }, create: { ...b, projectId: req.params.id } }) };
  });
  app.delete('/labels/:id', async (req) => {
    const l = await prisma.label.findUnique({ where: { id: req.params.id } });
    if (!l) throw httpError(404, 'برچسب یافت نشد');
    await requireProjectRole(req.user, l.projectId, 'MANAGER');
    await prisma.label.delete({ where: { id: l.id } });
    return { ok: true };
  });
  app.post('/projects/:id/milestones', async (req) => {
    await requireProjectRole(req.user, req.params.id, 'MANAGER');
    const b = z.object({ name: z.string().min(1), startDate: z.coerce.date().optional(), dueDate: z.coerce.date().optional() }).parse(req.body);
    return { milestone: await prisma.milestone.create({ data: { ...b, projectId: req.params.id } }) };
  });

  // ─── قالب تسک ───
  app.get('/projects/:id/task-templates', async (req) => {
    await requireProjectRole(req.user, req.params.id, 'REPORTER');
    return { templates: await prisma.taskTemplate.findMany({ where: { projectId: req.params.id } }) };
  });
  app.post('/projects/:id/task-templates', async (req) => {
    await requireProjectRole(req.user, req.params.id, 'MANAGER');
    const b = z.object({ name: z.string().min(1), data: z.object({ title: z.string(), description: z.string().optional(), priority: z.string().optional(), checklist: z.array(z.string()).optional() }) }).parse(req.body);
    return { template: await prisma.taskTemplate.create({ data: { ...b, projectId: req.params.id } }) };
  });

  // ─── نمای بار کاری (فقط کادر داخلی) ───
  app.get('/projects/:id/workload', async (req) => {
    await requireProjectRole(req.user, req.params.id, 'CONTRIBUTOR');
    if (!isInternal(req.user)) throw httpError(403, 'دسترسی کافی ندارید');
    const rows = await prisma.taskAssignee.groupBy({
      by: ['userId'], _count: true,
      where: { task: { projectId: req.params.id, deletedAt: null, archivedAt: null, column: { isDone: false } } },
    });
    const us = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, name: true } });
    return { workload: rows.map((r) => ({ user: us.find((u) => u.id === r.userId), open: r._count })) };
  });
}
