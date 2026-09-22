<script>
  import { api } from './api.js';
  import { notice } from './state.svelte.js';
  import { fmtDateTime, num } from './format.js';
  import Icon from './Icon.svelte';
  import EmptyState from './EmptyState.svelte';

  let { projectId } = $props();

  const LOCATIONS = { out: 'خارج از ایران', iran: 'ایران', both: 'هر دو' };
  const emptyForm = () => ({ id: null, domain: '', intervalMin: 5, checks: new Set(), location: 'both', onlyProblems: true, notifyTelegram: true, notifyPanel: true });

  let data = $state(null); // { domains, checks, intervals, iranEnabled }
  let form = $state(null);
  let openId = $state(null);
  let logs = $state({}); // id -> array | 'loading'
  let running = $state({}); // id -> bool
  let busy = $state(false);

  async function load() {
    data = await api(`/projects/${projectId}/monitors`);
  }
  $effect(() => { load().catch((e) => notice(e.message)); });

  function openAdd() {
    form = emptyForm();
    for (const c of Object.keys(data.checks)) if (c !== 'mx') form.checks.add(c);
  }
  function openEdit(m) {
    form = { id: m.id, domain: m.domain, intervalMin: m.intervalMin, checks: new Set(m.checks), location: m.location, onlyProblems: m.onlyProblems, notifyTelegram: m.notifyTelegram, notifyPanel: m.notifyPanel };
  }
  function toggleCheck(name) {
    if (form.checks.has(name)) form.checks.delete(name);
    else form.checks.add(name);
    form.checks = new Set(form.checks);
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.checks.size) return notice('حداقل یک چک را انتخاب کنید');
    busy = true;
    const body = { intervalMin: form.intervalMin, checks: [...form.checks], location: form.location, onlyProblems: form.onlyProblems, notifyTelegram: form.notifyTelegram, notifyPanel: form.notifyPanel };
    try {
      if (form.id) await api('/monitors/' + form.id, { method: 'PATCH', body });
      else await api(`/projects/${projectId}/monitors`, { method: 'POST', body: { domain: form.domain, ...body } });
      notice('ذخیره شد');
      form = null;
      load();
    } catch (err) {
      notice(err.message);
    } finally {
      busy = false;
    }
  }

  async function toggleEnabled(m) {
    await api('/monitors/' + m.id, { method: 'PATCH', body: { enabled: !m.enabled } });
    load();
  }
  async function del(m) {
    if (!confirm(`دامنه‌ی ${m.domain} حذف شود؟`)) return;
    await api('/monitors/' + m.id, { method: 'DELETE' });
    load();
  }
  async function runNow(m) {
    running = { ...running, [m.id]: true };
    try {
      await api(`/monitors/${m.id}/run`, { method: 'POST' });
      notice('بررسی انجام شد');
      await load();
      if (openId === m.id) loadLogs(m.id);
    } catch (err) {
      notice(err.message);
    } finally {
      running = { ...running, [m.id]: false };
    }
  }
  async function loadLogs(id) {
    logs = { ...logs, [id]: 'loading' };
    logs = { ...logs, [id]: (await api(`/monitors/${id}/logs`)).logs };
  }
  function toggleOpen(m) {
    openId = openId === m.id ? null : m.id;
    if (openId && !logs[openId]) loadLogs(openId);
  }

  const statusOf = (m) => (!m.enabled ? 'off' : !m.lastLog ? 'unknown' : m.lastLog.ok ? 'ok' : 'bad');
  const STATUS_DOT = { ok: 'bg-emerald-500', bad: 'bg-red-500', off: 'bg-zinc-300 dark:bg-white/20', unknown: 'bg-amber-400' };
  const STATUS_LABEL = { ok: 'سالم', bad: 'دارای مشکل', off: 'غیرفعال', unknown: 'هنوز بررسی نشده' };
  const ORIGIN = { local: ['خارج از ایران', 'globe'], remote: ['ایران', 'flag'], general: ['عمومی', 'circle'] };

  /** نتایج آخرین بررسی را بر اساس محل اجرا (خارج/ایران/عمومی) دسته‌بندی می‌کند */
  function groupByOrigin(results) {
    const g = { local: [], remote: [], general: [] };
    for (const [k, r] of Object.entries(results)) (g[r.origin] ?? g.general).push([k, r]);
    return g;
  }
</script>

<div class="mb-5 flex flex-wrap items-center gap-3">
  <div class="section-title !mb-0"><span class="tile h-7 w-7 bg-brand-50 text-brand dark:bg-brand/15"><Icon name="activity" size={15} /></span> مانیتورینگ دامنه‌ها</div>
  {#if data}<button class="btn-primary ms-auto" onclick={openAdd}><Icon name="plus" size={16} stroke={2.4} /> افزودن دامنه</button>{/if}
</div>

{#if form}
  <form class="card pop-in mb-6 space-y-4 p-5" onsubmit={submit}>
    <div class="flex items-center justify-between">
      <div class="font-bold">{form.id ? 'ویرایش دامنه' : 'دامنه‌ی جدید'}</div>
      <button type="button" class="btn-ghost !p-2" onclick={() => (form = null)} aria-label="بستن"><Icon name="x" size={16} /></button>
    </div>
    {#if !form.id}
      <label class="block text-sm font-semibold">دامنه
        <input class="input mt-1.5" dir="ltr" placeholder="example.com" bind:value={form.domain} required /></label>
    {:else}
      <div class="text-sm font-semibold" dir="ltr">{form.domain}</div>
    {/if}

    <div class="grid gap-4 sm:grid-cols-2">
      <label class="block text-sm font-semibold">بازه‌ی بررسی
        <select class="input mt-1.5" bind:value={form.intervalMin}>{#each data.intervals as iv}<option value={iv}>هر {num(iv)} دقیقه</option>{/each}</select></label>
      {#if data.iranEnabled}
        <label class="block text-sm font-semibold">محل چک
          <select class="input mt-1.5" bind:value={form.location}>{#each Object.entries(LOCATIONS) as [k, l]}<option value={k}>{l}</option>{/each}</select></label>
      {/if}
    </div>

    <div class="text-sm font-semibold">چک‌ها
      <div class="mt-2 flex flex-wrap gap-1.5">
        {#each Object.entries(data.checks) as [k, l]}
          <button type="button" class="chip cursor-pointer border {form.checks.has(k) ? 'border-brand bg-brand-50 text-brand dark:bg-brand/15' : 'border-zinc-200 text-zinc-500 dark:border-white/10'}" onclick={() => toggleCheck(k)}>{l}</button>
        {/each}
      </div>
    </div>

    <div class="grid gap-2 sm:grid-cols-3">
      <label class="flex items-center gap-2 text-sm"><input type="checkbox" class="size-4 accent-[#4f46e5]" bind:checked={form.onlyProblems} /> فقط وقتی مشکل بود پیام بده</label>
      <label class="flex items-center gap-2 text-sm"><input type="checkbox" class="size-4 accent-[#4f46e5]" bind:checked={form.notifyTelegram} /> اطلاع در گروه تلگرام</label>
      <label class="flex items-center gap-2 text-sm"><input type="checkbox" class="size-4 accent-[#4f46e5]" bind:checked={form.notifyPanel} /> اطلاع در پنل</label>
    </div>

    <div class="flex justify-end gap-2 border-t border-zinc-100 pt-4 dark:border-white/[0.06]">
      <button type="button" class="btn-ghost" onclick={() => (form = null)}>انصراف</button>
      <button class="btn-primary" disabled={busy}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</button>
    </div>
  </form>
{/if}

{#if !data}
  <div class="space-y-3">{#each Array(3) as _}<div class="skeleton h-20"></div>{/each}</div>
{:else if !data.domains.length}
  <div class="card"><EmptyState icon="activity" title="دامنه‌ای ثبت نشده" text="دامنه‌ی سایت را اضافه کنید تا وضعیت آن به‌طور خودکار بررسی شود.">
    <button class="btn-primary" onclick={openAdd}><Icon name="plus" size={16} stroke={2.4} /> افزودن دامنه</button>
  </EmptyState></div>
{:else}
  <div class="space-y-3">
    {#each data.domains as m (m.id)}
      {@const st = statusOf(m)}
      <div class="card overflow-hidden">
        <button class="flex w-full items-center gap-3 p-4 text-start" onclick={() => toggleOpen(m)}>
          <span class="h-2.5 w-2.5 shrink-0 rounded-full {STATUS_DOT[st]}"></span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="truncate font-bold" dir="ltr">{m.domain}</span>
              <span class="chip bg-zinc-100 text-zinc-500 dark:bg-white/10">{STATUS_LABEL[st]}</span>
              {#if data.iranEnabled}<span class="chip bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">{LOCATIONS[m.location]}</span>{/if}
              {#if m.uptime24h != null}<span class="chip {m.uptime24h >= 99 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : m.uptime24h >= 90 ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300'}">{num(m.uptime24h)}٪ سالم (۲۴س)</span>{/if}
            </div>
            <div class="mt-0.5 text-xs text-zinc-500">هر {num(m.intervalMin)} دقیقه · {num(m.checks.length)} چک{#if m.lastRunAt} · آخرین بررسی: <span class="tabnum">{fmtDateTime(m.lastRunAt)}</span>{/if}</div>
          </div>
          <Icon name="chev-down" size={16} class="text-zinc-400 transition {openId === m.id ? 'rotate-180' : ''}" />
        </button>

        {#if openId === m.id}
          <div class="border-t border-zinc-100 p-4 dark:border-white/[0.06]">
            {#if m.lastLog}
              {@const groups = groupByOrigin(m.lastLog.results)}
              <div class="mb-4 space-y-3">
                {#each ['local', 'remote', 'general'] as origin}
                  {#if groups[origin].length}
                    <div>
                      {#if data.iranEnabled}
                        <div class="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-zinc-500"><Icon name={ORIGIN[origin][1]} size={12} />{ORIGIN[origin][0]}</div>
                      {/if}
                      <div class="flex flex-wrap gap-1.5">
                        {#each groups[origin] as [k, r]}
                          <span class="chip {r.ok === true ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : r.ok === false ? 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300' : 'bg-zinc-100 text-zinc-500 dark:bg-white/10'}" title={r.detail}>
                            <Icon name={r.ok === true ? 'check' : r.ok === false ? 'x' : 'circle'} size={11} />{data.checks[k]}
                          </span>
                        {/each}
                      </div>
                    </div>
                  {/if}
                {/each}
              </div>
              {#each Object.entries(m.lastLog.results).filter(([, r]) => r.ok === false) as [k, r]}
                <div class="mb-1 text-xs text-red-600 dark:text-red-400">{data.checks[k]}{#if data.iranEnabled} ({ORIGIN[r.origin]?.[0] ?? ORIGIN.general[0]}){/if}: {r.detail}</div>
              {/each}
            {:else}
              <div class="mb-4 text-sm text-zinc-400">هنوز بررسی‌ای انجام نشده است.</div>
            {/if}

            <div class="flex flex-wrap gap-2">
              <button class="btn-outline" disabled={running[m.id]} onclick={() => runNow(m)}><Icon name="refresh" size={14} class={running[m.id] ? 'animate-spin' : ''} /> بررسی الان</button>
              <button class="btn-outline" onclick={() => openEdit(m)}><Icon name="edit" size={14} /> ویرایش</button>
              <button class="btn-outline" onclick={() => toggleEnabled(m)}><Icon name={m.enabled ? 'stop' : 'play'} size={14} /> {m.enabled ? 'توقف' : 'فعال‌سازی'}</button>
              <button class="btn-danger ms-auto" onclick={() => del(m)}><Icon name="trash" size={14} /> حذف</button>
            </div>

            <div class="mt-5">
              <div class="mb-2 text-xs font-semibold text-zinc-500">تاریخچه‌ی بررسی‌ها</div>
              {#if logs[m.id] === 'loading'}
                <div class="skeleton h-16"></div>
              {:else if logs[m.id]?.length}
                <div class="max-h-64 space-y-1.5 overflow-y-auto">
                  {#each logs[m.id] as l}
                    <div class="flex items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-xs dark:bg-white/[0.03]">
                      <span class="h-2 w-2 rounded-full {l.ok ? 'bg-emerald-500' : 'bg-red-500'}"></span>
                      <span class="tabnum text-zinc-500">{fmtDateTime(l.createdAt)}</span>
                      <span class="ms-auto text-zinc-600 dark:text-zinc-300">
                        {#if l.ok}سالم{:else}{Object.entries(l.results).filter(([, r]) => r.ok === false).map(([k]) => data.checks[k]).join('، ')}{/if}
                      </span>
                    </div>
                  {/each}
                </div>
              {:else}
                <div class="text-xs text-zinc-400">لاگی ثبت نشده.</div>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}
