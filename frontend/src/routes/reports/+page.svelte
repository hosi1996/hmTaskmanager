<script>
  import { api } from '$lib/api.js';
  import { app } from '$lib/state.svelte.js';
  import { num } from '$lib/format.js';

  let ov = $state(null);
  let members = $state([]);
  let load = $state([]);

  $effect(() => {
    api('/reports/overview').then((r) => (ov = r));
    if (app.user.role !== 'CLIENT') {
      api('/reports/members').then((r) => (members = r.members));
      api('/reports/workload').then((r) => (load = r.workload));
    }
  });
</script>

<svelte:head><title>گزارش‌ها</title></svelte:head>
<div class="mb-4 flex items-center"><h1 class="h-page">گزارش‌ها</h1><a class="btn-primary ms-auto" href="/api/reports/export.csv" download>⬇ خروجی CSV (Excel)</a></div>

{#if !ov}<div class="skeleton h-40"></div>{:else}
  <div class="card mb-4 overflow-x-auto">
    <table class="w-full text-sm">
      <thead class="text-slate-500"><tr><th class="p-3 text-start">پروژه</th><th>باز</th><th>بسته</th><th>عقب‌افتاده</th><th class="w-40">نرخ تکمیل</th></tr></thead>
      <tbody>
        {#each ov.projects as p}
          <tr class="border-t border-slate-100 text-center dark:border-slate-800"><td class="p-3 text-start"><a class="text-brand" href="/projects/{p.projectId}">{p.name}</a></td><td>{num(p.open)}</td><td>{num(p.closed)}</td><td class={p.overdue ? 'text-red-600' : ''}>{num(p.overdue)}</td>
            <td class="px-3"><div class="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div class="h-full bg-emerald-500" style="width:{p.rate}%"></div></div></td></tr>
        {/each}
      </tbody>
    </table>
    {#if !ov.projects.length}<div class="p-8 text-center text-slate-400">داده‌ای نیست.</div>{/if}
  </div>
{/if}

{#if members.length}
  <h2 class="mb-2 font-semibold">عملکرد اعضا</h2>
  <div class="card mb-4 overflow-x-auto">
    <table class="w-full text-sm"><thead class="text-slate-500"><tr><th class="p-3 text-start">عضو</th><th>باز</th><th>انجام‌شده</th><th>عقب‌افتاده</th><th>میانگین زمان انجام (ساعت)</th></tr></thead>
      <tbody>{#each members as m}<tr class="border-t border-slate-100 text-center dark:border-slate-800"><td class="p-3 text-start">{m.user.name}</td><td>{num(m.open)}</td><td>{num(m.done)}</td><td>{num(m.overdue)}</td><td>{num(m.avgHours)}</td></tr>{/each}</tbody></table>
  </div>
{/if}
{#if load.length}
  <h2 class="mb-2 font-semibold">بار کاری تیم</h2>
  <div class="card p-4">{#each load as w}<div class="mb-1 flex items-center gap-2 text-sm"><span class="w-32 truncate">{w.user?.name}</span><div class="h-2 flex-1 rounded bg-slate-100 dark:bg-slate-800"><div class="h-full rounded bg-brand" style="width:{Math.min(100, w.open * 8)}%"></div></div><span>{num(w.open)}</span></div>{/each}</div>
{/if}
