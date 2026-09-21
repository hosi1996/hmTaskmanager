import { prisma } from './db.js';
import { config } from './config.js';
import { hashPassword, randomToken } from './lib/security.js';

// گروه‌های تسک پیش‌فرض (بعداً از پنل قابل ویرایش/افزودن‌اند)
const CATEGORIES = [
  ['bug', 'باگ', '#ef4444'],
  ['feature', 'فیچر جدید', '#22c55e'],
  ['improvement', 'بهبود', '#3b82f6'],
  ['docs', 'مستندسازی', '#a855f7'],
  ['support', 'پشتیبانی / سوال', '#f59e0b'],
  ['internal', 'وظیفه‌ی داخلی', '#64748b'],
];

for (const [i, [key, name, color]] of CATEGORIES.entries()) {
  await prisma.category.upsert({ where: { key }, update: {}, create: { key, name, color, position: i } });
}
for (const [key, value] of [['bot.command', 'task'], ['bot.notifyBack', true]]) {
  await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value } });
}

if (!(await prisma.user.findFirst({ where: { role: 'OWNER' } }))) {
  const password = config.ownerPassword || randomToken(8);
  await prisma.user.create({
    data: { username: config.ownerUsername.toLowerCase(), name: config.ownerName, role: 'OWNER', passwordHash: await hashPassword(password) },
  });
  console.log(JSON.stringify({ msg: 'owner created', username: config.ownerUsername, password: config.ownerPassword ? '(from env)' : password }));
}
await prisma.$disconnect();
process.exit(0);
