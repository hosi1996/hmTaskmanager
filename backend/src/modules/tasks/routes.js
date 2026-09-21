import { z } from 'zod';
import { prisma } from '../../db.js';
import { RANK, canEditTask, httpError, isOwner, loadTaskFor, requireProjectRole, visibleTasksWhere } from '../../lib/access.js';
import { createTask, onColumnChanged, taskInclude, notify, taskAudience, logActivity } from './service.js';

const priority = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
const fields = {
  title: z.string().min(1).max(300),
  description: z.string().max(50000),
  categoryId: z.string().uuid().nullable(),
  milestoneId: z.string().uuid().nullable(),
  priority,
  startDate: z.coerce.date().nullable(),
  dueDate: z.coerce.date().nullable(),
  estimateMin: z.number().int().min(0).nullable(),
  recurrence: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']).nullable(),
};
const createBody = z.object({
  ...fields,
  columnId: z.string().uuid(),
  assigneeIds: z.array(z.string().uuid()),
  labelIds: z.array(z.string().uuid()),
  checklist: z.array(z.string()),
}).partial().required({ title: true });

const decorate = (t) => {
  const { assignees, watchers, labels, ...rest } = t;
  return { ...rest, assignees: assignees.map((a) => a.user), watchers: watchers.map((a) => a.user), labels: labels.map((l) => l.label) };
};

// ستون‌هایی که در PATCH فقط MANAGER می‌تواند تغییر دهد
const MANAGER_ONLY = ['assigneeIds', 'milestoneId'];

export default async function tasks(app) {
  // ─── فهرست با فیلتر (همیشه محدود به تسک‌های قابل‌مشاهده) ───
  app.get('/tasks', async (req) => {
    const q = req.query;
    const AND = [await visibleTasksWhere(req.user)];
    if (q.projectId) AND.push({ projectId: q.projectId });
    if (q.columnId) AND.push({ columnId: q.columnId });
    if (q.categoryId) AND.push({ categoryId: q.categoryId });
    if (q.priority) AND.push({ priority: q.priority });
    if (q.labelId) AND.push({ labels: { some: { labelId: q.labelId } } });
    if (q.assignee) AND.push({ assignees: { some: { userId: q.assignee === 'me' ? req.user.id : q.assignee } } });
    if (q.createdBy) AND.push({ createdById: q.createdBy === 'me' ? req.user.id : q.createdBy });
    if (q.status === 'open') AND.push({ column: { isDone: false } });
    if (q.status === 'done') AND.push({ column: { isDone: true } });
    if (q.overdue === '1') AND.push({ dueDate: { lt: new Date() }, column: { isDone: false } });
    if (q.from || q.to) AND.push({ dueDate: { ...(q.from && { gte: new Date(q.from) }), ...(q.to && { lte: new Date(q.to) }) } });
    if (q.q) AND.push({ OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { description: { contains: q.q, mode: 'insensitive' } }] });
    AND.push(q.archived === '1' ? { archivedAt: { not: null } } : { archivedAt: null });
    const sortMap = { due: { dueDate: { sort: 'asc', nulls: 'last' } }, created: { createdAt: 'desc' }, priority: { priority: 'desc' }, position: { position: 'asc' } };
    const take = Math.min(+q.limit || 200, 500);
    const list = await prisma.task.findMany({
      where: { AND }, include: { ...taskInclude, project: { select: { id: true, name: true, color: true } } },
      orderBy: sortMap[q.sort] ?? sortMap.position, take, skip: +q.offset || 0,
    });
    return { tasks: list.map(decorate) };
  });

  // ─── ایجاد (Reporter و بالاتر) ───
  app.post('/projects/:id/tasks', async (req) => {
    await requireProjectRole(req.user, req.params.id, 'REPORTER');
    const role = await requireProjectRole(req.user, req.params.id, 'REPORTER');
    const b = createBody.parse(req.body);
    if (RANK[role] < RANK.MANAGER) {
      // غیرمدیر نمی‌تواند اساین/milestone تعیین کند یا ستون دلخواه بدهد
      delete b.assigneeIds; delete b.milestoneId; delete b.columnId;
    }
    if (b.columnId) {
      const c = await prisma.boardColumn.findFirst({ where: { id: b.columnId, projectId: req.params.id } });
      if (!c) throw httpError(400, 'ستون نامعتبر');
    }
    if (b.assigneeIds?.length) {
      const n = await prisma.projectMember.count({ where: { projectId: req.params.id, userId: { in: b.assigneeIds } } });
      if (n !== b.assigneeIds.length) throw httpError(400, 'اساین‌شونده باید عضو پروژه باشد');
    }
    const task = await createTask(req.params.id, req.user.id, b);
    if (b.assigneeIds?.length) {
      await notify(b.assigneeIds, { type: 'assigned', title: 'تسک جدید به شما اساین شد', body: task.title, link: `/tasks/${task.id}` }, req.user.id);
    }
    // اطلاع به مدیران پروژه از تسکِ ثبت‌شده توسط مشتری/گزارش‌دهنده
    if (RANK[role] < RANK.CONTRIBUTOR) {
      const mgrs = await prisma.projectMember.findMany({ where: { projectId: req.params.id, role: 'MANAGER' }, select: { userId: true } });
      await notify(mgrs.map((m) => m.userId), { type: 'task_created', title: 'تسک جدید ثبت شد', body: task.title, link: `/tasks/${task.id}` }, req.user.id);
    }
    return { task };
  });

  // ─── جزئیات ───
  app.get('/tasks/:id', async (req) => {
    const { task } = await loadTaskFor(req.user, req.params.id);
    const full = await prisma.task.findUnique({
      where: { id: task.id },
      include: {
        ...taskInclude,
        project: { select: { id: true, name: true, color: true } },
        milestone: true,
        checklist: { orderBy: { position: 'asc' } },
        attachments: { orderBy: { createdAt: 'asc' } },
        blocks: { select: { blocked: { select: { id: true, number: true, title: true } } } },
        blockedBy: { select: { blocker: { select: { id: true, number: true, title: true, column: { select: { isDone: true } } } } } },
        activities: { orderBy: { createdAt: 'desc' }, take: 50, include: { user: { select: { name: true } } } },
        timeEntries: { orderBy: { startedAt: 'desc' }, include: { user: { select: { name: true } } } },
      },
    });
    const { blocks, blockedBy, ...rest } = decorate(full);
    const spent = full.timeEntries.reduce((s, t) => s + t.minutes, 0);
    const running = full.timeEntries.find((t) => !t.endedAt && t.userId === req.user.id) ?? null;
    return { task: { ...rest, blocks: blocks.map((b) => b.blocked), blockedBy: blockedBy.map((b) => b.blocker), spentMin: spent, runningTimer: running } };
  });

  // ─── ویرایش ───
  app.patch('/tasks/:id', async (req) => {
    const { task, role } = await loadTaskFor(req.user, req.params.id);
    const schema = z.object({
      ...fields, columnId: z.string().uuid(), position: z.number(),
      assigneeIds: z.array(z.string().uuid()), watcherIds: z.array(z.string().uuid()),
      labelIds: z.array(z.string().uuid()), archived: z.boolean(),
    }).partial();
    const b = schema.parse(req.body);
    const isManager = role === 'MANAGER';
    if (!(await canEditTask(req.user, task, role))) throw httpError(403, 'اجازه ویرایش این تسک را ندارید');
    if (!isManager && MANAGER_ONLY.some((k) => k in b)) throw httpError(403, 'فقط مدیر پروژه');

    const { assigneeIds, watcherIds, labelIds, archived, columnId, ...plain } = b;
    const data = { ...plain };
    const acts = [];
    for (const k of ['title', 'priority', 'dueDate', 'startDate', 'categoryId', 'estimateMin', 'recurrence']) {
      if (k in plain && String(plain[k] ?? '') !== String(task[k] ?? '')) acts.push({ action: 'task.field', data: { field: k, from: task[k], to: plain[k] } });
    }
    let newCol = null;
    if (columnId && columnId !== task.columnId) {
      newCol = await prisma.boardColumn.findFirst({ where: { id: columnId, projectId: task.projectId } });
      if (!newCol) throw httpError(400, 'ستون نامعتبر');
      // تسک مسدودشده را نمی‌شود بست
      if (newCol.isDone) {
        const open = await prisma.taskDependency.count({ where: { blockedId: task.id, blocker: { column: { isDone: false }, deletedAt: null } } });
        if (open) throw httpError(400, 'این تسک توسط تسک‌های باز دیگری مسدود شده است');
      }
      data.columnId = columnId;
      const old = await prisma.boardColumn.findUnique({ where: { id: task.columnId } });
      acts.push({ action: 'task.moved', data: { from: old.name, to: newCol.name } });
    }
    if (archived !== undefined) data.archivedAt = archived ? new Date() : null;

    await prisma.$transaction(async (tx) => {
      if (assigneeIds) {
        const n = await tx.projectMember.count({ where: { projectId: task.projectId, userId: { in: assigneeIds } } });
        if (n !== assigneeIds.length) throw httpError(400, 'اساین‌شونده باید عضو پروژه باشد');
        await tx.taskAssignee.deleteMany({ where: { taskId: task.id } });
        await tx.taskAssignee.createMany({ data: assigneeIds.map((userId) => ({ taskId: task.id, userId })) });
        acts.push({ action: 'task.assigned', data: { userIds: assigneeIds } });
      }
      if (watcherIds) {
        await tx.taskWatcher.deleteMany({ where: { taskId: task.id } });
        await tx.taskWatcher.createMany({ data: watcherIds.map((userId) => ({ taskId: task.id, userId })), skipDuplicates: true });
      }
      if (labelIds) {
        await tx.taskLabel.deleteMany({ where: { taskId: task.id } });
        await tx.taskLabel.createMany({ data: labelIds.map((labelId) => ({ taskId: task.id, labelId })) });
      }
      if (Object.keys(data).length) await tx.task.update({ where: { id: task.id }, data });
      for (const a of acts) await logActivity(tx, { projectId: task.projectId, taskId: task.id, userId: req.user.id, ...a });
    });

    if (newCol) {
      await onColumnChanged(task, newCol, req.user.id);
      await notify(await taskAudience(task.id), { type: 'status', title: `وضعیت تسک #${task.number} تغییر کرد`, body: `${task.title} ← ${newCol.name}`, link: `/tasks/${task.id}` }, req.user.id);
    }
    if (assigneeIds) {
      const prev = await prisma.activityLog.findMany({ where: { taskId: task.id, action: 'task.assigned' }, orderBy: { createdAt: 'desc' }, take: 2 });
      const before = new Set(prev[1]?.data?.userIds ?? []);
      await notify(assigneeIds.filter((i) => !before.has(i)), { type: 'assigned', title: 'تسک به شما اساین شد', body: task.title, link: `/tasks/${task.id}` }, req.user.id);
    }
    return { ok: true };
  });

  // ─── حذف نرم (فقط Manager) ───
  app.delete('/tasks/:id', async (req) => {
    const { task } = await loadTaskFor(req.user, req.params.id, 'MANAGER');
    await prisma.task.update({ where: { id: task.id }, data: { deletedAt: new Date() } });
    await logActivity(prisma, { projectId: task.projectId, taskId: task.id, userId: req.user.id, action: 'task.deleted' });
    return { ok: true };
  });

  // ─── عملیات گروهی ───
  app.post('/tasks/bulk', async (req) => {
    const b = z.object({
      ids: z.array(z.string().uuid()).min(1).max(200),
      action: z.enum(['move', 'assign', 'priority', 'delete', 'archive']),
      value: z.any().optional(),
    }).parse(req.body);
    let done = 0;
    for (const id of b.ids) {
      try {
        const { task, role } = await loadTaskFor(req.user, id, 'MANAGER');
        if (b.action === 'move') {
          const col = await prisma.boardColumn.findFirst({ where: { id: b.value, projectId: task.projectId } });
          if (!col) continue;
          await prisma.task.update({ where: { id }, data: { columnId: col.id } });
          await onColumnChanged(task, col, req.user.id);
        } else if (b.action === 'assign') {
          await prisma.$transaction([
            prisma.taskAssignee.deleteMany({ where: { taskId: id } }),
            prisma.taskAssignee.createMany({ data: [].concat(b.value).map((userId) => ({ taskId: id, userId })), skipDuplicates: true }),
          ]);
        } else if (b.action === 'priority') await prisma.task.update({ where: { id }, data: { priority: priority.parse(b.value) } });
        else if (b.action === 'archive') await prisma.task.update({ where: { id }, data: { archivedAt: new Date() } });
        else await prisma.task.update({ where: { id }, data: { deletedAt: new Date() } });
        void role; done++;
      } catch { /* تسک‌های بدون دسترسی نادیده گرفته می‌شوند */ }
    }
    return { done };
  });

  // ─── چک‌لیست ───
  app.post('/tasks/:id/checklist', async (req) => {
    const { task, role } = await loadTaskFor(req.user, req.params.id);
    if (!(await canEditTask(req.user, task, role))) throw httpError(403, 'اجازه ویرایش ندارید');
    const { text } = z.object({ text: z.string().min(1).max(300) }).parse(req.body);
    const last = await prisma.checklistItem.findFirst({ where: { taskId: task.id }, orderBy: { position: 'desc' } });
    return { item: await prisma.checklistItem.create({ data: { taskId: task.id, text, position: (last?.position ?? 0) + 1000 } }) };
  });
  app.patch('/checklist/:id', async (req) => {
    const it = await prisma.checklistItem.findUnique({ where: { id: req.params.id } });
    if (!it) throw httpError(404, 'یافت نشد');
    const { task, role } = await loadTaskFor(req.user, it.taskId);
    if (!(await canEditTask(req.user, task, role))) throw httpError(403, 'اجازه ویرایش ندارید');
    const b = z.object({ text: z.string().min(1).max(300).optional(), done: z.boolean().optional() }).parse(req.body);
    return { item: await prisma.checklistItem.update({ where: { id: it.id }, data: b }) };
  });
  app.delete('/checklist/:id', async (req) => {
    const it = await prisma.checklistItem.findUnique({ where: { id: req.params.id } });
    if (!it) throw httpError(404, 'یافت نشد');
    const { task, role } = await loadTaskFor(req.user, it.taskId);
    if (!(await canEditTask(req.user, task, role))) throw httpError(403, 'اجازه ویرایش ندارید');
    await prisma.checklistItem.delete({ where: { id: it.id } });
    return { ok: true };
  });

  // ─── وابستگی ───
  app.post('/tasks/:id/deps', async (req) => {
    const { task } = await loadTaskFor(req.user, req.params.id, 'MANAGER');
    const { blockerId } = z.object({ blockerId: z.string().uuid() }).parse(req.body);
    if (blockerId === task.id) throw httpError(400, 'تسک نمی‌تواند به خودش وابسته باشد');
    const other = await prisma.task.findFirst({ where: { id: blockerId, projectId: task.projectId, deletedAt: null } });
    if (!other) throw httpError(400, 'تسک مقصد باید در همین پروژه باشد');
    const cycle = await prisma.taskDependency.findUnique({ where: { blockerId_blockedId: { blockerId: task.id, blockedId: blockerId } } });
    if (cycle) throw httpError(400, 'وابستگی دوطرفه مجاز نیست');
    await prisma.taskDependency.upsert({ where: { blockerId_blockedId: { blockerId, blockedId: task.id } }, update: {}, create: { blockerId, blockedId: task.id } });
    return { ok: true };
  });
  app.delete('/tasks/:id/deps/:blockerId', async (req) => {
    await loadTaskFor(req.user, req.params.id, 'MANAGER');
    await prisma.taskDependency.deleteMany({ where: { blockedId: req.params.id, blockerId: req.params.blockerId } });
    return { ok: true };
  });

  // ─── زمان‌سنجی ───
  app.post('/tasks/:id/time', async (req) => {
    const { task, role } = await loadTaskFor(req.user, req.params.id, 'CONTRIBUTOR');
    void role;
    const b = z.object({ minutes: z.number().int().min(1).max(24 * 60), note: z.string().max(200).optional() }).parse(req.body);
    const now = new Date();
    return { entry: await prisma.timeEntry.create({ data: { taskId: task.id, userId: req.user.id, minutes: b.minutes, note: b.note ?? '', endedAt: now } }) };
  });
  app.post('/tasks/:id/timer/start', async (req) => {
    const { task } = await loadTaskFor(req.user, req.params.id, 'CONTRIBUTOR');
    const running = await prisma.timeEntry.findFirst({ where: { userId: req.user.id, endedAt: null } });
    if (running) throw httpError(409, 'یک تایمر دیگر در حال اجراست');
    return { entry: await prisma.timeEntry.create({ data: { taskId: task.id, userId: req.user.id } }) };
  });
  app.post('/tasks/:id/timer/stop', async (req) => {
    const running = await prisma.timeEntry.findFirst({ where: { taskId: req.params.id, userId: req.user.id, endedAt: null } });
    if (!running) throw httpError(404, 'تایمر فعالی نیست');
    const end = new Date();
    const minutes = Math.max(1, Math.round((end - running.startedAt) / 60000));
    return { entry: await prisma.timeEntry.update({ where: { id: running.id }, data: { endedAt: end, minutes } }) };
  });

  // ─── فیلترهای ذخیره‌شده ───
  app.get('/views', async (req) => ({ views: await prisma.savedView.findMany({ where: { userId: req.user.id } }) }));
  app.post('/views', async (req) => {
    const b = z.object({ name: z.string().min(1).max(60), filters: z.record(z.any()) }).parse(req.body);
    return { view: await prisma.savedView.create({ data: { ...b, userId: req.user.id } }) };
  });
  app.delete('/views/:id', async (req) => {
    await prisma.savedView.deleteMany({ where: { id: req.params.id, userId: req.user.id } });
    return { ok: true };
  });

  void isOwner;
}
