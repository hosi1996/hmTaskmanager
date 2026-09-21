<script>
  import { api } from './api.js';
  import { notice } from './state.svelte.js';
  import { fmtDate, isOverdue, PRIORITY } from './format.js';
  import Icon from './Icon.svelte';
  import Avatar from './Avatar.svelte';

  let { project, tasks, canManage, canMove, canCreate = false, reload } = $props();
  let dragId = $state(null);
  let overCol = $state(null);
  let newCol = $state('');
  let adding = $state(null);
  let addTitle = $state('');

  const PALETTE = ['#64748b', '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4'];
  const STRIPE = { LOW: '#94a3b8', MEDIUM: '#3b82f6', HIGH: '#f59e0b', URGENT: '#ef4444' };
  const colTasks = (id) => tasks.filter((t) => t.columnId === id).sort((a, b) => a.position - b.position);

  async function drop(col, before) {
    const t = tasks.find((x) => x.id === dragId);
    dragId = overCol = null;
    if (!t) return;
    const list = colTasks(col.id).filter((x) => x.id !== t.id);
    let position;
    if (before) {
      const i = list.findIndex((x) => x.id === before.id);
      position = ((list[i - 1]?.position ?? before.position - 2000) + before.position) / 2;
    } else position = (list.at(-1)?.position ?? 0) + 1000;
    t.columnId = col.id;
    t.position = position;
    t.column = col;
    try {
      await api('/tasks/' + t.id, { method: 'PATCH', body: { columnId: col.id, position } });
    } catch (e) {
      notice(e.message);
    }
    reload();
  }

  async function addColumn(e) {
    e.preventDefault();
    if (!newCol.trim()) return;
    await api(`/projects/${project.id}/columns`, { method: 'POST', body: { name: newCol.trim() } });
    newCol = '';
    reload();
  }

  async function addTask(e, col) {
    e.preventDefault();
    if (!addTitle.trim()) return;
    try {
      await api(`/projects/${project.id}/tasks`, { method: 'POST', body: { title: addTitle.trim(), ...(canManage ? { columnId: col.id } : {}) } });
      addTitle = '';
      reload();
    } catch (err) { notice(err.message); }
  }
</script>

<div class="flex gap-4 overflow-x-auto pb-4">
  {#each project.columns as col, ci (col.id)}
    {@const color = PALETTE[ci % PALETTE.length]}
    <div class="flex w-80 shrink-0 flex-col rounded-2xl bg-slate-100/70 p-2.5 transition dark:bg-slate-900/60 {overCol === col.id ? 'ring-2 ring-brand ring-offset-2 ring-offset-transparent' : ''}"
      role="list" ondragover={(e) => { if (canMove) { e.preventDefault(); overCol = col.id; } }} ondragleave={() => (overCol = null)} ondrop={(e) => { e.preventDefault(); drop(col); }}>
      <div class="mb-3 flex items-center gap-2 px-1.5 text-sm font-bold">
        <span class="h-3 w-3 rounded-full" style="background:{color};box-shadow:0 0 0 4px {color}30"></span>
        {col.name}{#if col.isDone}<Icon name="check" size={14} class="text-emerald-500" />{/if}
        <span class="chip ms-auto bg-white text-slate-500 shadow-sm dark:bg-slate-800">{colTasks(col.id).length}</span>
      </div>
      <div class="flex-1 space-y-2.5">
        {#each colTasks(col.id) as t (t.id)}
          <a href="/tasks/{t.id}" draggable={canMove} ondragstart={() => (dragId = t.id)} ondragend={() => (dragId = null)}
            ondragover={(e) => { if (canMove) e.preventDefault(); }} ondrop={(e) => { e.preventDefault(); e.stopPropagation(); drop(col, t); }}
            class="card card-hover fade-in block cursor-pointer border-s-4 p-3 text-sm {dragId === t.id ? 'rotate-2 opacity-40' : ''}" style="border-inline-start-color:{STRIPE[t.priority]}">
            <div class="font-semibold leading-relaxed"><span class="font-normal text-slate-400">#{t.number}</span> {t.title}</div>
            {#if t.category || t.labels.length}
              <div class="mt-2 flex flex-wrap gap-1">
                {#if t.category}<span class="chip" style="background:{t.category.color}18;color:{t.category.color}">{t.category.name}</span>{/if}
                {#each t.labels as l}<span class="chip" style="background:{l.color}18;color:{l.color}">{l.name}</span>{/each}
              </div>
            {/if}
            <div class="mt-3 flex items-center gap-2 text-xs text-slate-400">
              {#if t.dueDate}<span class="inline-flex items-center gap-1 {isOverdue(t) ? 'font-bold text-red-500' : ''}"><Icon name="clock" size={12} />{fmtDate(t.dueDate)}</span>{/if}
              {#if t._count?.checklist}<span class="inline-flex items-center gap-0.5"><Icon name="list" size={12} />{t._count.checklist}</span>{/if}
              {#if t._count?.comments}<span class="inline-flex items-center gap-0.5"><Icon name="message" size={12} />{t._count.comments}</span>{/if}
              {#if t._count?.attachments}<span class="inline-flex items-center gap-0.5"><Icon name="clip" size={12} />{t._count.attachments}</span>{/if}
              <span class="ms-auto flex -space-x-2 -space-x-reverse">{#each t.assignees.slice(0, 3) as a}<Avatar name={a.name} size={22} ring />{/each}</span>
            </div>
          </a>
        {/each}
        {#if !colTasks(col.id).length}<div class="rounded-xl border-2 border-dashed border-slate-200 p-5 text-center text-xs text-slate-400 dark:border-slate-800">اینجا رها کنید</div>{/if}
      </div>
      {#if canCreate}
        {#if adding === col.id}
          <form class="pop-in mt-2" onsubmit={(e) => addTask(e, col)}>
            <input class="input" placeholder="عنوان تسک و Enter…" bind:value={addTitle} onblur={() => !addTitle && (adding = null)} />
          </form>
        {:else}
          <button class="btn-ghost mt-2 w-full justify-start text-slate-500" onclick={() => { adding = col.id; addTitle = ''; }}><Icon name="plus" size={15} /> افزودن تسک</button>
        {/if}
      {/if}
    </div>
  {/each}
  {#if canManage}
    <form class="w-64 shrink-0" onsubmit={addColumn}><input class="input border-dashed" placeholder="＋ ستون جدید" bind:value={newCol} /></form>
  {/if}
</div>
