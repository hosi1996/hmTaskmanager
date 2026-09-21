<script>
  import '../app.css';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { app, loadMe, isOwner } from '$lib/state.svelte.js';
  import { api } from '$lib/api.js';
  import QuickTask from '$lib/QuickTask.svelte';
  import Icon from '$lib/Icon.svelte';
  import Avatar from '$lib/Avatar.svelte';
  import { SYS_ROLES } from '$lib/format.js';

  let { children } = $props();
  const publicPaths = ['/login', '/accept-invite'];
  const isPublic = $derived(publicPaths.some((p) => page.url.pathname.startsWith(p)));

  let dark = $state(false);
  let menu = $state(false);
  let q = $state('');
  let results = $state(null);
  let quick = $state(false);
  let help = $state(false);
  let searchEl = $state();
  let timer;

  onMount(async () => {
    dark = document.documentElement.classList.contains('dark');
    const u = await loadMe();
    if (!u && !isPublic) goto('/login');
    const poll = async () => {
      if (app.user && !document.hidden) app.unread = (await api('/notifications/count').catch(() => ({ unread: 0 }))).unread;
    };
    poll();
    const iv = setInterval(poll, 60000);
    return () => clearInterval(iv);
  });

  function toggleTheme() {
    dark = !dark;
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch {}
  }

  function onSearch() {
    clearTimeout(timer);
    if (q.trim().length < 2) return (results = null);
    timer = setTimeout(async () => (results = await api('/search?q=' + encodeURIComponent(q.trim())).catch(() => null)), 250);
  }

  function keys(e) {
    const typing = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); searchEl?.focus(); }
    else if (!typing && e.key === '/') { e.preventDefault(); searchEl?.focus(); }
    else if (!typing && e.key === 'n' && app.user) { e.preventDefault(); quick = true; }
    else if (!typing && e.key === '?') { help = !help; }
    else if (!typing && e.key === 'g') { window.__g = Date.now(); }
    else if (!typing && window.__g && Date.now() - window.__g < 900) {
      const map = { h: '/', p: '/projects', r: '/reports', n: '/notifications', s: '/settings' };
      if (map[e.key]) goto(map[e.key]);
      window.__g = 0;
    }
    else if (e.key === 'Escape') { results = null; quick = false; help = false; }
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    app.user = null;
    goto('/login');
  }

  const nav = $derived([
    ['/', 'تسک‌های من', 'home'],
    ['/projects', 'پروژه‌ها', 'folder'],
    ['/reports', 'گزارش‌ها', 'chart'],
    ['/notifications', 'اعلان‌ها', 'bell'],
    ['/settings', 'تنظیمات', 'sliders'],
    ...(isOwner() ? [['/admin', 'مدیریت', 'shield']] : []),
  ]);
  const active = (h) => (h === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(h));
  const SHORTCUTS = [['n', 'تسک سریع'], ['/', 'جستجو'], ['Ctrl K', 'جستجو'], ['g h', 'تسک‌های من'], ['g p', 'پروژه‌ها'], ['g r', 'گزارش‌ها'], ['g n', 'اعلان‌ها'], ['g s', 'تنظیمات'], ['?', 'این راهنما'], ['Esc', 'بستن']];
</script>

<svelte:window onkeydown={keys} />

{#if isPublic}
  {@render children()}
{:else if !app.ready}
  <div class="flex min-h-screen items-center justify-center"><div class="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent"></div></div>
{:else if app.user}
  <div class="flex min-h-screen">
    <aside class="fixed inset-y-0 z-30 flex w-64 shrink-0 flex-col border-e border-slate-200/70 bg-white/90 p-4 backdrop-blur transition-transform dark:border-slate-800 dark:bg-slate-900/90 md:sticky md:top-0 md:h-screen md:translate-x-0 {menu ? '' : 'translate-x-full md:translate-x-0'}">
      <a href="/" class="mb-6 flex items-center gap-3 px-1">
        <span class="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand-2 text-white shadow-pop"><Icon name="check" size={22} /></span>
        <span><span class="block text-base font-extrabold leading-tight">hmTaskManager</span><span class="text-[11px] text-slate-400">مدیریت هوشمند تسک</span></span>
      </a>
      <nav class="space-y-1">
        {#each nav as [href, label, icon]}
          <a {href} onclick={() => (menu = false)} class="group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition {active(href) ? 'bg-gradient-to-l from-indigo-50 to-transparent font-bold text-brand dark:from-indigo-950/60' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}">
            {#if active(href)}<span class="absolute inset-y-2 end-0 w-1 rounded-full bg-brand"></span>{/if}
            <Icon name={icon} />{label}
            {#if href === '/notifications' && app.unread}<span class="chip ms-auto bg-red-500 text-white">{app.unread}</span>{/if}
          </a>
        {/each}
      </nav>

      <button class="btn-primary mt-5 w-full" onclick={() => (quick = true)}><Icon name="plus" size={16} /> تسک جدید</button>

      <div class="mt-auto space-y-1">
        <button class="btn-ghost w-full justify-start" onclick={() => (help = true)}><Icon name="help" size={16} /> میان‌بُرها <kbd class="ms-auto">?</kbd></button>
        <button class="btn-ghost w-full justify-start" onclick={toggleTheme}><Icon name={dark ? 'sun' : 'moon'} size={16} /> {dark ? 'حالت روشن' : 'حالت تیره'}</button>
        <div class="flex items-center gap-2 rounded-xl bg-slate-50 p-2 dark:bg-slate-800/60">
          <Avatar name={app.user.name} size={34} />
          <div class="min-w-0 flex-1"><div class="truncate text-sm font-bold">{app.user.name}</div><div class="text-[11px] text-slate-400">{SYS_ROLES[app.user.role]}</div></div>
          <button class="btn-ghost !p-2" onclick={logout} title="خروج" aria-label="خروج"><Icon name="logout" size={16} /></button>
        </div>
      </div>
    </aside>
    {#if menu}<button class="fixed inset-0 z-20 bg-black/40 backdrop-blur-sm md:hidden" aria-label="بستن" onclick={() => (menu = false)}></button>{/if}

    <div class="min-w-0 flex-1">
      <header class="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200/70 bg-white/70 px-4 py-3 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/60 md:px-6">
        <button class="btn-ghost md:hidden" onclick={() => (menu = !menu)} aria-label="منو"><Icon name="menu" /></button>
        <div class="relative max-w-xl flex-1">
          <Icon name="search" size={16} class="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input bind:this={searchEl} class="input !ps-9" placeholder="جستجو در تسک، پروژه، کامنت و فایل…" bind:value={q} oninput={onSearch} />
          <kbd class="absolute end-3 top-1/2 hidden -translate-y-1/2 sm:block">/</kbd>
          {#if results}
            <div class="card pop-in absolute inset-x-0 top-full z-40 mt-2 max-h-96 overflow-auto p-2 text-sm shadow-xl">
              {#each results.projects as p}<a class="flex items-center gap-2 rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800" href="/projects/{p.id}" onclick={() => (results = null)}><Icon name="folder" size={15} class="text-brand" />{p.name}</a>{/each}
              {#each results.tasks as t}<a class="flex items-center gap-2 rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800" href="/tasks/{t.id}" onclick={() => (results = null)}><Icon name="check" size={15} class="text-emerald-500" /><span class="text-slate-400">#{t.number}</span> {t.title} <span class="ms-auto text-xs text-slate-400">{t.project.name}</span></a>{/each}
              {#each results.comments as c}<a class="flex items-center gap-2 rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800" href="/tasks/{c.task.id}" onclick={() => (results = null)}><Icon name="message" size={15} class="text-sky-500" />{c.body.slice(0, 60)} <span class="ms-auto text-xs text-slate-400">{c.task.title}</span></a>{/each}
              {#each results.files as f}<a class="flex items-center gap-2 rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800" href="/tasks/{f.task.id}" onclick={() => (results = null)}><Icon name="clip" size={15} class="text-amber-500" />{f.name}</a>{/each}
              {#if !results.projects.length && !results.tasks.length && !results.comments.length && !results.files.length}<div class="p-4 text-center text-slate-400">نتیجه‌ای پیدا نشد</div>{/if}
            </div>
          {/if}
        </div>
        <a href="/notifications" class="btn-ghost relative !p-2.5" aria-label="اعلان‌ها"><Icon name="bell" />{#if app.unread}<span class="absolute end-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900"></span>{/if}</a>
        <button class="btn-ghost !p-2.5 md:hidden" onclick={toggleTheme} aria-label="تم"><Icon name={dark ? 'sun' : 'moon'} /></button>
      </header>
      {#key page.url.pathname}<main class="fade-in mx-auto max-w-7xl p-4 md:p-6">{@render children()}</main>{/key}
    </div>
  </div>

  {#if quick}<QuickTask onclose={() => (quick = false)} />{/if}

  {#if help}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="presentation" onclick={(e) => e.target === e.currentTarget && (help = false)}>
      <div class="card pop-in w-full max-w-sm p-5">
        <div class="section-title"><Icon name="zap" size={16} class="text-brand" /> میان‌بُرهای صفحه‌کلید</div>
        {#each SHORTCUTS as [k, d]}<div class="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0 dark:border-slate-800"><span>{d}</span><kbd dir="ltr">{k}</kbd></div>{/each}
      </div>
    </div>
  {/if}

  {#if app.toast}<div class="pop-in fixed bottom-5 start-1/2 z-50 -translate-x-1/2 rounded-xl bg-slate-900 px-5 py-3 text-sm text-white shadow-2xl dark:bg-white dark:text-slate-900">{app.toast}</div>{/if}
{/if}
