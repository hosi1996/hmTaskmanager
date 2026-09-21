<script>
  import { goto } from '$app/navigation';
  import { api } from '$lib/api.js';
  import { app } from '$lib/state.svelte.js';

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
</script>

<svelte:head><title>ورود</title></svelte:head>
<div class="flex min-h-screen items-center justify-center p-4">
  <form class="card fade-in w-full max-w-sm space-y-4 p-6" onsubmit={submit}>
    <h1 class="text-xl font-bold text-brand">◆ hmTaskManager</h1>
    <input class="input" placeholder="نام کاربری یا ایمیل" autocomplete="username" bind:value={username} dir="ltr" required />
    <input class="input" type="password" placeholder="رمز عبور" autocomplete="current-password" bind:value={password} dir="ltr" required />
    {#if need2fa}<input class="input" placeholder="کد ۶ رقمی اپ احراز هویت" inputmode="numeric" bind:value={code} dir="ltr" required />{/if}
    {#if error}<p class="text-sm text-red-600">{error}</p>{/if}
    <button class="btn-primary w-full" disabled={busy}>ورود</button>
  </form>
</div>
