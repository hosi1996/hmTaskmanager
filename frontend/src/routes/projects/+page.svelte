<script>
  import { goto } from '$app/navigation';
  import { api } from '$lib/api.js';
  import { canCreateProject, notice } from '$lib/state.svelte.js';
  import { fmtDate, num, ROLES } from '$lib/format.js';
  import Icon from '$lib/Icon.svelte';

  let projects = $state(null);
  let templates = $state([]);
  let status = $state('');
  let search = $state('');
  let show = $state(false);
  let f = $state({ name: '', description: '', color: '#6366f1', icon: '📁', templateId: '' });
  const STATUS = { ACTIVE: ['فعال', 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'], PAUSED: ['متوقف', 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'], COMPLETED: ['تکمیل‌شده', 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300'], ARCHIVED: ['بایگانی', 'bg-slate-100 text-slate-500 dark:bg-slate-800'] };
  const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6'];
  const ICONS = ['📁', '🚀', '🎯', '💡', '🛠️', '📱', '🌐', '🛒', '📊', '🎨'];

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
<div class="mb-6 flex flex-wrap items-center gap-3">
  <h1 class="h-page">پروژه‌ها</h1>
  <div class="relative ms-auto w-full sm:w-64">
    <Icon name="search" size={15} class="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
    <input class="input !ps-9" placeholder="جستجوی پروژه…" bind:value={search} />
  </div>
  <div class="flex gap-1 rounded-xl bg-white p-1 shadow-soft dark:bg-slate-900">
    {#each [['', 'همه'], ...Object.entries(STATUS).map(([k, v]) => [k, v[0]])] as [k, l]}
      <button class="rounded-lg px-3 py-1 text-xs font-medium transition {status === k ? 'bg-gradient-to-l from-brand to-brand-2 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}" onclick={() => (status = k)}>{l}</button>
    {/each}
  </div>
  {#if canCreateProject()}<button class="btn-primary" onclick={() => (show = !show)}><Icon name={show ? 'x' : 'plus'} size={16} /> پروژه جدید</button>{/if}
</div>

{#if show}
  <form class="card pop-in mb-6 grid gap-4 p-5 sm:grid-cols-2" onsubmit={create}>
    <input class="input" placeholder="نام پروژه" bind:value={f.name} required />
    <select class="input" bind:value={f.templateId}><option value="">شروع از صفر (بدون قالب)</option>{#each templates as t}<option value={t.id}>قالب: {t.name}</option>{/each}</select>
    <div><div class="mb-1.5 text-xs text-slate-500">آیکون</div><div class="flex flex-wrap gap-1.5">{#each ICONS as i}<button type="button" class="h-9 w-9 rounded-xl border text-lg transition {f.icon === i ? 'border-brand bg-indigo-50 dark:bg-indigo-950' : 'border-slate-200 dark:border-slate-700'}" onclick={() => (f.icon = i)}>{i}</button>{/each}</div></div>
    <div><div class="mb-1.5 text-xs text-slate-500">رنگ</div><div class="flex flex-wrap gap-2">{#each COLORS as c}<button type="button" aria-label={c} class="h-8 w-8 rounded-full transition {f.color === c ? 'scale-110 ring-4 ring-offset-2 ring-offset-white dark:ring-offset-slate-900' : ''}" style="background:{c};--tw-ring-color:{c}66" onclick={() => (f.color = c)}></button>{/each}</div></div>
    <textarea class="input sm:col-span-2" rows="2" placeholder="توضیحات (مارک‌داون)" bind:value={f.description}></textarea>
    <button class="btn-primary sm:col-span-2 !py-2.5">ساخت پروژه</button>
  </form>
{/if}

{#if !list}
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{#each Array(3) as _}<div class="skeleton h-40"></div>{/each}</div>
{:else if !list.length}
  <div class="card p-14 text-center"><div class="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-100 to-violet-100 text-4xl dark:from-indigo-950 dark:to-violet-950">📂</div><div class="font-bold">پروژه‌ای پیدا نشد</div><div class="mt-1 text-sm text-slate-400">با دکمه‌ی «پروژه جدید» شروع کنید.</div></div>
{:else}
  <div class="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {#each list as p (p.id)}
      {@const pct = p.total ? Math.round((p.closed / p.total) * 100) : 0}
      <a href="/projects/{p.id}" class="card card-hover group relative block overflow-hidden p-5">
        <div class="absolute inset-x-0 top-0 h-1" style="background:linear-gradient(90deg,{p.color},{p.color}66)"></div>
        <div class="flex items-start gap-3">
          <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl" style="background:{p.color}1f">{p.icon}</span>
          <div class="min-w-0 flex-1"><div class="truncate font-bold">{p.name}</div><div class="mt-0.5 truncate text-xs text-slate-400">{p.description?.replace(/[#*_`>]/g, '').slice(0, 60) || p.type || '—'}</div></div>
          <span class="chip {STATUS[p.status][1]}">{STATUS[p.status][0]}</span>
        </div>
        <div class="mt-5 flex items-center justify-between text-xs text-slate-500"><span>{num(p.closed)} از {num(p.total)} تسک</span><b style="color:{p.color}">{num(pct)}٪</b></div>
        <div class="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div class="h-full rounded-full transition-all duration-700" style="width:{pct}%;background:linear-gradient(90deg,{p.color},{p.color}aa)"></div></div>
        <div class="mt-4 flex items-center justify-between text-xs text-slate-400">
          <span class="inline-flex items-center gap-1"><Icon name="users" size={13} />{ROLES[p.myRole] ?? '—'}</span>
          {#if p.deadline}<span class="inline-flex items-center gap-1"><Icon name="flag" size={13} />{fmtDate(p.deadline)}</span>{/if}
        </div>
      </a>
    {/each}
  </div>
{/if}
