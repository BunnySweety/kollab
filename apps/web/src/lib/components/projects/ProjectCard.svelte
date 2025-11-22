<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { MoreHorizontal } from 'lucide-svelte';
	import type { Project } from '$lib/services/project-service';
	import { getIconComponent, getViewIcon } from '$lib/utils/project-utils';

	export let project: Project;
	export let isArchived = false;
	export let openMenuId: string | null = null;

	const dispatch = createEventDispatcher<{
		click: void;
		menuToggle: void;
	}>();

	function handleClick() {
		dispatch('click');
	}

	function handleMenuToggle(e: MouseEvent) {
		e.stopPropagation();
		dispatch('menuToggle');
	}

	$: if (openMenuId !== project.id) {
		// Menu closed externally
	}
</script>

<button
	class="text-left w-full"
	on:click={handleClick}
	on:keydown={(e) => e.key === 'Enter' && handleClick()}
>
	<Card class="group hover:shadow-lg transition-shadow cursor-pointer h-full {isArchived ? 'opacity-75' : ''}">
		<CardHeader>
			<div class="flex items-start justify-between">
				<div class="flex items-center gap-3">
					<div
						class="w-10 h-10 rounded-lg flex items-center justify-center"
						style="background-color: {(project.color || '#3B82F6') + '20'}"
					>
						<svelte:component
							this={getIconComponent(project.icon || 'Folder')}
							class="h-5 w-5"
							style="color: {project.color || '#3B82F6'}"
						/>
					</div>
					<div>
						<CardTitle class="text-lg">{project.name}</CardTitle>
						<div class="flex items-center gap-1 text-xs text-muted-foreground mt-1">
							{#if getViewIcon(project.viewType)}
								<svelte:component this={getViewIcon(project.viewType)} class="h-3 w-3" />
								<span class="capitalize">{project.viewType}</span>
							{/if}
							{#if isArchived}
								<span class="ml-2 text-orange-600">• Archivé</span>
							{/if}
						</div>
					</div>
				</div>
				<div class="relative">
					<button
						class="opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-accent rounded-md"
						on:click={handleMenuToggle}
					>
						<MoreHorizontal class="h-4 w-4" />
					</button>

					{#if openMenuId === project.id}
						<div
							class="absolute right-0 mt-2 w-48 bg-background border rounded-lg shadow-lg z-10"
							role="menu"
							tabindex="-1"
							on:click|stopPropagation
							on:keydown={(e) => e.key === 'Escape' && dispatch('menuToggle')}
						>
							<slot name="menu" {project} />
						</div>
					{/if}
				</div>
			</div>
		</CardHeader>
		<CardContent>
			<CardDescription class="line-clamp-2 mb-4">
				{project.description || 'No description'}
			</CardDescription>
			<div class="flex items-center justify-between text-xs text-muted-foreground">
				<span>Project</span>
				<span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
			</div>
		</CardContent>
	</Card>
</button>

