<script>
  import { goto } from '$app/navigation';
  import { api } from '$lib/api.js';
  import { app } from '$lib/state.svelte.js';
  import { fmtDateTime } from '$lib/format.js';

  let items = $state(null);
  $effect(() => {
    api('/notifications').then((r) => (items = r.notifications));
  });

  async function open(n) {
    if (!n.readAt) { await api('/notifications/read', { method: 'POST', body: { ids: [n.id] } }); app.unread = Math.max(0, app.unread - 1); }
    if (n.link) goto(n.link);
  }
  async function readAll() {
    await api('/notifications/read', { method: 'POST', body: {} });
    app.unread = 0;
    items = items.map((n) => ({ ...n, readAt: n.readAt ?? new Date() }));
  }
</script>

<svelte:head><title>اعلان‌ها</title></svelte:head>
<div class="mb-4 flex items-center"><h1 class="h-page">اعلان‌ها</h1><button class="btn-ghost ms-auto" onclick={readAll}>علامت‌گذاری همه به‌عنوان خوانده‌شده</button></div>
<div class="card overflow-hidden">
  {#if !items}{#each Array(4) as _}<div class="skeleton m-3 h-10"></div>{/each}
  {:else if !items.length}<div class="p-10 text-center text-slate-400"><div class="text-4xl">🔔</div>اعلانی ندارید.</div>
  {:else}
    {#each items as n (n.id)}
      <button class="block w-full border-b border-slate-100 px-4 py-3 text-start last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50 {n.readAt ? 'opacity-60' : ''}" onclick={() => open(n)}>
        <div class="text-sm font-medium">{#if !n.readAt}<span class="me-1 text-brand">●</span>{/if}{n.title}</div>
        {#if n.body}<div class="text-xs text-slate-500">{n.body}</div>{/if}
        <div class="mt-0.5 text-xs text-slate-400">{fmtDateTime(n.createdAt)}</div>
      </button>
    {/each}
  {/if}
</div>
