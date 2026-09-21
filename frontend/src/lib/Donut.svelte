<script>
  import { num } from './format.js';
  let { value = 0, size = 120, stroke = 12, label = '' } = $props();
  const r = $derived((size - stroke) / 2);
  const c = $derived(2 * Math.PI * r);
</script>

<div class="relative inline-flex items-center justify-center" style="width:{size}px;height:{size}px">
  <svg width={size} height={size} class="-rotate-90">
    <defs><linearGradient id="dg" x1="0" x2="1"><stop offset="0" stop-color="#6366f1" /><stop offset="1" stop-color="#a855f7" /></linearGradient></defs>
    <circle cx={size / 2} cy={size / 2} {r} fill="none" stroke="currentColor" class="text-slate-100 dark:text-slate-800" stroke-width={stroke} />
    <circle cx={size / 2} cy={size / 2} {r} fill="none" stroke="url(#dg)" stroke-width={stroke} stroke-linecap="round"
      stroke-dasharray={c} stroke-dashoffset={c * (1 - Math.min(100, value) / 100)} style="transition:stroke-dashoffset .8s ease" />
  </svg>
  <div class="absolute text-center"><div class="text-2xl font-extrabold">{num(Math.round(value))}٪</div>{#if label}<div class="text-[11px] text-slate-500">{label}</div>{/if}</div>
</div>
