<script>
  import { goto } from '$app/navigation';
  import { api } from '$lib/api.js';
  import { app, notice } from '$lib/state.svelte.js';
  import { fmtDate, num } from '$lib/format.js';
  import Icon from '$lib/Icon.svelte';
  import EmptyState from '$lib/EmptyState.svelte';

  let data = $state(null);
  let tab = $state('tasks');

  async function load() { data = await api('/archive'); }
  $effect(() => {
    if (app.user.role === 'CLIENT') return void goto('/');
    load().catch((e) => notice(e.message));
  });

  async function restore(kind, item) {
    await api(`/archive/${kind}/${item.id}/restore`, { method: 'POST' });
    notice('بازیابی شد');
    load();
  }
  const TABS = $derived([
    ['tasks', 'تسک‌های بایگانی‌شده', 'archive', data?.tasks.length],
    ['deleted', 'تسک‌های حذف‌شده', 'trash', data?.deletedTasks.length],
    ['projects', 'پروژه‌های بایگانی و حذف‌شده', 'folder', data?.projects.length],
  ]);
  const list = $derived(tab === 'tasks' ? data?.tasks : tab === 'deleted' ? data?.deletedTasks : data?.projects);
</script>

<svelte:head><title>بایگانی</title></svelte:head>

<div class="mb-8"><h1 class="h-page !text-[26px]">بایگانی</h1><p class="mt-1 text-sm text-zinc-500">موارد بایگانی‌شده و حذف‌شده؛ هر مورد را می‌توانید بازیابی کنید.</p></div>

<div class="seg mb-6 max-w-full overflow-x-auto">
  {#each TABS as [k, l, ic, n]}
    <button class="seg-btn !px-4 !py-2 !text-[13px] {tab === k ? 'seg-btn-on' : ''}" onclick={() => (tab = k)}><Icon name={ic} size={15} />{l}{#if n}<span class="tabnum chip {tab === k ? 'bg-white/25' : 'bg-zinc-100 dark:bg-white/10'}">{num(n)}</span>{/if}</button>
  {/each}
</div>

<div class="card overflow-hidden">
  {#if !data}
    {#each Array(4) as _}<div class="skeleton m-3 h-14"></div>{/each}
  {:else if !list.length}
    <EmptyState icon="archive" title="موردی وجود ندارد" text="وقتی تسک یا پروژه‌ای بایگانی یا حذف شود، اینجا نمایش داده می‌شود." />
  {:else if tab === 'projects'}
    {#each list as p (p.id)}
      <div class="flex items-center gap-4 border-b border-zinc-100 px-5 py-4 last:border-0 dark:border-white/[0.05]">
        <span class="tile h-11 w-11" style="background:{p.color}18;color:{p.color}"><Icon name={p.icon} size={20} /></span>
        <div class="min-w-0 flex-1"><div class="truncate font-semibold">{p.name}</div>
          <div class="mt-0.5 text-xs text-zinc-500">{p.deletedAt ? 'حذف‌شده' : 'بایگانی‌شده'}</div></div>
        <button class="btn-outline" onclick={() => restore('projects', p)}><Icon name="refresh" size={15} /> بازیابی</button>
      </div>
    {/each}
  {:else}
    {#each list as t (t.id)}
      <div class="flex items-center gap-4 border-b border-zinc-100 px-5 py-4 last:border-0 dark:border-white/[0.05]">
        <span class="tile h-10 w-10 bg-zinc-100 text-zinc-500 dark:bg-white/10"><Icon name={tab === 'deleted' ? 'trash' : 'archive'} size={18} /></span>
        <div class="min-w-0 flex-1">
          <div class="truncate font-semibold"><span class="tabnum font-normal text-zinc-400">#{num(t.number)}</span> {t.title}</div>
          <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span class="inline-flex items-center gap-1.5"><span class="h-2 w-2 rounded-sm" style="background:{t.project.color}"></span>{t.project.name}</span>
            <span>{t.column.name}</span><span>ثبت‌کننده: {t.createdBy.name}</span>
            <span class="tabnum">{tab === 'deleted' ? 'حذف' : 'بایگانی'}: {fmtDate(tab === 'deleted' ? t.deletedAt : t.archivedAt)}</span>
          </div>
        </div>
        {#if tab === 'tasks'}<a href="/tasks/{t.id}" class="btn-ghost">مشاهده</a>{/if}
        <button class="btn-outline" onclick={() => restore('tasks', t)}><Icon name="refresh" size={15} /> بازیابی</button>
      </div>
    {/each}
  {/if}
</div>
