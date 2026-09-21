<script>
  import { fmtDate, isOverdue, PRIORITY } from './format.js';
  let { task, showProject = false, selected = false, onselect = null } = $props();
</script>

<div class="flex items-center gap-3 border-b border-slate-100 px-3 py-2 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
  {#if onselect}<input type="checkbox" checked={selected} onchange={() => onselect(task.id)} aria-label="انتخاب" />{/if}
  <a href="/tasks/{task.id}" class="min-w-0 flex-1">
    <div class="truncate text-sm font-medium"><span class="text-slate-400">#{task.number}</span> {task.title}</div>
    <div class="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-slate-500">
      {#if showProject && task.project}<span style="color:{task.project.color}">● {task.project.name}</span>{/if}
      {#if task.category}<span class="chip" style="background:{task.category.color}22;color:{task.category.color}">{task.category.name}</span>{/if}
      {#each task.labels as l}<span class="chip" style="background:{l.color}22;color:{l.color}">{l.name}</span>{/each}
    </div>
  </a>
  <span class="chip hidden sm:inline-flex bg-slate-100 dark:bg-slate-800">{task.column.name}</span>
  <span class="chip {PRIORITY[task.priority].cls}">{PRIORITY[task.priority].label}</span>
  <span class="w-24 text-end text-xs {isOverdue(task) ? 'font-semibold text-red-600' : 'text-slate-500'}">{fmtDate(task.dueDate)}</span>
</div>
