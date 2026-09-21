<script>
  import '../app.css';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { app, loadMe, canCreateProject, isOwner } from '$lib/state.svelte.js';
  import { api } from '$lib/api.js';
  import QuickTask from '$lib/QuickTask.svelte';

  let { children } = $props();
  const publicPaths = ['/login', '/accept-invite'];
  const isPublic = $derived(publicPaths.some((p) => page.url.pathname.startsWith(p)));

  let dark = $state(false);
  let menu = $state(false);
  let q = $state('');
  let results = $state(null);
  let quick = $state(false);
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
    else if (e.key === 'Escape') { results = null; quick = false; }
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    app.user = null;
    goto('/login');
  }

  const nav = $derived([
    ['/', 'تسک‌های من', '✓'],
    ['/projects', 'پروژه‌ها', '▦'],
    ['/reports', 'گزارش‌ها', '◔'],
    ['/notifications', 'اعلان‌ها', '🔔'],
    ['/settings', 'تنظیمات', '⚙'],
    ...(isOwner() ? [['/admin', 'مدیریت', '★']] : []),
  ]);
  const active = (h) => (h === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(h));
</script>

<svelte:window onkeydown={keys} />

{#if isPublic}
  {@render children()}
{:else if !app.ready}
  <div class="p-8"><div class="skeleton h-8 w-48"></div></div>
{:else if app.user}
  <div class="flex min-h-screen">
    <aside class="fixed inset-y-0 z-30 w-56 shrink-0 border-e border-slate-200 bg-white p-3 transition-transform dark:border-slate-800 dark:bg-slate-900 md:static md:translate-x-0 {menu ? '' : 'translate-x-full md:translate-x-0'}">
      <div class="mb-4 flex items-center gap-2 px-2 py-2 text-lg font-bold text-brand">◆ hmTaskManager</div>
      <nav class="space-y-1">
        {#each nav as [href, label, icon]}
          <a {href} onclick={() => (menu = false)} class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 {active(href) ? 'bg-indigo-50 font-semibold text-brand dark:bg-indigo-950' : ''}">
            <span class="w-5 text-center">{icon}</span>{label}
            {#if href === '/notifications' && app.unread}<span class="chip ms-auto bg-red-500 text-white">{app.unread}</span>{/if}
          </a>
        {/each}
      </nav>
      <div class="absolute inset-x-3 bottom-3 space-y-1 text-sm">
        <div class="truncate px-3 text-xs text-slate-500">{app.user.name}</div>
        <button class="btn-ghost w-full justify-start" onclick={toggleTheme}>{dark ? '☀ حالت روشن' : '☾ حالت تیره'}</button>
        <button class="btn-ghost w-full justify-start" onclick={logout}>خروج</button>
      </div>
    </aside>
    {#if menu}<button class="fixed inset-0 z-20 bg-black/30 md:hidden" aria-label="بستن" onclick={() => (menu = false)}></button>{/if}

    <div class="min-w-0 flex-1">
      <header class="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-200 bg-white/80 px-4 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
        <button class="btn-ghost md:hidden" onclick={() => (menu = !menu)} aria-label="منو">☰</button>
        <div class="relative max-w-md flex-1">
          <input bind:this={searchEl} class="input" placeholder="جستجو در تسک، پروژه، کامنت و فایل…  ( / )" bind:value={q} oninput={onSearch} />
          {#if results}
            <div class="card fade-in absolute inset-x-0 top-full z-40 mt-1 max-h-96 space-y-2 overflow-auto p-2 text-sm shadow-lg">
              {#each results.projects as p}<a class="block rounded p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800" href="/projects/{p.id}" onclick={() => (results = null)}>▦ {p.name}</a>{/each}
              {#each results.tasks as t}<a class="block rounded p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800" href="/tasks/{t.id}" onclick={() => (results = null)}>✓ #{t.number} {t.title} <span class="text-xs text-slate-400">{t.project.name}</span></a>{/each}
              {#each results.comments as c}<a class="block rounded p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800" href="/tasks/{c.task.id}" onclick={() => (results = null)}>💬 {c.body.slice(0, 60)} <span class="text-xs text-slate-400">{c.task.title}</span></a>{/each}
              {#each results.files as f}<a class="block rounded p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800" href="/tasks/{f.task.id}" onclick={() => (results = null)}>📎 {f.name}</a>{/each}
              {#if !results.projects.length && !results.tasks.length && !results.comments.length && !results.files.length}<div class="p-2 text-slate-400">نتیجه‌ای نیست</div>{/if}
            </div>
          {/if}
        </div>
        <button class="btn-primary ms-auto" onclick={() => (quick = true)} title="کلید n">＋ تسک سریع</button>
      </header>
      <main class="mx-auto max-w-7xl p-4 md:p-6">{@render children()}</main>
    </div>
  </div>
  {#if quick}<QuickTask onclose={() => (quick = false)} />{/if}
  {#if app.toast}<div class="fade-in fixed bottom-4 start-4 z-50 rounded-lg bg-slate-800 px-4 py-2 text-sm text-white shadow-lg">{app.toast}</div>{/if}
{/if}
