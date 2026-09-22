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
      const map = { h: '/', p: '/projects', r: '/reports', m: '/monitoring', n: '/notifications', s: '/settings' };
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

  const isClient = $derived(app.user?.role === 'CLIENT');
  const nav = $derived([
    ['/', isClient ? 'درخواست‌های من' : 'داشبورد', 'dashboard'],
    ['/projects', 'پروژه‌ها', 'folder'],
    ...(isClient ? [] : [['/reports', 'گزارش‌ها', 'chart'], ['/monitoring', 'مانیتورینگ', 'activity'], ['/archive', 'بایگانی', 'archive']]),
    ['/notifications', 'اعلان‌ها', 'bell'],
    ['/settings', 'تنظیمات', 'sliders'],
    ...(isOwner() ? [['/admin', 'مدیریت', 'shield']] : []),
  ]);
  const active = (h) => (h === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(h));
  const SHORTCUTS = [['n', 'تسک سریع'], ['/', 'جستجو'], ['Ctrl K', 'جستجو'], ['g h', 'داشبورد'], ['g p', 'پروژه‌ها'], ['g r', 'گزارش‌ها'], ['g m', 'مانیتورینگ'], ['g n', 'اعلان‌ها'], ['g s', 'تنظیمات'], ['?', 'این راهنما'], ['Esc', 'بستن']];
</script>

<svelte:window onkeydown={keys} />

{#if isPublic}
  {@render children()}
{:else if !app.ready}
  <div class="flex min-h-screen items-center justify-center"><div class="h-9 w-9 animate-spin rounded-full border-[3px] border-brand border-t-transparent"></div></div>
{:else if app.user}
  <div class="flex min-h-screen">
    <aside class="dotgrid fixed inset-y-0 z-30 flex w-[17rem] shrink-0 flex-col bg-ink p-4 text-zinc-300 transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0 {menu ? '' : 'translate-x-full md:translate-x-0'}">
      <div class="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-brand/30 to-transparent"></div>
      <a href="/" class="relative mb-7 flex items-center gap-3 px-1.5 pt-1">
        <span class="tile h-10 w-10 bg-brand text-white shadow-glow"><Icon name="tick" size={22} stroke={2.4} /></span>
        <span><span class="block text-[15px] font-extrabold leading-tight text-white">hmTaskManager</span><span class="text-[11px] text-zinc-500">مدیریت پروژه و تسک</span></span>
      </a>

      <div class="relative mb-2 px-2 text-[11px] font-semibold text-zinc-500">منوی اصلی</div>
      <nav class="relative space-y-0.5">
        {#each nav as [href, label, icon]}
          <a {href} onclick={() => (menu = false)} class="group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition {active(href) ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100'}">
            {#if active(href)}<span class="absolute inset-y-2.5 end-0 w-[3px] rounded-full bg-indigo-400"></span>{/if}
            <Icon name={icon} size={18} class={active(href) ? 'text-indigo-300' : ''} />{label}
            {#if href === '/notifications' && app.unread}<span class="chip ms-auto bg-brand text-white">{app.unread}</span>{/if}
          </a>
        {/each}
      </nav>

      <button class="btn-primary relative mt-6 w-full" onclick={() => (quick = true)}><Icon name="plus" size={16} stroke={2.4} /> {isClient ? 'درخواست جدید' : 'تسک جدید'} <kbd class="ms-auto !border-white/20 !bg-white/15 !text-white/80">N</kbd></button>

      <div class="relative mt-auto space-y-1">
        <button class="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/[0.05] hover:text-zinc-100" onclick={() => (help = true)}><Icon name="command" size={16} /> میان‌بُرها <kbd class="ms-auto !border-white/10 !bg-white/5 !text-zinc-400">?</kbd></button>
        <button class="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/[0.05] hover:text-zinc-100" onclick={toggleTheme}><Icon name={dark ? 'sun' : 'moon'} size={16} /> {dark ? 'حالت روشن' : 'حالت تیره'}</button>
        <div class="mt-2 flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.04] p-2.5">
          <Avatar name={app.user.name} size={36} />
          <div class="min-w-0 flex-1"><div class="truncate text-sm font-bold text-white">{app.user.name}</div><div class="text-[11px] text-zinc-500">{SYS_ROLES[app.user.role]}</div></div>
          <button class="rounded-lg p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white" onclick={logout} title="خروج" aria-label="خروج"><Icon name="logout" size={16} /></button>
        </div>
      </div>
    </aside>
    {#if menu}<button class="fixed inset-0 z-20 bg-black/50 backdrop-blur-sm md:hidden" aria-label="بستن" onclick={() => (menu = false)}></button>{/if}

    <div class="min-w-0 flex-1">
      <header class="sticky top-0 z-10 flex items-center gap-3 border-b border-zinc-200/70 bg-zinc-50/80 px-4 py-3 backdrop-blur-xl dark:border-white/[0.06] dark:bg-[#0b0c14]/80 md:px-8">
        <button class="btn-ghost !p-2.5 md:hidden" onclick={() => (menu = !menu)} aria-label="منو"><Icon name="menu" /></button>
        <div class="relative max-w-xl flex-1">
          <Icon name="search" size={16} class="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input bind:this={searchEl} class="input !ps-10 !py-2.5 shadow-xs" placeholder="جستجو در تسک‌ها، پروژه‌ها، کامنت‌ها و فایل‌ها…" bind:value={q} oninput={onSearch} />
          <kbd class="absolute end-3 top-1/2 hidden -translate-y-1/2 sm:block">/</kbd>
          {#if results}
            <div class="card pop-in absolute inset-x-0 top-full z-40 mt-2 max-h-96 overflow-auto p-1.5 text-sm shadow-lift">
              {#each results.projects as p}<a class="flex items-center gap-2.5 rounded-lg p-2.5 hover:bg-zinc-100 dark:hover:bg-white/[0.06]" href="/projects/{p.id}" onclick={() => (results = null)}><Icon name="folder" size={16} class="text-brand" />{p.name}<span class="chip ms-auto bg-zinc-100 text-zinc-500 dark:bg-white/10">پروژه</span></a>{/each}
              {#each results.tasks as t}<a class="flex items-center gap-2.5 rounded-lg p-2.5 hover:bg-zinc-100 dark:hover:bg-white/[0.06]" href="/tasks/{t.id}" onclick={() => (results = null)}><Icon name="check" size={16} class="text-emerald-500" /><span class="tabnum text-zinc-400">#{t.number}</span> {t.title}<span class="ms-auto text-xs text-zinc-400">{t.project.name}</span></a>{/each}
              {#each results.comments as c}<a class="flex items-center gap-2.5 rounded-lg p-2.5 hover:bg-zinc-100 dark:hover:bg-white/[0.06]" href="/tasks/{c.task.id}" onclick={() => (results = null)}><Icon name="message" size={16} class="text-sky-500" />{c.body.slice(0, 60)}<span class="ms-auto text-xs text-zinc-400">{c.task.title}</span></a>{/each}
              {#each results.files as f}<a class="flex items-center gap-2.5 rounded-lg p-2.5 hover:bg-zinc-100 dark:hover:bg-white/[0.06]" href="/tasks/{f.task.id}" onclick={() => (results = null)}><Icon name="clip" size={16} class="text-amber-500" />{f.name}</a>{/each}
              {#if !results.projects.length && !results.tasks.length && !results.comments.length && !results.files.length}<div class="p-6 text-center text-zinc-400">نتیجه‌ای پیدا نشد</div>{/if}
            </div>
          {/if}
        </div>
        <a href="/notifications" class="btn-outline relative !p-2.5" aria-label="اعلان‌ها"><Icon name="bell" size={18} />{#if app.unread}<span class="absolute -end-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{app.unread}</span>{/if}</a>
        <button class="btn-outline !p-2.5 md:hidden" onclick={toggleTheme} aria-label="تم"><Icon name={dark ? 'sun' : 'moon'} size={18} /></button>
      </header>
      {#key page.url.pathname}<main class="fade-in mx-auto max-w-[1400px] p-4 md:p-8">{@render children()}</main>{/key}
    </div>
  </div>

  {#if quick}<QuickTask onclose={() => (quick = false)} />{/if}

  {#if help}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="presentation" onclick={(e) => e.target === e.currentTarget && (help = false)}>
      <div class="card pop-in w-full max-w-sm p-6">
        <div class="section-title"><span class="tile h-8 w-8 bg-brand-50 text-brand dark:bg-brand/15"><Icon name="command" size={16} /></span> میان‌بُرهای صفحه‌کلید</div>
        {#each SHORTCUTS as [k, d]}<div class="flex items-center justify-between border-b border-zinc-100 py-2.5 text-sm last:border-0 dark:border-white/[0.06]"><span>{d}</span><kbd dir="ltr">{k}</kbd></div>{/each}
      </div>
    </div>
  {/if}

  {#if app.toast}<div class="pop-in fixed bottom-6 start-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-zinc-900 px-5 py-3 text-sm font-medium text-white shadow-lift dark:bg-white dark:text-zinc-900"><Icon name="check" size={16} class="text-emerald-400" />{app.toast}</div>{/if}
{/if}
