import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import { prisma, redis } from './db.js';
import { getSession } from './lib/session.js';
import { startScheduler } from './scheduler.js';
import auth from './modules/auth/routes.js';
import users from './modules/users/routes.js';
import projects from './modules/projects/routes.js';
import tasks from './modules/tasks/routes.js';
import comments from './modules/comments/routes.js';
import files from './modules/files/routes.js';
import notifications from './modules/notifications/routes.js';
import telegram from './modules/telegram/routes.js';
import reports from './modules/reports/routes.js';
import search from './modules/search/routes.js';

const app = Fastify({ logger: { level: config.logLevel }, trustProxy: true, bodyLimit: 1024 * 1024 });

await app.register(cookie);
await app.register(rateLimit, { max: config.rateLimitMax, timeWindow: '1 minute', redis });
await app.register(multipart, { limits: { fileSize: config.maxUploadBytes, files: 10 } });

const safeEq = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

app.decorateRequest('user', null);
app.decorateRequest('sid', null);

// احراز هویت + CSRF (هدر سفارشی برای درخواست‌های تغییردهنده) + توکن داخلی بات
app.addHook('onRequest', async (req, reply) => {
  const url = req.url;
  if (url.startsWith('/internal/')) {
    const t = req.headers['x-bot-token'];
    if (!config.botInternalToken || typeof t !== 'string' || !safeEq(t, config.botInternalToken)) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    return;
  }
  if (req.routeOptions.config?.public) return;

  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-requested-with'] !== 'hm') {
    return reply.code(403).send({ error: 'درخواست نامعتبر' });
  }
  const sid = req.cookies.sid;
  const s = await getSession(sid);
  if (!s) return reply.code(401).send({ error: 'ورود لازم است' });
  const user = await prisma.user.findUnique({ where: { id: s.userId } });
  if (!user || !user.active) return reply.code(401).send({ error: 'ورود لازم است' });
  req.user = user;
  req.sid = sid;
});

app.setErrorHandler((err, req, reply) => {
  if (err.name === 'ZodError') {
    return reply.code(400).send({ error: 'داده نامعتبر', issues: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
  }
  const status = err.statusCode || 500;
  if (status >= 500) req.log.error(err);
  reply.code(status).send({ error: status >= 500 ? 'خطای داخلی سرور' : err.message });
});

app.get('/health', { config: { public: true } }, async () => {
  await prisma.$queryRaw`SELECT 1`;
  await redis.ping();
  return { ok: true, time: new Date().toISOString() };
});

await app.register(auth, { prefix: '/api' });
await app.register(users, { prefix: '/api' });
await app.register(projects, { prefix: '/api' });
await app.register(tasks, { prefix: '/api' });
await app.register(comments, { prefix: '/api' });
await app.register(files, { prefix: '/api' });
await app.register(notifications, { prefix: '/api' });
await app.register(reports, { prefix: '/api' });
await app.register(search, { prefix: '/api' });
await app.register(telegram);

startScheduler(app.log);

const close = async () => {
  await app.close();
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
};
process.on('SIGTERM', close);
process.on('SIGINT', close);

await app.listen({ port: config.port, host: '0.0.0.0' });
