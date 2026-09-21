import { createReadStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { prisma } from '../../db.js';
import { mimeAllowed } from '../../config.js';
import { canEditTask, httpError, loadTaskFor } from '../../lib/access.js';
import { filePath, saveStream } from '../../lib/files.js';
import { logActivity } from '../../lib/notify.js';

const asciiName = (n) => encodeURIComponent(n);

export default async function files(app) {
  app.post('/tasks/:id/attachments', async (req) => {
    const { task, role } = await loadTaskFor(req.user, req.params.id, 'REPORTER');
    // Reporter فقط روی تسک‌های خودش؛ Contributor+ طبق قانون ویرایش
    if (role === 'REPORTER' && task.createdById !== req.user.id) throw httpError(403, 'اجازه آپلود ندارید');
    if (role === 'CONTRIBUTOR' && !(await canEditTask(req.user, task, role))) throw httpError(403, 'اجازه آپلود ندارید');
    const saved = [];
    for await (const part of req.files()) {
      if (!mimeAllowed(part.mimetype)) {
        part.file.resume();
        throw httpError(415, `نوع فایل مجاز نیست: ${part.mimetype}`);
      }
      saved.push(await saveStream(task.id, part.file, { name: part.filename.slice(0, 200), mime: part.mimetype, userId: req.user.id }));
    }
    await logActivity(prisma, { projectId: task.projectId, taskId: task.id, userId: req.user.id, action: 'task.attached', data: { names: saved.map((s) => s.name) } });
    return { attachments: saved };
  });

  // دانلود فقط با احراز هویت (فایل‌ها خارج از مسیر public نگهداری می‌شوند)
  app.get('/attachments/:id', async (req, reply) => {
    const a = await prisma.attachment.findUnique({ where: { id: req.params.id } });
    if (!a) throw httpError(404, 'فایل یافت نشد');
    await loadTaskFor(req.user, a.taskId);
    const inline = a.mime.startsWith('image/') && a.mime !== 'image/svg+xml';
    reply
      .header('content-type', inline ? a.mime : 'application/octet-stream')
      .header('content-disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${asciiName(a.name)}`)
      .header('x-content-type-options', 'nosniff')
      .header('cache-control', 'private, max-age=86400');
    return reply.send(createReadStream(filePath(a.id)));
  });

  app.delete('/attachments/:id', async (req) => {
    const a = await prisma.attachment.findUnique({ where: { id: req.params.id } });
    if (!a) throw httpError(404, 'فایل یافت نشد');
    const { role } = await loadTaskFor(req.user, a.taskId);
    if (role !== 'MANAGER' && a.uploadedById !== req.user.id) throw httpError(403, 'اجازه حذف ندارید');
    await prisma.attachment.delete({ where: { id: a.id } });
    await unlink(filePath(a.id)).catch(() => {});
    return { ok: true };
  });
}
