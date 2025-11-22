<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '$lib/components/ui/dialog';
	import { Plus, Database, Search, Filter, X, Trash2 } from 'lucide-svelte';
	import type { PageData } from '$lib/types';
	import { api, endpoints } from '$lib/api-client';
	import { log } from '$lib/logger';
	import { toast } from 'svelte-sonner';
	import { currentWorkspaceId } from '$lib/stores/workspace';

	export let data: PageData;

	let databases: Array<{
		id: string;
		name: string;
		description: string | null;
		entryCount: number;
		createdAt: Date | string;
		updatedAt: Date | string;
	}> = [];
	let loading = false;
	let showCreateModal = false;
	let creatingDatabase = false;
	let newDatabaseName = '';
	let newDatabaseDescription = '';
	let newDatabaseDefaultViewName = 'Table';
	let searchQuery = '';
	let filteredDatabases: typeof databases = [];
	
	// Database columns/properties
	type ColumnType = 'title' | 'text' | 'number' | 'email' | 'url' | 'date' | 'checkbox' | 'select' | 'multi-select';
	interface DatabaseColumn {
		id: string;
		name: string;
		type: ColumnType;
		options?: string[];
	}
	
	let databaseColumns: DatabaseColumn[] = [
		{ id: crypto.randomUUID(), name: 'Name', type: 'title' }
	];

	$: workspaceId = $currentWorkspaceId;
	$: {
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			filteredDatabases = databases.filter(db => 
				db.name.toLowerCase().includes(query) ||
				(db.description && db.description.toLowerCase().includes(query))
			);
		} else {
			filteredDatabases = databases;
		}
	}

	onMount(() => {
		if (workspaceId) {
			loadDatabases();
		}
	});

	$: if (workspaceId) {
		loadDatabases();
	}

	async function loadDatabases() {
		if (!workspaceId) {
			databases = [];
			return;
		}

		loading = true;
		try {
			log.info('Loading databases', { workspaceId });
			const response = await api.get(endpoints.databases.listByWorkspace(workspaceId));
			log.info('Databases loaded', { 
				workspaceId, 
				count: response.databases?.length || 0,
				databases: response.databases?.map((db: any) => ({ 
					id: db.id, 
					name: db.name,
					entryCount: db.entryCount 
				}))
			});
			databases = (response.databases || []).map((db: any) => ({
				...db,
				createdAt: db.createdAt ? new Date(db.createdAt) : new Date(),
				updatedAt: db.updatedAt ? new Date(db.updatedAt) : new Date()
			}));
			filteredDatabases = databases;
			searchQuery = '';
		} catch (error) {
			log.error('Load databases error', error instanceof Error ? error : new Error(String(error)), { workspaceId });
			toast.error('Failed to load databases');
			databases = [];
		} finally {
			loading = false;
		}
	}

	function formatDate(date: Date | string): string {
		const d = typeof date === 'string' ? new Date(date) : date;
		const now = new Date();
		const diffMs = now.getTime() - d.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
		if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
		if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
		return d.toLocaleDateString();
	}

	function getDatabaseIcon(name: string): string {
		const lowerName = name.toLowerCase();
		if (lowerName.includes('customer') || lowerName.includes('client')) return '👥';
		if (lowerName.includes('product') || lowerName.includes('inventory')) return '📦';
		if (lowerName.includes('sales') || lowerName.includes('pipeline')) return '💼';
		return '📊';
	}

	function addColumn() {
		databaseColumns = [...databaseColumns, {
			id: crypto.randomUUID(),
			name: '',
			type: 'text'
		}];
	}

	function removeColumn(columnId: string) {
		if (databaseColumns.length <= 1) {
			toast.error('At least one column is required');
			return;
		}
		databaseColumns = databaseColumns.filter(col => col.id !== columnId);
	}

	function updateColumn(columnId: string, field: 'name' | 'type', value: string) {
		databaseColumns = databaseColumns.map(col => {
			if (col.id === columnId) {
				if (field === 'type') {
					return { ...col, type: value as ColumnType, options: (value === 'select' || value === 'multi-select') ? [] : undefined };
				}
				return { ...col, [field]: value };
			}
			return col;
		});
	}

	function addOptionToColumn(columnId: string, option: string) {
		if (!option.trim()) return;
		databaseColumns = databaseColumns.map(col => {
			if (col.id === columnId) {
				const options = col.options || [];
				if (!options.includes(option.trim())) {
					return { ...col, options: [...options, option.trim()] };
				}
			}
			return col;
		});
	}

	function removeOptionFromColumn(columnId: string, option: string) {
		databaseColumns = databaseColumns.map(col => {
			if (col.id === columnId && col.options) {
				return { ...col, options: col.options.filter(opt => opt !== option) };
			}
			return col;
		});
	}

	function resetCreateForm() {
		newDatabaseName = '';
		newDatabaseDescription = '';
		newDatabaseDefaultViewName = 'Table';
		databaseColumns = [
			{ id: crypto.randomUUID(), name: 'Name', type: 'title' }
		];
	}

	async function createDatabase() {
		if (!workspaceId) {
			toast.error('No workspace selected');
			return;
		}

		if (!newDatabaseName.trim()) {
			toast.error('Please enter a database name');
			return;
		}

		// Validate columns
		const validColumns = databaseColumns.filter(col => col.name.trim());
		if (validColumns.length === 0) {
			toast.error('At least one column with a name is required');
			return;
		}

		// Check for duplicate column names
		const columnNames = validColumns.map(col => col.name.trim().toLowerCase());
		const uniqueNames = new Set(columnNames);
		if (uniqueNames.size !== columnNames.length) {
			toast.error('Column names must be unique');
			return;
		}

		// Check for at least one title column
		const hasTitleColumn = validColumns.some(col => col.type === 'title');
		if (!hasTitleColumn) {
			toast.error('At least one column must be of type "Title"');
			return;
		}

		creatingDatabase = true;
		try {
			// Build properties object from columns
			const properties: Record<string, any> = {};
			validColumns.forEach(col => {
				const property: any = {
					type: col.type,
					name: col.name.trim()
				};
				if (col.options && col.options.length > 0) {
					property.options = col.options;
				}
				properties[col.name.trim()] = property;
			});

			// Check if database has image-related properties for gallery view
			const hasImageProp = Object.values(properties).some((prop: any) => {
				return prop.type === 'url' || 
				       (prop.type === 'text' && (prop.name?.toLowerCase().includes('image') || 
				                                 prop.name?.toLowerCase().includes('photo') ||
				                                 prop.name?.toLowerCase().includes('cover')));
			});

			const views: Array<{ type: string; name: string }> = [
				{ type: 'table', name: newDatabaseDefaultViewName.trim() || 'Table' }
			];
			
			// Only add gallery view if there's an image property
			if (hasImageProp) {
				views.push({ type: 'gallery', name: 'Gallery' });
			}

			const payload: any = {
				workspaceId,
				name: newDatabaseName.trim(),
				properties,
				views
			};

			if (newDatabaseDescription.trim()) {
				payload.description = newDatabaseDescription.trim();
			}

			const response = await api.post(endpoints.databases.create, payload);

			toast.success('Database created successfully');
			showCreateModal = false;
			resetCreateForm();
			await loadDatabases();
			goto(`/workspace/databases/${response.database.id}`);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			const errorDetails = error instanceof Error && 'data' in error ? (error as any).data : null;
			log.error('Create database error', error instanceof Error ? error : new Error(String(error)), { 
				workspaceId,
				errorMessage,
				errorDetails
			});
			
			// Show more detailed error message
			if (errorDetails && typeof errorDetails === 'object' && 'error' in errorDetails) {
				toast.error(errorDetails.error || 'Failed to create database');
			} else {
				toast.error(errorMessage || 'Failed to create database');
			}
		} finally {
			creatingDatabase = false;
		}
	}
</script>

<div class="flex-1 p-6">
	<!-- Header -->
	<div class="mb-6">
		<h1 class="text-3xl font-bold mb-2">Databases</h1>
		<p class="text-muted-foreground">Organize and manage structured data</p>
	</div>

	<!-- Toolbar -->
	<div class="flex items-center justify-between mb-6">
		<div class="flex items-center gap-2">
			<div class="relative">
				<Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
				<Input
					type="text"
					placeholder="Search databases..."
					bind:value={searchQuery}
					class="pl-9 w-64"
				/>
			</div>
			{#if searchQuery}
				<Button 
					variant="outline" 
					size="sm"
					on:click={() => searchQuery = ''}
				>
					Clear
				</Button>
			{/if}
		</div>
		<Button on:click={() => showCreateModal = true}>
			<Plus class="h-4 w-4 mr-1" />
			New Database
		</Button>
	</div>

	<!-- Database Grid -->
	{#if loading}
		<div class="flex items-center justify-center py-12">
			<div class="text-muted-foreground">Loading databases...</div>
		</div>
	{:else}
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
			{#each filteredDatabases as database}
				<button
					class="group p-4 bg-card rounded-lg border hover:shadow-md transition-all text-left"
					on:click={() => {
						goto(`/workspace/databases/${database.id}`);
					}}
				>
					<div class="flex items-start justify-between mb-3">
						<span class="text-2xl">{getDatabaseIcon(database.name)}</span>
						<Database class="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
					</div>
					<h3 class="font-semibold mb-1">{database.name}</h3>
					<p class="text-sm text-muted-foreground mb-3">{database.description || 'No description'}</p>
					<div class="flex items-center justify-between text-xs text-muted-foreground">
						<span>{database.entryCount} record{database.entryCount !== 1 ? 's' : ''}</span>
						<span>{formatDate(database.updatedAt)}</span>
					</div>
				</button>
			{/each}

			<!-- Create New Database Card -->
			<button
				class="p-4 bg-card rounded-lg border border-dashed hover:border-primary hover:bg-accent transition-all flex flex-col items-center justify-center min-h-[160px] group"
				on:click={() => showCreateModal = true}
			>
				<div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
					<Plus class="h-6 w-6 text-primary" />
				</div>
				<span class="font-medium">Create Database</span>
				<span class="text-xs text-muted-foreground mt-1">Start organizing your data</span>
			</button>
		</div>
	{/if}

	<!-- Empty State (shown when no databases) -->
	{#if !loading && databases.length === 0}
		<div class="flex flex-col items-center justify-center py-12">
			<div class="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
				<Database class="h-8 w-8 text-primary" />
			</div>
			<h2 class="text-xl font-semibold mb-2">No databases yet</h2>
			<p class="text-muted-foreground text-center mb-6 max-w-md">
				Create your first database to start organizing and managing structured data in tables.
			</p>
			<Button on:click={() => showCreateModal = true}>
				<Plus class="h-4 w-4 mr-1" />
				Create Your First Database
			</Button>
		</div>
	{/if}
</div>

<!-- Create Database Modal -->
<Dialog bind:open={showCreateModal} onOpenChange={(open) => { if (!open) resetCreateForm(); }}>
	<DialogContent class="max-w-2xl max-h-[90vh]">
		<DialogHeader>
			<DialogTitle>Create New Database</DialogTitle>
			<DialogDescription>Create a new database with custom columns and properties</DialogDescription>
		</DialogHeader>

		<div class="space-y-4 py-4">
				<div>
					<Label for="database-name">Name *</Label>
					<Input
						id="database-name"
						bind:value={newDatabaseName}
						placeholder="Enter database name"
						disabled={creatingDatabase}
					/>
				</div>

				<div>
					<Label for="database-description">Description</Label>
					<Textarea
						id="database-description"
						bind:value={newDatabaseDescription}
						placeholder="Enter database description (optional)"
						disabled={creatingDatabase}
						rows={3}
					/>
				</div>

				<div>
					<Label for="database-default-view-name">Default View Name</Label>
					<Input
						id="database-default-view-name"
						bind:value={newDatabaseDefaultViewName}
						placeholder="Table"
						disabled={creatingDatabase}
					/>
					<p class="text-xs text-muted-foreground mt-1">Name of the default table view</p>
				</div>

				<div>
					<div class="flex items-center justify-between mb-2">
						<Label>Columns *</Label>
						<Button
							type="button"
							variant="outline"
							size="sm"
							on:click={addColumn}
							disabled={creatingDatabase}
						>
							<Plus class="h-4 w-4 mr-1" />
							Add Column
						</Button>
					</div>
					<div class="space-y-3 max-h-[400px] overflow-y-auto">
						{#each databaseColumns as column, index}
							<div class="p-3 border rounded-lg space-y-2">
								<div class="flex items-center gap-2">
									<div class="flex-1">
										<Label for="column-name-{column.id}">Column Name *</Label>
										<Input
											id="column-name-{column.id}"
											value={column.name}
											on:input={(e) => updateColumn(column.id, 'name', e.currentTarget.value)}
											placeholder="Column name"
											disabled={creatingDatabase}
										/>
									</div>
									<div class="flex-1">
										<Label for="column-type-{column.id}">Type *</Label>
										<select
											id="column-type-{column.id}"
											value={column.type}
											on:change={(e) => updateColumn(column.id, 'type', e.currentTarget.value)}
											disabled={creatingDatabase}
											class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
										>
											<option value="title">Title</option>
											<option value="text">Text</option>
											<option value="number">Number</option>
											<option value="email">Email</option>
											<option value="url">URL</option>
											<option value="date">Date</option>
											<option value="checkbox">Checkbox</option>
											<option value="select">Select</option>
											<option value="multi-select">Multi-select</option>
										</select>
									</div>
									<div class="pt-6">
										<Button
											type="button"
											variant="ghost"
											size="icon"
											on:click={() => removeColumn(column.id)}
											disabled={creatingDatabase || databaseColumns.length <= 1}
										>
											<Trash2 class="h-4 w-4" />
										</Button>
									</div>
								</div>
								{#if column.type === 'select' || column.type === 'multi-select'}
									<div>
										<Label>Options</Label>
										<div class="flex gap-2 mt-1">
											<Input
												type="text"
												placeholder="Add option..."
												disabled={creatingDatabase}
												on:keydown={(e) => {
													if (e.key === 'Enter') {
														e.preventDefault();
														addOptionToColumn(column.id, e.currentTarget.value);
														e.currentTarget.value = '';
													}
												}}
											/>
										</div>
										{#if column.options && column.options.length > 0}
											<div class="flex flex-wrap gap-2 mt-2">
												{#each column.options as option}
													<div class="flex items-center gap-1 px-2 py-1 bg-accent rounded text-sm">
														<span>{option}</span>
														<button
															type="button"
															on:click={() => removeOptionFromColumn(column.id, option)}
															disabled={creatingDatabase}
															class="hover:text-destructive"
														>
															<X class="h-3 w-3" />
														</button>
													</div>
												{/each}
											</div>
										{/if}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
		</div>

		<DialogFooter>
			<DialogClose variant="outline" disabled={creatingDatabase}>
				Cancel
			</DialogClose>
			<Button
				on:click={createDatabase}
				disabled={creatingDatabase || !newDatabaseName.trim() || databaseColumns.filter(col => col.name.trim()).length === 0}
			>
				<Plus class="mr-2 h-4 w-4" />
				Create Database
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
