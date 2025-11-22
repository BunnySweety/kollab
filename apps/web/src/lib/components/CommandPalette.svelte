<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		Search,
		FileText,
		Plus,
		Settings,
		User,
		LogOut,
		Home,
		CheckSquare,
		Calendar,
		Database,
		Hash,
		ChevronRight,
		Trash2,
		Sun,
		Moon,
		Command
	} from 'lucide-svelte';
	import { commandPaletteStore, type CommandDefinition } from '$lib/stores/commandPalette';
	import { theme } from '$lib/stores/theme';
	import { Monitor } from 'lucide-svelte';
	import { api, endpoints } from '$lib/api-client';
	import { log } from '$lib/logger';

	let isOpen = false;
	let searchQuery = '';
	let selectedIndex = 0;
	let searchInput: HTMLInputElement;
	let searchResults: any[] = [];
	let isSearching = false;

	// Command categories
	const globalCommands: CommandDefinition[] = [
		// Navigation
		{ id: 'home', label: 'Go to Home', icon: Home, category: 'Navigation', action: () => goto('/workspace') },
		{ id: 'tasks', label: 'Go to Tasks', icon: CheckSquare, category: 'Navigation', action: () => goto('/workspace/tasks') },
		{ id: 'calendar', label: 'Go to Calendar', icon: Calendar, category: 'Navigation', action: () => goto('/workspace/calendar') },
		{ id: 'databases', label: 'Go to Databases', icon: Database, category: 'Navigation', action: () => goto('/workspace/databases') },
		{ id: 'settings', label: 'Settings', icon: Settings, category: 'Navigation', action: () => goto('/workspace/settings') },

		// Actions
		{ id: 'new-document', label: 'Create New Document', icon: Plus, category: 'Actions', action: createNewDocument },
		{ id: 'new-task', label: 'Create New Task', icon: Plus, category: 'Actions', action: createNewTask },
		{ id: 'new-project', label: 'Create New Project', icon: Plus, category: 'Actions', action: createNewProject },

		// Theme
		{ id: 'theme-light', label: 'Switch to Light Mode', icon: Sun, category: 'Theme', action: () => theme.set('light') },
		{ id: 'theme-dark', label: 'Switch to Dark Mode', icon: Moon, category: 'Theme', action: () => theme.set('dark') },
		{ id: 'theme-system', label: 'Use System Theme', icon: Monitor, category: 'Theme', action: () => theme.set('system') },

		// Account
		{ id: 'profile', label: 'View Profile', icon: User, category: 'Account', action: () => goto('/workspace/profile') },
		{ id: 'logout', label: 'Log Out', icon: LogOut, category: 'Account', action: handleLogout },

		// Search
		{ id: 'search-docs', label: 'Search Documents...', icon: FileText, category: 'Search', action: () => focusSearch('documents') },
		{ id: 'search-tasks', label: 'Search Tasks...', icon: CheckSquare, category: 'Search', action: () => focusSearch('tasks') },
		{ id: 'trash', label: 'View Trash', icon: Trash2, category: 'Other', action: () => goto('/workspace/trash') }
	];

	// Subscribe to store
	$: isOpen = $commandPaletteStore.isOpen;

	// Filter commands based on search
	let contextCommands: CommandDefinition[] = [];
	let combinedCommands: CommandDefinition[] = [];

	$: storeState = $commandPaletteStore;
	$: isOpen = storeState.isOpen;
	$: contextCommands = storeState.contextCommands;

	const matchesQuery = (cmd: CommandDefinition, query: string) => {
		const haystack = [
			cmd.label,
			cmd.category,
			...(cmd.keywords || [])
		]
			.join(' ')
			.toLowerCase();
		return haystack.includes(query.toLowerCase());
	};

	$: combinedCommands = [
		...globalCommands,
		...contextCommands
	].filter((cmd, index, array) => array.findIndex(other => other.id === cmd.id) === index);

	$: filteredCommands = searchQuery
		? combinedCommands.filter(cmd => matchesQuery(cmd, searchQuery))
		: combinedCommands;

	// Group commands by category
	$: groupedCommands = filteredCommands.reduce((acc, cmd) => {
		if (!acc[cmd.category]) acc[cmd.category] = [];
		acc[cmd.category].push(cmd);
		return acc;
	}, {} as Record<string, CommandDefinition[]>);

	// Combined results (commands + search results)
	$: allResults = [
		...searchResults.map(result => ({ type: 'result', ...result })),
		...filteredCommands.map(cmd => ({ type: 'command', ...cmd }))
	];

	onMount(() => {
		// Keyboard shortcut handler
		const handleKeyDown = (e: KeyboardEvent) => {
			// Open with Cmd/Ctrl + K
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				commandPaletteStore.toggle();
			}

			// Close with Escape
			if (e.key === 'Escape' && isOpen) {
				commandPaletteStore.close();
			}

			// Navigate with arrow keys
			if (isOpen) {
				if (e.key === 'ArrowDown') {
					e.preventDefault();
					selectedIndex = Math.min(selectedIndex + 1, allResults.length - 1);
				} else if (e.key === 'ArrowUp') {
					e.preventDefault();
					selectedIndex = Math.max(selectedIndex - 1, 0);
				} else if (e.key === 'Enter') {
					e.preventDefault();
					handleSelect(allResults[selectedIndex]);
				}
			}
		};

		document.addEventListener('keydown', handleKeyDown);

		return () => {
			document.removeEventListener('keydown', handleKeyDown);
		};
	});

	// Focus input when opened
	$: if (isOpen && searchInput) {
		searchInput.focus();
		selectedIndex = 0;
		searchQuery = '';
		searchResults = [];
	}

	async function handleSearch() {
		if (searchQuery.length < 2) {
			searchResults = [];
			return;
		}

		isSearching = true;

		try {
			// Search in MeiliSearch
			const data = await api.get(endpoints.search.all, {
				params: { q: searchQuery }
			});
			searchResults = data.results || [];
		} catch (error) {
			log.error('Search error', error instanceof Error ? error : new Error(String(error)), { searchQuery });
			// Fallback to local search
			searchResults = [];
		} finally {
			isSearching = false;
		}
	}

	function handleSelect(item: any) {
		if (item.type === 'command') {
			item.action();
		} else if (item.type === 'result') {
			// Navigate to result
			if (item.resultType === 'document') {
				goto(`/workspace/document/${item.id}`);
			} else if (item.resultType === 'task') {
				goto(`/workspace/task/${item.id}`);
			}
		}

		commandPaletteStore.close();
	}

	function createNewDocument() {
		goto('/workspace/document/new');
		commandPaletteStore.close();
	}

	function createNewTask() {
		goto('/workspace/task/new');
		commandPaletteStore.close();
	}

	function createNewProject() {
		goto('/workspace/project/new');
		commandPaletteStore.close();
	}


	function focusSearch(type: string) {
		searchQuery = '';
		// Implement specific search
		commandPaletteStore.close();
	}

	async function handleLogout() {
		try {
			await api.post(endpoints.auth.logout);
			goto('/login');
		} catch (error) {
			log.error('Logout error', error instanceof Error ? error : new Error(String(error)));
		}
		commandPaletteStore.close();
	}

	// Debounced search
	let searchTimeout: NodeJS.Timeout;
	$: {
		clearTimeout(searchTimeout);
		if (searchQuery) {
			searchTimeout = setTimeout(() => {
				handleSearch();
			}, 300);
		}
	}
</script>

{#if isOpen}
	<!-- Backdrop -->
	<button
		class="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm"
		on:click={() => commandPaletteStore.close()}
		aria-label="Close command palette"
	/>

	<!-- Command Palette -->
	<div class="fixed left-1/2 top-20 z-50 w-full max-w-2xl -translate-x-1/2 p-4">
		<div class="overflow-hidden rounded-lg border bg-popover shadow-lg">
			<!-- Search input -->
			<div class="flex items-center border-b px-3">
				<Search class="h-4 w-4 text-muted-foreground" />
				<input
					bind:this={searchInput}
					bind:value={searchQuery}
					type="text"
					placeholder="Type a command or search..."
					class="flex-1 bg-transparent px-3 py-4 text-sm outline-none placeholder:text-muted-foreground"
				/>
				{#if isSearching}
					<div class="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
				{/if}
			</div>

			<!-- Results -->
			<div class="max-h-[400px] overflow-y-auto p-2">
				{#if searchQuery && searchResults.length > 0}
					<!-- Search results -->
					<div class="mb-2">
						<div class="mb-1 px-2 text-xs font-medium text-muted-foreground">Search Results</div>
						{#each searchResults as result, i}
							<button
								class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent {selectedIndex === i ? 'bg-accent' : ''}"
								on:click={() => handleSelect({ type: 'result', ...result })}
							>
								{#if result.resultType === 'document'}
									<FileText class="h-4 w-4 text-muted-foreground" />
								{:else if result.resultType === 'task'}
									<CheckSquare class="h-4 w-4 text-muted-foreground" />
								{:else}
									<Hash class="h-4 w-4 text-muted-foreground" />
								{/if}
								<span class="flex-1">{result.title}</span>
								{#if result.workspace}
									<span class="text-xs text-muted-foreground">{result.workspace}</span>
								{/if}
							</button>
						{/each}
					</div>
				{/if}

				<!-- Commands -->
				{#each Object.entries(groupedCommands) as [category, categoryCommands]}
					<div class="mb-2">
						<div class="mb-1 px-2 text-xs font-medium text-muted-foreground">{category}</div>
						{#each categoryCommands as cmd, i}
							{@const globalIndex = searchResults.length + filteredCommands.indexOf(cmd)}
							<button
								class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent {selectedIndex === globalIndex ? 'bg-accent' : ''}"
								on:click={() => handleSelect({ type: 'command', ...cmd })}
							>
								<svelte:component this={cmd.icon} class="h-4 w-4 text-muted-foreground" />
								<span class="flex-1">{cmd.label}</span>
								<ChevronRight class="h-4 w-4 text-muted-foreground" />
							</button>
						{/each}
					</div>
				{/each}

				{#if filteredCommands.length === 0 && searchResults.length === 0 && searchQuery}
					<div class="px-3 py-8 text-center text-sm text-muted-foreground">
						No results found for "{searchQuery}"
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<div class="border-t px-3 py-2">
				<div class="flex items-center justify-between text-xs text-muted-foreground">
					<div class="flex items-center gap-4">
						<span class="flex items-center gap-1">
							<kbd class="rounded border px-1">↑↓</kbd>
							Navigate
						</span>
						<span class="flex items-center gap-1">
							<kbd class="rounded border px-1">↵</kbd>
							Select
						</span>
						<span class="flex items-center gap-1">
							<kbd class="rounded border px-1">ESC</kbd>
							Close
						</span>
					</div>
					<span class="flex items-center gap-1">
						<Command class="h-3 w-3" />
						<kbd class="rounded border px-1">K</kbd>
					</span>
				</div>
			</div>
		</div>
	</div>
{/if}