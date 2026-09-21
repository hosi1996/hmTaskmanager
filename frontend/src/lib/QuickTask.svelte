<script>
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from './api.js';
  import { notice } from './state.svelte.js';

  let { onclose, projectId = '' } = $props();
  let projects = $state([]);
  let pid = $state('');
  let title = $state('');
  let busy = $state(false);
  let input = $state();

  $effect(() => {
    untrack(() => {
      pid = projectId;
      api('/projects?status=ACTIVE').then((r) => {
        projects = r.projects.filter((p) => ['REPORTER', 'CONTRIBUTOR', 'MANAGER'].includes(p.myRole));
        if (!pid && projects.length) pid = projects[0].id;
      });
    });
    input?.focus();
  });

  async function submit(e) {
    e.preventDefault();
    if (!title.trim() || !pid) return;
    busy = true;
    try {
      const { task } = await api(`/projects/${pid}/tasks`, { method: 'POST', body: { title: title.trim() } });
      notice('تسک ساخته شد');
      onclose();
      goto(`/tasks/${task.id}`);
    } catch (err) {
      notice(err.message);
    } finally {
      busy = false;
    }
  }
</script>

<div class="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-24" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <form class="card fade-in w-full max-w-lg space-y-3 p-4 shadow-xl" onsubmit={submit}>
    <div class="font-semibold">تسک سریع</div>
    {#if !projects.length}
      <p class="text-sm text-zinc-500">پروژه‌ای که بتوانید در آن تسک بسازید وجود ندارد.</p>
    {:else}
      <select class="input" bind:value={pid}>{#each projects as p}<option value={p.id}>{p.name}</option>{/each}</select>
      <input bind:this={input} class="input" placeholder="عنوان تسک…" bind:value={title} maxlength="300" />
    {/if}
    <div class="flex justify-end gap-2">
      <button type="button" class="btn-ghost" onclick={onclose}>انصراف</button>
      <button class="btn-primary" disabled={busy || !title.trim() || !pid}>ساخت</button>
    </div>
  </form>
</div>
