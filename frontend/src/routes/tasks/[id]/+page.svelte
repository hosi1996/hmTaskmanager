<script>
  import Icon from '$lib/Icon.svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api.js';
  import { app, notice } from '$lib/state.svelte.js';
  import { ACTIONS, fmtDateTime, fmtMin, md, num, PRIORITY, toInput } from '$lib/format.js';

  const id = page.params.id;
  let t = $state(null);
  let role = $state('VIEWER');
  let project = $state(null);
  let categories = $state([]);
  let comments = $state([]);
  let editDesc = $state(false);
  let desc = $state('');
  let newCheck = $state('');
  let newComment = $state('');
  let editingComment = $state(null);
  let depSearch = $state('');
  let depResults = $state([]);
  let minutes = $state('');
  let newLabel = $state('');

  const isManager = $derived(role === 'MANAGER');
  const canEdit = $derived(isManager || (role === 'CONTRIBUTOR' && t && (t.createdById === app.user.id || t.assignees.some((a) => a.id === app.user.id))));
  const canComment = $derived(['REPORTER', 'CONTRIBUTOR', 'MANAGER'].includes(role));
  const canAttach = $derived(canEdit || (role === 'REPORTER' && t?.createdById === app.user.id));
  const progress = $derived(t?.checklist.length ? Math.round((t.checklist.filter((c) => c.done).length / t.checklist.length) * 100) : null);

  async function load() {
    t = (await api('/tasks/' + id)).task;
    const p = await api('/projects/' + t.projectId);
    project = p.project;
    role = p.myRole;
    comments = (await api(`/tasks/${id}/comments`)).comments;
    desc = t.description;
  }
  $effect(() => {
    load().catch((e) => { notice(e.message); goto('/projects'); });
    api('/categories').then((r) => (categories = r.categories));
  });

  async function patch(body) {
    try {
      await api('/tasks/' + id, { method: 'PATCH', body });
      await load();
    } catch (e) {
      notice(e.message);
    }
  }
  const toggleId = (list, uid) => (list.includes(uid) ? list.filter((x) => x !== uid) : [...list, uid]);

  async function checkAdd(e) {
    e.preventDefault();
    if (!newCheck.trim()) return;
    await api(`/tasks/${id}/checklist`, { method: 'POST', body: { text: newCheck.trim() } });
    newCheck = '';
    load();
  }
  async function checkToggle(c) {
    await api('/checklist/' + c.id, { method: 'PATCH', body: { done: !c.done } });
    load();
  }
  async function checkDel(c) {
    await api('/checklist/' + c.id, { method: 'DELETE' });
    load();
  }

  async function postComment(e) {
    e.preventDefault();
    if (!newComment.trim()) return;
    await api(`/tasks/${id}/comments`, { method: 'POST', body: { body: newComment.trim() } });
    newComment = '';
    load();
  }
  async function saveComment(c) {
    await api('/comments/' + c.id, { method: 'PATCH', body: { body: editingComment.body } });
    editingComment = null;
    load();
  }
  async function delComment(c) {
    if (confirm('کامنت حذف شود؟')) { await api('/comments/' + c.id, { method: 'DELETE' }); load(); }
  }

  async function upload(e) {
    const fd = new FormData();
    for (const f of e.target.files) fd.append('file', f);
    e.target.value = '';
    try { await api(`/tasks/${id}/attachments`, { method: 'POST', form: fd }); load(); } catch (err) { notice(err.message); }
  }
  async function delFile(a) {
    if (confirm('فایل حذف شود؟')) { await api('/attachments/' + a.id, { method: 'DELETE' }); load(); }
  }

  async function findDep() {
    if (depSearch.length < 1) return (depResults = []);
    const r = await api(`/tasks?projectId=${t.projectId}&q=${encodeURIComponent(depSearch)}&limit=8`);
    depResults = r.tasks.filter((x) => x.id !== id);
  }
  async function addDep(b) {
    try { await api(`/tasks/${id}/deps`, { method: 'POST', body: { blockerId: b.id } }); depSearch = ''; depResults = []; load(); } catch (e) { notice(e.message); }
  }
  async function delDep(b) {
    await api(`/tasks/${id}/deps/${b.id}`, { method: 'DELETE' });
    load();
  }

  async function timer(action) {
    try { await api(`/tasks/${id}/timer/${action}`, { method: 'POST' }); load(); } catch (e) { notice(e.message); }
  }
  async function logTime(e) {
    e.preventDefault();
    await api(`/tasks/${id}/time`, { method: 'POST', body: { minutes: +minutes } });
    minutes = '';
    load();
  }
  async function addLabel(e) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    const { label } = await api(`/projects/${t.projectId}/labels`, { method: 'POST', body: { name: newLabel.trim() } });
    newLabel = '';
    await patch({ labelIds: [...new Set([...t.labels.map((l) => l.id), label.id])] });
    project = (await api('/projects/' + t.projectId)).project;
  }
  async function remove() {
    if (confirm('تسک حذف شود؟')) { await api('/tasks/' + id, { method: 'DELETE' }); goto('/projects/' + t.projectId); }
  }
</script>

<svelte:head><title>{t ? `#${t.number} ${t.title}` : 'تسک'}</title></svelte:head>

{#if !t}
  <div class="skeleton h-10 w-96 max-w-full"></div><div class="skeleton mt-4 h-64"></div>
{:else}
  <div class="mb-3 text-sm text-zinc-500"><a class="text-brand" href="/projects/{t.projectId}">{t.project.name}</a> / #{t.number}
    {#if t.telegramSender}<span class="chip ms-2 bg-sky-100 text-sky-700 dark:bg-sky-950"><Icon name="send" size={12} />تلگرام · {t.telegramSender}</span>{/if}
  </div>
  <div class="grid gap-4 lg:grid-cols-[1fr_20rem]">
    <div class="min-w-0 space-y-4">
      {#if canEdit}
        <input class="input !border-transparent !bg-transparent !px-0 h-page hover:!border-zinc-300" value={t.title} onchange={(e) => patch({ title: e.target.value })} maxlength="300" />
      {:else}<h1 class="h-page">{t.title}</h1>{/if}

      {#if t.blockedBy.some((b) => !b.column.isDone)}<div class="rounded-lg bg-amber-50 p-2 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300"><Icon name="ban" size={16} /> این تسک توسط تسک‌های باز دیگری مسدود شده است.</div>{/if}

      <section class="card p-4">
        <div class="mb-2 flex items-center"><b>توضیحات</b>{#if canEdit}<button class="btn-ghost ms-auto" onclick={() => (editDesc = !editDesc)}>{editDesc ? 'انصراف' : 'ویرایش'}</button>{/if}</div>
        {#if editDesc}
          <textarea class="input" rows="8" bind:value={desc}></textarea>
          <button class="btn-primary mt-2" onclick={() => { patch({ description: desc }); editDesc = false; }}>ذخیره</button>
        {:else if t.description}<div class="md text-sm">{@html md(t.description)}</div>
        {:else}<div class="text-sm text-zinc-400">توضیحی ثبت نشده.</div>{/if}
      </section>

      <section class="card p-4">
        <div class="mb-2 flex items-center gap-2"><b>چک‌لیست</b>{#if progress !== null}<span class="text-xs text-zinc-500">{num(progress)}٪</span>{/if}</div>
        {#if progress !== null}<div class="mb-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/[0.06]"><div class="h-full bg-emerald-500 transition-all" style="width:{progress}%"></div></div>{/if}
        {#each t.checklist as c (c.id)}
          <div class="flex items-center gap-2 py-1 text-sm">
            <input type="checkbox" checked={c.done} disabled={!canEdit} onchange={() => checkToggle(c)} />
            <span class={c.done ? 'text-zinc-400 line-through' : ''}>{c.text}</span>
            {#if canEdit}<button class="btn-ghost ms-auto !py-0" onclick={() => checkDel(c)} aria-label="حذف">×</button>{/if}
          </div>
        {/each}
        {#if canEdit}<form onsubmit={checkAdd} class="mt-2"><input class="input" placeholder="آیتم جدید را بنویسید و Enter بزنید…" bind:value={newCheck} /></form>{/if}
      </section>

      <section class="card p-4">
        <div class="mb-2 flex items-center"><b>پیوست‌ها</b>
          {#if canAttach}<label class="btn-ghost ms-auto">＋ آپلود<input type="file" multiple hidden onchange={upload} /></label>{/if}</div>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {#each t.attachments as a (a.id)}
            <div class="rounded-lg border border-zinc-200 p-2 text-xs dark:border-white/[0.08]">
              {#if a.mime.startsWith('image/') && a.mime !== 'image/svg+xml'}<a href="/api/attachments/{a.id}" target="_blank"><img src="/api/attachments/{a.id}" alt={a.name} class="mb-1 h-24 w-full rounded object-cover" loading="lazy" /></a>{/if}
              <a class="block truncate text-brand" href="/api/attachments/{a.id}" target="_blank" download={a.name}><Icon name="clip" size={13} class="inline" /> {a.name}</a>
              <div class="flex justify-between text-zinc-400">{num(Math.round(a.size / 1024))} KB {#if isManager || a.uploadedById === app.user.id}<button onclick={() => delFile(a)}>حذف</button>{/if}</div>
            </div>
          {/each}
        </div>
        {#if !t.attachments.length}<div class="text-sm text-zinc-400">پیوستی نیست.</div>{/if}
      </section>

      <section class="card p-4">
        <b>کامنت‌ها</b>
        <div class="mt-2 space-y-3">
          {#each comments as c (c.id)}
            <div class="rounded-lg bg-zinc-50 p-3 text-sm dark:bg-white/[0.04]">
              <div class="mb-1 flex items-center gap-2 text-xs text-zinc-500"><b>{c.author.name}</b>{fmtDateTime(c.createdAt)}{#if c.editedAt}(ویرایش‌شده){/if}
                {#if c.authorId === app.user.id}<button class="ms-auto" onclick={() => (editingComment = { id: c.id, body: c.body })}>ویرایش</button>{/if}
                {#if c.authorId === app.user.id || isManager}<button onclick={() => delComment(c)}>حذف</button>{/if}</div>
              {#if editingComment?.id === c.id}
                <textarea class="input" rows="3" bind:value={editingComment.body}></textarea>
                <button class="btn-primary mt-1" onclick={() => saveComment(c)}>ذخیره</button>
              {:else}<div class="md">{@html md(c.body.replace(/@([a-zA-Z0-9_.-]+)/g, '**@$1**'))}</div>{/if}
            </div>
          {/each}
        </div>
        {#if canComment}
          <form class="mt-3" onsubmit={postComment}>
            <textarea class="input" rows="3" placeholder="کامنت… (با @username کسی را منشن کنید)" bind:value={newComment}></textarea>
            <button class="btn-primary mt-2" disabled={!newComment.trim()}>ارسال</button>
          </form>
        {/if}
      </section>

      <section class="card p-4">
        <b>تاریخچه فعالیت</b>
        {#each t.activities as a}
          <div class="border-b border-zinc-100 py-1.5 text-xs text-zinc-500 last:border-0 dark:border-white/[0.08]">
            <b>{a.user?.name ?? 'سیستم'}</b> {ACTIONS[a.action] ?? a.action}
            {#if a.action === 'task.moved'}: {a.data.from} به {a.data.to}{:else if a.action === 'task.field'}: {a.data.field}{/if}
            <span class="ms-1 text-zinc-400">{fmtDateTime(a.createdAt)}</span>
          </div>
        {/each}
      </section>
    </div>

    <aside class="space-y-3">
      <div class="card space-y-3 p-4 text-sm">
        <label class="block">وضعیت
          <select class="input mt-1" value={t.columnId} disabled={!canEdit} onchange={(e) => patch({ columnId: e.target.value })}>{#each project.columns as c}<option value={c.id}>{c.name}</option>{/each}</select></label>
        <label class="block">اولویت
          <select class="input mt-1" value={t.priority} disabled={!canEdit} onchange={(e) => patch({ priority: e.target.value })}>{#each Object.entries(PRIORITY) as [k, v]}<option value={k}>{v.label}</option>{/each}</select></label>
        <label class="block">گروه
          <select class="input mt-1" value={t.categoryId ?? ''} disabled={!canEdit} onchange={(e) => patch({ categoryId: e.target.value || null })}><option value="">—</option>{#each categories as c}<option value={c.id}>{c.name}</option>{/each}</select></label>
        <div class="grid grid-cols-2 gap-2">
          <label>شروع<input class="input mt-1" type="date" value={toInput(t.startDate)} disabled={!canEdit} onchange={(e) => patch({ startDate: e.target.value || null })} /></label>
          <label>ددلاین<input class="input mt-1" type="date" value={toInput(t.dueDate)} disabled={!canEdit} onchange={(e) => patch({ dueDate: e.target.value || null })} /></label>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <label>تخمین (دقیقه)<input class="input mt-1" type="number" min="0" value={t.estimateMin ?? ''} disabled={!canEdit} onchange={(e) => patch({ estimateMin: e.target.value ? +e.target.value : null })} /></label>
          <label>تکرار<select class="input mt-1" value={t.recurrence ?? ''} disabled={!canEdit} onchange={(e) => patch({ recurrence: e.target.value || null })}><option value="">ندارد</option><option value="DAILY">روزانه</option><option value="WEEKLY">هفتگی</option><option value="MONTHLY">ماهانه</option></select></label>
        </div>
        <div class="text-xs text-zinc-500">سازنده: {t.createdBy.name} · {fmtDateTime(t.createdAt)}</div>
      </div>

      <div class="card p-4 text-sm">
        <div class="mb-2 font-semibold">اساین‌شده‌ها</div>
        {#if isManager}
          {#each project.members.filter((m) => m.user.role !== 'CLIENT') as m}
            <label class="flex items-center gap-2 py-0.5"><input type="checkbox" checked={t.assignees.some((a) => a.id === m.userId)} onchange={() => patch({ assigneeIds: toggleId(t.assignees.map((a) => a.id), m.userId) })} />{m.user.name}</label>
          {/each}
        {:else}{t.assignees.map((a) => a.name).join('، ') || '—'}{/if}
        <div class="mb-1 mt-3 font-semibold">دنبال‌کننده‌ها</div>
        {#if isManager}
          {#each project.members as m}
            <label class="flex items-center gap-2 py-0.5"><input type="checkbox" checked={t.watchers.some((a) => a.id === m.userId)} onchange={() => patch({ watcherIds: toggleId(t.watchers.map((a) => a.id), m.userId) })} />{m.user.name}</label>
          {/each}
        {:else}{t.watchers.map((a) => a.name).join('، ') || '—'}{/if}
      </div>

      <div class="card p-4 text-sm">
        <div class="mb-2 font-semibold">برچسب‌ها</div>
        <div class="flex flex-wrap gap-1">
          {#each project.labels as l}
            {@const on = t.labels.some((x) => x.id === l.id)}
            <button class="chip border" disabled={!canEdit} style="border-color:{l.color};{on ? `background:${l.color};color:#fff` : `color:${l.color}`}" onclick={() => patch({ labelIds: toggleId(t.labels.map((x) => x.id), l.id) })}>{l.name}</button>
          {/each}
        </div>
        {#if canEdit}<form class="mt-2" onsubmit={addLabel}><input class="input" placeholder="＋ برچسب جدید" bind:value={newLabel} /></form>{/if}
      </div>

      {#if canComment && role !== 'REPORTER'}
        <div class="card p-4 text-sm">
          <div class="mb-2 font-semibold">زمان‌سنجی</div>
          <div class="mb-2 text-zinc-500">صرف‌شده: {fmtMin(t.spentMin)}{#if t.estimateMin} از {fmtMin(t.estimateMin)}{/if}</div>
          {#if t.runningTimer}<button class="btn-danger w-full" onclick={() => timer('stop')}><Icon name="stop" size={14} /> توقف تایمر</button>{:else}<button class="btn-outline w-full" onclick={() => timer('start')}><Icon name="play" size={14} /> شروع تایمر</button>{/if}
          <form class="mt-2 flex gap-2" onsubmit={logTime}><input class="input" type="number" min="1" placeholder="ثبت دستی (دقیقه)" bind:value={minutes} /><button class="btn-ghost">ثبت</button></form>
        </div>
      {/if}

      <div class="card p-4 text-sm">
        <div class="mb-2 font-semibold">وابستگی‌ها</div>
        {#each t.blockedBy as b}<div class="flex items-center gap-1 py-0.5"><Icon name="ban" size={14} class="inline" /> وابسته به <a class="text-brand" href="/tasks/{b.id}">#{b.number} {b.title}</a>{#if isManager}<button class="ms-auto" onclick={() => delDep(b)}>×</button>{/if}</div>{/each}
        {#each t.blocks as b}<div class="py-0.5">مسدودکننده‌ی <a class="text-brand" href="/tasks/{b.id}">#{b.number} {b.title}</a></div>{/each}
        {#if isManager}
          <input class="input mt-2" placeholder="＋ وابسته به تسک… (جستجو)" bind:value={depSearch} oninput={findDep} />
          {#each depResults as r}<button class="btn-ghost w-full justify-start" onclick={() => addDep(r)}>#{r.number} {r.title}</button>{/each}
        {/if}
      </div>

      {#if isManager}
        <div class="flex gap-2">
          <button class="btn-outline flex-1" onclick={() => patch({ archived: !t.archivedAt })}>{t.archivedAt ? 'خروج از بایگانی' : 'بایگانی'}</button>
          <button class="btn-danger" onclick={remove}>حذف</button>
        </div>
      {/if}
    </aside>
  </div>
{/if}
