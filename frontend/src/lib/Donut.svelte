<script>
  import { num } from './format.js';
  let { value = 0, size = 112, stroke = 10, label = '' } = $props();
  const r = $derived((size - stroke) / 2);
  const c = $derived(2 * Math.PI * r);
</script>

<div class="relative inline-flex shrink-0 items-center justify-center" style="width:{size}px;height:{size}px">
  <svg width={size} height={size} class="-rotate-90">
    <circle cx={size / 2} cy={size / 2} {r} fill="none" stroke="currentColor" class="text-zinc-100 dark:text-white/10" stroke-width={stroke} />
    <circle cx={size / 2} cy={size / 2} {r} fill="none" stroke="#4f46e5" stroke-width={stroke} stroke-linecap="round"
      stroke-dasharray={c} stroke-dashoffset={c * (1 - Math.min(100, value) / 100)} style="transition:stroke-dashoffset .9s cubic-bezier(.2,.7,.2,1)" />
  </svg>
  <div class="absolute text-center"><div class="tabnum text-xl font-extrabold">{num(Math.round(value))}٪</div>{#if label}<div class="text-[11px] text-zinc-500">{label}</div>{/if}</div>
</div>
