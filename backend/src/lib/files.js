import { createWriteStream } from 'node:fs';
import { mkdir, writeFile, unlink, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { config } from '../config.js';
import { prisma } from '../db.js';

export const filePath = (id) => join(config.uploadDir, id);

export async function saveStream(taskId, stream, { name, mime, userId }) {
  await mkdir(config.uploadDir, { recursive: true });
  const id = randomUUID();
  try {
    await pipeline(stream, createWriteStream(filePath(id)));
    if (stream.truncated) throw Object.assign(new Error('حجم فایل بیش از حد مجاز است'), { statusCode: 413 });
  } catch (e) {
    await unlink(filePath(id)).catch(() => {});
    throw e;
  }
  const { size } = await stat(filePath(id));
  return prisma.attachment.create({ data: { id, taskId, name, mime, size, uploadedById: userId } });
}

export async function saveBuffer(taskId, buf, { name, mime, userId }) {
  await mkdir(config.uploadDir, { recursive: true });
  const id = randomUUID();
  await writeFile(filePath(id), buf);
  return prisma.attachment.create({ data: { id, taskId, name, mime, size: buf.length, uploadedById: userId } });
}
