<script>
  import { goto } from '$app/navigation';
  import { api } from '$lib/api.js';
  import { canCreateProject, notice } from '$lib/state.svelte.js';
  import { fmtDate, num, ROLES } from '$lib/format.js';
  import Icon from '$lib/Icon.svelte';
  import EmptyState from '$lib/EmptyState.svelte';

  let projects = $state(null);
  let templates = $state([]);
  let status = $state('');
  let search = $state('');
  let show = $state(false);
  let f = $state({ name: '', description: '', color: '#4f46e5', icon: 'folder', templateId: '' });
  const STATUS = {
    ACTIVE: ['فعال', 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'],
    PAUSED: ['متوقف', 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'],
    COMPLETED: ['تکمیل‌شده', 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300'],
    ARCHIVED: ['بایگانی', 'bg-zinc-100 text-zinc-500 dark:bg-white/10'],
  };
  const COLORS = ['#4f46e5', '#7c5cd6', '#c2569b', '#d4802a', '#2f9e73', '#2b8fb3', '#c8503c', '#3f74d6'];
  const ICONS = ['folder', 'rocket', 'target', 'bulb', 'wrench', 'phone', 'globe', 'cart', 'chart', 'palette', 'briefcase', 'layers'];

  async function load() { projects = (await api('/projects' + (status ? `?status=${status}` : ''))).projects; }
  $effect(() => { status; load(); });
  $effect(() => { if (canCreateProject()) api('/project-templates').then((r) => (templates = r.templates)); });

  const list = $derived(projects?.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase())));

  async function create(e) {
    e.preventDefault();
    try {
      const { project } = await api('/projects', { method: 'POST', body: { ...f, templateId: f.templateId || undefined } });
      goto('/projects/' + project.id);
    } catch (err) { notice(err.message); }
  }
</script>

<svelte:head><title>پروژه‌ها</title></svelte:head>
<div class="mb-8 flex flex-wrap items-center gap-3">
  <div class="me-auto"><h1 class="h-page !text-[26px]">پروژه‌ها</h1><p class="mt-1 text-sm text-zinc-500">همه‌ی پروژه‌هایی که به آن‌ها دسترسی دارید</p></div>
  <div class="relative w-full sm:w-60">
    <Icon name="search" size={15} class="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-zinc-400" />
    <input class="input !ps-9" placeholder="جستجوی پروژه…" bind:value={search} />
  </div>
  <div class="seg">
    {#each [['', 'همه'], ...Object.entries(STATUS).map(([k, v]) => [k, v[0]])] as [k, l]}
      <button class="seg-btn {status === k ? 'seg-btn-on' : ''}" onclick={() => (status = k)}>{l}</button>
    {/each}
  </div>
  {#if canCreateProject()}<button class="btn-primary" onclick={() => (show = !show)}><Icon name={show ? 'x' : 'plus'} size={16} stroke={2.4} /> پروژه جدید</button>{/if}
</div>

{#if show}
  <form class="card pop-in mb-8 grid gap-5 p-6 sm:grid-cols-2" onsubmit={create}>
    <label class="text-sm font-semibold">نام پروژه<input class="input mt-2" bind:value={f.name} required /></label>
    <label class="text-sm font-semibold">قالب<select class="input mt-2" bind:value={f.templateId}><option value="">شروع از صفر</option>{#each templates as t}<option value={t.id}>قالب: {t.name}</option>{/each}</select></label>
    <div><div class="mb-2 text-sm font-semibold">آیکون</div><div class="flex flex-wrap gap-2">{#each ICONS as i}<button type="button" class="tile h-10 w-10 border transition {f.icon === i ? 'border-brand bg-brand-50 text-brand dark:bg-brand/15' : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50 dark:border-white/10 dark:hover:bg-white/5'}" onclick={() => (f.icon = i)} aria-label={i}><Icon name={i} size={18} /></button>{/each}</div></div>
    <div><div class="mb-2 text-sm font-semibold">رنگ</div><div class="flex flex-wrap gap-2.5">{#each COLORS as c}<button type="button" aria-label={c} class="h-9 w-9 rounded-full transition {f.color === c ? 'scale-110 ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#12131d]' : 'hover:scale-105'}" style="background:{c};--tw-ring-color:{c}" onclick={() => (f.color = c)}></button>{/each}</div></div>
    <label class="text-sm font-semibold sm:col-span-2">توضیحات<textarea class="input mt-2" rows="2" placeholder="مارک‌داون پشتیبانی می‌شود" bind:value={f.description}></textarea></label>
    <div class="flex justify-end gap-2 sm:col-span-2"><button type="button" class="btn-ghost" onclick={() => (show = false)}>انصراف</button><button class="btn-primary">ساخت پروژه</button></div>
  </form>
{/if}

{#if !list}
  <div class="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{#each Array(3) as _}<div class="skeleton h-44"></div>{/each}</div>
{:else if !list.length}
  <div class="card"><EmptyState icon="folder" title="پروژه‌ای پیدا نشد" text="با دکمه‌ی «پروژه جدید» اولین پروژه‌ی خود را بسازید." /></div>
{:else}
  <div class="stagger grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
    {#each list as p (p.id)}
      {@const pct = p.total ? Math.round((p.closed / p.total) * 100) : 0}
      <a href="/projects/{p.id}" class="card card-hover group relative block p-5">
        <div class="flex items-start gap-3.5">
          <span class="tile h-12 w-12" style="background:{p.color}18;color:{p.color}"><Icon name={p.icon} size={22} /></span>
          <div class="min-w-0 flex-1"><div class="truncate font-bold">{p.name}</div><div class="mt-1 truncate text-xs text-zinc-400">{p.description?.replace(/[#*_`>]/g, '').slice(0, 60) || p.type || 'بدون توضیحات'}</div></div>
          <span class="chip {STATUS[p.status][1]}">{STATUS[p.status][0]}</span>
        </div>
        <div class="mt-6 flex items-end justify-between"><span class="tabnum text-xs text-zinc-500">{num(p.closed)} از {num(p.total)} تسک</span><b class="tabnum text-lg" style="color:{p.color}">{num(pct)}٪</b></div>
        <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10"><div class="h-full rounded-full transition-all duration-700" style="width:{pct}%;background:{p.color}"></div></div>
        <div class="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3 text-xs text-zinc-400 dark:border-white/[0.06]">
          <span class="inline-flex items-center gap-1.5"><Icon name="users" size={13} />{ROLES[p.myRole] ?? '—'}</span>
          {#if p.deadline}<span class="tabnum inline-flex items-center gap-1.5"><Icon name="flag" size={13} />{fmtDate(p.deadline)}</span>{/if}
        </div>
      </a>
    {/each}
  </div>
{/if}
