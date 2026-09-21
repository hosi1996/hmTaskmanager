<script>
  import { goto } from '$app/navigation';
  import { api } from '$lib/api.js';
  import { canCreateProject, notice } from '$lib/state.svelte.js';
  import { num } from '$lib/format.js';

  let projects = $state(null);
  let templates = $state([]);
  let status = $state('');
  let show = $state(false);
  let f = $state({ name: '', description: '', color: '#6366f1', icon: '📁', templateId: '' });
  const STATUS = { ACTIVE: 'فعال', PAUSED: 'متوقف', COMPLETED: 'تکمیل‌شده', ARCHIVED: 'بایگانی' };

  async function load() {
    projects = (await api('/projects' + (status ? `?status=${status}` : ''))).projects;
  }
  $effect(() => {
    status;
    load();
  });
  $effect(() => {
    if (canCreateProject()) api('/project-templates').then((r) => (templates = r.templates));
  });

  async function create(e) {
    e.preventDefault();
    try {
      const body = { ...f, templateId: f.templateId || undefined };
      const { project } = await api('/projects', { method: 'POST', body });
      goto('/projects/' + project.id);
    } catch (err) {
      notice(err.message);
    }
  }
</script>

<svelte:head><title>پروژه‌ها</title></svelte:head>
<div class="mb-4 flex items-center gap-2">
  <h1 class="text-xl font-bold">پروژه‌ها</h1>
  <select class="input ms-4 !w-auto" bind:value={status}>
    <option value="">همه‌ی وضعیت‌ها</option>
    {#each Object.entries(STATUS) as [k, v]}<option value={k}>{v}</option>{/each}
  </select>
  {#if canCreateProject()}<button class="btn-primary ms-auto" onclick={() => (show = !show)}>＋ پروژه جدید</button>{/if}
</div>

{#if show}
  <form class="card fade-in mb-4 grid gap-3 p-4 sm:grid-cols-2" onsubmit={create}>
    <input class="input" placeholder="نام پروژه" bind:value={f.name} required />
    <div class="flex gap-2"><input class="input !w-16" bind:value={f.icon} maxlength="4" aria-label="آیکون" /><input class="h-9 w-12 rounded" type="color" bind:value={f.color} aria-label="رنگ" />
      <select class="input" bind:value={f.templateId}><option value="">بدون قالب</option>{#each templates as t}<option value={t.id}>قالب: {t.name}</option>{/each}</select></div>
    <textarea class="input sm:col-span-2" rows="2" placeholder="توضیحات (مارک‌داون)" bind:value={f.description}></textarea>
    <button class="btn-primary sm:col-span-2">ساخت پروژه</button>
  </form>
{/if}

{#if !projects}
  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{#each Array(3) as _}<div class="skeleton h-28"></div>{/each}</div>
{:else if !projects.length}
  <div class="card p-12 text-center text-slate-400"><div class="text-4xl">📂</div>پروژه‌ای وجود ندارد.</div>
{:else}
  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {#each projects as p (p.id)}
      <a href="/projects/{p.id}" class="card fade-in block p-4 transition hover:shadow-md" style="border-top:3px solid {p.color}">
        <div class="flex items-center gap-2 font-semibold"><span>{p.icon}</span>{p.name}<span class="chip ms-auto bg-slate-100 text-slate-500 dark:bg-slate-800">{STATUS[p.status]}</span></div>
        <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div class="h-full" style="width:{p.total ? (p.closed / p.total) * 100 : 0}%;background:{p.color}"></div></div>
        <div class="mt-2 text-xs text-slate-500">{num(p.closed)} از {num(p.total)} تسک انجام شده</div>
      </a>
    {/each}
  </div>
{/if}
