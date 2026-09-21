<script>
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api.js';
  import { notice } from '$lib/state.svelte.js';
  import { ACTIONS, fmtDate, fmtDateTime, num, ROLES, SYS_ROLES, toInput } from '$lib/format.js';
  import Board from '$lib/Board.svelte';
  import ListView from '$lib/ListView.svelte';
  import Calendar from '$lib/Calendar.svelte';
  import QuickTask from '$lib/QuickTask.svelte';

  const id = page.params.id;
  let data = $state(null);
  let tasks = $state([]);
  let categories = $state([]);
  let workload = $state([]);
  let tab = $state('board');
  let quick = $state(false);
  let inviteLink = $state('');
  let newMember = $state({ q: '', found: [], role: 'REPORTER' });
  let edit = $state(null);

  const role = $derived(data?.myRole);
  const isManager = $derived(role === 'MANAGER');
  const canCreate = $derived(['REPORTER', 'CONTRIBUTOR', 'MANAGER'].includes(role));
  const project = $derived(data?.project);

  async function reload() {
    data = await api('/projects/' + id);
    tasks = (await api(`/tasks?projectId=${id}&limit=500`)).tasks;
    if (data.myRole !== 'VIEWER' && data.myRole !== 'REPORTER') workload = (await api(`/projects/${id}/workload`).catch(() => ({ workload: [] }))).workload;
  }
  $effect(() => {
    reload().catch((e) => { notice(e.message); goto('/projects'); });
    api('/categories').then((r) => (categories = r.categories));
  });

  async function findUsers() {
    if (newMember.q.length < 1) return (newMember.found = []);
    newMember.found = (await api('/users/lookup?q=' + encodeURIComponent(newMember.q))).users;
  }
  async function setRole(userId, r) {
    await api(`/projects/${id}/members/${userId}`, { method: 'PUT', body: { role: r } });
    newMember = { q: '', found: [], role: 'REPORTER' };
    reload();
  }
  async function removeMember(userId) {
    if (!confirm('عضو حذف شود؟')) return;
    await api(`/projects/${id}/members/${userId}`, { method: 'DELETE' });
    reload();
  }
  async function invite() {
    inviteLink = (await api('/invites', { method: 'POST', body: { role: 'CLIENT', projectId: id, projectRole: newMember.role } })).link;
  }
  async function saveEdit(e) {
    e.preventDefault();
    const { name, description, status, color, icon, type, startDate, deadline } = edit;
    await api('/projects/' + id, { method: 'PATCH', body: { name, description, status, color, icon, type, startDate: startDate || null, deadline: deadline || null } });
    notice('ذخیره شد');
    edit = null;
    reload();
  }
  async function saveTemplate() {
    const name = prompt('نام قالب؟', project.name);
    if (name) { await api(`/projects/${id}/save-template`, { method: 'POST', body: { name } }); notice('قالب ذخیره شد'); }
  }
  async function remove() {
    if (confirm('پروژه حذف شود؟')) { await api('/projects/' + id, { method: 'DELETE' }); goto('/projects'); }
  }
  function openTab(k) {
    tab = k;
    if (k === 'settings') edit = { name: project.name, description: project.description, status: project.status, color: project.color, icon: project.icon, type: project.type, startDate: toInput(project.startDate), deadline: toInput(project.deadline) };
  }
  const tabs = $derived([['board', 'کانبان'], ['list', 'لیست'], ['calendar', 'تقویم'], ['overview', 'داشبورد'], ['members', 'اعضا'], ...(isManager ? [['settings', 'تنظیمات']] : [])]);
</script>

<svelte:head><title>{project?.name ?? 'پروژه'}</title></svelte:head>

{#if !data}
  <div class="skeleton h-10 w-64"></div><div class="skeleton mt-4 h-64"></div>
{:else}
  <div class="mb-4 flex flex-wrap items-center gap-3">
    <h1 class="text-xl font-bold" style="color:{project.color}">{project.icon} {project.name}</h1>
    {#if project.telegram}<span class="chip bg-sky-100 text-sky-700 dark:bg-sky-950">تلگرام: {project.telegram.title}</span>{/if}
    <div class="ms-auto flex gap-2">{#if canCreate}<button class="btn-primary" onclick={() => (quick = true)}>＋ تسک</button>{/if}</div>
  </div>

  <div class="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
    {#each tabs as [k, l]}
      <button class="-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm {tab === k ? 'border-brand font-semibold text-brand' : 'border-transparent text-slate-500'}" onclick={() => openTab(k)}>{l}</button>
    {/each}
  </div>

  {#if tab === 'board'}
    <Board {project} {tasks} canManage={isManager} canMove={isManager} {reload} />
  {:else if tab === 'list'}
    <ListView {project} {categories} members={project.members} canManage={isManager} />
  {:else if tab === 'calendar'}
    <Calendar {tasks} />
  {:else if tab === 'overview'}
    <div class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {#each [['کل', data.stats.total, ''], ['باز', data.stats.open, ''], ['انجام‌شده', data.stats.closed, 'text-emerald-600'], ['عقب‌افتاده', data.stats.overdue, 'text-red-600']] as [l, v, c]}
        <div class="card p-3"><div class="text-xs text-slate-500">{l}</div><div class="text-2xl font-bold {c}">{num(v)}</div></div>
      {/each}
    </div>
    <div class="card mb-4 p-4">
      <div class="mb-2 text-sm text-slate-500">پیشرفت: {data.stats.total ? num(Math.round((data.stats.closed / data.stats.total) * 100)) : '۰'}٪ {#if project.deadline}· ددلاین: {fmtDate(project.deadline)}{/if}</div>
      <div class="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div class="h-full bg-emerald-500" style="width:{data.stats.total ? (data.stats.closed / data.stats.total) * 100 : 0}%"></div></div>
    </div>
    {#if workload.length}
      <div class="card mb-4 p-4"><div class="mb-2 font-semibold">بار کاری اعضا</div>
        {#each workload as w}<div class="mb-1 flex items-center gap-2 text-sm"><span class="w-32 truncate">{w.user?.name}</span><div class="h-2 flex-1 rounded bg-slate-100 dark:bg-slate-800"><div class="h-full rounded bg-brand" style="width:{Math.min(100, w.open * 10)}%"></div></div><span>{num(w.open)}</span></div>{/each}
      </div>
    {/if}
    <div class="card p-4"><div class="mb-2 font-semibold">فعالیت‌های اخیر</div>
      {#each data.recent as a}<div class="border-b border-slate-100 py-1.5 text-sm last:border-0 dark:border-slate-800">{a.user?.name ?? 'سیستم'} {ACTIONS[a.action] ?? a.action}{#if a.task} <a class="text-brand" href="/tasks/{a.taskId}">#{a.task.number}</a>{/if}<span class="ms-2 text-xs text-slate-400">{fmtDateTime(a.createdAt)}</span></div>{/each}
      {#if !data.recent.length}<div class="text-sm text-slate-400">فعالیتی ثبت نشده.</div>{/if}
    </div>
  {:else if tab === 'members'}
    <div class="card divide-y divide-slate-100 dark:divide-slate-800">
      {#each project.members as m (m.userId)}
        <div class="flex items-center gap-3 p-3 text-sm">
          <span class="font-medium">{m.user.name}</span><span class="text-xs text-slate-400">@{m.user.username} · {SYS_ROLES[m.user.role]}</span>
          {#if isManager}
            <select class="input ms-auto !w-auto" value={m.role} onchange={(e) => setRole(m.userId, e.target.value)}>{#each Object.entries(ROLES) as [k, v]}<option value={k}>{v}</option>{/each}</select>
            <button class="btn-danger" onclick={() => removeMember(m.userId)}>حذف</button>
          {:else}<span class="chip ms-auto bg-slate-100 dark:bg-slate-800">{ROLES[m.role]}</span>{/if}
        </div>
      {/each}
    </div>
    {#if isManager}
      <div class="card mt-4 space-y-3 p-4">
        <div class="font-semibold">افزودن عضو</div>
        <div class="flex flex-wrap gap-2">
          <input class="input !w-56" placeholder="جستجوی کاربر…" bind:value={newMember.q} oninput={findUsers} />
          <select class="input !w-auto" bind:value={newMember.role}>{#each Object.entries(ROLES) as [k, v]}<option value={k}>{v}</option>{/each}</select>
          <button class="btn-ghost" onclick={invite}>🔗 لینک دعوت مشتری</button>
        </div>
        {#each newMember.found as u}<button class="btn-ghost w-full justify-start" onclick={() => setRole(u.id, newMember.role)}>＋ {u.name} (@{u.username})</button>{/each}
        {#if inviteLink}<input class="input" dir="ltr" readonly value={inviteLink} onclick={(e) => e.target.select()} />{/if}
      </div>
    {/if}
  {:else if tab === 'settings'}
    {#if edit}
      <form class="card grid max-w-2xl gap-3 p-4 sm:grid-cols-2" onsubmit={saveEdit}>
        <input class="input" bind:value={edit.name} required />
        <select class="input" bind:value={edit.status}><option value="ACTIVE">فعال</option><option value="PAUSED">متوقف</option><option value="COMPLETED">تکمیل‌شده</option><option value="ARCHIVED">بایگانی</option></select>
        <input class="input" placeholder="نوع/دسته پروژه" bind:value={edit.type} />
        <div class="flex gap-2"><input class="input !w-16" bind:value={edit.icon} maxlength="4" /><input class="h-9 w-12" type="color" bind:value={edit.color} /></div>
        <label class="text-xs">شروع<input class="input" type="date" bind:value={edit.startDate} /></label>
        <label class="text-xs">ددلاین<input class="input" type="date" bind:value={edit.deadline} /></label>
        <textarea class="input sm:col-span-2" rows="4" bind:value={edit.description}></textarea>
        <div class="flex gap-2 sm:col-span-2"><button class="btn-primary">ذخیره</button><button type="button" class="btn-ghost" onclick={saveTemplate}>ذخیره به‌عنوان قالب</button><button type="button" class="btn-danger ms-auto" onclick={remove}>حذف پروژه</button></div>
      </form>
    {/if}
  {/if}
  {#if quick}<QuickTask projectId={id} onclose={() => { quick = false; reload(); }} />{/if}
{/if}
