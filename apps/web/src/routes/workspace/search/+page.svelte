<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { page } from '$app/stores';
	import { Input } from '$lib/components/ui/input';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Search, FileText, Hash, CheckSquare, Calendar, Clock, Filter } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { onMount } from 'svelte';

	// SvelteKit props - properly declared to avoid warnings
	export let data: any;

	let searchQuery = '';
	let searchResults: any[] = [];
	let loading = false;
	let selectedFilter = 'all';

	const filters = [
		{ value: 'all', label: 'All', icon: null },
		{ value: 'documents', label: 'Documents', icon: FileText },
		{ value: 'pages', label: 'Pages', icon: Hash },
		{ value: 'tasks', label: 'Tasks', icon: CheckSquare },
		{ value: 'events', label: 'Events', icon: Calendar }
	];

	// Mock search results for demonstration
	const mockResults = [
		{
			id: '1',
			type: 'document',
			title: 'Project Roadmap',
			content: 'Q4 2024 objectives and key results...',
			lastModified: '2 hours ago',
			icon: FileText
		},
		{
			id: '2',
			type: 'task',
			title: 'Review design mockups',
			content: 'Review the latest design mockups for the dashboard...',
			lastModified: '3 hours ago',
			icon: CheckSquare
		},
		{
			id: '3',
			type: 'page',
			title: 'Meeting Notes - Sprint Planning',
			content: 'Sprint 23 planning session notes...',
			lastModified: '1 day ago',
			icon: Hash
		},
		{
			id: '4',
			type: 'event',
			title: 'Team Standup',
			content: 'Daily standup meeting at 10:00 AM',
			lastModified: 'Today',
			icon: Calendar
		}
	];

	async function performSearch() {
		if (!searchQuery.trim()) {
			searchResults = [];
			return;
		}

		loading = true;
		try {
			// Simulate API search
			await new Promise(resolve => setTimeout(resolve, 500));

			// Filter mock results based on query and selected filter
			searchResults = mockResults.filter(item => {
				const matchesQuery = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
					item.content.toLowerCase().includes(searchQuery.toLowerCase());
				const matchesFilter = selectedFilter === 'all' || item.type === selectedFilter.slice(0, -1); // Remove 's' from filter
				return matchesQuery && matchesFilter;
			});
		} catch (error) {
			toast.error('Search failed');
		} finally {
			loading = false;
		}
	}

	function navigateToResult(result: any) {
		switch (result.type) {
			case 'document':
				goto(`/workspace/document/${result.id}`);
				break;
			case 'task':
				goto('/workspace/tasks');
				break;
			case 'page':
				goto(`/workspace/document/${result.id}`);
				break;
			case 'event':
				goto('/workspace/calendar');
				break;
			default:
				goto('/workspace');
		}
	}

	onMount(() => {
		// Focus search input on mount
		const input = document.querySelector('input[type="search"]') as HTMLInputElement;
		if (input) input.focus();
	});

	// Debounced search
	let searchTimeout: ReturnType<typeof setTimeout>;
	$: {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			performSearch();
		}, 300);
	}
</script>

<div class="container max-w-5xl p-6">
	<div class="mb-8">
		<h1 class="text-3xl font-bold mb-2">Search</h1>
		<p class="text-muted-foreground">Find documents, tasks, and more across your workspace</p>
	</div>

	<!-- Search Bar -->
	<div class="mb-6">
		<div class="relative">
			<Search class="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
			<Input
				type="search"
				placeholder="Search for documents, tasks, pages..."
				bind:value={searchQuery}
				class="pl-10 text-lg h-12"
			/>
		</div>
	</div>

	<!-- Filters -->
	<div class="mb-6">
		<div class="flex gap-2 flex-wrap">
			{#each filters as filter}
				<Button
					variant={selectedFilter === filter.value ? 'default' : 'outline'}
					size="sm"
					on:click={() => {
						selectedFilter = filter.value;
						performSearch();
					}}
				>
					{#if filter.icon}
						<svelte:component this={filter.icon} class="mr-2 h-4 w-4" />
					{/if}
					{filter.label}
				</Button>
			{/each}
		</div>
	</div>

	<!-- Search Results -->
	<div class="space-y-4">
		{#if loading}
			<div class="flex justify-center py-12">
				<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
			</div>
		{:else if searchQuery && searchResults.length === 0}
			<Card>
				<CardContent class="py-12 text-center">
					<Search class="mx-auto h-12 w-12 text-muted-foreground mb-4" />
					<p class="text-lg font-medium">No results found</p>
					<p class="text-sm text-muted-foreground mt-1">Try adjusting your search terms or filters</p>
				</CardContent>
			</Card>
		{:else if searchResults.length > 0}
			<div class="space-y-2">
				{#each searchResults as result}
					<Card
						class="cursor-pointer hover:bg-accent/50 transition-colors"
						on:click={() => navigateToResult(result)}
					>
						<CardContent class="p-4">
							<div class="flex items-start gap-3">
								<div class="mt-1">
									<svelte:component this={result.icon} class="h-5 w-5 text-muted-foreground" />
								</div>
								<div class="flex-1 min-w-0">
									<h3 class="font-medium mb-1">{result.title}</h3>
									<p class="text-sm text-muted-foreground line-clamp-2">{result.content}</p>
									<div class="flex items-center gap-4 mt-2">
										<span class="text-xs text-muted-foreground capitalize">{result.type}</span>
										<div class="flex items-center gap-1 text-xs text-muted-foreground">
											<Clock class="h-3 w-3" />
											{result.lastModified}
										</div>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>
				{/each}
			</div>
		{:else}
			<!-- Empty state -->
			<Card>
				<CardContent class="py-12 text-center">
					<Search class="mx-auto h-12 w-12 text-muted-foreground mb-4" />
					<p class="text-lg font-medium">Start searching</p>
					<p class="text-sm text-muted-foreground mt-1">Type to search across your entire workspace</p>
				</CardContent>
			</Card>
		{/if}
	</div>

	<!-- Recent Searches (optional) -->
	{#if !searchQuery}
		<div class="mt-8">
			<h2 class="text-lg font-semibold mb-4">Recent Searches</h2>
			<div class="flex flex-wrap gap-2">
				<Button variant="outline" size="sm" on:click={() => searchQuery = 'project roadmap'}>
					project roadmap
				</Button>
				<Button variant="outline" size="sm" on:click={() => searchQuery = 'meeting notes'}>
					meeting notes
				</Button>
				<Button variant="outline" size="sm" on:click={() => searchQuery = 'design review'}>
					design review
				</Button>
				<Button variant="outline" size="sm" on:click={() => searchQuery = 'sprint planning'}>
					sprint planning
				</Button>
			</div>
		</div>
	{/if}
</div>
