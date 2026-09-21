<script>
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api.js';
  import { app } from '$lib/state.svelte.js';

  const token = page.url.searchParams.get('token') ?? '';
  let f = $state({ username: '', name: '', password: '' });
  let error = $state('');
  let valid = $state(null);

  $effect(() => {
    api('/auth/invite/' + token).then(() => (valid = true)).catch(() => (valid = false));
  });

  async function submit(e) {
    e.preventDefault();
    error = '';
    try {
      app.user = (await api('/auth/accept-invite', { method: 'POST', body: { token, ...f } })).user;
      goto('/');
    } catch (err) {
      error = err.message;
    }
  }
</script>

<div class="flex min-h-screen items-center justify-center p-4">
  {#if valid === false}
    <div class="card p-6 text-center">دعوت‌نامه نامعتبر یا منقضی شده است.</div>
  {:else if valid}
    <form class="card fade-in w-full max-w-sm space-y-3 p-6" onsubmit={submit}>
      <h1 class="text-lg font-bold">تکمیل ثبت‌نام</h1>
      <input class="input" placeholder="نام و نام‌خانوادگی" bind:value={f.name} required />
      <input class="input" placeholder="نام کاربری (انگلیسی)" bind:value={f.username} dir="ltr" required minlength="3" />
      <input class="input" type="password" placeholder="رمز عبور (حداقل ۸ کاراکتر)" bind:value={f.password} dir="ltr" required minlength="8" />
      {#if error}<p class="text-sm text-red-600">{error}</p>{/if}
      <button class="btn-primary w-full">ثبت‌نام و ورود</button>
    </form>
  {/if}
</div>
