<script>
  import { api, qs } from './api.js';
  import { notice } from './state.svelte.js';
  import { PRIORITY } from './format.js';
  import TaskRow from './TaskRow.svelte';

  let { project, categories, members, canManage } = $props();
  let f = $state({ status: 'open', priority: '', categoryId: '', assignee: '', q: '', sort: 'due' });
  let tasks = $state(null);
  let views = $state([]);
  let sel = $state([]);

  async function load() {
    tasks = (await api('/tasks' + qs({ projectId: project.id, ...f }))).tasks;
    sel = [];
  }
  $effect(() => {
    JSON.stringify(f);
    load();
  });
  $effect(() => {
    api('/views').then((r) => (views = r.views.filter((v) => v.filters._project === project.id)));
  });

  async function saveView() {
    const name = prompt('نام فیلتر ذخیره‌شده؟');
    if (!name) return;
    const { view } = await api('/views', { method: 'POST', body: { name, filters: { ...f, _project: project.id } } });
    views = [...views, view];
  }
  async function delView(v) {
    await api('/views/' + v.id, { method: 'DELETE' });
    views = views.filter((x) => x.id !== v.id);
  }
  const toggle = (id) => (sel = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);

  async function bulk(action, value) {
    if (action === 'delete' && !confirm(`${sel.length} تسک حذف شود؟`)) return;
    const r = await api('/tasks/bulk', { method: 'POST', body: { ids: sel, action, value } });
    notice(`${r.done} تسک به‌روزرسانی شد`);
    load();
  }
</script>

<div class="mb-3 flex flex-wrap items-center gap-2">
  <input class="input !w-44" placeholder="جستجو…" bind:value={f.q} />
  <select class="input !w-auto" bind:value={f.status}><option value="">همه</option><option value="open">باز</option><option value="done">انجام‌شده</option></select>
  <select class="input !w-auto" bind:value={f.priority}><option value="">همه‌ی اولویت‌ها</option>{#each Object.entries(PRIORITY) as [k, v]}<option value={k}>{v.label}</option>{/each}</select>
  <select class="input !w-auto" bind:value={f.categoryId}><option value="">همه‌ی گروه‌ها</option>{#each categories as c}<option value={c.id}>{c.name}</option>{/each}</select>
  <select class="input !w-auto" bind:value={f.assignee}><option value="">همه‌ی اساین‌شده‌ها</option><option value="me">من</option>{#each members as m}<option value={m.user.id}>{m.user.name}</option>{/each}</select>
  <select class="input !w-auto" bind:value={f.sort}><option value="due">ددلاین</option><option value="priority">اولویت</option><option value="created">جدیدترین</option></select>
  <button class="btn-ghost" onclick={saveView}>☆ ذخیره فیلتر</button>
  {#each views as v}
    <span class="chip bg-indigo-50 text-brand dark:bg-indigo-950"><button onclick={() => (f = { ...f, ...v.filters })}>{v.name}</button><button class="opacity-60" onclick={() => delView(v)} aria-label="حذف">×</button></span>
  {/each}
</div>

{#if sel.length && canManage}
  <div class="card fade-in mb-3 flex flex-wrap items-center gap-2 p-2 text-sm">
    <b>{sel.length} انتخاب‌شده</b>
    <select class="input !w-auto" onchange={(e) => e.target.value && bulk('move', e.target.value)}><option value="">انتقال به…</option>{#each project.columns as c}<option value={c.id}>{c.name}</option>{/each}</select>
    <select class="input !w-auto" onchange={(e) => e.target.value && bulk('assign', [e.target.value])}><option value="">اساین به…</option>{#each members as m}<option value={m.user.id}>{m.user.name}</option>{/each}</select>
    <select class="input !w-auto" onchange={(e) => e.target.value && bulk('priority', e.target.value)}><option value="">اولویت…</option>{#each Object.entries(PRIORITY) as [k, v]}<option value={k}>{v.label}</option>{/each}</select>
    <button class="btn-ghost" onclick={() => bulk('archive')}>بایگانی</button>
    <button class="btn-danger" onclick={() => bulk('delete')}>حذف</button>
  </div>
{/if}

<div class="card overflow-hidden">
  {#if !tasks}{#each Array(5) as _}<div class="skeleton m-3 h-8"></div>{/each}
  {:else if !tasks.length}<div class="p-10 text-center text-slate-400"><div class="text-4xl">🗒️</div>تسکی با این فیلترها نیست.</div>
  {:else}{#each tasks as t (t.id)}<TaskRow task={t} selected={sel.includes(t.id)} onselect={canManage ? toggle : null} />{/each}{/if}
</div>
