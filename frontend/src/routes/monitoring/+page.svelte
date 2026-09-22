<script>
  import { goto } from '$app/navigation';
  import { api } from '$lib/api.js';
  import { app, notice } from '$lib/state.svelte.js';
  import { fmtDateTime, monitorRows, num } from '$lib/format.js';
  import Icon from '$lib/Icon.svelte';
  import EmptyState from '$lib/EmptyState.svelte';

  let data = $state(null);
  let filter = $state('all');
  let running = $state({});

  $effect(() => {
    if (app.user.role === 'CLIENT') return void goto('/');
    load();
  });
  async function load() {
    data = await api('/monitors').catch((e) => { notice(e.message); return null; });
  }

  const statusOf = (m) => (!m.enabled ? 'off' : !m.lastLog ? 'unknown' : m.lastLog.ok ? 'ok' : 'bad');
  const STATUS_DOT = { ok: 'bg-emerald-500', bad: 'bg-red-500', off: 'bg-zinc-300 dark:bg-white/20', unknown: 'bg-amber-400' };
  const STATUS_LABEL = { ok: 'سالم', bad: 'دارای مشکل', off: 'غیرفعال', unknown: 'هنوز بررسی نشده' };
  const LOC_LABEL = { out: 'خارج از ایران', iran: 'ایران', both: 'هر دو' };

  const list = $derived.by(() => {
    if (!data) return null;
    if (filter === 'bad') return data.domains.filter((m) => statusOf(m) === 'bad');
    if (filter === 'off') return data.domains.filter((m) => statusOf(m) === 'off');
    return data.domains;
  });
  const counts = $derived.by(() => {
    if (!data) return { bad: 0, ok: 0, off: 0 };
    return data.domains.reduce((a, m) => { const s = statusOf(m); a[s] = (a[s] ?? 0) + 1; return a; }, {});
  });

  async function runNow(m) {
    running = { ...running, [m.id]: true };
    try {
      await api(`/monitors/${m.id}/run`, { method: 'POST' });
      notice(`${m.domain} بررسی شد`);
      await load();
    } catch (err) {
      notice(err.message);
    } finally {
      running = { ...running, [m.id]: false };
    }
  }

  function detailOf(m) {
    if (!m.lastLog) return [];
    return monitorRows(m.lastLog.results).filter((r) => r.ok === false);
  }
</script>

<svelte:head><title>مانیتورینگ دامنه‌ها</title></svelte:head>

<div class="mb-8 flex flex-wrap items-end justify-between gap-4">
  <div><h1 class="h-page !text-[26px]">مانیتورینگ دامنه‌ها</h1><p class="mt-1 text-sm text-zinc-500">وضعیت لحظه‌ای همه‌ی دامنه‌های تحت مدیریت شما، از خارج و از ایران.</p></div>
</div>

<div class="stagger mb-8 grid grid-cols-3 gap-4">
  <button class="card p-5 text-start transition {filter === 'bad' ? 'ring-2 ring-red-400' : ''}" onclick={() => (filter = filter === 'bad' ? 'all' : 'bad')}>
    <div class="flex items-center justify-between"><span class="text-sm font-medium text-zinc-500">دارای مشکل</span><span class="tile h-9 w-9 bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300"><Icon name="alert" size={18} /></span></div>
    <div class="tabnum mt-3 text-3xl font-extrabold text-red-600 dark:text-red-400">{data ? num(counts.bad ?? 0) : '—'}</div>
  </button>
  <button class="card p-5 text-start transition {filter === 'all' ? 'ring-2 ring-brand/40' : ''}" onclick={() => (filter = 'all')}>
    <div class="flex items-center justify-between"><span class="text-sm font-medium text-zinc-500">کل دامنه‌ها</span><span class="tile h-9 w-9 bg-brand-50 text-brand dark:bg-brand/15"><Icon name="globe" size={18} /></span></div>
    <div class="tabnum mt-3 text-3xl font-extrabold">{data ? num(data.domains.length) : '—'}</div>
  </button>
  <button class="card p-5 text-start transition {filter === 'off' ? 'ring-2 ring-zinc-400' : ''}" onclick={() => (filter = filter === 'off' ? 'all' : 'off')}>
    <div class="flex items-center justify-between"><span class="text-sm font-medium text-zinc-500">غیرفعال</span><span class="tile h-9 w-9 bg-zinc-100 text-zinc-500 dark:bg-white/10"><Icon name="stop" size={18} /></span></div>
    <div class="tabnum mt-3 text-3xl font-extrabold">{data ? num(counts.off ?? 0) : '—'}</div>
  </button>
</div>

{#if !data}
  <div class="space-y-3">{#each Array(3) as _}<div class="skeleton h-20"></div>{/each}</div>
{:else if !list.length}
  <div class="card"><EmptyState icon="activity" title={filter === 'all' ? 'هنوز دامنه‌ای ثبت نشده' : 'موردی در این فیلتر نیست'} text={filter === 'all' ? 'از داخل هر پروژه، تب «مانیتورینگ» را باز کنید و دامنه اضافه کنید.' : ''} /></div>
{:else}
  <div class="space-y-3">
    {#each list as m (m.id)}
      {@const st = statusOf(m)}
      {@const bad = detailOf(m)}
      <div class="card p-4">
        <div class="flex flex-wrap items-center gap-3">
          <span class="h-2.5 w-2.5 shrink-0 rounded-full {STATUS_DOT[st]}"></span>
          <a href="/projects/{m.project.id}?tab=monitoring" class="min-w-0 flex-1 hover:underline">
            <div class="flex flex-wrap items-center gap-2">
              <span class="truncate font-bold" dir="ltr">{m.domain}</span>
              <span class="chip bg-zinc-100 text-zinc-500 dark:bg-white/10">{STATUS_LABEL[st]}</span>
              {#if data.iranEnabled}<span class="chip bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">{LOC_LABEL[m.location]}</span>{/if}
              {#if m.uptime24h != null}<span class="chip {m.uptime24h >= 99 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : m.uptime24h >= 90 ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300'}">{num(m.uptime24h)}٪ سالم (۲۴س)</span>{/if}
            </div>
            <div class="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
              <span class="inline-flex items-center gap-1"><span class="h-1.5 w-1.5 rounded-sm" style="background:{m.project.color}"></span>{m.project.name}</span>
              {#if m.lastRunAt}<span>· آخرین بررسی: <span class="tabnum">{fmtDateTime(m.lastRunAt)}</span></span>{/if}
            </div>
          </a>
          <button class="btn-outline !px-3 !py-1.5 text-xs" disabled={running[m.id]} onclick={() => runNow(m)}><Icon name="refresh" size={13} class={running[m.id] ? 'animate-spin' : ''} /> بررسی الان</button>
          <a href="/projects/{m.project.id}?tab=monitoring" class="btn-ghost !px-3 !py-1.5 text-xs">جزئیات <Icon name="chev-left" size={13} /></a>
        </div>
        {#if bad.length}
          <div class="mt-3 flex flex-wrap gap-1.5 border-t border-zinc-100 pt-3 dark:border-white/[0.06]">
            {#each bad as r}<span class="chip bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300" title={r.detail}><Icon name="x" size={11} />{data.checks[r.name]}: {r.detail}</span>{/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}
