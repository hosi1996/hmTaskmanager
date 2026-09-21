<script>
  import { app } from '$lib/state.svelte.js';
  import StaffHome from '$lib/StaffHome.svelte';
  import ClientHome from '$lib/ClientHome.svelte';
</script>

{#if app.user.role === 'CLIENT'}<ClientHome />{:else}<StaffHome />{/if}
