import { prisma } from '../../db.js';
import { httpError, isInternal, isOwner } from '../../lib/access.js';
import { logActivity } from '../../lib/notify.js';

/** پروژه‌هایی که کاربر می‌تواند بایگانی/حذف‌شده‌هایشان را ببیند: مالک همه، مدیر پروژه فقط پروژه‌های خودش */
async function scope(user) {
  if (!isInternal(user)) throw httpError(403, 'دسترسی کافی ندارید');
  if (isOwner(user)) return {};
  return { members: { some: { userId: user.id, role: 'MANAGER' } } };
}

export default async function archive(app) {
  app.get('/archive', async (req) => {
    const pw = await scope(req.user);
    const taskInclude = {
      project: { select: { id: true, name: true, color: true } },
      column: { select: { name: true } },
      createdBy: { select: { name: true } },
    };
    const [tasks, deletedTasks, projects] = await Promise.all([
      prisma.task.findMany({ where: { archivedAt: { not: null }, deletedAt: null, project: { deletedAt: null, ...pw } }, include: taskInclude, orderBy: { archivedAt: 'desc' }, take: 200 }),
      prisma.task.findMany({ where: { deletedAt: { not: null }, project: pw }, include: taskInclude, orderBy: { deletedAt: 'desc' }, take: 200 }),
      prisma.project.findMany({ where: { isTemplate: false, ...pw, OR: [{ deletedAt: { not: null } }, { status: 'ARCHIVED' }] }, orderBy: { updatedAt: 'desc' }, take: 100 }),
    ]);
    return { tasks, deletedTasks, projects };
  });

  app.post('/archive/tasks/:id/restore', async (req) => {
    const pw = await scope(req.user);
    const t = await prisma.task.findFirst({ where: { id: req.params.id, project: pw } });
    if (!t) throw httpError(404, 'تسک یافت نشد');
    await prisma.task.update({ where: { id: t.id }, data: { archivedAt: null, deletedAt: null } });
    await logActivity(prisma, { projectId: t.projectId, taskId: t.id, userId: req.user.id, action: 'task.restored' });
    return { ok: true };
  });

  app.post('/archive/projects/:id/restore', async (req) => {
    const pw = await scope(req.user);
    const p = await prisma.project.findFirst({ where: { id: req.params.id, ...pw } });
    if (!p) throw httpError(404, 'پروژه یافت نشد');
    await prisma.project.update({ where: { id: p.id }, data: { deletedAt: null, status: p.status === 'ARCHIVED' ? 'ACTIVE' : p.status } });
    return { ok: true };
  });
}
