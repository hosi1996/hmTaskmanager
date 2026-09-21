<script>
  import { api } from '$lib/api.js';
  import { num } from '$lib/format.js';
  import TaskRow from '$lib/TaskRow.svelte';

  let tasks = $state(null);
  let overview = $state(null);

  $effect(() => {
    api('/tasks?assignee=me&status=open&sort=due').then((r) => (tasks = r.tasks));
    api('/reports/overview').then((r) => (overview = r.totals));
  });
</script>

<svelte:head><title>تسک‌های من</title></svelte:head>
<h1 class="mb-4 text-xl font-bold">تسک‌های من</h1>

<div class="mb-4 grid grid-cols-3 gap-3">
  {#each [['باز', overview?.open, ''], ['بسته‌شده', overview?.closed, ''], ['عقب‌افتاده', overview?.overdue, 'text-red-600']] as [l, v, c]}
    <div class="card p-3"><div class="text-xs text-slate-500">{l}</div><div class="text-2xl font-bold {c}">{overview ? num(v) : '…'}</div></div>
  {/each}
</div>

<div class="card overflow-hidden">
  {#if !tasks}
    {#each Array(4) as _}<div class="skeleton m-3 h-8"></div>{/each}
  {:else if !tasks.length}
    <div class="p-10 text-center text-slate-400"><div class="text-4xl">🎉</div>تسکی به شما اساین نشده است.</div>
  {:else}
    {#each tasks as t (t.id)}<TaskRow task={t} showProject />{/each}
  {/if}
</div>
