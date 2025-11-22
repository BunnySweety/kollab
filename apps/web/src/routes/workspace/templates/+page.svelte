<script lang="ts">
	import { page } from '$app/stores';
	import TemplateGallery from '$lib/components/templates/TemplateGallery.svelte';

	// Accept SvelteKit props to avoid warnings
	export let data: any;

	// Get workspace ID from somewhere (you might want to add this to your auth context)
	let workspaceId = 'default'; // Replace with actual workspace ID
</script>

<TemplateGallery {workspaceId} />
