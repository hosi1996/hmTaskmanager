import { z } from 'zod';
import { prisma, redis } from '../../db.js';
import { config } from '../../config.js';
import { hashPassword, verifyPassword, verifyTotp, newTotpSecret, totpUri, sha256, randomToken } from '../../lib/security.js';
import { createSession, destroySession, listSessions, destroyAllSessions, cookieOpts } from '../../lib/session.js';
import { httpError } from '../../lib/access.js';

export const publicUser = (u) => ({
  id: u.id, username: u.username, email: u.email, name: u.name, role: u.role,
  totpEnabled: u.totpEnabled, telegramLinked: !!u.telegramChatId, notifyPrefs: u.notifyPrefs,
});

const passwordSchema = z.string().min(8, 'رمز عبور حداقل ۸ کاراکتر').max(200);

export default async function auth(app) {
  const strict = { rateLimit: { max: 10, timeWindow: '1 minute' } };

  app.post('/auth/login', { config: { public: true, ...strict } }, async (req, reply) => {
    const { username, password, code } = z
      .object({ username: z.string().min(1), password: z.string().min(1), code: z.string().optional() })
      .parse(req.body);
    const uname = username.trim().toLowerCase();
    const lockKey = `lock:${uname}`;
    const fails = +((await redis.get(lockKey)) || 0);
    if (fails >= config.loginMaxFails) throw httpError(429, `حساب موقتاً قفل شد. ${config.loginLockMinutes} دقیقه بعد تلاش کنید`);

    const user = await prisma.user.findFirst({ where: { OR: [{ username: uname }, { email: uname }] } });
    const ok = user && user.active && (await verifyPassword(user.passwordHash, password));
    if (!ok) {
      await redis.multi().incr(lockKey).expire(lockKey, config.loginLockMinutes * 60).exec();
      throw httpError(401, 'نام کاربری یا رمز عبور اشتباه است');
    }
    if (user.totpEnabled) {
      if (!code) return reply.code(200).send({ need2fa: true });
      if (!verifyTotp(user.totpSecret, code)) {
        await redis.multi().incr(lockKey).expire(lockKey, config.loginLockMinutes * 60).exec();
        throw httpError(401, 'کد دو مرحله‌ای اشتباه است');
      }
    }
    await redis.del(lockKey);
    const sid = await createSession(user.id, req);
    reply.setCookie('sid', sid, cookieOpts());
    return { user: publicUser(user) };
  });

  app.post('/auth/logout', async (req, reply) => {
    await destroySession(req.sid, req.user.id);
    reply.clearCookie('sid', { path: '/' });
    return { ok: true };
  });

  app.get('/me', async (req) => ({ user: publicUser(req.user) }));

  app.patch('/me', async (req) => {
    const b = z
      .object({ name: z.string().min(1).max(100).optional(), email: z.string().email().nullable().optional(), notifyPrefs: z.record(z.any()).optional() })
      .parse(req.body);
    const u = await prisma.user.update({ where: { id: req.user.id }, data: b });
    return { user: publicUser(u) };
  });

  app.post('/me/password', async (req) => {
    const b = z.object({ current: z.string(), next: passwordSchema }).parse(req.body);
    if (!(await verifyPassword(req.user.passwordHash, b.current))) throw httpError(400, 'رمز فعلی اشتباه است');
    await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash: await hashPassword(b.next) } });
    await destroyAllSessions(req.user.id, req.sid);
    return { ok: true };
  });

  // ─── نشست‌های فعال ───
  app.get('/me/sessions', async (req) => {
    const list = await listSessions(req.user.id);
    return { sessions: list.map((s) => ({ ...s, current: s.id === req.sid })) };
  });
  app.delete('/me/sessions/:id', async (req) => {
    await destroySession(req.params.id, req.user.id);
    return { ok: true };
  });

  // ─── 2FA ───
  app.post('/me/2fa/setup', async (req) => {
    const secret = newTotpSecret();
    await redis.set(`totp:setup:${req.user.id}`, secret, 'EX', 600);
    return { secret, uri: totpUri(secret, req.user.username) };
  });
  app.post('/me/2fa/enable', async (req) => {
    const { code } = z.object({ code: z.string() }).parse(req.body);
    const secret = await redis.get(`totp:setup:${req.user.id}`);
    if (!secret || !verifyTotp(secret, code)) throw httpError(400, 'کد اشتباه است');
    await prisma.user.update({ where: { id: req.user.id }, data: { totpSecret: secret, totpEnabled: true } });
    await redis.del(`totp:setup:${req.user.id}`);
    return { ok: true };
  });
  app.post('/me/2fa/disable', async (req) => {
    const { password } = z.object({ password: z.string() }).parse(req.body);
    if (!(await verifyPassword(req.user.passwordHash, password))) throw httpError(400, 'رمز عبور اشتباه است');
    await prisma.user.update({ where: { id: req.user.id }, data: { totpEnabled: false, totpSecret: null } });
    return { ok: true };
  });

  // ─── اتصال حساب تلگرام (کاربر در چت خصوصی بات /start CODE می‌فرستد) ───
  app.post('/me/telegram-link', async (req) => {
    const code = randomToken(4).toUpperCase();
    await redis.set(`tglink:${code}`, req.user.id, 'EX', 600);
    return { code };
  });
  app.delete('/me/telegram-link', async (req) => {
    await prisma.user.update({ where: { id: req.user.id }, data: { telegramChatId: null, telegramUserId: null } });
    return { ok: true };
  });

  // ─── پذیرش دعوت‌نامه ───
  app.get('/auth/invite/:token', { config: { public: true, ...strict } }, async (req) => {
    const inv = await prisma.invite.findUnique({ where: { tokenHash: sha256(req.params.token) } });
    if (!inv || inv.usedAt || inv.expiresAt < new Date()) throw httpError(404, 'دعوت‌نامه نامعتبر یا منقضی است');
    return { email: inv.email, role: inv.role };
  });
  app.post('/auth/accept-invite', { config: { public: true, ...strict } }, async (req, reply) => {
    const b = z
      .object({
        token: z.string(), username: z.string().min(3).max(40).regex(/^[a-zA-Z0-9_.-]+$/),
        name: z.string().min(1).max(100), password: passwordSchema,
      })
      .parse(req.body);
    const inv = await prisma.invite.findUnique({ where: { tokenHash: sha256(b.token) } });
    if (!inv || inv.usedAt || inv.expiresAt < new Date()) throw httpError(404, 'دعوت‌نامه نامعتبر یا منقضی است');
    const username = b.username.toLowerCase();
    if (await prisma.user.findUnique({ where: { username } })) throw httpError(409, 'این نام کاربری قبلاً گرفته شده');
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { username, name: b.name, email: inv.email, role: inv.role, passwordHash: await hashPassword(b.password) },
      });
      if (inv.projectId) {
        await tx.projectMember.create({ data: { projectId: inv.projectId, userId: u.id, role: inv.projectRole ?? 'REPORTER' } });
      }
      await tx.invite.update({ where: { id: inv.id }, data: { usedAt: new Date() } });
      return u;
    });
    const sid = await createSession(user.id, req);
    reply.setCookie('sid', sid, cookieOpts());
    return { user: publicUser(user) };
  });
}
