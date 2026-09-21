import { marked } from 'marked';
import DOMPurify from 'dompurify';

const fa = (opts) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', opts);
const dDate = fa({ year: 'numeric', month: 'short', day: 'numeric' });
const dTime = fa({ year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export const fmtDate = (d) => (d ? dDate.format(new Date(d)) : '—');
export const fmtDateTime = (d) => (d ? dTime.format(new Date(d)) : '—');
export const toInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
export const num = (n) => new Intl.NumberFormat('fa-IR').format(n ?? 0);
export const isOverdue = (t) => t.dueDate && !t.column?.isDone && new Date(t.dueDate) < new Date();
export const fmtMin = (m) => (m >= 60 ? `${num(Math.floor(m / 60))}س ${num(m % 60)}د` : `${num(m)}د`);

/** مارک‌داون → HTML امن (DOMPurify) */
export const md = (s) => DOMPurify.sanitize(marked.parse(s ?? '', { breaks: true, async: false }), { USE_PROFILES: { html: true } });

export const PRIORITY = {
  LOW: { label: 'کم', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  MEDIUM: { label: 'متوسط', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
  HIGH: { label: 'زیاد', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  URGENT: { label: 'فوری', cls: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' },
};
export const ROLES = { VIEWER: 'بیننده', REPORTER: 'گزارش‌دهنده', CONTRIBUTOR: 'همکار', MANAGER: 'مدیر' };
export const SYS_ROLES = { OWNER: 'مالک', STAFF: 'کارمند', CLIENT: 'مشتری' };
export const ACTIONS = {
  'task.created': 'تسک را ساخت',
  'task.moved': 'وضعیت را تغییر داد',
  'task.assigned': 'اساین را تغییر داد',
  'task.field': 'یک فیلد را تغییر داد',
  'task.attached': 'فایل پیوست کرد',
  'task.deleted': 'تسک را حذف کرد',
  'project.created': 'پروژه را ساخت',
  'project.updated': 'پروژه را ویرایش کرد',
};

const jf = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric' });
export const jparts = (d) => {
  const p = Object.fromEntries(jf.formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p.relatedYear || +p.year, m: +p.month, d: +p.day };
};
export const JMONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
/** روزهای یک ماه شمسی که شامل تاریخ cursor است؛ هفته از شنبه شروع می‌شود */
export function jmonthGrid(cursor) {
  const c = jparts(cursor);
  const start = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - (c.d - 1), 12);
  const days = [];
  for (let d = new Date(start); jparts(d).m === c.m; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 12)) days.push(new Date(d));
  return { title: `${JMONTHS[c.m - 1]} ${new Intl.NumberFormat('fa-IR', { useGrouping: false }).format(c.y)}`, pad: (start.getDay() + 1) % 7, days };
}
