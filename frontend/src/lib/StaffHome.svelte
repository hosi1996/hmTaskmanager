<script>
  import { api } from '$lib/api.js';
  import { app } from '$lib/state.svelte.js';
  import { ACTIONS, fmtDateTime, num } from '$lib/format.js';
  import TaskRow from '$lib/TaskRow.svelte';
  import Icon from '$lib/Icon.svelte';
  import Donut from '$lib/Donut.svelte';
  import EmptyState from '$lib/EmptyState.svelte';

  let tasks = $state(null);
  let ov = $state(null);
  let trend = $state([]);
  let feed = $state([]);
  let filter = $state('all');
  let problems = $state([]);

  $effect(() => {
    api('/tasks?assignee=me&status=open&sort=due').then((r) => (tasks = r.tasks));
    api('/reports/overview').then((r) => (ov = r));
    api('/reports/trend').then((r) => (trend = r.days));
    api('/activity').then((r) => (feed = r.activity));
    api('/monitors').then((r) => (problems = r.domains.filter((m) => m.enabled && m.lastLog && !m.lastLog.ok))).catch(() => {});
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
  const STATS = $derived([
    ['تسک‌های باز', ov?.totals.open, 'target', 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300'],
    ['انجام‌شده', ov?.totals.closed, 'check', 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300'],
    ['عقب‌افتاده', ov?.totals.overdue, 'alert', 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300'],
    ['اساین‌شده به من', tasks?.length, 'users', 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300'],
  ]);
</script>

<svelte:head><title>داشبورد</title></svelte:head>

<div class="mb-8 flex flex-wrap items-end justify-between gap-4">
  <div>
    <p class="mb-1 flex items-center gap-1.5 text-sm text-zinc-500"><Icon name="calendar" size={14} />{today}</p>
    <h1 class="h-page !text-[26px]">{greet}، {app.user.name.split(' ')[0]}</h1>
  </div>
  <a href="/projects" class="btn-outline">همه‌ی پروژه‌ها <Icon name="arrow-left" size={15} /></a>
</div>

{#if problems.length}
  <a href="/monitoring" class="pop-in mb-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm transition hover:bg-red-100 dark:border-red-500/20 dark:bg-red-500/10 dark:hover:bg-red-500/15">
    <span class="tile h-10 w-10 bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300"><Icon name="alert" size={18} /></span>
    <div class="flex-1"><b class="text-red-700 dark:text-red-300">{num(problems.length)} دامنه دچار مشکل شده{problems.length > 1 ? '‌اند' : ''}</b>
      <div class="mt-0.5 text-xs text-red-600/80 dark:text-red-300/70" dir="ltr">{problems.slice(0, 4).map((p) => p.domain).join(' · ')}{#if problems.length > 4} …{/if}</div></div>
    <Icon name="chev-left" size={16} class="text-red-500" />
  </a>
{/if}

<div class="stagger mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
  {#each STATS as [label, v, icon, tone]}
    <div class="card p-5">
      <div class="flex items-center justify-between"><span class="text-sm font-medium text-zinc-500">{label}</span><span class="tile h-9 w-9 {tone}"><Icon name={icon} size={18} /></span></div>
      <div class="tabnum mt-3 text-3xl font-extrabold tracking-tight">{v == null ? '—' : num(v)}</div>
    </div>
  {/each}
</div>

<div class="grid gap-6 lg:grid-cols-3">
  <section class="lg:col-span-2">
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <div class="section-title !mb-0"><span class="tile h-7 w-7 bg-brand-50 text-brand dark:bg-brand/15"><Icon name="list" size={15} /></span> کارهای پیش رو</div>
      <div class="seg ms-auto">
        {#each CHIPS as [k, l]}<button class="seg-btn {filter === k ? 'seg-btn-on' : ''}" onclick={() => (filter = k)}>{l}</button>{/each}
      </div>
    </div>
    <div class="card overflow-hidden">
      {#if !shown}
        {#each Array(4) as _}<div class="skeleton m-3 h-14"></div>{/each}
      {:else if !shown.length}
        <EmptyState icon="party" title="همه‌چیز مرتب است" text="در این بخش تسک بازی ندارید. با کلید N یک تسک جدید بسازید." />
      {:else}
        <div class="stagger">{#each shown as t (t.id)}<TaskRow task={t} showProject />{/each}</div>
      {/if}
    </div>
  </section>

  <aside class="space-y-6">
    <div class="card flex items-center gap-5 p-5">
      <Donut value={rate} label="تکمیل" />
      <div class="space-y-1.5 text-sm">
        <div class="font-bold">پیشرفت کلی</div>
        <div class="tabnum text-zinc-500">{num(ov?.totals.closed ?? 0)} از {num(total)} تسک</div>
        {#if ov?.totals.overdue}<div class="chip bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">{num(ov.totals.overdue)} عقب‌افتاده</div>{/if}
      </div>
    </div>

    <div class="card p-5">
      <div class="section-title"><Icon name="trend" size={16} class="text-brand" /> روند ۱۴ روز اخیر</div>
      <svg viewBox="0 0 280 96" class="h-24 w-full" preserveAspectRatio="none" role="img" aria-label="نمودار روند">
        {#each [0.25, 0.5, 0.75] as g}<line x1="0" x2="280" y1={90 - g * 80} y2={90 - g * 80} class="stroke-zinc-100 dark:stroke-white/[0.06]" stroke-dasharray="3 4" />{/each}
        {#each trend as d, i}
          {@const w = 280 / trend.length}
          <rect x={i * w + 2} y={90 - (d.created / maxBar) * 80} width={w / 2 - 2} height={Math.max(2, (d.created / maxBar) * 80)} rx="2" class="fill-zinc-200 dark:fill-white/15" />
          <rect x={i * w + w / 2} y={90 - (d.done / maxBar) * 80} width={w / 2 - 2} height={Math.max(2, (d.done / maxBar) * 80)} rx="2" fill="#4f46e5" />
        {/each}
      </svg>
      <div class="mt-3 flex gap-4 text-xs text-zinc-500"><span class="flex items-center gap-1.5"><i class="h-2 w-2 rounded-sm bg-brand"></i>انجام‌شده</span><span class="flex items-center gap-1.5"><i class="h-2 w-2 rounded-sm bg-zinc-300 dark:bg-white/20"></i>ساخته‌شده</span></div>
    </div>

    <div class="card p-5">
      <div class="section-title"><Icon name="activity" size={16} class="text-brand" /> آخرین فعالیت‌ها</div>
      <div class="relative space-y-4 before:absolute before:inset-y-1 before:start-[5px] before:w-px before:bg-zinc-200 dark:before:bg-white/10">
        {#each feed as a}
          <a href="/tasks/{a.task?.id}" class="relative block ps-6 text-sm transition hover:opacity-75">
            <span class="absolute start-0 top-1.5 h-[11px] w-[11px] rounded-full border-2 border-brand bg-white dark:bg-[#12131d]"></span>
            <b>{a.user?.name ?? 'سیستم'}</b> {ACTIONS[a.action] ?? a.action}
            <div class="truncate text-xs text-zinc-400"><span class="tabnum">#{a.task?.number}</span> {a.task?.title} · {fmtDateTime(a.createdAt)}</div>
          </a>
        {/each}
        {#if !feed.length}<div class="text-sm text-zinc-400">هنوز فعالیتی ثبت نشده.</div>{/if}
      </div>
    </div>
  </aside>
</div>
