<script>
  import { goto } from '$app/navigation';
  import { api } from '$lib/api.js';
  import { app } from '$lib/state.svelte.js';
  import { fmtDateTime } from '$lib/format.js';
  import Icon from '$lib/Icon.svelte';
  import EmptyState from '$lib/EmptyState.svelte';

  let items = $state(null);
  $effect(() => {
    api('/notifications').then((r) => (items = r.notifications));
  });
  const ICON = { assigned: 'users', comment: 'message', mention: 'message', deadline: 'clock', status: 'refresh', project_added: 'folder', task_created: 'plus', digest: 'list' };

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
<div class="mb-8 flex items-center"><div><h1 class="h-page !text-[26px]">اعلان‌ها</h1><p class="mt-1 text-sm text-zinc-500">آخرین رویدادهای مرتبط با شما</p></div><button class="btn-outline ms-auto" onclick={readAll}><Icon name="tick" size={15} /> خوانده‌شدن همه</button></div>
<div class="card overflow-hidden">
  {#if !items}{#each Array(4) as _}<div class="skeleton m-3 h-14"></div>{/each}
  {:else if !items.length}<EmptyState icon="bell" title="اعلانی ندارید" text="وقتی اتفاقی مرتبط با شما بیفتد، اینجا نشان داده می‌شود." />
  {:else}
    <div class="stagger">
    {#each items as n (n.id)}
      <button class="flex w-full items-start gap-3.5 border-b border-zinc-100 px-5 py-4 text-start transition last:border-0 hover:bg-zinc-50 dark:border-white/[0.05] dark:hover:bg-white/[0.03] {n.readAt ? 'opacity-60' : ''}" onclick={() => open(n)}>
        <span class="tile h-10 w-10 {n.readAt ? 'bg-zinc-100 text-zinc-500 dark:bg-white/10' : 'bg-brand-50 text-brand dark:bg-brand/15'}"><Icon name={ICON[n.type] ?? 'bell'} size={18} /></span>
        <div class="min-w-0 flex-1"><div class="text-sm font-semibold">{n.title}</div>
          {#if n.body}<div class="mt-0.5 truncate text-xs text-zinc-500">{n.body}</div>{/if}
          <div class="tabnum mt-1 text-[11px] text-zinc-400">{fmtDateTime(n.createdAt)}</div></div>
        {#if !n.readAt}<span class="mt-2 h-2 w-2 rounded-full bg-brand"></span>{/if}
      </button>
    {/each}
    </div>
  {/if}
</div>
