<script>
  import { api } from './api.js';
  import { notice } from './state.svelte.js';
  import { fmtDate, isOverdue, PRIORITY } from './format.js';

  let { project, tasks, canManage, canMove, reload } = $props();
  let dragId = $state(null);
  let overCol = $state(null);
  let newCol = $state('');

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
    // به‌روزرسانی خوش‌بینانه
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
</script>

<div class="flex gap-3 overflow-x-auto pb-4">
  {#each project.columns as col (col.id)}
    <div class="w-72 shrink-0 rounded-xl bg-slate-100 p-2 transition dark:bg-slate-900 {overCol === col.id ? 'ring-2 ring-brand' : ''}"
      role="list" ondragover={(e) => { if (canMove) { e.preventDefault(); overCol = col.id; } }} ondragleave={() => (overCol = null)} ondrop={(e) => { e.preventDefault(); drop(col); }}>
      <div class="mb-2 flex items-center justify-between px-1 text-sm font-semibold">
        <span>{col.name}{#if col.isDone} ✓{/if}</span>
        <span class="chip bg-white dark:bg-slate-800">{colTasks(col.id).length}</span>
      </div>
      <div class="space-y-2">
        {#each colTasks(col.id) as t (t.id)}
          <a href="/tasks/{t.id}" draggable={canMove} ondragstart={() => (dragId = t.id)} ondragend={() => (dragId = null)}
            ondragover={(e) => { if (canMove) e.preventDefault(); }} ondrop={(e) => { e.preventDefault(); e.stopPropagation(); drop(col, t); }}
            class="card fade-in block p-2.5 text-sm shadow-sm transition hover:shadow {dragId === t.id ? 'opacity-40' : ''}">
            <div class="font-medium"><span class="text-slate-400">#{t.number}</span> {t.title}</div>
            <div class="mt-2 flex flex-wrap items-center gap-1 text-xs">
              <span class="chip {PRIORITY[t.priority].cls}">{PRIORITY[t.priority].label}</span>
              {#if t.category}<span class="chip" style="background:{t.category.color}22;color:{t.category.color}">{t.category.name}</span>{/if}
              {#each t.labels as l}<span class="chip" style="background:{l.color}22;color:{l.color}">{l.name}</span>{/each}
            </div>
            <div class="mt-2 flex items-center justify-between text-xs text-slate-500">
              <span class={isOverdue(t) ? 'font-semibold text-red-600' : ''}>{t.dueDate ? '⏰ ' + fmtDate(t.dueDate) : ''}</span>
              <span>{t.assignees.map((a) => a.name.split(' ')[0]).join('، ')}</span>
            </div>
          </a>
        {/each}
        {#if !colTasks(col.id).length}<div class="p-4 text-center text-xs text-slate-400">خالی</div>{/if}
      </div>
    </div>
  {/each}
  {#if canManage}
    <form class="w-56 shrink-0" onsubmit={addColumn}><input class="input" placeholder="＋ ستون جدید" bind:value={newCol} /></form>
  {/if}
</div>
