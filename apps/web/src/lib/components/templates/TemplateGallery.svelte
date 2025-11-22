<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { Plus, Search, Filter, Heart, Download, Star, FileText, Folder, List, Calendar, BookOpen, Users } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { api, endpoints } from '$lib/api-client';
	import { log } from '$lib/logger';

	export let workspaceId: string;

	let templates: any[] = [];
	let loading = false;
	let searchQuery = '';
	let selectedCategory = 'all';
	let sortBy = 'popular';
	let view = 'gallery'; // gallery or list

	const categories = [
		{ value: 'all', label: 'All Templates', icon: null },
		{ value: 'document', label: 'Documents', icon: FileText },
		{ value: 'project', label: 'Projects', icon: Folder },
		{ value: 'task-list', label: 'Task Lists', icon: List },
		{ value: 'wiki', label: 'Wiki', icon: BookOpen },
		{ value: 'meeting-notes', label: 'Meeting Notes', icon: Users },
		{ value: 'roadmap', label: 'Roadmaps', icon: Calendar }
	];

	onMount(() => {
		loadTemplates();
	});

	async function loadTemplates() {
		loading = true;
		try {
			const data = await api.get(endpoints.templates.gallery, {
				params: {
					category: selectedCategory === 'all' ? '' : selectedCategory,
					search: searchQuery,
					sort: sortBy
				}
			});

			templates = data.templates;
		} catch (error) {
			log.error('Load templates error', error instanceof Error ? error : new Error(String(error)), { workspaceId, category: selectedCategory, searchQuery });
			toast.error('Failed to load templates');
		} finally {
			loading = false;
		}
	}

	async function useTemplate(templateId: string, templateName: string) {
		const name = prompt(`Enter name for new ${templateName}:`, templateName);
		if (!name) return;

		try {
			const data = await api.post(endpoints.templates.use(templateId), {
				workspaceId,
				name
			});

			toast.success(`${data.type === 'document' ? 'Document' : 'Project'} created from template`);

			// Navigate to the created document
			if (data.type === 'document') {
				goto(`/workspace/document/${data.document.id}`);
			} else if (data.type === 'project') {
				goto(`/workspace/document/${data.rootDocument.id}`);
			}
		} catch (error) {
			log.error('Use template error', error instanceof Error ? error : new Error(String(error)), { templateId, workspaceId, name });
			toast.error('Failed to create from template');
		}
	}

	async function favoriteTemplate(templateId: string, isFavorited: boolean) {
		try {
			if (isFavorited) {
				await api.delete(`/api/templates/${templateId}/favorite`);
			} else {
				await api.post(`/api/templates/${templateId}/favorite`);
			}

			toast.success(isFavorited ? 'Removed from favorites' : 'Added to favorites');
			loadTemplates();
		} catch (error) {
			log.error('Favorite error', error instanceof Error ? error : new Error(String(error)), { templateId, isFavorited });
			toast.error('Failed to update favorite');
		}
	}

	function getCategoryIcon(category: string) {
		switch (category) {
			case 'document': return FileText;
			case 'project': return Folder;
			case 'task-list': return List;
			case 'wiki': return BookOpen;
			case 'meeting-notes': return Users;
			case 'roadmap': return Calendar;
			default: return FileText;
		}
	}

	$: if (selectedCategory || sortBy) {
		loadTemplates();
	}
</script>

<div class="p-6">
	<!-- Header -->
	<div class="mb-6">
		<h1 class="text-2xl font-bold mb-2">Template Gallery</h1>
		<p class="text-muted-foreground">Start with a template or create your own</p>
	</div>

	<!-- Toolbar -->
	<div class="flex flex-col sm:flex-row gap-4 mb-6">
		<!-- Search -->
		<div class="relative flex-1">
			<Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
			<input
				type="text"
				placeholder="Search templates..."
				bind:value={searchQuery}
				on:input={loadTemplates}
				class="w-full pl-9 pr-3 py-2 border rounded-lg bg-background"
			/>
		</div>

		<!-- Filters -->
		<div class="flex gap-2">
			<!-- Category filter -->
			<select
				bind:value={selectedCategory}
				class="px-3 py-2 border rounded-lg bg-background"
			>
				{#each categories as category}
					<option value={category.value}>{category.label}</option>
				{/each}
			</select>

			<!-- Sort -->
			<select
				bind:value={sortBy}
				class="px-3 py-2 border rounded-lg bg-background"
			>
				<option value="popular">Most Popular</option>
				<option value="recent">Recently Added</option>
				<option value="rating">Highest Rated</option>
				<option value="featured">Featured</option>
			</select>

			<!-- View toggle -->
			<Button
				variant={view === 'gallery' ? 'default' : 'ghost'}
				size="icon"
				on:click={() => view = 'gallery'}
			>
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<rect x="3" y="3" width="7" height="7" rx="1" />
					<rect x="14" y="3" width="7" height="7" rx="1" />
					<rect x="3" y="14" width="7" height="7" rx="1" />
					<rect x="14" y="14" width="7" height="7" rx="1" />
				</svg>
			</Button>
			<Button
				variant={view === 'list' ? 'default' : 'ghost'}
				size="icon"
				on:click={() => view = 'list'}
			>
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<line x1="3" y1="6" x2="21" y2="6" />
					<line x1="3" y1="12" x2="21" y2="12" />
					<line x1="3" y1="18" x2="21" y2="18" />
				</svg>
			</Button>
		</div>
	</div>

	<!-- Create custom template button -->
	<div class="mb-6">
		<Button on:click={() => goto('/workspace/templates/new')} class="gap-2">
			<Plus class="w-4 h-4" />
			Create Custom Template
		</Button>
	</div>

	<!-- Loading state -->
	{#if loading}
		<div class="flex justify-center py-12">
			<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
		</div>
	{:else if templates.length === 0}
		<!-- Empty state -->
		<div class="text-center py-12">
			<FileText class="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
			<h3 class="text-lg font-medium mb-2">No templates found</h3>
			<p class="text-muted-foreground mb-4">Try adjusting your search or filters</p>
			<Button on:click={() => goto('/workspace/templates/new')}>
				Create First Template
			</Button>
		</div>
	{:else if view === 'gallery'}
		<!-- Gallery view -->
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
			{#each templates as item}
				{@const template = item.template}
				{@const gallery = item.gallery}
				<div class="border rounded-lg overflow-hidden hover:shadow-lg transition-shadow">
					<!-- Thumbnail -->
					<div class="h-32 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
						<svelte:component this={getCategoryIcon(template.category)} class="w-12 h-12 text-primary/50" />
					</div>

					<!-- Content -->
					<div class="p-4">
						<h3 class="font-medium mb-1 truncate">{template.name}</h3>
						<p class="text-sm text-muted-foreground mb-3 line-clamp-2">
							{template.description || 'No description'}
						</p>

						<!-- Stats -->
						<div class="flex items-center gap-3 text-sm text-muted-foreground mb-3">
							{#if gallery}
								<span class="flex items-center gap-1">
									<Download class="w-3 h-3" />
									{gallery.downloads || 0}
								</span>
								<span class="flex items-center gap-1">
									<Heart class="w-3 h-3" />
									{gallery.likes || 0}
								</span>
								{#if gallery.rating}
									<span class="flex items-center gap-1">
										<Star class="w-3 h-3" />
										{gallery.rating}
									</span>
								{/if}
							{/if}
						</div>

						<!-- Actions -->
						<div class="flex gap-2">
							<Button
								size="sm"
								class="flex-1"
								on:click={() => useTemplate(template.id, template.name)}
							>
								Use Template
							</Button>
							<Button
								size="icon"
								variant="ghost"
								on:click={() => favoriteTemplate(template.id, false)}
							>
								<Heart class="w-4 h-4" />
							</Button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<!-- List view -->
		<div class="space-y-2">
			{#each templates as item}
				{@const template = item.template}
				{@const gallery = item.gallery}
				<div class="border rounded-lg p-4 hover:shadow-md transition-shadow">
					<div class="flex items-start gap-4">
						<!-- Icon -->
						<div class="w-10 h-10 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
							<svelte:component this={getCategoryIcon(template.category)} class="w-5 h-5 text-primary" />
						</div>

						<!-- Content -->
						<div class="flex-1 min-w-0">
							<h3 class="font-medium mb-1">{template.name}</h3>
							<p class="text-sm text-muted-foreground mb-2">
								{template.description || 'No description'}
							</p>

							<!-- Stats -->
							<div class="flex items-center gap-4 text-sm text-muted-foreground">
								<span class="px-2 py-1 bg-secondary rounded text-xs">
									{template.category}
								</span>
								{#if gallery}
									<span class="flex items-center gap-1">
										<Download class="w-3 h-3" />
										{gallery.downloads || 0}
									</span>
									<span class="flex items-center gap-1">
										<Heart class="w-3 h-3" />
										{gallery.likes || 0}
									</span>
									{#if gallery.rating}
										<span class="flex items-center gap-1">
											<Star class="w-3 h-3" />
											{gallery.rating}
										</span>
									{/if}
								{/if}
							</div>
						</div>

						<!-- Actions -->
						<div class="flex gap-2">
							<Button
								size="sm"
								on:click={() => useTemplate(template.id, template.name)}
							>
								Use Template
							</Button>
							<Button
								size="icon"
								variant="ghost"
								on:click={() => favoriteTemplate(template.id, false)}
							>
								<Heart class="w-4 h-4" />
							</Button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>