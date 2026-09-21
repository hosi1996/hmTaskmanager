<script>
  import { api } from '$lib/api.js';
  import { app } from '$lib/state.svelte.js';
  import { ACTIONS, fmtDate, fmtDateTime, num } from '$lib/format.js';
  import TaskRow from '$lib/TaskRow.svelte';
  import Icon from '$lib/Icon.svelte';
  import Donut from '$lib/Donut.svelte';

  let tasks = $state(null);
  let ov = $state(null);
  let trend = $state([]);
  let feed = $state([]);
  let filter = $state('all');

  $effect(() => {
    api('/tasks?assignee=me&status=open&sort=due').then((r) => (tasks = r.tasks));
    api('/reports/overview').then((r) => (ov = r));
    api('/reports/trend').then((r) => (trend = r.days));
    api('/activity').then((r) => (feed = r.activity));
  });

  const endOf = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
  const shown = $derived.by(() => {
    if (!tasks) return null;
    const now = new Date();
    if (filter === 'today') return tasks.filter((t) => t.dueDate && new Date(t.dueDate) <= endOf(now));
    if (filter === 'week') return tasks.filter((t) => t.dueDate && new Date(t.dueDate) <= endOf(new Date(Date.now() + 7 * 864e5)));
    if (filter === 'overdue') return tasks.filter((t) => t.dueDate && new Date(t.dueDate) < now);
    return tasks;
  });
  const total = $derived(ov ? ov.totals.open + ov.totals.closed : 0);
  const rate = $derived(total ? (ov.totals.closed / total) * 100 : 0);
  const maxBar = $derived(Math.max(1, ...trend.map((d) => Math.max(d.created, d.done))));
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'صبح بخیر' : hour < 17 ? 'روز بخیر' : hour < 20 ? 'عصر بخیر' : 'شب بخیر';
  const today = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());
  const CHIPS = [['all', 'همه'], ['today', 'امروز'], ['week', 'این هفته'], ['overdue', 'عقب‌افتاده']];
</script>

<svelte:head><title>تسک‌های من</title></svelte:head>

<div class="mb-6 flex flex-wrap items-end justify-between gap-3">
  <div><h1 class="h-page">{greet}، {app.user.name.split(' ')[0]} 👋</h1><p class="mt-1 text-sm text-slate-500">{today}</p></div>
  <a href="/projects" class="btn-outline"><Icon name="folder" size={16} /> همه‌ی پروژه‌ها</a>
</div>

<div class="stagger mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
  {#each [
    ['تسک‌های باز', ov?.totals.open, 'target', 'from-indigo-500 to-violet-500'],
    ['انجام‌شده', ov?.totals.closed, 'check', 'from-emerald-500 to-teal-500'],
    ['عقب‌افتاده', ov?.totals.overdue, 'alert', 'from-rose-500 to-orange-500'],
    ['اساین‌شده به من', tasks?.length, 'users', 'from-sky-500 to-cyan-500'],
  ] as [label, v, icon, grad]}
    <div class="card card-hover flex items-center gap-4 p-4">
      <span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br {grad} text-white shadow-lg"><Icon name={icon} size={22} /></span>
      <div><div class="text-xs text-slate-500">{label}</div><div class="text-2xl font-extrabold">{v == null ? '…' : num(v)}</div></div>
    </div>
  {/each}
</div>

<div class="grid gap-6 lg:grid-cols-3">
  <section class="lg:col-span-2">
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <div class="section-title !mb-0"><Icon name="check" size={16} class="text-brand" /> کارهای پیش رو</div>
      <div class="ms-auto flex gap-1 rounded-xl bg-white p-1 shadow-soft dark:bg-slate-900">
        {#each CHIPS as [k, l]}<button class="rounded-lg px-3 py-1 text-xs font-medium transition {filter === k ? 'bg-gradient-to-l from-brand to-brand-2 text-white shadow' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}" onclick={() => (filter = k)}>{l}</button>{/each}
      </div>
    </div>
    <div class="card overflow-hidden">
      {#if !shown}
        {#each Array(4) as _}<div class="skeleton m-3 h-12"></div>{/each}
      {:else if !shown.length}
        <div class="p-12 text-center">
          <div class="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-100 to-violet-100 text-4xl dark:from-indigo-950 dark:to-violet-950">🎉</div>
          <div class="font-bold">هیچ کاری در این بخش نیست</div>
          <div class="mt-1 text-sm text-slate-400">همه‌چیز مرتب است؛ یا یک تسک جدید بساز (کلید <kbd>n</kbd>).</div>
        </div>
      {:else}
        <div class="stagger">{#each shown as t (t.id)}<TaskRow task={t} showProject />{/each}</div>
      {/if}
    </div>
  </section>

  <aside class="space-y-6">
    <div class="card flex items-center gap-5 p-5">
      <Donut value={rate} label="تکمیل" />
      <div class="space-y-1 text-sm"><div class="font-bold">پیشرفت کلی</div><div class="text-slate-500">{num(ov?.totals.closed ?? 0)} از {num(total)} تسک</div>
        {#if ov?.totals.overdue}<div class="text-xs font-medium text-rose-500">{num(ov.totals.overdue)} مورد عقب‌افتاده</div>{/if}</div>
    </div>

    <div class="card p-5">
      <div class="section-title"><Icon name="trend" size={16} class="text-brand" /> ۱۴ روز اخیر</div>
      <svg viewBox="0 0 280 90" class="h-24 w-full" preserveAspectRatio="none">
        {#each trend as d, i}
          {@const w = 280 / trend.length}
          <rect x={i * w + 2} y={90 - (d.created / maxBar) * 80} width={w / 2 - 2} height={(d.created / maxBar) * 80} rx="2" class="fill-slate-200 dark:fill-slate-700" />
          <rect x={i * w + w / 2} y={90 - (d.done / maxBar) * 80} width={w / 2 - 2} height={(d.done / maxBar) * 80} rx="2" fill="#6366f1" />
        {/each}
      </svg>
      <div class="mt-2 flex gap-4 text-xs text-slate-500"><span class="flex items-center gap-1"><i class="h-2 w-2 rounded-sm bg-brand"></i>انجام‌شده</span><span class="flex items-center gap-1"><i class="h-2 w-2 rounded-sm bg-slate-300"></i>ساخته‌شده</span></div>
    </div>

    <div class="card p-5">
      <div class="section-title"><Icon name="zap" size={16} class="text-brand" /> آخرین فعالیت‌ها</div>
      <div class="space-y-3">
        {#each feed as a}
          <a href="/tasks/{a.task?.id}" class="block text-sm hover:opacity-80"><b>{a.user?.name ?? 'سیستم'}</b> {ACTIONS[a.action] ?? a.action}
            <div class="truncate text-xs text-slate-400">#{a.task?.number} {a.task?.title} · {fmtDateTime(a.createdAt)}</div></a>
        {/each}
        {#if !feed.length}<div class="text-sm text-slate-400">هنوز فعالیتی ثبت نشده.</div>{/if}
      </div>
    </div>
  </aside>
</div>
