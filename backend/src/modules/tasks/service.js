import { prisma } from '../../db.js';
import { logActivity, notify, taskAudience } from '../../lib/notify.js';
import { esc, tgSend } from '../../lib/notify.js';

export const taskInclude = {
  column: { select: { id: true, name: true, isDone: true } },
  category: true,
  createdBy: { select: { id: true, name: true } },
  assignees: { select: { user: { select: { id: true, name: true } } } },
  watchers: { select: { user: { select: { id: true, name: true } } } },
  labels: { select: { label: true } },
  _count: { select: { comments: true, attachments: true, checklist: true } },
};

/** ساخت تسک با شماره‌ی متوالی در پروژه؛ ستون پیش‌فرض = ستون شروع */
export async function createTask(projectId, userId, data, extra = {}) {
  return prisma.$transaction(async (tx) => {
    const p = await tx.project.update({ where: { id: projectId }, data: { taskSeq: { increment: 1 } }, select: { taskSeq: true } });
    let columnId = data.columnId;
    if (!columnId) {
      const c = await tx.boardColumn.findFirst({ where: { projectId, isDefault: true } }) ?? (await tx.boardColumn.findFirst({ where: { projectId }, orderBy: { position: 'asc' } }));
      columnId = c.id;
    }
    const last = await tx.task.findFirst({ where: { columnId }, orderBy: { position: 'desc' }, select: { position: true } });
    const { assigneeIds = [], labelIds = [], checklist = [], ...fields } = data;
    const task = await tx.task.create({
      data: {
        ...fields, ...extra, projectId, columnId, number: p.taskSeq, createdById: userId,
        position: (last?.position ?? 0) + 1000,
        assignees: { create: assigneeIds.map((id) => ({ userId: id })) },
        labels: { create: labelIds.map((id) => ({ labelId: id })) },
        checklist: { create: checklist.map((text, i) => ({ text, position: (i + 1) * 1000 })) },
        watchers: { create: [{ userId }] },
      },
    });
    await logActivity(tx, { projectId, taskId: task.id, userId, action: 'task.created', data: { title: task.title } });
    return task;
  });
}

const nextDate = (d, rule) => {
  const n = new Date(d);
  if (rule === 'DAILY') n.setDate(n.getDate() + 1);
  else if (rule === 'WEEKLY') n.setDate(n.getDate() + 7);
  else n.setMonth(n.getMonth() + 1);
  return n;
};

/** پس از رفتن تسک به ستون «انجام‌شده»: زمان تکمیل، تسک تکرارشونده‌ی بعدی و اعلان به‌سازنده‌ی تلگرامی */
export async function onColumnChanged(task, newCol, actorId) {
  const wasDone = !!task.completedAt;
  if (newCol.isDone && !wasDone) {
    await prisma.task.update({ where: { id: task.id }, data: { completedAt: new Date() } });
    if (task.recurrence) {
      const full = await prisma.task.findUnique({ where: { id: task.id }, include: { assignees: true, labels: true, checklist: true } });
      const base = full.dueDate ?? new Date();
      const start = await prisma.boardColumn.findFirst({ where: { projectId: task.projectId, isDefault: true } });
      await createTask(task.projectId, full.createdById, {
        title: full.title, description: full.description, categoryId: full.categoryId, priority: full.priority,
        recurrence: full.recurrence, columnId: start?.id, dueDate: nextDate(base, full.recurrence),
        startDate: full.startDate ? nextDate(full.startDate, full.recurrence) : null,
        assigneeIds: full.assignees.map((a) => a.userId), labelIds: full.labels.map((l) => l.labelId),
        checklist: full.checklist.map((c) => c.text),
      });
    }
    await notifyBack(task, newCol.name);
  } else if (!newCol.isDone && wasDone) {
    await prisma.task.update({ where: { id: task.id }, data: { completedAt: null } });
  }
}

/** اعلان معکوس به گروه تلگرام مبدأ (قابل خاموش‌کردن از تنظیمات) */
async function notifyBack(task, columnName) {
  if (!task.telegramChatId) return;
  const s = await prisma.setting.findUnique({ where: { key: 'bot.notifyBack' } });
  if (s && s.value === false) return;
  await tgSend(task.telegramChatId, `✅ تسک #${task.number} «${esc(task.title)}» به وضعیت <b>${esc(columnName)}</b> رفت.`);
}

export { notify, taskAudience, logActivity };
