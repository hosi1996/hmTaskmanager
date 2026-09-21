import { prisma } from '../db.js';

export const RANK = { VIEWER: 1, REPORTER: 2, CONTRIBUTOR: 3, MANAGER: 4 };
export const isOwner = (u) => u.role === 'OWNER';
export const isInternal = (u) => u.role !== 'CLIENT';
export const httpError = (status, message) => Object.assign(new Error(message), { statusCode: status });

/** نقش کاربر روی پروژه (مالک سیستم = MANAGER). null یعنی بدون دسترسی */
export async function projectRole(user, projectId) {
  if (isOwner(user)) return 'MANAGER';
  const m = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
    select: { role: true },
  });
  return m?.role ?? null;
}

export async function requireProjectRole(user, projectId, min = 'VIEWER') {
  const role = await projectRole(user, projectId);
  if (!role) throw httpError(404, 'پروژه یافت نشد');
  if (RANK[role] < RANK[min]) throw httpError(403, 'دسترسی کافی ندارید');
  return role;
}

/** فیلتر پروژه‌های قابل مشاهده — در سطح کوئری دیتابیس */
export const visibleProjectsWhere = (user) =>
  isOwner(user)
    ? { deletedAt: null, isTemplate: false }
    : { deletedAt: null, isTemplate: false, members: { some: { userId: user.id } } };

const mine = (userId) => [
  { createdById: userId },
  { assignees: { some: { userId } } },
  { watchers: { some: { userId } } },
];

/** MANAGER و (CONTRIBUTOR کارمند) همه‌ی تسک‌های پروژه را می‌بینند؛ بقیه فقط تسک‌های مرتبط با خودشان */
export const seesAll = (user, role) =>
  role === 'MANAGER' || (role === 'CONTRIBUTOR' && user.role !== 'CLIENT');

/** فیلتر تسک‌های قابل مشاهده — در سطح کوئری دیتابیس (ایزوله‌سازی مشتری) */
export async function visibleTasksWhere(user, { includeDeleted = false } = {}) {
  const base = includeDeleted ? {} : { deletedAt: null };
  if (isOwner(user)) return base;
  const ms = await prisma.projectMember.findMany({
    where: { userId: user.id, project: { deletedAt: null } },
    select: { projectId: true, role: true },
  });
  const OR = ms.map((m) =>
    seesAll(user, m.role) ? { projectId: m.projectId } : { projectId: m.projectId, OR: mine(user.id) },
  );
  return { ...base, OR: OR.length ? OR : [{ id: '00000000-0000-4000-8000-000000000000' }] };
}

/** بررسی دسترسی به یک تسک؛ خروجی: {task, role} */
export async function loadTaskFor(user, taskId, min = 'VIEWER', include) {
  const task = await prisma.task.findFirst({ where: { id: taskId, deletedAt: null }, include });
  if (!task) throw httpError(404, 'تسک یافت نشد');
  const role = await projectRole(user, task.projectId);
  if (!role) throw httpError(404, 'تسک یافت نشد');
  if (!seesAll(user, role) && !isOwner(user)) {
    const rel =
      task.createdById === user.id ||
      (await prisma.taskAssignee.findUnique({ where: { taskId_userId: { taskId, userId: user.id } } })) ||
      (await prisma.taskWatcher.findUnique({ where: { taskId_userId: { taskId, userId: user.id } } }));
    if (!rel) throw httpError(404, 'تسک یافت نشد');
  }
  if (RANK[role] < RANK[min]) throw httpError(403, 'دسترسی کافی ندارید');
  return { task, role };
}

/** ویرایش: MANAGER همه؛ CONTRIBUTOR فقط تسک‌های خودش (سازنده/اساین‌شده) */
export async function canEditTask(user, task, role) {
  if (role === 'MANAGER') return true;
  if (role !== 'CONTRIBUTOR') return false;
  if (task.createdById === user.id) return true;
  return !!(await prisma.taskAssignee.findUnique({
    where: { taskId_userId: { taskId: task.id, userId: user.id } },
  }));
}
