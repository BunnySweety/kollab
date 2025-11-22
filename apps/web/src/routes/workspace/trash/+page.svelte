<script lang="ts">
	import { page } from '$app/stores';
	import { Trash2, RefreshCw, FileText, Folder, Search } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import type { PageData } from './$types';

	export let data: any;

	// Sample trash items (in a real app, these would come from the database)
	const trashedItems = [
		{
			id: '1',
			title: 'Q4 Marketing Plan',
			type: 'document',
			deletedAt: '2 days ago',
			deletedBy: 'You'
		},
		{
			id: '2',
			title: 'Old Project Files',
			type: 'folder',
			deletedAt: '1 week ago',
			deletedBy: 'John Doe'
		},
		{
			id: '3',
			title: 'Meeting Notes - Oct 2024',
			type: 'document',
			deletedAt: '2 weeks ago',
			deletedBy: 'You'
		},
		{
			id: '4',
			title: 'Archived Resources',
			type: 'folder',
			deletedAt: '1 month ago',
			deletedBy: 'Sarah Smith'
		}
	];

	function restoreItem(item: any) {
		toast.success(`"${item.title}" has been restored`);
	}

	function deleteForever(item: any) {
		if (confirm(`Are you sure you want to permanently delete "${item.title}"? This action cannot be undone.`)) {
			toast.success(`"${item.title}" has been permanently deleted`);
		}
	}

	function emptyTrash() {
		if (confirm('Are you sure you want to permanently delete all items in trash? This action cannot be undone.')) {
			toast.success('Trash has been emptied');
		}
	}
</script>

<div class="flex-1 p-6">
	<!-- Header -->
	<div class="mb-6 flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold mb-2 flex items-center gap-2">
				<Trash2 class="h-8 w-8" />
				Trash
			</h1>
			<p class="text-muted-foreground">Items in trash will be permanently deleted after 30 days</p>
		</div>
		<Button variant="destructive" on:click={emptyTrash}>
			Empty Trash
		</Button>
	</div>

	<!-- Search and Filter -->
	<div class="mb-6 flex items-center gap-2">
		<div class="relative flex-1 max-w-md">
			<Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
			<input
				type="text"
				placeholder="Search in trash..."
				class="pl-9 pr-4 py-2 bg-background border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-primary"
			/>
		</div>
	</div>

	<!-- Trash Items -->
	{#if trashedItems.length > 0}
		<div class="bg-card rounded-lg border">
			<div class="grid grid-cols-[auto,1fr,200px,200px,150px] gap-4 p-4 border-b font-medium text-sm text-muted-foreground">
				<div></div>
				<div>Name</div>
				<div>Deleted</div>
				<div>Deleted By</div>
				<div>Actions</div>
			</div>
			{#each trashedItems as item}
				<div class="grid grid-cols-[auto,1fr,200px,200px,150px] gap-4 p-4 border-b hover:bg-accent/50 transition-colors items-center">
					<div>
						{#if item.type === 'document'}
							<FileText class="h-5 w-5 text-muted-foreground" />
						{:else}
							<Folder class="h-5 w-5 text-muted-foreground" />
						{/if}
					</div>
					<div class="font-medium">{item.title}</div>
					<div class="text-sm text-muted-foreground">{item.deletedAt}</div>
					<div class="text-sm text-muted-foreground">{item.deletedBy}</div>
					<div class="flex items-center gap-2">
						<Button
							size="sm"
							variant="outline"
							on:click={() => restoreItem(item)}
							title="Restore"
						>
							<RefreshCw class="h-3 w-3 mr-1" />
							Restore
						</Button>
						<Button
							size="sm"
							variant="ghost"
							on:click={() => deleteForever(item)}
							title="Delete forever"
							class="text-destructive hover:text-destructive"
						>
							<Trash2 class="h-3 w-3" />
						</Button>
					</div>
				</div>
			{/each}
		</div>

		<!-- Info -->
		<div class="mt-4 p-4 bg-muted/50 rounded-lg">
			<p class="text-sm text-muted-foreground">
				<strong>Note:</strong> Items in trash are automatically deleted after 30 days.
				Restore items to move them back to their original location.
			</p>
		</div>
	{:else}
		<!-- Empty State -->
		<div class="flex flex-col items-center justify-center py-12">
			<div class="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
				<Trash2 class="h-8 w-8 text-muted-foreground" />
			</div>
			<h2 class="text-xl font-semibold mb-2">Trash is empty</h2>
			<p class="text-muted-foreground text-center max-w-md">
				Items you delete will appear here for 30 days before being permanently removed.
			</p>
		</div>
	{/if}
</div>
