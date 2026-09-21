<script>
  import { api } from './api.js';
  import { notice } from './state.svelte.js';
  import Icon from './Icon.svelte';
  import { fmtDate, jmonthGrid, jparts, num, PRIORITY } from './format.js';

  let { tasks, canSchedule = false, canCreate = false, oncreate = null, reload = () => {} } = $props();
  let cursor = $state(new Date());
  let selected = $state(new Date());
  let dragId = $state(null);
  let overKey = $state(null);

  const grid = $derived(jmonthGrid(cursor));
  const key = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const TONE = { LOW: '#71717a', MEDIUM: '#3b82f6', HIGH: '#f59e0b', URGENT: '#ef4444' };

  const byDay = $derived.by(() => {
    const m = {};
    for (const t of tasks) if (t.dueDate) (m[key(new Date(t.dueDate))] ??= []).push(t);
    return m;
  });
  const unscheduled = $derived(tasks.filter((t) => !t.dueDate && !t.column?.isDone));
  const dayTasks = $derived(byDay[key(selected)] ?? []);
  const todayKey = key(new Date());
  const trailing = $derived((7 - ((grid.pad + grid.days.length) % 7)) % 7);

  function shift(n) {
    const c = jparts(cursor);
    const d = new Date(cursor);
    d.setDate(d.getDate() + (n > 0 ? 32 - c.d : -c.d));
    cursor = d;
  }
  const goToday = () => { cursor = new Date(); selected = new Date(); };

  async function drop(d) {
    const id = dragId;
    dragId = overKey = null;
    if (!id) return;
    try {
      await api('/tasks/' + id, { method: 'PATCH', body: { dueDate: iso(d) } });
      notice('ددلاین تغییر کرد');
      reload();
    } catch (e) { notice(e.message); }
  }
</script>

<div class="grid items-start gap-6 xl:grid-cols-[1fr_20rem]">
  <div class="card p-4">
    <div class="mb-4 flex items-center gap-2">
      <button class="btn-outline !p-2" onclick={() => shift(-1)} aria-label="ماه قبل"><Icon name="chev-right" size={16} /></button>
      <button class="btn-outline !p-2" onclick={() => shift(1)} aria-label="ماه بعد"><Icon name="chev-left" size={16} /></button>
      <div class="ms-2 text-lg font-extrabold">{grid.title}</div>
      <button class="btn-outline ms-auto" onclick={goToday}>امروز</button>
    </div>

    <div class="grid grid-cols-7 overflow-hidden rounded-xl border border-zinc-200 text-xs dark:border-white/[0.08]">
      {#each ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'] as d, i}
        <div class="border-b border-zinc-200 bg-zinc-50 py-2 text-center font-semibold text-zinc-500 dark:border-white/[0.08] dark:bg-white/[0.03] {i === 6 ? 'text-red-500' : ''}">{d}</div>
      {/each}
      {#each Array(grid.pad) as _}<div class="min-h-24 border-b border-s border-zinc-100 bg-zinc-50/50 dark:border-white/[0.05] dark:bg-white/[0.01]"></div>{/each}
      {#each grid.days as d, i}
        {@const k = key(d)}
        {@const list = byDay[k] ?? []}
        {@const fri = (grid.pad + i) % 7 === 6}
        <div role="button" tabindex="0" onclick={() => (selected = d)} onkeydown={(e) => e.key === 'Enter' && (selected = d)}
          ondragover={(e) => { if (canSchedule && dragId) { e.preventDefault(); overKey = k; } }} ondragleave={() => (overKey = null)} ondrop={(e) => { e.preventDefault(); drop(d); }}
          class="min-h-24 cursor-pointer border-b border-s border-zinc-100 p-1.5 text-start transition dark:border-white/[0.05] {overKey === k ? 'bg-brand-50 dark:bg-brand/15' : key(selected) === k ? 'bg-brand-50/60 dark:bg-brand/10' : 'hover:bg-zinc-50 dark:hover:bg-white/[0.03]'}">
          <div class="mb-1 flex items-center justify-between">
            <span class="tabnum inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold {k === todayKey ? 'bg-brand text-white' : fri ? 'text-red-500' : 'text-zinc-600 dark:text-zinc-300'}">{num(jparts(d).d)}</span>
            {#if list.length > 2}<span class="tabnum text-[10px] text-zinc-400">{num(list.length)} تسک</span>{/if}
          </div>
          {#each list.slice(0, 2) as t (t.id)}
            <a href="/tasks/{t.id}" draggable={canSchedule} ondragstart={() => (dragId = t.id)} ondragend={() => (dragId = null)} onclick={(e) => e.stopPropagation()}
              class="mb-1 block truncate rounded-md border-s-[3px] bg-white px-1.5 py-1 text-[11px] font-medium shadow-xs transition hover:shadow dark:bg-white/[0.06] {t.column?.isDone ? 'text-zinc-400 line-through' : ''}" style="border-inline-start-color:{TONE[t.priority]}">{t.title}</a>
          {/each}
        </div>
      {/each}
      {#each Array(trailing) as _}<div class="min-h-24 border-b border-s border-zinc-100 bg-zinc-50/50 dark:border-white/[0.05] dark:bg-white/[0.01]"></div>{/each}
    </div>
    {#if canSchedule}<p class="mt-3 flex items-center gap-1.5 text-xs text-zinc-400"><Icon name="info" size={13} /> برای تغییر ددلاین، تسک را روی روز موردنظر بکشید و رها کنید.</p>{/if}
  </div>

  <aside class="space-y-4">
    <div class="card p-4">
      <div class="section-title"><Icon name="calendar" size={16} class="text-brand" /> <span class="tabnum">{fmtDate(selected)}</span>
        {#if canCreate && oncreate}<button class="btn-primary ms-auto !px-3 !py-1.5 text-xs" onclick={() => oncreate(iso(selected))}><Icon name="plus" size={14} stroke={2.4} />تسک</button>{/if}</div>
      {#each dayTasks as t (t.id)}
        <a href="/tasks/{t.id}" class="mb-2 flex items-center gap-2.5 rounded-xl border border-zinc-100 p-2.5 transition hover:bg-zinc-50 dark:border-white/[0.06] dark:hover:bg-white/[0.04]">
          <span class="h-8 w-1 rounded-full" style="background:{TONE[t.priority]}"></span>
          <div class="min-w-0 flex-1"><div class="truncate text-sm font-semibold">{t.title}</div><div class="text-[11px] text-zinc-500">{t.column.name} · {PRIORITY[t.priority].label}</div></div>
        </a>
      {/each}
      {#if !dayTasks.length}<div class="py-5 text-center text-sm text-zinc-400">برای این روز تسکی ثبت نشده است.</div>{/if}
    </div>

    {#if unscheduled.length}
      <div class="card p-4">
        <div class="section-title"><Icon name="clock" size={16} class="text-brand" /> بدون ددلاین <span class="tabnum chip bg-zinc-100 text-zinc-500 dark:bg-white/10">{num(unscheduled.length)}</span></div>
        <div class="max-h-72 space-y-1.5 overflow-y-auto">
          {#each unscheduled as t (t.id)}
            <a href="/tasks/{t.id}" draggable={canSchedule} ondragstart={() => (dragId = t.id)} ondragend={() => (dragId = null)}
              class="flex items-center gap-2 rounded-lg border border-dashed border-zinc-200 px-2.5 py-2 text-sm transition hover:border-brand/50 hover:bg-brand-50/50 dark:border-white/10 {canSchedule ? 'cursor-grab' : ''}">
              {#if canSchedule}<Icon name="grip" size={14} class="text-zinc-300" />{/if}<span class="truncate">{t.title}</span>
            </a>
          {/each}
        </div>
      </div>
    {/if}
  </aside>
</div>
