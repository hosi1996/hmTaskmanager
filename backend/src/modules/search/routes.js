import { prisma } from '../../db.js';
import { visibleProjectsWhere, visibleTasksWhere } from '../../lib/access.js';

export default async function search(app) {
  app.get('/search', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return { tasks: [], projects: [], comments: [] };
    const ci = { contains: q, mode: 'insensitive' };
    const tw = await visibleTasksWhere(req.user);
    const [tasks, projects, comments, files] = await Promise.all([
      prisma.task.findMany({
        where: { AND: [tw, { OR: [{ title: ci }, { description: ci }] }] }, take: 15, orderBy: { updatedAt: 'desc' },
        select: { id: true, number: true, title: true, project: { select: { name: true } } },
      }),
      prisma.project.findMany({ where: { AND: [visibleProjectsWhere(req.user), { OR: [{ name: ci }, { description: ci }] }] }, take: 8, select: { id: true, name: true } }),
      prisma.comment.findMany({
        where: { body: ci, task: tw }, take: 10, orderBy: { createdAt: 'desc' },
        select: { id: true, body: true, task: { select: { id: true, title: true } } },
      }),
      prisma.attachment.findMany({ where: { name: ci, task: tw }, take: 8, select: { id: true, name: true, task: { select: { id: true, title: true } } } }),
    ]);
    return { tasks, projects, comments, files };
  });
}
