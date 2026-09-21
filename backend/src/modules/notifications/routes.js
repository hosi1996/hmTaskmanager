import { prisma } from '../../db.js';

export default async function notifications(app) {
  app.get('/notifications', async (req) => {
    const where = { userId: req.user.id };
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.notification.count({ where: { ...where, readAt: null } }),
    ]);
    return { notifications: items, unread };
  });
  app.get('/notifications/count', async (req) => ({
    unread: await prisma.notification.count({ where: { userId: req.user.id, readAt: null } }),
  }));
  app.post('/notifications/read', async (req) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
    await prisma.notification.updateMany({
      where: { userId: req.user.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
    return { ok: true };
  });
}
