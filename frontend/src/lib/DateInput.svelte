<script>
  import Icon from './Icon.svelte';
  import { fmtDate, jmonthGrid, jparts, num } from './format.js';

  // value: رشته‌ی میلادی YYYY-MM-DD (یا خالی)؛ نمایش و انتخاب به‌صورت شمسی
  let { value = $bindable(''), onchange = null, disabled = false, placeholder = 'انتخاب تاریخ', clearable = true } = $props();
  let open = $state(false);
  let cursor = $state(new Date());
  let root = $state();

  const grid = $derived(jmonthGrid(cursor));
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const sameDay = (a, b) => a && b && iso(a) === iso(b);
  const selected = $derived(value ? new Date(value + 'T12:00:00') : null);
  const today = new Date();

  function toggle() {
    if (disabled) return;
    open = !open;
    if (open) cursor = selected ? new Date(selected) : new Date();
  }
  function shift(n) {
    const c = jparts(cursor);
    const d = new Date(cursor);
    d.setDate(d.getDate() + (n > 0 ? 32 - c.d : -c.d));
    cursor = d;
  }
  function pick(d) {
    value = iso(d);
    open = false;
    onchange?.(value);
  }
  function clear() {
    value = '';
    open = false;
    onchange?.('');
  }
  function outside(e) {
    if (open && root && !root.contains(e.target)) open = false;
  }
</script>

<svelte:window onclick={outside} onkeydown={(e) => e.key === 'Escape' && (open = false)} />

<div class="relative" bind:this={root}>
  <button type="button" class="input flex items-center gap-2 text-start {value ? '' : 'text-zinc-400'}" {disabled} onclick={toggle}>
    <Icon name="calendar" size={15} class="text-zinc-400" />
    <span class="tabnum flex-1">{value ? fmtDate(value) : placeholder}</span>
    {#if value && clearable && !disabled}<span role="button" tabindex="-1" class="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10" onclick={(e) => { e.stopPropagation(); clear(); }} onkeydown={() => {}} aria-label="پاک کردن"><Icon name="x" size={13} /></span>{/if}
  </button>

  {#if open}
    <div class="card pop-in absolute start-0 top-full z-50 mt-2 w-72 p-3 shadow-lift">
      <div class="mb-2 flex items-center justify-between">
        <button type="button" class="btn-ghost !p-1.5" onclick={() => shift(-1)} aria-label="ماه قبل"><Icon name="chev-right" size={16} /></button>
        <div class="text-sm font-bold">{grid.title}</div>
        <button type="button" class="btn-ghost !p-1.5" onclick={() => shift(1)} aria-label="ماه بعد"><Icon name="chev-left" size={16} /></button>
      </div>
      <div class="grid grid-cols-7 gap-1 text-center text-xs">
        {#each ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'] as d}<div class="py-1 font-semibold text-zinc-400">{d}</div>{/each}
        {#each Array(grid.pad) as _}<div></div>{/each}
        {#each grid.days as d}
          <button type="button" onclick={() => pick(d)}
            class="tabnum h-8 rounded-lg text-sm transition {sameDay(d, selected) ? 'bg-brand font-bold text-white' : sameDay(d, today) ? 'bg-brand-50 font-bold text-brand dark:bg-brand/20' : 'hover:bg-zinc-100 dark:hover:bg-white/10'}">{num(jparts(d).d)}</button>
        {/each}
      </div>
      <div class="mt-3 flex justify-between border-t border-zinc-100 pt-2 dark:border-white/[0.06]">
        <button type="button" class="btn-ghost !py-1 text-xs" onclick={() => pick(new Date())}>امروز</button>
        {#if clearable}<button type="button" class="btn-ghost !py-1 text-xs" onclick={clear}>پاک کردن</button>{/if}
      </div>
    </div>
  {/if}
</div>
