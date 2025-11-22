<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Edit, Trash2, Copy, Image as ImageIcon } from 'lucide-svelte';

	export let entries: any[] = [];
	export let properties: Record<string, any> = {};
	export let coverPropertyKey: string = '';
	export let cardSize: 'small' | 'medium' | 'large' = 'medium';
	export let onEntryClick: (entry: any) => void = () => {};
	export let onEntryEdit: (entry: any) => void = () => {};
	export let onEntryDelete: (entry: any) => void = () => {};
	export let onEntryDuplicate: (entry: any) => void = () => {};

	function getPropertyValue(entry: any, propertyName: string): any {
		if (!entry.data || typeof entry.data !== 'object') {
			return null;
		}
		return entry.data[propertyName] || null;
	}

	function getTitleProperty(entry: any): string {
		const titleProp = Object.entries(properties).find(([_, prop]: [string, any]) => prop.type === 'title');
		if (titleProp) {
			const [key] = titleProp;
			return getPropertyValue(entry, key) || 'Untitled';
		}
		return 'Untitled';
	}

	function formatPropertyValue(value: any, propertyType: string): string {
		if (value === null || value === undefined) {
			return '-';
		}

		switch (propertyType) {
			case 'date':
				return new Date(value).toLocaleDateString();
			case 'checkbox':
				return value ? 'Yes' : 'No';
			case 'number':
				return String(value);
			case 'multi-select':
				return Array.isArray(value) ? value.join(', ') : String(value);
			default:
				return String(value);
		}
	}

	function getCardSizeClass(): string {
		switch (cardSize) {
			case 'small':
				return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6';
			case 'medium':
				return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
			case 'large':
				return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3';
			default:
				return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
		}
	}

	function getCoverImage(entry: any): string | null {
		if (!coverPropertyKey) return null;
		return getPropertyValue(entry, coverPropertyKey) || null;
	}
</script>

<div class="grid {getCardSizeClass()} gap-4">
	{#each entries as entry}
		<div
			class="group relative bg-card border rounded-lg overflow-hidden hover:shadow-lg transition-all cursor-pointer"
			on:click={() => onEntryClick(entry)}
		>
			<!-- Cover Image -->
			{#if getCoverImage(entry)}
				<div class="aspect-video bg-muted relative overflow-hidden">
					<img
						src={getCoverImage(entry)}
						alt={getTitleProperty(entry)}
						class="w-full h-full object-cover"
					/>
				</div>
			{:else}
				<div class="aspect-video bg-muted flex items-center justify-center">
					<ImageIcon class="h-12 w-12 text-muted-foreground" />
				</div>
			{/if}

			<!-- Card Content -->
			<div class="p-4">
				<h3 class="font-semibold mb-2 line-clamp-2">{getTitleProperty(entry)}</h3>
				<div class="space-y-1 text-xs text-muted-foreground">
					{#each Object.entries(properties) as [key, property]}
						{#if property.type !== 'title' && key !== coverPropertyKey}
							<div class="flex items-center justify-between">
								<span class="font-medium">{property.name}:</span>
								<span class="truncate ml-2">{formatPropertyValue(getPropertyValue(entry, key), property.type)}</span>
							</div>
						{/if}
					{/each}
				</div>
			</div>

			<!-- Actions (on hover) -->
			<div class="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
				<button
					type="button"
					class="h-7 w-7 bg-background/90 backdrop-blur-sm rounded-md border border-input hover:bg-accent hover:text-accent-foreground flex items-center justify-center transition-colors"
					title="Duplicate entry"
					on:click={(e) => {
						e.stopPropagation();
						onEntryDuplicate(entry);
					}}
				>
					<Copy class="h-3.5 w-3.5" />
				</button>
				<button
					type="button"
					class="h-7 w-7 bg-background/90 backdrop-blur-sm rounded-md border border-input hover:bg-accent hover:text-accent-foreground flex items-center justify-center transition-colors"
					title="Edit entry"
					on:click={(e) => {
						e.stopPropagation();
						onEntryEdit(entry);
					}}
				>
					<Edit class="h-3.5 w-3.5" />
				</button>
				<button
					type="button"
					class="h-7 w-7 bg-background/90 backdrop-blur-sm rounded-md border border-input hover:bg-accent hover:text-accent-foreground flex items-center justify-center transition-colors"
					title="Delete entry"
					on:click={(e) => {
						e.stopPropagation();
						onEntryDelete(entry);
					}}
				>
					<Trash2 class="h-3.5 w-3.5" />
				</button>
			</div>
		</div>
	{/each}
</div>

{#if entries.length === 0}
	<div class="flex flex-col items-center justify-center py-12 text-center">
		<ImageIcon class="h-16 w-16 text-muted-foreground mb-4" />
		<p class="text-muted-foreground">No entries to display</p>
	</div>
{/if}

