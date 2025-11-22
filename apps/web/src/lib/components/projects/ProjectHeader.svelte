<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { ArrowLeft, Settings, UserPlus, Archive, ArchiveRestore } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { getIconComponent } from '$lib/utils/project-utils';
	import type { Project } from '$lib/services/project-service';

	export let project: Project;

	const dispatch = createEventDispatcher<{
		settings: void;
		share: void;
		archive: void;
		unarchive: void;
	}>();
</script>

<div class="border-b bg-background">
	<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 gap-4">
		<div class="flex items-center gap-2 sm:gap-4">
			<Button variant="ghost" size="sm" on:click={() => goto('/workspace/projects')}>
				<ArrowLeft class="h-4 w-4 sm:mr-2" />
				<span class="hidden sm:inline">Back to Projects</span>
			</Button>

			<div class="flex items-center gap-2 sm:gap-3">
				<div
					class="w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0"
					style="background-color: {(project.color || '#3B82F6') + '20'}"
				>
					<svelte:component
						this={getIconComponent(project.icon || 'Folder')}
						class="h-4 w-4 sm:h-5 sm:w-5"
						style="color: {project.color || '#3B82F6'}"
					/>
				</div>
				<div class="min-w-0">
					<h1 class="text-lg sm:text-2xl font-bold truncate">{project.name}</h1>
					{#if project.description}
						<p class="text-xs sm:text-sm text-muted-foreground hidden sm:block truncate">
							{project.description}
						</p>
					{/if}
				</div>

				{#if project.isArchived}
					<div
						class="px-2 sm:px-3 py-1 bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200 rounded-full text-xs font-medium flex-shrink-0"
					>
						Archived
					</div>
				{/if}
			</div>
		</div>

		<div class="flex items-center gap-1 sm:gap-2">
			{#if project.isArchived}
				<Button variant="outline" size="sm" on:click={() => dispatch('unarchive')}>
					<ArchiveRestore class="h-4 w-4 sm:mr-2" />
					<span class="hidden sm:inline">Restore</span>
				</Button>
			{:else}
				<Button variant="outline" size="sm" class="hidden sm:flex" on:click={() => dispatch('share')}>
					<UserPlus class="h-4 w-4 mr-2" />
					Share
				</Button>
				<Button variant="outline" size="sm" on:click={() => dispatch('archive')}>
					<Archive class="h-4 w-4 sm:mr-2" />
					<span class="hidden sm:inline">Archive</span>
				</Button>
			{/if}
			<Button variant="outline" size="sm" on:click={() => dispatch('settings')}>
				<Settings class="h-4 w-4" />
			</Button>
		</div>
	</div>
</div>

