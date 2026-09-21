<script>
  import { goto } from '$app/navigation';
  import { api } from '$lib/api.js';
  import { app } from '$lib/state.svelte.js';
  import Icon from '$lib/Icon.svelte';

  let username = $state('');
  let password = $state('');
  let code = $state('');
  let need2fa = $state(false);
  let error = $state('');
  let busy = $state(false);

  async function submit(e) {
    e.preventDefault();
    busy = true;
    error = '';
    try {
      const r = await api('/auth/login', { method: 'POST', body: { username, password, code: code || undefined } });
      if (r.need2fa) need2fa = true;
      else {
        app.user = r.user;
        goto('/');
      }
    } catch (err) {
      error = err.message;
    } finally {
      busy = false;
    }
  }
  const features = [
    ['kanban', 'برد کانبان با درگ‌ودراپ'],
    ['send', 'اتصال مستقیم به گروه‌های تلگرام'],
    ['users', 'دسترسی جداگانه برای مشتری‌ها'],
    ['chart', 'گزارش و نمودار عملکرد تیم'],
  ];
</script>

<svelte:head><title>ورود</title></svelte:head>
<div class="grid min-h-screen lg:grid-cols-2">
  <div class="relative hidden overflow-hidden bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-12 text-white lg:flex lg:flex-col lg:justify-between">
    <div class="absolute -start-20 -top-20 h-80 w-80 rounded-full bg-white/10 blur-3xl"></div>
    <div class="absolute -bottom-32 -end-10 h-96 w-96 rounded-full bg-fuchsia-300/20 blur-3xl"></div>
    <div class="relative flex items-center gap-3 text-xl font-extrabold"><span class="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20 backdrop-blur"><Icon name="check" size={24} /></span>hmTaskManager</div>
    <div class="relative">
      <h2 class="mb-3 text-4xl font-extrabold leading-tight">کارها را <br />ساده، سریع و شفاف <br />مدیریت کن</h2>
      <p class="mb-8 max-w-md text-white/80">پروژه‌ها، تسک‌ها و مشتری‌ها یک‌جا؛ با ربات تلگرام که پیام‌ها را به تسک تبدیل می‌کند.</p>
      <ul class="space-y-3">{#each features as [i, t]}<li class="flex items-center gap-3"><span class="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15"><Icon name={i} size={18} /></span>{t}</li>{/each}</ul>
    </div>
    <div class="relative text-sm text-white/60">© hmTaskManager</div>
  </div>

  <div class="flex items-center justify-center p-6">
    <form class="fade-in w-full max-w-sm space-y-4" onsubmit={submit}>
      <div class="mb-6 lg:hidden"><span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand-2 text-white shadow-pop"><Icon name="check" size={26} /></span></div>
      <h1 class="h-page">خوش آمدید 👋</h1>
      <p class="text-sm text-slate-500">برای ادامه وارد حساب خود شوید.</p>
      <label class="block text-sm font-medium">نام کاربری یا ایمیل
        <input class="input mt-1.5" autocomplete="username" bind:value={username} dir="ltr" required /></label>
      <label class="block text-sm font-medium">رمز عبور
        <input class="input mt-1.5" type="password" autocomplete="current-password" bind:value={password} dir="ltr" required /></label>
      {#if need2fa}<label class="pop-in block text-sm font-medium">کد ۶ رقمی اپ احراز هویت
        <input class="input mt-1.5 text-center tracking-[0.5em]" inputmode="numeric" maxlength="6" bind:value={code} dir="ltr" required /></label>{/if}
      {#if error}<p class="rounded-xl bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/50">{error}</p>{/if}
      <button class="btn-primary w-full !py-2.5" disabled={busy}>{busy ? 'در حال ورود…' : 'ورود'}</button>
    </form>
  </div>
</div>
