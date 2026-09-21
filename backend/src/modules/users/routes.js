import { z } from 'zod';
import { prisma } from '../../db.js';
import { config } from '../../config.js';
import { hashPassword, randomToken, sha256 } from '../../lib/security.js';
import { destroyAllSessions } from '../../lib/session.js';
import { httpError, isOwner } from '../../lib/access.js';

const ownerOnly = (req) => {
  if (!isOwner(req.user)) throw httpError(403, 'فقط مالک سیستم');
};
const sel = { id: true, username: true, name: true, email: true, role: true, active: true, telegramChatId: true, createdAt: true };

export default async function users(app) {
  // جستجوی کاربران برای اساین/منشن: فقط کاربران هم‌پروژه (مالک: همه)
  app.get('/users/lookup', async (req) => {
    const q = String(req.query.q || '').trim();
    const projectId = req.query.projectId;
    const where = { active: true };
    if (q) where.OR = [{ name: { contains: q, mode: 'insensitive' } }, { username: { contains: q, mode: 'insensitive' } }];
    if (projectId) where.memberships = { some: { projectId } };
    else if (!isOwner(req.user)) {
      where.memberships = { some: { project: { members: { some: { userId: req.user.id } } } } };
    }
    if (req.user.role === 'CLIENT') where.role = { not: 'CLIENT' }; // مشتری فقط کادر داخلی را ببیند
    return { users: await prisma.user.findMany({ where, select: { id: true, username: true, name: true, role: true }, take: 20 }) };
  });

  app.get('/users', async (req) => {
    ownerOnly(req);
    return { users: await prisma.user.findMany({ select: sel, orderBy: { createdAt: 'asc' } }) };
  });

  app.post('/users', async (req) => {
    ownerOnly(req);
    const b = z
      .object({
        username: z.string().min(3).max(40).regex(/^[a-zA-Z0-9_.-]+$/), name: z.string().min(1),
        email: z.string().email().optional(), role: z.enum(['STAFF', 'CLIENT']).default('STAFF'),
        password: z.string().min(8).optional(),
      })
      .parse(req.body);
    const password = b.password ?? randomToken(6);
    try {
      const u = await prisma.user.create({
        data: { username: b.username.toLowerCase(), name: b.name, email: b.email, role: b.role, passwordHash: await hashPassword(password) },
        select: sel,
      });
      return { user: u, initialPassword: b.password ? undefined : password };
    } catch (e) {
      if (e.code === 'P2002') throw httpError(409, 'نام کاربری یا ایمیل تکراری است');
      throw e;
    }
  });

  app.patch('/users/:id', async (req) => {
    ownerOnly(req);
    const b = z
      .object({ name: z.string().optional(), email: z.string().email().nullable().optional(), role: z.enum(['STAFF', 'CLIENT']).optional(), active: z.boolean().optional() })
      .parse(req.body);
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw httpError(404, 'کاربر یافت نشد');
    if (target.role === 'OWNER') throw httpError(400, 'تغییر مالک مجاز نیست');
    const u = await prisma.user.update({ where: { id: target.id }, data: b, select: sel });
    if (b.active === false) await destroyAllSessions(target.id);
    return { user: u };
  });

  // ریست دستی رمز توسط مالک
  app.post('/users/:id/reset-password', async (req) => {
    ownerOnly(req);
    const password = randomToken(6);
    await prisma.user.update({ where: { id: req.params.id }, data: { passwordHash: await hashPassword(password), totpEnabled: false, totpSecret: null } });
    await destroyAllSessions(req.params.id);
    return { password };
  });

  // دعوت با لینک یک‌بارمصرف
  app.post('/invites', async (req) => {
    const b = z
      .object({
        email: z.string().email().optional(), role: z.enum(['STAFF', 'CLIENT']).default('CLIENT'),
        projectId: z.string().uuid().optional(), projectRole: z.enum(['VIEWER', 'REPORTER', 'CONTRIBUTOR', 'MANAGER']).optional(),
      })
      .parse(req.body);
    if (!isOwner(req.user)) {
      if (!b.projectId) throw httpError(403, 'دسترسی کافی ندارید');
      const m = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId: b.projectId, userId: req.user.id } } });
      if (m?.role !== 'MANAGER') throw httpError(403, 'دسترسی کافی ندارید');
    }
    const token = randomToken(24);
    await prisma.invite.create({
      data: { ...b, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 7 * 864e5), createdById: req.user.id },
    });
    return { link: `${config.appUrl}/accept-invite?token=${token}` };
  });
}
