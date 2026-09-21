import { hash, verify } from '@node-rs/argon2';
import { createHash, createHmac, randomBytes } from 'node:crypto';

export const hashPassword = (p) => hash(p, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
export const verifyPassword = async (h, p) => {
  try {
    return await verify(h, p);
  } catch {
    return false;
  }
};
export const randomToken = (n = 32) => randomBytes(n).toString('hex');
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// ─── TOTP (RFC 6238) ───
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const newTotpSecret = () => {
  let bits = '';
  let out = '';
  for (const x of randomBytes(20)) bits += x.toString(2).padStart(8, '0');
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
};
const b32decode = (s) => {
  let bits = '';
  for (const c of s.replace(/=+$/, '')) bits += B32.indexOf(c).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
};
const hotp = (secret, counter) => {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', b32decode(secret)).update(buf).digest();
  const o = h[h.length - 1] & 15;
  const code = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % 1e6).padStart(6, '0');
};
export const verifyTotp = (secret, code) => {
  const step = Math.floor(Date.now() / 30000);
  return [-1, 0, 1].some((d) => hotp(secret, step + d) === String(code).trim());
};
export const totpUri = (secret, account) =>
  `otpauth://totp/hmTaskManager:${encodeURIComponent(account)}?secret=${secret}&issuer=hmTaskManager`;
