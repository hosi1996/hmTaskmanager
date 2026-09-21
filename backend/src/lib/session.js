import { redis } from '../db.js';
import { config } from '../config.js';
import { randomToken } from './security.js';

const key = (sid) => `sess:${sid}`;
const setKey = (uid) => `usess:${uid}`;

export async function createSession(userId, req) {
  const sid = randomToken(32);
  const data = { userId, ip: req.ip, ua: (req.headers['user-agent'] || '').slice(0, 200), createdAt: Date.now() };
  await redis.multi().set(key(sid), JSON.stringify(data), 'EX', config.sessionTtl).sadd(setKey(userId), sid).exec();
  return sid;
}

export async function getSession(sid) {
  if (!sid) return null;
  const raw = await redis.get(key(sid));
  return raw ? JSON.parse(raw) : null;
}

export async function destroySession(sid, userId) {
  await redis.multi().del(key(sid)).srem(setKey(userId), sid).exec();
}

export async function listSessions(userId) {
  const sids = await redis.smembers(setKey(userId));
  const out = [];
  for (const sid of sids) {
    const s = await getSession(sid);
    if (s) out.push({ id: sid, ...s });
    else await redis.srem(setKey(userId), sid);
  }
  return out;
}

export async function destroyAllSessions(userId, exceptSid) {
  for (const sid of await redis.smembers(setKey(userId))) if (sid !== exceptSid) await destroySession(sid, userId);
}

export const cookieOpts = () => ({
  path: '/',
  httpOnly: true,
  sameSite: 'lax',
  secure: config.cookieSecure,
  maxAge: config.sessionTtl,
});
