<script>
  import { api } from '$lib/api.js';
  import { app, notice } from '$lib/state.svelte.js';
  import { fmtDateTime } from '$lib/format.js';

  const EVENTS = { assigned: 'اساین‌شدن', comment: 'کامنت جدید', mention: 'منشن', deadline: 'نزدیک‌شدن ددلاین', status: 'تغییر وضعیت', project_added: 'اضافه‌شدن به پروژه', task_created: 'تسک جدید' };
  let sessions = $state([]);
  let pw = $state({ current: '', next: '' });
  let prefs = $state(structuredClone(app.user.notifyPrefs ?? {}));
  let tg = $state('');
  let twofa = $state(null);
  let code = $state('');
  let name = $state(app.user.name);

  const loadSessions = async () => (sessions = (await api('/me/sessions')).sessions);
  $effect(() => { loadSessions(); });

  const on = (ev, ch) => prefs[ev]?.[ch] !== false;
  function setPref(ev, ch, v) { prefs[ev] = { ...(prefs[ev] ?? {}), [ch]: v }; }
  async function savePrefs() {
    const digest = { enabled: prefs.digest?.enabled === true };
    app.user = (await api('/me', { method: 'PATCH', body: { name, notifyPrefs: { ...prefs, digest } } })).user;
    notice('ذخیره شد');
  }
  async function changePw(e) {
    e.preventDefault();
    try { await api('/me/password', { method: 'POST', body: pw }); pw = { current: '', next: '' }; notice('رمز تغییر کرد'); } catch (err) { notice(err.message); }
  }
  async function kill(s) { await api('/me/sessions/' + s.id, { method: 'DELETE' }); loadSessions(); }
  async function tgLink() { tg = (await api('/me/telegram-link', { method: 'POST' })).code; }
  async function tgUnlink() { await api('/me/telegram-link', { method: 'DELETE' }); app.user.telegramLinked = false; }
  async function setup2fa() { twofa = await api('/me/2fa/setup', { method: 'POST' }); }
  async function enable2fa() {
    try { await api('/me/2fa/enable', { method: 'POST', body: { code } }); app.user.totpEnabled = true; twofa = null; code = ''; notice('فعال شد'); } catch (e) { notice(e.message); }
  }
  async function disable2fa() {
    const password = prompt('برای غیرفعال‌سازی، رمز عبور را وارد کنید');
    if (password) try { await api('/me/2fa/disable', { method: 'POST', body: { password } }); app.user.totpEnabled = false; } catch (e) { notice(e.message); }
  }
</script>

<svelte:head><title>تنظیمات</title></svelte:head>
<h1 class="mb-4 text-xl font-bold">تنظیمات</h1>
<div class="grid gap-4 lg:grid-cols-2">
  <section class="card space-y-3 p-4 text-sm">
    <b>اعلان‌ها</b>
    <input class="input" bind:value={name} placeholder="نام" />
    <table class="w-full"><thead class="text-xs text-slate-500"><tr><th class="text-start">رویداد</th><th>پنل</th><th>تلگرام</th></tr></thead>
      <tbody>{#each Object.entries(EVENTS) as [ev, label]}<tr><td class="py-1">{label}</td>
        <td class="text-center"><input type="checkbox" checked={on(ev, 'panel')} onchange={(e) => setPref(ev, 'panel', e.target.checked)} /></td>
        <td class="text-center"><input type="checkbox" checked={on(ev, 'telegram')} onchange={(e) => setPref(ev, 'telegram', e.target.checked)} /></td></tr>{/each}</tbody></table>
    <label class="flex items-center gap-2"><input type="checkbox" checked={prefs.digest?.enabled === true} onchange={(e) => (prefs.digest = { enabled: e.target.checked })} /> خلاصه‌ی روزانه‌ی تسک‌های عقب‌افتاده</label>
    <button class="btn-primary" onclick={savePrefs}>ذخیره</button>
  </section>

  <section class="card space-y-3 p-4 text-sm">
    <b>حساب تلگرام</b>
    {#if app.user.telegramLinked}
      <div>✅ متصل است. <button class="btn-danger" onclick={tgUnlink}>قطع اتصال</button></div>
    {:else}
      <p class="text-slate-500">کد بگیرید و در چت خصوصی با بات <code dir="ltr">/start CODE</code> بفرستید.</p>
      {#if tg}<div class="rounded bg-slate-100 p-2 text-center font-mono text-lg dark:bg-slate-800" dir="ltr">/start {tg}</div>{:else}<button class="btn-primary" onclick={tgLink}>دریافت کد اتصال</button>{/if}
    {/if}
  </section>

  <section class="card space-y-3 p-4 text-sm">
    <b>رمز عبور</b>
    <form class="space-y-2" onsubmit={changePw}>
      <input class="input" type="password" placeholder="رمز فعلی" bind:value={pw.current} dir="ltr" required />
      <input class="input" type="password" placeholder="رمز جدید (حداقل ۸ کاراکتر)" bind:value={pw.next} dir="ltr" minlength="8" required />
      <button class="btn-primary">تغییر رمز</button>
    </form>
    <hr class="border-slate-200 dark:border-slate-800" />
    <b>ورود دو مرحله‌ای (2FA)</b>
    {#if app.user.totpEnabled}
      <div>✅ فعال است. <button class="btn-danger" onclick={disable2fa}>غیرفعال‌سازی</button></div>
    {:else if twofa}
      <p class="text-slate-500">این کلید را در اپ Authenticator وارد کنید و کد را بنویسید:</p>
      <div class="rounded bg-slate-100 p-2 text-center font-mono dark:bg-slate-800" dir="ltr">{twofa.secret}</div>
      <input class="input" placeholder="کد ۶ رقمی" bind:value={code} dir="ltr" inputmode="numeric" />
      <button class="btn-primary" onclick={enable2fa}>فعال‌سازی</button>
    {:else}<button class="btn-ghost border border-slate-200 dark:border-slate-700" onclick={setup2fa}>راه‌اندازی</button>{/if}
  </section>

  <section class="card p-4 text-sm">
    <b>نشست‌های فعال</b>
    <div class="mt-2 space-y-2">
      {#each sessions as s}
        <div class="flex items-center gap-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50">
          <div class="min-w-0 flex-1"><div class="truncate text-xs" dir="ltr">{s.ua || 'نامشخص'}</div><div class="text-xs text-slate-400">{s.ip} · {fmtDateTime(s.createdAt)}</div></div>
          {#if s.current}<span class="chip bg-emerald-100 text-emerald-700">این دستگاه</span>{:else}<button class="btn-danger" onclick={() => kill(s)}>خروج</button>{/if}
        </div>
      {/each}
    </div>
  </section>
</div>
