<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Table, Image } from 'lucide-svelte';

	export let currentView: 'table' | 'gallery' = 'table';
	export let availableViews: Array<{ type: string; name: string }> = [];
	export let onViewChange: (viewType: string) => void = () => {};

	const viewIcons = {
		table: Table,
		gallery: Image
	};

	function getViewIcon(type: string) {
		return viewIcons[type as keyof typeof viewIcons] || Table;
	}
</script>

<div class="flex items-center gap-1 border rounded-lg p-1 bg-muted/50">
	{#each availableViews as view}
		{@const Icon = getViewIcon(view.type)}
		<Button
			variant={currentView === view.type ? 'secondary' : 'ghost'}
			size="sm"
			on:click={() => onViewChange(view.type)}
			class="flex items-center gap-2"
		>
			<Icon class="h-4 w-4" />
			<span>{view.name}</span>
		</Button>
	{/each}
</div>

