<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Plus, Edit, Trash2 } from 'lucide-svelte';

	export let entries: any[] = [];
	export let properties: Record<string, any> = {};
	export let groupByPropertyKey: string = '';
	export let onEntryClick: (entry: any) => void = () => {};
	export let onEntryEdit: (entry: any) => void = () => {};
	export let onEntryDelete: (entry: any) => void = () => {};
	export let onEntryMove: (entryId: string, newGroup: string) => void = () => {};

	let draggedEntry: any = null;
	let draggedOverColumn: string | null = null;

	function getPropertyValue(entry: any, propertyName: string): any {
		if (!entry.data || typeof entry.data !== 'object') {
			return null;
		}
		return entry.data[propertyName] || null;
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

	function getTitleProperty(entry: any): string {
		const titleProp = Object.entries(properties).find(([_, prop]: [string, any]) => prop.type === 'title');
		if (titleProp) {
			const [key] = titleProp;
			return getPropertyValue(entry, key) || 'Untitled';
		}
		return 'Untitled';
	}

	function getGroupedEntries() {
		if (!groupByPropertyKey || !properties[groupByPropertyKey]) {
			return { 'All': entries };
		}

		const grouped: Record<string, any[]> = {};
		const property = properties[groupByPropertyKey];
		const options = property.options || [];

		// Initialize groups with options
		options.forEach((option: string) => {
			grouped[option] = [];
		});

		// Add "Uncategorized" for entries without a value
		grouped['Uncategorized'] = [];

		// Group entries
		entries.forEach(entry => {
			const value = getPropertyValue(entry, groupByPropertyKey);
			if (value && options.includes(value)) {
				grouped[value].push(entry);
			} else {
				grouped['Uncategorized'].push(entry);
			}
		});

		return grouped;
	}

	function handleDragStart(entry: any) {
		draggedEntry = entry;
	}

	function handleDragOver(e: DragEvent, column: string) {
		e.preventDefault();
		draggedOverColumn = column;
	}

	function handleDrop(e: DragEvent, column: string) {
		e.preventDefault();
		if (draggedEntry && groupByProperty) {
			onEntryMove(draggedEntry.id, column);
		}
		draggedEntry = null;
		draggedOverColumn = null;
	}

	function handleDragEnd() {
		draggedEntry = null;
		draggedOverColumn = null;
	}

	$: groupedEntries = getGroupedEntries();
</script>

<div class="flex gap-4 overflow-x-auto pb-4">
	{#each Object.entries(groupedEntries) as [groupName, groupEntries]}
		<div
			class="flex-shrink-0 w-80 bg-muted/30 rounded-lg p-4 {draggedOverColumn === groupName ? 'ring-2 ring-primary' : ''}"
			on:dragover={(e) => handleDragOver(e, groupName)}
			on:drop={(e) => handleDrop(e, groupName)}
		>
			<div class="mb-4 flex items-center justify-between">
				<h3 class="font-semibold text-sm">{groupName}</h3>
				<span class="text-xs text-muted-foreground bg-background px-2 py-1 rounded-full">
					{groupEntries.length}
				</span>
			</div>

			<div class="space-y-2 min-h-[200px]">
				{#each groupEntries as entry}
					<div
						class="group bg-background border rounded-lg p-3 cursor-move hover:shadow-md transition-shadow"
						draggable="true"
						on:dragstart={() => handleDragStart(entry)}
						on:dragend={handleDragEnd}
						on:click={() => onEntryClick(entry)}
					>
						<div class="font-medium mb-2">{getTitleProperty(entry)}</div>
						<div class="space-y-1 text-xs text-muted-foreground">
							{#each Object.entries(properties) as [key, property]}
								{#if property.type !== 'title' && key !== groupByPropertyKey}
									<div class="flex items-center justify-between">
										<span class="font-medium">{property.name}:</span>
										<span>{formatPropertyValue(getPropertyValue(entry, key), property.type)}</span>
									</div>
								{/if}
							{/each}
						</div>
						<div class="mt-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
							<button
								type="button"
								class="h-6 w-6 rounded-md hover:bg-accent hover:text-accent-foreground flex items-center justify-center transition-colors"
								on:click={(e) => {
									e.stopPropagation();
									onEntryEdit(entry);
								}}
							>
								<Edit class="h-3 w-3" />
							</button>
							<button
								type="button"
								class="h-6 w-6 rounded-md hover:bg-accent hover:text-accent-foreground flex items-center justify-center transition-colors"
								on:click={(e) => {
									e.stopPropagation();
									onEntryDelete(entry);
								}}
							>
								<Trash2 class="h-3 w-3" />
							</button>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/each}
</div>

