<script>
  import Icon from './Icon.svelte';
  let { icon = 'inbox', title, text = '', children } = $props();
</script>

<div class="flex flex-col items-center px-6 py-14 text-center">
  <div class="relative mb-4">
    <div class="absolute inset-0 -m-3 rounded-full bg-brand/10 blur-xl"></div>
    <span class="tile relative h-16 w-16 rounded-2xl bg-brand-50 text-brand ring-1 ring-brand/15 dark:bg-brand/15"><Icon name={icon} size={28} stroke={1.5} /></span>
  </div>
  <div class="font-bold">{title}</div>
  {#if text}<div class="mt-1 max-w-xs text-sm text-zinc-500">{text}</div>{/if}
  {#if children}<div class="mt-4">{@render children()}</div>{/if}
</div>
