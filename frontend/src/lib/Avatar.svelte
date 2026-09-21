<script>
  let { name = '?', size = 28, ring = false } = $props();
  // پالت آرام و هماهنگ با برند
  const COLORS = ['#5b5bd6', '#7c5cd6', '#c2569b', '#d4802a', '#2f9e73', '#2b8fb3', '#c8503c', '#3f74d6'];
  const color = $derived(COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length]);
  const initials = $derived(name.trim().split(/\s+/).slice(0, 2).map((w) => [...w][0]).join('‌') || '?');
</script>

<span class="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white {ring ? 'ring-2 ring-white dark:ring-[#12131d]' : ''}"
  style="width:{size}px;height:{size}px;font-size:{size * 0.4}px;background:{color}" title={name}>{initials}</span>
