<script>
  import { fmtDate, isOverdue, PRIORITY } from './format.js';
  import Icon from './Icon.svelte';
  import Avatar from './Avatar.svelte';
  let { task, showProject = false, selected = false, onselect = null } = $props();
  const DOT = { LOW: '#94a3b8', MEDIUM: '#3b82f6', HIGH: '#f59e0b', URGENT: '#ef4444' };
</script>

<div class="group flex items-center gap-3 border-b border-slate-100 px-4 py-3 transition last:border-0 hover:bg-indigo-50/40 dark:border-slate-800 dark:hover:bg-slate-800/40">
  {#if onselect}<input type="checkbox" class="size-4 accent-indigo-500" checked={selected} onchange={() => onselect(task.id)} aria-label="انتخاب" />{/if}
  <span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background:{DOT[task.priority]}" title={PRIORITY[task.priority].label}></span>
  <a href="/tasks/{task.id}" class="min-w-0 flex-1">
    <div class="truncate text-sm font-semibold"><span class="font-normal text-slate-400">#{task.number}</span> {task.title}</div>
    <div class="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
      {#if showProject && task.project}<span class="inline-flex items-center gap-1"><span class="h-1.5 w-1.5 rounded-full" style="background:{task.project.color}"></span>{task.project.name}</span>{/if}
      {#if task.category}<span class="chip" style="background:{task.category.color}18;color:{task.category.color}">{task.category.name}</span>{/if}
      {#each task.labels as l}<span class="chip" style="background:{l.color}18;color:{l.color}">{l.name}</span>{/each}
      {#if task._count?.checklist}<span class="inline-flex items-center gap-0.5"><Icon name="list" size={12} />{task._count.checklist}</span>{/if}
      {#if task._count?.comments}<span class="inline-flex items-center gap-0.5"><Icon name="message" size={12} />{task._count.comments}</span>{/if}
      {#if task._count?.attachments}<span class="inline-flex items-center gap-0.5"><Icon name="clip" size={12} />{task._count.attachments}</span>{/if}
    </div>
  </a>
  <span class="chip hidden bg-slate-100 text-slate-600 sm:inline-flex dark:bg-slate-800 dark:text-slate-300">{task.column.name}</span>
  <div class="hidden -space-x-2 -space-x-reverse sm:flex">{#each task.assignees.slice(0, 3) as a}<Avatar name={a.name} size={24} ring />{/each}</div>
  <span class="inline-flex w-24 items-center justify-end gap-1 text-xs {isOverdue(task) ? 'font-bold text-red-600' : 'text-slate-500'}">{#if task.dueDate}<Icon name="clock" size={12} />{fmtDate(task.dueDate)}{/if}</span>
</div>
