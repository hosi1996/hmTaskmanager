<script>
  import { api } from './api.js';
  import { app } from './state.svelte.js';
  import { fmtDate, fmtDateTime, num, PRIORITY } from './format.js';
  import Icon from './Icon.svelte';
  import EmptyState from './EmptyState.svelte';
  import QuickTask from './QuickTask.svelte';

  let tasks = $state(null);
  let projects = $state([]);
  let filter = $state('all');
  let search = $state('');
  let showNew = $state(false);

  const load = () => api('/tasks?sort=created&limit=300').then((r) => (tasks = r.tasks));
  $effect(() => {
    load();
    api('/projects').then((r) => (projects = r.projects));
  });

  const open = $derived(tasks?.filter((t) => !t.column.isDone) ?? []);
  const done = $derived(tasks?.filter((t) => t.column.isDone) ?? []);
  const shown = $derived.by(() => {
    if (!tasks) return null;
    let l = filter === 'open' ? open : filter === 'done' ? done : tasks;
    if (search.trim()) l = l.filter((t) => t.title.toLowerCase().includes(search.trim().toLowerCase()));
    return l;
  });
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'صبح بخیر' : hour < 17 ? 'روز بخیر' : hour < 20 ? 'عصر بخیر' : 'شب بخیر';
  const STATS = $derived([
    ['کل درخواست‌ها', tasks?.length, 'layers', 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300'],
    ['در حال رسیدگی', open.length, 'clock', 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300'],
    ['انجام‌شده', done.length, 'check', 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300'],
  ]);
</script>

<svelte:head><title>درخواست‌های من</title></svelte:head>

<div class="relative mb-8 overflow-hidden rounded-3xl bg-ink p-7 text-white sm:p-9">
  <div class="dotgrid absolute inset-0"></div>
  <div class="absolute -start-16 -top-24 h-72 w-72 rounded-full bg-brand/50 blur-[90px]"></div>
  <div class="relative flex flex-wrap items-center justify-between gap-5">
    <div>
      <p class="mb-1 text-sm text-zinc-400">{greet}</p>
      <h1 class="text-[28px] font-extrabold leading-tight">{app.user.name}</h1>
      <p class="mt-2 max-w-md text-sm leading-7 text-zinc-300">درخواست‌ها و مشکلات خود را ثبت کنید و مراحل رسیدگی به آن‌ها را لحظه‌به‌لحظه دنبال کنید.</p>
    </div>
    <button class="btn-primary !px-6 !py-3 !text-[15px]" onclick={() => (showNew = true)}><Icon name="plus" size={18} stroke={2.4} /> ثبت درخواست جدید</button>
  </div>
</div>

<div class="stagger mb-8 grid grid-cols-3 gap-4">
  {#each STATS as [label, v, icon, tone]}
    <div class="card p-5"><div class="flex items-center justify-between"><span class="text-sm font-medium text-zinc-500">{label}</span><span class="tile h-9 w-9 {tone}"><Icon name={icon} size={18} /></span></div>
      <div class="tabnum mt-3 text-3xl font-extrabold">{v == null ? '—' : num(v)}</div></div>
  {/each}
</div>

{#if projects.length}
  <div class="section-title"><Icon name="folder" size={16} class="text-brand" /> پروژه‌های شما</div>
  <div class="stagger mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
    {#each projects as p (p.id)}
      {@const pct = p.total ? Math.round((p.closed / p.total) * 100) : 0}
      <a href="/projects/{p.id}" class="card card-hover flex items-center gap-4 p-4">
        <span class="tile h-12 w-12" style="background:{p.color}18;color:{p.color}"><Icon name={p.icon} size={22} /></span>
        <div class="min-w-0 flex-1"><div class="truncate font-bold">{p.name}</div>
          <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10"><div class="h-full rounded-full" style="width:{pct}%;background:{p.color}"></div></div>
          <div class="tabnum mt-1.5 text-xs text-zinc-500">{num(pct)}٪ انجام شده{#if p.deadline} · موعد {fmtDate(p.deadline)}{/if}</div></div>
      </a>
    {/each}
  </div>
{/if}

<div class="mb-3 flex flex-wrap items-center gap-3">
  <div class="section-title !mb-0"><Icon name="list" size={16} class="text-brand" /> درخواست‌های من</div>
  <div class="relative ms-auto w-full sm:w-56"><Icon name="search" size={15} class="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-zinc-400" /><input class="input !ps-9" placeholder="جستجو…" bind:value={search} /></div>
  <div class="seg">{#each [['all', 'همه'], ['open', 'در حال رسیدگی'], ['done', 'انجام‌شده']] as [k, l]}<button class="seg-btn {filter === k ? 'seg-btn-on' : ''}" onclick={() => (filter = k)}>{l}</button>{/each}</div>
</div>

<div class="card overflow-hidden">
  {#if !shown}
    {#each Array(4) as _}<div class="skeleton m-3 h-16"></div>{/each}
  {:else if !shown.length}
    <EmptyState icon="inbox" title={tasks?.length ? 'موردی پیدا نشد' : 'هنوز درخواستی ثبت نکرده‌اید'} text="با دکمه‌ی «ثبت درخواست جدید» اولین درخواست خود را ارسال کنید.">
      <button class="btn-primary" onclick={() => (showNew = true)}><Icon name="plus" size={16} stroke={2.4} /> ثبت درخواست</button>
    </EmptyState>
  {:else}
    <div class="stagger">
      {#each shown as t (t.id)}
        <a href="/tasks/{t.id}" class="flex items-center gap-4 border-b border-zinc-100 px-5 py-4 transition last:border-0 hover:bg-zinc-50 dark:border-white/[0.05] dark:hover:bg-white/[0.03]">
          <span class="tile h-10 w-10 {t.column.isDone ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-brand-50 text-brand dark:bg-brand/15'}"><Icon name={t.column.isDone ? 'check' : 'clock'} size={18} /></span>
          <div class="min-w-0 flex-1">
            <div class="truncate font-semibold"><span class="tabnum font-normal text-zinc-400">#{num(t.number)}</span> {t.title}</div>
            <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span>{t.project.name}</span>
              {#if t.category}<span class="chip" style="background:{t.category.color}18;color:{t.category.color}">{t.category.name}</span>{/if}
              <span class="tabnum">ثبت: {fmtDateTime(t.createdAt)}</span>
              {#if t._count?.comments}<span class="inline-flex items-center gap-1"><Icon name="message" size={12} />{num(t._count.comments)}</span>{/if}
            </div>
          </div>
          <span class="chip {PRIORITY[t.priority].cls} hidden sm:inline-flex">{PRIORITY[t.priority].label}</span>
          <span class="chip {t.column.isDone ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-brand-50 text-brand dark:bg-brand/20 dark:text-indigo-300'} !px-3 !py-1">{t.column.name}</span>
          <Icon name="chev-left" size={16} class="text-zinc-300" />
        </a>
      {/each}
    </div>
  {/if}
</div>

{#if showNew}<QuickTask onclose={() => { showNew = false; load(); }} />{/if}
