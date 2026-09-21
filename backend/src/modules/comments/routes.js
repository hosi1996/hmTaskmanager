import { z } from 'zod';
import { prisma } from '../../db.js';
import { httpError, isOwner, loadTaskFor } from '../../lib/access.js';
import { notify, taskAudience } from '../../lib/notify.js';

// mention به شکل @username در متن
const mentions = async (body, projectId) => {
  const names = [...new Set([...body.matchAll(/@([a-zA-Z0-9_.-]{3,40})/g)].map((m) => m[1].toLowerCase()))];
  if (!names.length) return [];
  const us = await prisma.user.findMany({ where: { username: { in: names }, active: true, memberships: { some: { projectId } } }, select: { id: true } });
  return us.map((u) => u.id);
};

export default async function comments(app) {
  app.get('/tasks/:id/comments', async (req) => {
    await loadTaskFor(req.user, req.params.id);
    return {
      comments: await prisma.comment.findMany({
        where: { taskId: req.params.id }, orderBy: { createdAt: 'asc' },
        include: { author: { select: { id: true, name: true, username: true } } },
      }),
    };
  });

  app.post('/tasks/:id/comments', async (req) => {
    // Viewer فقط می‌بیند؛ از Reporter به بالا می‌تواند کامنت بگذارد
    const { task } = await loadTaskFor(req.user, req.params.id, 'REPORTER');
    const { body } = z.object({ body: z.string().min(1).max(10000) }).parse(req.body);
    const c = await prisma.comment.create({
      data: { taskId: task.id, authorId: req.user.id, body },
      include: { author: { select: { id: true, name: true, username: true } } },
    });
    const ment = await mentions(body, task.projectId);
    await notify(ment, { type: 'mention', title: `${req.user.name} شما را منشن کرد`, body: task.title, link: `/tasks/${task.id}` }, req.user.id);
    const aud = (await taskAudience(task.id)).filter((id) => !ment.includes(id));
    await notify(aud, { type: 'comment', title: `کامنت جدید روی #${task.number}`, body: `${req.user.name}: ${body.slice(0, 120)}`, link: `/tasks/${task.id}` }, req.user.id);
    return { comment: c };
  });

  app.patch('/comments/:id', async (req) => {
    const c = await prisma.comment.findUnique({ where: { id: req.params.id } });
    if (!c || c.authorId !== req.user.id) throw httpError(403, 'فقط نویسنده می‌تواند ویرایش کند');
    await loadTaskFor(req.user, c.taskId);
    const { body } = z.object({ body: z.string().min(1).max(10000) }).parse(req.body);
    return { comment: await prisma.comment.update({ where: { id: c.id }, data: { body, editedAt: new Date() } }) };
  });

  app.delete('/comments/:id', async (req) => {
    const c = await prisma.comment.findUnique({ where: { id: req.params.id } });
    if (!c) throw httpError(404, 'یافت نشد');
    const { role } = await loadTaskFor(req.user, c.taskId);
    if (c.authorId !== req.user.id && role !== 'MANAGER' && !isOwner(req.user)) throw httpError(403, 'اجازه حذف ندارید');
    await prisma.comment.delete({ where: { id: c.id } });
    return { ok: true };
  });
}
