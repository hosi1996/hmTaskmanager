<script>
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from './api.js';
  import { app, notice } from './state.svelte.js';
  import { PRIORITY } from './format.js';
  import Icon from './Icon.svelte';
  import DateInput from './DateInput.svelte';

  let { onclose, projectId = '', dueDate = '' } = $props();
  const isClient = app.user.role === 'CLIENT';
  let projects = $state([]);
  let categories = $state([]);
  let f = $state({ pid: '', title: '', description: '', categoryId: '', priority: 'MEDIUM', dueDate: '' });
  let files = $state([]);
  let busy = $state(false);
  let input = $state();

  $effect(() => {
    untrack(() => {
      f.pid = projectId;
      f.dueDate = dueDate;
      api('/projects?status=ACTIVE').then((r) => {
        projects = r.projects.filter((p) => ['REPORTER', 'CONTRIBUTOR', 'MANAGER'].includes(p.myRole));
        if (!f.pid && projects.length) f.pid = projects[0].id;
      });
      api('/categories').then((r) => (categories = r.categories));
    });
    input?.focus();
  });

  const pick = (e) => { files = [...files, ...e.target.files]; e.target.value = ''; };

  async function submit(e) {
    e.preventDefault();
    if (!f.title.trim() || !f.pid) return;
    busy = true;
    try {
      const body = { title: f.title.trim(), priority: f.priority, description: f.description || undefined, categoryId: f.categoryId || undefined, dueDate: f.dueDate || undefined };
      const { task } = await api(`/projects/${f.pid}/tasks`, { method: 'POST', body });
      if (files.length) {
        const fd = new FormData();
        for (const x of files) fd.append('file', x);
        await api(`/tasks/${task.id}/attachments`, { method: 'POST', form: fd }).catch((err) => notice(err.message));
      }
      notice(isClient ? 'درخواست شما ثبت شد' : 'تسک ساخته شد');
      onclose();
      goto(`/tasks/${task.id}`);
    } catch (err) {
      notice(err.message);
    } finally {
      busy = false;
    }
  }
</script>

<div class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[8vh] backdrop-blur-sm" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <form class="card pop-in w-full max-w-xl overflow-visible shadow-lift" onsubmit={submit}>
    <div class="flex items-center gap-3 border-b border-zinc-100 p-5 dark:border-white/[0.06]">
      <span class="tile h-10 w-10 bg-brand-50 text-brand dark:bg-brand/15"><Icon name="plus" size={20} stroke={2.2} /></span>
      <div class="flex-1"><div class="font-bold">{isClient ? 'ثبت درخواست جدید' : 'تسک جدید'}</div><div class="text-xs text-zinc-500">{isClient ? 'درخواست یا مشکل خود را با جزئیات بنویسید' : 'اطلاعات اصلی را وارد کنید؛ بقیه را بعداً می‌توانید تکمیل کنید'}</div></div>
      <button type="button" class="btn-ghost !p-2" onclick={onclose} aria-label="بستن"><Icon name="x" size={18} /></button>
    </div>

    {#if !projects.length}
      <p class="p-8 text-center text-sm text-zinc-500">پروژه‌ای که بتوانید در آن تسک ثبت کنید وجود ندارد.</p>
    {:else}
      <div class="space-y-4 p-5">
        {#if projects.length > 1 || !projectId}
          <label class="block text-sm font-semibold">پروژه
            <select class="input mt-1.5" bind:value={f.pid}>{#each projects as p}<option value={p.id}>{p.name}</option>{/each}</select></label>
        {/if}
        <label class="block text-sm font-semibold">عنوان
          <input bind:this={input} class="input mt-1.5" placeholder={isClient ? 'مثلاً: خطا در صفحه‌ی پرداخت' : 'عنوان تسک'} bind:value={f.title} maxlength="300" required /></label>
        <label class="block text-sm font-semibold">توضیحات
          <textarea class="input mt-1.5" rows="4" placeholder="جزئیات، مراحل تکرار مشکل، لینک و… (مارک‌داون پشتیبانی می‌شود)" bind:value={f.description}></textarea></label>

        <div class="grid gap-4 sm:grid-cols-2">
          <label class="block text-sm font-semibold">{isClient ? 'نوع درخواست' : 'گروه'}
            <select class="input mt-1.5" bind:value={f.categoryId}><option value="">—</option>{#each categories as c}<option value={c.id}>{c.name}</option>{/each}</select></label>
          <div class="text-sm font-semibold">تاریخ موردنظر<div class="mt-1.5 font-normal"><DateInput bind:value={f.dueDate} placeholder="اختیاری" /></div></div>
        </div>

        <div class="text-sm font-semibold">اولویت
          <div class="seg mt-1.5 w-full">{#each Object.entries(PRIORITY) as [k, v]}<button type="button" class="seg-btn flex-1 justify-center {f.priority === k ? 'seg-btn-on' : ''}" onclick={() => (f.priority = k)}>{v.label}</button>{/each}</div></div>

        <div class="text-sm font-semibold">پیوست
          <div class="mt-1.5 flex flex-wrap items-center gap-2">
            <label class="btn-outline cursor-pointer"><Icon name="clip" size={15} /> افزودن فایل یا تصویر<input type="file" multiple hidden onchange={pick} /></label>
            {#each files as x, i}<span class="chip bg-zinc-100 dark:bg-white/10">{x.name}<button type="button" class="ms-1 opacity-60 hover:opacity-100" onclick={() => (files = files.filter((_, j) => j !== i))} aria-label="حذف"><Icon name="x" size={11} /></button></span>{/each}
          </div></div>
      </div>
      <div class="flex justify-end gap-2 border-t border-zinc-100 p-4 dark:border-white/[0.06]">
        <button type="button" class="btn-ghost" onclick={onclose}>انصراف</button>
        <button class="btn-primary" disabled={busy || !f.title.trim() || !f.pid}>{busy ? 'در حال ثبت…' : isClient ? 'ثبت درخواست' : 'ساخت تسک'}</button>
      </div>
    {/if}
  </form>
</div>
