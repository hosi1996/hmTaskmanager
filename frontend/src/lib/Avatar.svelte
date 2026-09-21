<script>
  let { name = '?', size = 28, ring = false } = $props();
  const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444', '#3b82f6'];
  const color = $derived(COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length]);
  const initials = $derived(name.trim().split(/\s+/).slice(0, 2).map((w) => [...w][0]).join('‌') || '?');
</script>

<span class="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white {ring ? 'ring-2 ring-white dark:ring-slate-900' : ''}"
  style="width:{size}px;height:{size}px;font-size:{size * 0.4}px;background:linear-gradient(135deg,{color},{color}bb)" title={name}>{initials}</span>
