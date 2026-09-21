<script>
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api.js';
  import { app, notice } from '$lib/state.svelte.js';
  import { ACTIONS, fmtDate, fmtDateTime, fmtMin, md, num, PRIORITY, toInput } from '$lib/format.js';
  import Icon from '$lib/Icon.svelte';
  import Avatar from '$lib/Avatar.svelte';
  import DateInput from '$lib/DateInput.svelte';

  const id = page.params.id;
  const isClient = app.user.role === 'CLIENT';
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
  // ثبت‌کننده تا قبل از تکمیل، عنوان و توضیحات تسک خودش را می‌تواند اصلاح کند
  const canEditBasic = $derived(canEdit || (role === 'REPORTER' && t?.createdById === app.user.id && !t?.completedAt));
  const canComment = $derived(['REPORTER', 'CONTRIBUTOR', 'MANAGER'].includes(role));
  const canAttach = $derived(canEdit || (role === 'REPORTER' && t?.createdById === app.user.id));
  const progress = $derived(t?.checklist.length ? Math.round((t.checklist.filter((c) => c.done).length / t.checklist.length) * 100) : null);
  const curIdx = $derived(project && t ? project.columns.findIndex((c) => c.id === t.columnId) : -1);
  const activities = $derived(t ? t.activities.filter((a) => !isClient || ['task.created', 'task.moved', 'task.attached'].includes(a.action)) : []);
  const blocked = $derived(t?.blockedBy.some((b) => !b.column.isDone));

  async function load() {
    // همه‌چیز اول گرفته می‌شود و بعد یک‌جا ست می‌شود تا صفحه هیچ‌وقت با داده‌ی ناقص رندر نشود
    const task = (await api('/tasks/' + id)).task;
    const [p, cm] = await Promise.all([api('/projects/' + task.projectId), api(`/tasks/${id}/comments`)]);
    project = p.project;
    role = p.myRole;
    comments = cm.comments;
    desc = task.description;
    t = task;
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

{#if !t || !project}
  <div class="skeleton h-10 w-96 max-w-full"></div><div class="skeleton mt-4 h-64"></div>
{:else}
  <div class="mb-5 flex flex-wrap items-center gap-2 text-sm text-zinc-500">
    <a class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 transition hover:bg-zinc-100 dark:hover:bg-white/[0.06]" href="/projects/{t.projectId}"><Icon name="arrow-right" size={15} />{t.project.name}</a>
    <span class="tabnum text-zinc-300">/</span><span class="tabnum">#{num(t.number)}</span>
    {#if t.telegramSender}<span class="chip bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"><Icon name="send" size={12} />از تلگرام · {t.telegramSender}</span>{/if}
    {#if t.archivedAt}<span class="chip bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"><Icon name="archive" size={12} />بایگانی‌شده</span>{/if}
  </div>

  <div class="mb-6">
    {#if canEditBasic}
      <input class="input !border-transparent !bg-transparent !px-2 !py-1 h-page !text-[26px] hover:!border-zinc-200 focus:!bg-white dark:hover:!border-white/10" value={t.title} onchange={(e) => patch({ title: e.target.value })} maxlength="300" />
    {:else}<h1 class="h-page !text-[26px]">{t.title}</h1>{/if}
    <div class="mt-3 flex flex-wrap items-center gap-2 px-2">
      <span class="chip bg-brand-50 text-brand dark:bg-brand/20 dark:text-indigo-300">{t.column.name}</span>
      <span class="chip {PRIORITY[t.priority].cls}"><Icon name="flag" size={11} />{PRIORITY[t.priority].label}</span>
      {#if t.category}<span class="chip" style="background:{t.category.color}18;color:{t.category.color}">{t.category.name}</span>{/if}
      {#each t.labels as l}<span class="chip" style="background:{l.color}18;color:{l.color}">{l.name}</span>{/each}
      {#if t.dueDate}<span class="chip tabnum bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300"><Icon name="clock" size={11} />{fmtDate(t.dueDate)}</span>{/if}
    </div>
  </div>

  <!-- مراحل پیشرفت -->
  <div class="card mb-6 overflow-x-auto p-4">
    <div class="flex min-w-max items-center">
      {#each project.columns as c, i (c.id)}
        <button disabled={!canEdit} onclick={() => c.id !== t.columnId && patch({ columnId: c.id })}
          class="flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-semibold transition {i === curIdx ? 'bg-brand text-white shadow-glow' : i < curIdx ? 'text-brand' : 'text-zinc-400'} {canEdit && i !== curIdx ? 'hover:bg-zinc-100 dark:hover:bg-white/[0.06]' : ''}">
          <span class="flex h-5 w-5 items-center justify-center rounded-full text-[11px] {i === curIdx ? 'bg-white/25' : i < curIdx ? 'bg-brand/15' : 'bg-zinc-100 dark:bg-white/10'}">{#if i < curIdx}<Icon name="tick" size={12} stroke={3} />{:else}{num(i + 1)}{/if}</span>{c.name}
        </button>
        {#if i < project.columns.length - 1}<span class="mx-1 h-px w-8 {i < curIdx ? 'bg-brand' : 'bg-zinc-200 dark:bg-white/10'}"></span>{/if}
      {/each}
    </div>
  </div>

  {#if blocked}<div class="mb-6 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"><Icon name="ban" size={16} /> این تسک توسط تسک‌های باز دیگری مسدود شده است.</div>{/if}

  <div class="grid items-start gap-6 lg:grid-cols-[1fr_21rem]">
    <div class="min-w-0 space-y-6">
      <section class="card p-5">
        <div class="section-title"><Icon name="file-text" size={16} class="text-brand" /> توضیحات
          {#if canEditBasic}<button class="btn-ghost ms-auto !py-1 text-xs" onclick={() => (editDesc = !editDesc)}><Icon name={editDesc ? 'x' : 'edit'} size={13} />{editDesc ? 'انصراف' : 'ویرایش'}</button>{/if}</div>
        {#if editDesc}
          <textarea class="input" rows="8" bind:value={desc}></textarea>
          <button class="btn-primary mt-3" onclick={() => { patch({ description: desc }); editDesc = false; }}>ذخیره</button>
        {:else if t.description}<div class="md text-sm">{@html md(t.description)}</div>
        {:else}<div class="text-sm text-zinc-400">توضیحی ثبت نشده است.</div>{/if}
      </section>

      {#if t.checklist.length || canEdit}
        <section class="card p-5">
          <div class="section-title"><Icon name="list" size={16} class="text-brand" /> چک‌لیست {#if progress !== null}<span class="tabnum ms-auto text-xs font-medium text-zinc-500">{num(progress)}٪</span>{/if}</div>
          {#if progress !== null}<div class="mb-3 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/[0.08]"><div class="h-full rounded-full bg-emerald-500 transition-all duration-500" style="width:{progress}%"></div></div>{/if}
          {#each t.checklist as c (c.id)}
            <div class="group flex items-center gap-3 rounded-lg px-1 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-white/[0.03]">
              <input type="checkbox" class="size-4 accent-[#4f46e5]" checked={c.done} disabled={!canEdit} onchange={() => checkToggle(c)} />
              <span class="flex-1 {c.done ? 'text-zinc-400 line-through' : ''}">{c.text}</span>
              {#if canEdit}<button class="rounded p-1 text-zinc-300 opacity-0 transition hover:text-red-500 group-hover:opacity-100" onclick={() => checkDel(c)} aria-label="حذف"><Icon name="trash" size={14} /></button>{/if}
            </div>
          {/each}
          {#if canEdit}<form onsubmit={checkAdd} class="mt-2"><input class="input" placeholder="آیتم جدید را بنویسید و Enter بزنید…" bind:value={newCheck} /></form>{/if}
        </section>
      {/if}

      <section class="card p-5">
        <div class="section-title"><Icon name="clip" size={16} class="text-brand" /> پیوست‌ها
          {#if canAttach}<label class="btn-outline ms-auto !py-1 cursor-pointer text-xs"><Icon name="plus" size={13} />افزودن<input type="file" multiple hidden onchange={upload} /></label>{/if}</div>
        {#if t.attachments.length}
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {#each t.attachments as a (a.id)}
              <div class="overflow-hidden rounded-xl border border-zinc-200 text-xs dark:border-white/[0.08]">
                {#if a.mime.startsWith('image/') && a.mime !== 'image/svg+xml'}<a href="/api/attachments/{a.id}" target="_blank"><img src="/api/attachments/{a.id}" alt={a.name} class="h-24 w-full bg-zinc-100 object-cover dark:bg-white/5" loading="lazy" /></a>
                {:else}<div class="flex h-24 items-center justify-center bg-zinc-50 text-zinc-300 dark:bg-white/[0.03]"><Icon name="file-text" size={32} stroke={1.3} /></div>{/if}
                <div class="p-2.5"><a class="block truncate font-semibold text-brand" href="/api/attachments/{a.id}" target="_blank" download={a.name}>{a.name}</a>
                  <div class="tabnum mt-1 flex items-center justify-between text-zinc-400">{num(Math.round(a.size / 1024))} KB {#if isManager || a.uploadedById === app.user.id}<button class="hover:text-red-500" onclick={() => delFile(a)}>حذف</button>{/if}</div></div>
              </div>
            {/each}
          </div>
        {:else}<div class="text-sm text-zinc-400">پیوستی وجود ندارد.</div>{/if}
      </section>

      <section class="card p-5">
        <div class="section-title"><Icon name="message" size={16} class="text-brand" /> گفتگو <span class="tabnum chip bg-zinc-100 text-zinc-500 dark:bg-white/10">{num(comments.length)}</span></div>
        <div class="space-y-4">
          {#each comments as c (c.id)}
            <div class="flex gap-3">
              <Avatar name={c.author.name} size={34} />
              <div class="min-w-0 flex-1 rounded-2xl rounded-ss-md bg-zinc-50 p-3.5 text-sm dark:bg-white/[0.04]">
                <div class="mb-1.5 flex items-center gap-2 text-xs text-zinc-500"><b class="text-zinc-800 dark:text-zinc-200">{c.author.name}</b><span class="tabnum">{fmtDateTime(c.createdAt)}</span>{#if c.editedAt}<span>(ویرایش‌شده)</span>{/if}
                  <span class="ms-auto flex gap-2">{#if c.authorId === app.user.id}<button class="hover:text-brand" onclick={() => (editingComment = { id: c.id, body: c.body })}>ویرایش</button>{/if}
                  {#if c.authorId === app.user.id || isManager}<button class="hover:text-red-500" onclick={() => delComment(c)}>حذف</button>{/if}</span></div>
                {#if editingComment?.id === c.id}
                  <textarea class="input" rows="3" bind:value={editingComment.body}></textarea>
                  <button class="btn-primary mt-2" onclick={() => saveComment(c)}>ذخیره</button>
                {:else}<div class="md">{@html md(c.body.replace(/@([a-zA-Z0-9_.-]+)/g, '**@$1**'))}</div>{/if}
              </div>
            </div>
          {/each}
          {#if !comments.length}<div class="text-sm text-zinc-400">هنوز پیامی نیست.</div>{/if}
        </div>
        {#if canComment}
          <form class="mt-5 flex gap-3" onsubmit={postComment}>
            <Avatar name={app.user.name} size={34} />
            <div class="flex-1"><textarea class="input" rows="3" placeholder={isClient ? 'پیام خود را بنویسید…' : 'پیام… (با @username کسی را منشن کنید)'} bind:value={newComment}></textarea>
              <div class="mt-2 flex justify-end"><button class="btn-primary" disabled={!newComment.trim()}><Icon name="send" size={14} />ارسال</button></div></div>
          </form>
        {/if}
      </section>

      <section class="card p-5">
        <div class="section-title"><Icon name="activity" size={16} class="text-brand" /> تاریخچه</div>
        <div class="relative space-y-3.5 before:absolute before:inset-y-1 before:start-[5px] before:w-px before:bg-zinc-200 dark:before:bg-white/10">
          {#each activities as a}
            <div class="relative ps-6 text-sm">
              <span class="absolute start-0 top-1.5 h-[11px] w-[11px] rounded-full border-2 border-brand bg-white dark:bg-[#12131d]"></span>
              <b>{a.user?.name ?? 'سیستم'}</b> {ACTIONS[a.action] ?? a.action}
              {#if a.action === 'task.moved'}<span class="text-zinc-500">: {a.data.from} به {a.data.to}</span>{/if}
              <div class="tabnum text-xs text-zinc-400">{fmtDateTime(a.createdAt)}</div>
            </div>
          {/each}
        </div>
      </section>
    </div>

    <aside class="space-y-4 lg:sticky lg:top-24">
      <div class="card p-5 text-sm">
        <div class="section-title"><Icon name="sliders" size={16} class="text-brand" /> جزئیات</div>
        {#if canEdit}
          <div class="space-y-3.5">
            <label class="block font-semibold">اولویت
              <select class="input mt-1.5 font-normal" value={t.priority} onchange={(e) => patch({ priority: e.target.value })}>{#each Object.entries(PRIORITY) as [k, v]}<option value={k}>{v.label}</option>{/each}</select></label>
            <label class="block font-semibold">گروه
              <select class="input mt-1.5 font-normal" value={t.categoryId ?? ''} onchange={(e) => patch({ categoryId: e.target.value || null })}><option value="">—</option>{#each categories as c}<option value={c.id}>{c.name}</option>{/each}</select></label>
            <div class="space-y-3.5">
              <div class="font-semibold">شروع<div class="mt-1.5 font-normal"><DateInput value={toInput(t.startDate)} onchange={(v) => patch({ startDate: v || null })} placeholder="—" /></div></div>
              <div class="font-semibold">ددلاین<div class="mt-1.5 font-normal"><DateInput value={toInput(t.dueDate)} onchange={(v) => patch({ dueDate: v || null })} placeholder="—" /></div></div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <label class="font-semibold">تخمین (دقیقه)<input class="input mt-1.5 font-normal" type="number" min="0" value={t.estimateMin ?? ''} onchange={(e) => patch({ estimateMin: e.target.value ? +e.target.value : null })} /></label>
              <label class="font-semibold">تکرار<select class="input mt-1.5 font-normal" value={t.recurrence ?? ''} onchange={(e) => patch({ recurrence: e.target.value || null })}><option value="">ندارد</option><option value="DAILY">روزانه</option><option value="WEEKLY">هفتگی</option><option value="MONTHLY">ماهانه</option></select></label>
            </div>
          </div>
        {:else}
          <dl class="space-y-3">
            {#each [['وضعیت', t.column.name], ['اولویت', PRIORITY[t.priority].label], ['گروه', t.category?.name ?? '—'], ['موعد', fmtDate(t.dueDate)]] as [k, v]}
              <div class="flex items-center justify-between"><dt class="text-zinc-500">{k}</dt><dd class="font-semibold">{v}</dd></div>
            {/each}
          </dl>
        {/if}
        <div class="mt-4 flex items-center gap-2 border-t border-zinc-100 pt-4 text-xs text-zinc-500 dark:border-white/[0.06]"><Avatar name={t.createdBy.name} size={24} /><span>ثبت‌شده توسط <b class="text-zinc-700 dark:text-zinc-300">{t.createdBy.name}</b><br /><span class="tabnum">{fmtDateTime(t.createdAt)}</span></span></div>
      </div>

      <div class="card p-5 text-sm">
        <div class="section-title"><Icon name="users" size={16} class="text-brand" /> {isClient ? 'مسئول رسیدگی' : 'افراد'}</div>
        {#if isManager}
          <div class="mb-1 text-xs font-semibold text-zinc-500">اساین‌شده‌ها</div>
          {#each project.members.filter((m) => m.user.role !== 'CLIENT') as m}
            <label class="flex items-center gap-2.5 rounded-lg px-1 py-1.5 hover:bg-zinc-50 dark:hover:bg-white/[0.04]"><input type="checkbox" class="size-4 accent-[#4f46e5]" checked={t.assignees.some((a) => a.id === m.userId)} onchange={() => patch({ assigneeIds: toggleId(t.assignees.map((a) => a.id), m.userId) })} /><Avatar name={m.user.name} size={22} />{m.user.name}</label>
          {/each}
          <div class="mb-1 mt-4 text-xs font-semibold text-zinc-500">دنبال‌کننده‌ها</div>
          {#each project.members as m}
            <label class="flex items-center gap-2.5 rounded-lg px-1 py-1.5 hover:bg-zinc-50 dark:hover:bg-white/[0.04]"><input type="checkbox" class="size-4 accent-[#4f46e5]" checked={t.watchers.some((a) => a.id === m.userId)} onchange={() => patch({ watcherIds: toggleId(t.watchers.map((a) => a.id), m.userId) })} /><Avatar name={m.user.name} size={22} />{m.user.name}</label>
          {/each}
        {:else}
          <div class="flex flex-wrap gap-2">{#each t.assignees as a}<span class="inline-flex items-center gap-2 rounded-full bg-zinc-100 py-1 pe-3 ps-1 dark:bg-white/10"><Avatar name={a.name} size={22} />{a.name}</span>{/each}
            {#if !t.assignees.length}<span class="text-zinc-400">هنوز کسی اختصاص داده نشده</span>{/if}</div>
        {/if}
      </div>

      {#if !isClient}
        <div class="card p-5 text-sm">
          <div class="section-title"><Icon name="tag" size={16} class="text-brand" /> برچسب‌ها</div>
          <div class="flex flex-wrap gap-1.5">
            {#each project.labels as l}
              {@const on = t.labels.some((x) => x.id === l.id)}
              <button class="chip border transition" disabled={!canEdit} style="border-color:{l.color};{on ? `background:${l.color};color:#fff` : `color:${l.color}`}" onclick={() => patch({ labelIds: toggleId(t.labels.map((x) => x.id), l.id) })}>{l.name}</button>
            {/each}
            {#if !project.labels.length}<span class="text-zinc-400">برچسبی تعریف نشده</span>{/if}
          </div>
          {#if canEdit}<form class="mt-3" onsubmit={addLabel}><input class="input" placeholder="برچسب جدید…" bind:value={newLabel} /></form>{/if}
        </div>

        {#if canComment && role !== 'REPORTER'}
          <div class="card p-5 text-sm">
            <div class="section-title"><Icon name="timer" size={16} class="text-brand" /> زمان‌سنجی</div>
            <div class="tabnum mb-3 text-zinc-500">صرف‌شده: <b class="text-zinc-800 dark:text-zinc-200">{fmtMin(t.spentMin)}</b>{#if t.estimateMin} از {fmtMin(t.estimateMin)}{/if}</div>
            {#if t.runningTimer}<button class="btn-danger w-full !bg-red-50 dark:!bg-red-500/10" onclick={() => timer('stop')}><Icon name="stop" size={14} /> توقف تایمر</button>{:else}<button class="btn-outline w-full" onclick={() => timer('start')}><Icon name="play" size={14} /> شروع تایمر</button>{/if}
            <form class="mt-3 flex gap-2" onsubmit={logTime}><input class="input" type="number" min="1" placeholder="ثبت دستی (دقیقه)" bind:value={minutes} /><button class="btn-outline">ثبت</button></form>
          </div>
        {/if}

        <div class="card p-5 text-sm">
          <div class="section-title"><Icon name="layers" size={16} class="text-brand" /> وابستگی‌ها</div>
          {#each t.blockedBy as b}<div class="flex items-center gap-2 py-1"><Icon name="ban" size={14} class="text-amber-500" /><a class="text-brand" href="/tasks/{b.id}">#{b.number} {b.title}</a>{#if isManager}<button class="ms-auto text-zinc-400 hover:text-red-500" onclick={() => delDep(b)} aria-label="حذف"><Icon name="x" size={14} /></button>{/if}</div>{/each}
          {#each t.blocks as b}<div class="py-1 text-zinc-500">مسدودکننده‌ی <a class="text-brand" href="/tasks/{b.id}">#{b.number} {b.title}</a></div>{/each}
          {#if !t.blockedBy.length && !t.blocks.length}<div class="text-zinc-400">وابستگی‌ای ثبت نشده.</div>{/if}
          {#if isManager}
            <input class="input mt-3" placeholder="وابسته به تسک… (جستجو)" bind:value={depSearch} oninput={findDep} />
            {#each depResults as r}<button class="btn-ghost w-full justify-start" onclick={() => addDep(r)}>#{r.number} {r.title}</button>{/each}
          {/if}
        </div>
      {/if}

      {#if isManager}
        <div class="flex gap-2">
          <button class="btn-outline flex-1" onclick={() => patch({ archived: !t.archivedAt })}><Icon name="archive" size={15} />{t.archivedAt ? 'خروج از بایگانی' : 'بایگانی'}</button>
          <button class="btn-danger" onclick={remove}><Icon name="trash" size={15} />حذف</button>
        </div>
      {/if}
    </aside>
  </div>
{/if}
