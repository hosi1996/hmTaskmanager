<script>
  import { fmtDate, isOverdue, PRIORITY } from './format.js';
  import Icon from './Icon.svelte';
  import Avatar from './Avatar.svelte';
  let { task, showProject = false, selected = false, onselect = null } = $props();
  const TONE = { LOW: 'text-zinc-400', MEDIUM: 'text-sky-500', HIGH: 'text-amber-500', URGENT: 'text-red-500' };
</script>

<div class="group flex items-center gap-3 border-b border-zinc-100 px-4 py-3.5 transition last:border-0 hover:bg-zinc-50 dark:border-white/[0.05] dark:hover:bg-white/[0.03]">
  {#if onselect}<input type="checkbox" class="size-4 accent-[#5b5bd6]" checked={selected} onchange={() => onselect(task.id)} aria-label="انتخاب" />{/if}
  <span class="{TONE[task.priority]}" title="اولویت: {PRIORITY[task.priority].label}"><Icon name="flag" size={16} /></span>
  <a href="/tasks/{task.id}" class="min-w-0 flex-1">
    <div class="truncate text-sm font-semibold"><span class="tabnum font-normal text-zinc-400">#{task.number}</span> {task.title}</div>
    <div class="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
      {#if showProject && task.project}<span class="inline-flex items-center gap-1.5"><span class="h-2 w-2 rounded-sm" style="background:{task.project.color}"></span>{task.project.name}</span>{/if}
      {#if task.category}<span class="chip" style="background:{task.category.color}18;color:{task.category.color}">{task.category.name}</span>{/if}
      {#each task.labels as l}<span class="chip" style="background:{l.color}18;color:{l.color}">{l.name}</span>{/each}
      {#if task._count?.checklist}<span class="inline-flex items-center gap-1"><Icon name="list" size={12} />{task._count.checklist}</span>{/if}
      {#if task._count?.comments}<span class="inline-flex items-center gap-1"><Icon name="message" size={12} />{task._count.comments}</span>{/if}
      {#if task._count?.attachments}<span class="inline-flex items-center gap-1"><Icon name="clip" size={12} />{task._count.attachments}</span>{/if}
    </div>
  </a>
  <span class="chip hidden bg-zinc-100 text-zinc-600 sm:inline-flex dark:bg-white/10 dark:text-zinc-300">{task.column.name}</span>
  <div class="hidden -space-x-2 -space-x-reverse sm:flex">{#each task.assignees.slice(0, 3) as a}<Avatar name={a.name} size={26} ring />{/each}</div>
  <span class="tabnum inline-flex w-28 items-center justify-end gap-1.5 text-xs {isOverdue(task) ? 'font-bold text-red-600 dark:text-red-400' : 'text-zinc-500'}">{#if task.dueDate}<Icon name="clock" size={13} />{fmtDate(task.dueDate)}{/if}</span>
</div>
