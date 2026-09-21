<script>
  import { jmonthGrid, jparts, num, PRIORITY } from './format.js';

  let { tasks } = $props();
  let cursor = $state(new Date());
  const grid = $derived(jmonthGrid(cursor));
  const key = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const byDay = $derived.by(() => {
    const m = {};
    for (const t of tasks) if (t.dueDate) (m[key(new Date(t.dueDate))] ??= []).push(t);
    return m;
  });
  const shift = (n) => {
    const c = jparts(cursor);
    const d = new Date(cursor);
    d.setDate(d.getDate() + (n > 0 ? 32 - c.d : -c.d));
    cursor = d;
  };
  const today = key(new Date());
</script>

<div class="card p-3">
  <div class="mb-3 flex items-center justify-between">
    <button class="btn-ghost" onclick={() => shift(-1)}>▶ قبل</button>
    <div class="font-semibold">{grid.title}</div>
    <button class="btn-ghost" onclick={() => shift(1)}>بعد ◀</button>
  </div>
  <div class="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-slate-200 text-xs dark:bg-slate-800">
    {#each ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'] as d}<div class="bg-slate-50 p-1 text-center font-semibold dark:bg-slate-900">{d}</div>{/each}
    {#each Array(grid.pad) as _}<div class="bg-white dark:bg-slate-950"></div>{/each}
    {#each grid.days as d}
      <div class="min-h-20 bg-white p-1 dark:bg-slate-950 {key(d) === today ? 'ring-2 ring-inset ring-brand' : ''}">
        <div class="text-slate-400">{num(jparts(d).d)}</div>
        {#each (byDay[key(d)] ?? []).slice(0, 3) as t}
          <a href="/tasks/{t.id}" class="mt-0.5 block truncate rounded px-1 {PRIORITY[t.priority].cls}">{t.title}</a>
        {/each}
        {#if (byDay[key(d)]?.length ?? 0) > 3}<div class="text-slate-400">+{num(byDay[key(d)].length - 3)}</div>{/if}
      </div>
    {/each}
  </div>
</div>
