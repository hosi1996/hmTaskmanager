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
  let show = $state(false);

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
    ['kanban', 'برد کانبان', 'مدیریت بصری تسک‌ها با درگ‌ودراپ'],
    ['send', 'اتصال به تلگرام', 'ساخت تسک مستقیم از پیام‌های گروه'],
    ['users', 'پورتال مشتری', 'دسترسی محدود و ایزوله برای هر مشتری'],
    ['chart', 'گزارش و تحلیل', 'نمودار عملکرد تیم و روند پروژه‌ها'],
  ];
</script>

<svelte:head><title>ورود</title></svelte:head>
<div class="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
  <div class="dotgrid relative hidden overflow-hidden bg-ink p-14 text-white lg:flex lg:flex-col lg:justify-between">
    <div class="absolute -start-24 -top-24 h-96 w-96 rounded-full bg-brand/40 blur-[110px]"></div>
    <div class="absolute -bottom-32 -end-16 h-96 w-96 rounded-full bg-violet-500/25 blur-[110px]"></div>

    <div class="relative flex items-center gap-3">
      <span class="tile h-11 w-11 bg-brand shadow-glow"><Icon name="tick" size={24} stroke={2.4} /></span>
      <span class="text-lg font-extrabold">hmTaskManager</span>
    </div>

    <div class="relative">
      <div class="chip mb-5 border border-white/10 bg-white/5 !px-3 !py-1 text-zinc-300"><Icon name="sparkles" size={13} class="text-indigo-300" /> نسخه‌ی حرفه‌ای مدیریت پروژه</div>
      <h2 class="mb-4 text-[40px] font-extrabold leading-[1.25]">کارها را شفاف و <br /><span class="bg-gradient-to-l from-indigo-300 to-violet-300 bg-clip-text text-transparent">بدون اتلاف وقت</span> پیش ببر</h2>
      <p class="mb-10 max-w-md leading-8 text-zinc-400">پروژه، تسک و مشتری در یک پنل سریع و مرتب؛ با رباتی که پیام‌های تلگرام را به تسک تبدیل می‌کند.</p>
      <div class="grid max-w-xl grid-cols-2 gap-3">
        {#each features as [i, t, d]}
          <div class="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 backdrop-blur">
            <span class="tile mb-3 h-9 w-9 bg-white/10 text-indigo-200"><Icon name={i} size={18} /></span>
            <div class="text-sm font-bold">{t}</div><div class="mt-1 text-xs leading-6 text-zinc-400">{d}</div>
          </div>
        {/each}
      </div>
    </div>
    <div class="relative text-xs text-zinc-500">hmTaskManager</div>
  </div>

  <div class="flex items-center justify-center p-6">
    <form class="fade-in w-full max-w-sm space-y-5" onsubmit={submit}>
      <div class="lg:hidden"><span class="tile h-12 w-12 bg-brand text-white shadow-glow"><Icon name="tick" size={26} stroke={2.4} /></span></div>
      <div>
        <h1 class="h-page">ورود به حساب</h1>
        <p class="mt-1.5 text-sm text-zinc-500">برای ادامه، اطلاعات ورود خود را وارد کنید.</p>
      </div>
      <label class="block text-sm font-semibold">نام کاربری یا ایمیل
        <div class="relative mt-2"><Icon name="users" size={16} class="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-zinc-400" /><input class="input !ps-10 !py-2.5" autocomplete="username" bind:value={username} dir="ltr" required /></div></label>
      <label class="block text-sm font-semibold">رمز عبور
        <div class="relative mt-2"><Icon name="lock" size={16} class="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-zinc-400" /><input class="input !ps-10 !py-2.5" type={show ? 'text' : 'password'} autocomplete="current-password" bind:value={password} dir="ltr" required />
          <button type="button" class="absolute end-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700" onclick={() => (show = !show)} aria-label="نمایش رمز"><Icon name="eye" size={16} /></button></div></label>
      {#if need2fa}<label class="pop-in block text-sm font-semibold">کد ۶ رقمی اپ احراز هویت
        <input class="input mt-2 !py-2.5 text-center text-lg tracking-[0.6em]" inputmode="numeric" maxlength="6" bind:value={code} dir="ltr" required /></label>{/if}
      {#if error}<div class="pop-in flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400"><Icon name="alert" size={16} class="mt-0.5" />{error}</div>{/if}
      <button class="btn-primary w-full !py-3" disabled={busy}>{#if busy}<span class="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"></span>{/if}{busy ? 'در حال ورود…' : 'ورود'}</button>
    </form>
  </div>
</div>
