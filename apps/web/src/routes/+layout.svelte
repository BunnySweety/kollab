<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { Toaster } from 'svelte-sonner';
	import CommandPalette from '$lib/components/CommandPalette.svelte';
	import { theme } from '$lib/stores/theme';

	// SvelteKit props - properly declared to avoid warnings
	export let data: any;

	onMount(() => {
		theme.init();
	});
</script>

<Toaster position="bottom-right" richColors={true} closeButton={true} />
<CommandPalette />

<slot />
