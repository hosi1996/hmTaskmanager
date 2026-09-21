<script>
  import Icon from '$lib/Icon.svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api.js';
  import { app, notice } from '$lib/state.svelte.js';
  import { SYS_ROLES, fmtDateTime } from '$lib/format.js';

  let users = $state([]);
  let groups = $state([]);
  let projects = $state([]);
  let settings = $state({ 'bot.command': 'task', 'bot.notifyBack': true });
  let categories = $state([]);
  let nu = $state({ username: '', name: '', role: 'STAFF', password: '' });
  let created = $state('');
  let logs = $state(null);
  let newCat = $state('');

  $effect(() => {
    if (app.user.role !== 'OWNER') return void goto('/');
    loadAll();
  });
  async function loadAll() {
    users = (await api('/users')).users;
    groups = (await api('/telegram/groups')).groups;
    projects = (await api('/projects')).projects;
    settings = await api('/settings');
    categories = (await api('/categories')).categories;
  }
  async function addUser(e) {
    e.preventDefault();
    try {
      const r = await api('/users', { method: 'POST', body: { ...nu, password: nu.password || undefined } });
      created = r.initialPassword ? `رمز اولیه ${r.user.username}: ${r.initialPassword}` : 'کاربر ساخته شد';
      nu = { username: '', name: '', role: 'STAFF', password: '' };
      loadAll();
    } catch (err) { notice(err.message); }
  }
  async function toggleActive(u) { await api('/users/' + u.id, { method: 'PATCH', body: { active: !u.active } }); loadAll(); }
  async function resetPw(u) {
    if (confirm(`رمز ${u.name} ریست شود؟`)) created = `رمز جدید ${u.username}: ` + (await api(`/users/${u.id}/reset-password`, { method: 'POST' })).password;
  }
  async function link(g, projectId) {
    try { await api('/telegram/groups/' + g.id, { method: 'PATCH', body: { projectId: projectId || null } }); loadAll(); } catch (e) { notice(e.message); }
  }
  async function saveSettings() {
    await api('/settings', { method: 'PATCH', body: { 'bot.command': settings['bot.command'], 'bot.notifyBack': settings['bot.notifyBack'] } });
    notice('ذخیره شد');
  }
  async function showLogs(g) { logs = { g, list: (await api(`/telegram/groups/${g.id}/messages`)).messages }; }
  async function addCat(e) { e.preventDefault(); await api('/categories', { method: 'POST', body: { name: newCat } }); newCat = ''; loadAll(); }
  async function renameCat(c, name) { await api('/categories/' + c.id, { method: 'PATCH', body: { name } }); }
</script>

<svelte:head><title>مدیریت</title></svelte:head>
<h1 class="mb-4 h-page">مدیریت سیستم</h1>
<div class="grid gap-4 lg:grid-cols-2">
  <section class="card p-4 text-sm lg:col-span-2">
    <b>گروه‌های تلگرام متصل</b>
    <p class="mb-2 text-xs text-zinc-500">بات را به گروه اضافه کنید تا اینجا نمایش داده شود؛ سپس گروه را به یک پروژه وصل کنید.</p>
    {#each groups as g (g.id)}
      <div class="flex flex-wrap items-center gap-2 border-t border-zinc-100 py-2 dark:border-white/[0.08]">
        <span class="font-medium">{g.title}</span><span class="text-xs text-zinc-400" dir="ltr">{g.chatId}</span>
        {#if !g.active}<span class="chip bg-red-100 text-red-700">خارج‌شده</span>{/if}
        <select class="input ms-auto !w-56" value={g.projectId ?? ''} onchange={(e) => link(g, e.target.value)}><option value="">— بدون پروژه —</option>{#each projects as p}<option value={p.id}>{p.name}</option>{/each}</select>
        <button class="btn-ghost" onclick={() => showLogs(g)}>پیام‌ها</button>
      </div>
    {/each}
    {#if !groups.length}<div class="p-4 text-center text-zinc-400">هنوز گروهی ثبت نشده است.</div>{/if}
    {#if logs}
      <div class="mt-3 max-h-64 overflow-auto rounded-lg bg-zinc-50 p-2 text-xs dark:bg-white/[0.04]">
        {#each logs.list as m}<div class="py-0.5"><b>{m.fromName}:</b> {m.text} <span class="text-zinc-400">{fmtDateTime(m.createdAt)}</span></div>{/each}
        {#if !logs.list.length}پیامی ثبت نشده. (غیرفعال‌بودن Privacy Mode بات را بررسی کنید)
        {/if}
      </div>
    {/if}
  </section>

  <section class="card space-y-2 p-4 text-sm">
    <b>تنظیمات بات</b>
    <label class="block">دستور ساخت تسک (بدون /)<input class="input mt-1" dir="ltr" bind:value={settings['bot.command']} /></label>
    <label class="flex items-center gap-2"><input type="checkbox" bind:checked={settings['bot.notifyBack']} /> اعلام تغییر وضعیت تسک‌های تلگرامی در گروه</label>
    <button class="btn-primary" onclick={saveSettings}>ذخیره</button>
    <hr class="border-zinc-200 dark:border-white/[0.08]" />
    <b>گروه‌های تسک</b>
    {#each categories as c}<input class="input" value={c.name} onchange={(e) => renameCat(c, e.target.value)} />{/each}
    <form class="flex gap-2" onsubmit={addCat}><input class="input" placeholder="گروه جدید…" bind:value={newCat} /><button class="btn-ghost">افزودن</button></form>
  </section>

  <section class="card space-y-2 p-4 text-sm">
    <b>کاربران</b>
    <form class="grid grid-cols-2 gap-2" onsubmit={addUser}>
      <input class="input" placeholder="نام" bind:value={nu.name} required /><input class="input" dir="ltr" placeholder="username" bind:value={nu.username} required minlength="3" />
      <select class="input" bind:value={nu.role}><option value="STAFF">کارمند</option><option value="CLIENT">مشتری</option></select>
      <input class="input" dir="ltr" placeholder="رمز (خالی = تصادفی)" bind:value={nu.password} />
      <button class="btn-primary col-span-2">ساخت کاربر</button>
    </form>
    {#if created}<div class="rounded bg-amber-50 p-2 font-mono text-xs dark:bg-amber-950" dir="ltr">{created}</div>{/if}
    {#each users as u (u.id)}
      <div class="flex items-center gap-2 border-t border-zinc-100 py-1.5 dark:border-white/[0.08] {u.active ? '' : 'opacity-50'}">
        <span>{u.name}</span><span class="text-xs text-zinc-400">@{u.username} · {SYS_ROLES[u.role]}</span>
        {#if u.role !== 'OWNER'}<button class="btn-ghost ms-auto" onclick={() => resetPw(u)}>ریست رمز</button><button class="btn-ghost" onclick={() => toggleActive(u)}>{u.active ? 'غیرفعال' : 'فعال'}</button>{/if}
      </div>
    {/each}
  </section>
</div>
