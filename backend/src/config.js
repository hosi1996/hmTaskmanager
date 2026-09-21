const e = process.env;
const num = (v, d) => (v !== undefined && v !== '' && !isNaN(+v) ? +v : d);

export const config = {
  port: num(e.PORT, 3111),
  appUrl: (e.APP_URL || 'http://localhost:5173').replace(/\/$/, ''),
  redisUrl: e.REDIS_URL || 'redis://localhost:6379',
  uploadDir: e.UPLOAD_DIR || './data/uploads',
  maxUploadBytes: num(e.MAX_UPLOAD_MB, 20) * 1024 * 1024,
  allowedUploadTypes: (
    e.ALLOWED_UPLOAD_TYPES ||
    'image/*,application/pdf,text/plain,application/zip,application/msword,application/vnd.openxmlformats-officedocument.*,application/vnd.ms-excel'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  cookieSecure: e.COOKIE_SECURE !== 'false',
  sessionTtl: num(e.SESSION_TTL_DAYS, 14) * 86400,
  botToken: e.TELEGRAM_BOT_TOKEN || '',
  botInternalToken: e.BOT_INTERNAL_TOKEN || '',
  ownerUsername: e.OWNER_USERNAME || 'admin',
  ownerPassword: e.OWNER_PASSWORD || '',
  ownerName: e.OWNER_NAME || 'مدیر سیستم',
  loginMaxFails: num(e.LOGIN_MAX_FAILS, 5),
  loginLockMinutes: num(e.LOGIN_LOCK_MINUTES, 15),
  rateLimitMax: num(e.RATE_LIMIT_MAX, 300),
  logLevel: e.LOG_LEVEL || 'info',
};

export const mimeAllowed = (mime) =>
  config.allowedUploadTypes.some((p) => (p.endsWith('*') ? mime.startsWith(p.slice(0, -1)) : p === mime));
