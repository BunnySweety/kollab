<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import ProjectCard from './ProjectCard.svelte';
	import ProjectMenu from './ProjectMenu.svelte';
	import { Plus } from 'lucide-svelte';
	import type { Project } from '$lib/services/project-service';

	export let projects: Project[] = [];
	export let isArchived = false;
	export let showCreateButton = true;
	export let openMenuId: string | null = null;

	const dispatch = createEventDispatcher<{
		projectClick: { project: Project };
		projectEdit: { project: Project };
		projectShare: { project: Project };
		projectArchive: { project: Project };
		projectUnarchive: { project: Project };
		projectDelete: { project: Project };
		createClick: void;
		menuToggle: { projectId: string };
	}>();

	function handleProjectAction(project: Project, action: string) {
		switch (action) {
			case 'click':
			case 'open':
				dispatch('projectClick', { project });
				break;
			case 'edit':
				dispatch('projectEdit', { project });
				break;
			case 'share':
				dispatch('projectShare', { project });
				break;
			case 'archive':
				dispatch('projectArchive', { project });
				break;
			case 'unarchive':
				dispatch('projectUnarchive', { project });
				break;
			case 'delete':
				dispatch('projectDelete', { project });
				break;
		}
	}

	function handleMenuToggle(projectId: string) {
		dispatch('menuToggle', { projectId });
	}
</script>

<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
	{#each projects as project (project.id)}
		<ProjectCard
			{project}
			{isArchived}
			{openMenuId}
			on:click={() => handleProjectAction(project, 'click')}
			on:menuToggle={() => handleMenuToggle(project.id)}
		>
			<svelte:fragment slot="menu" let:project>
				<ProjectMenu {project} {isArchived} on:action={(e) => handleProjectAction(project, e.detail)} />
			</svelte:fragment>
		</ProjectCard>
	{/each}

	{#if showCreateButton && !isArchived}
		<button
			class="p-6 bg-card rounded-lg border border-dashed hover:border-primary hover:bg-accent transition-all flex flex-col items-center justify-center min-h-[200px] group"
			on:click={() => dispatch('createClick')}
		>
			<div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
				<Plus class="h-6 w-6 text-primary" />
			</div>
			<span class="font-medium">Create Project</span>
			<span class="text-xs text-muted-foreground mt-1">Start a new project</span>
		</button>
	{/if}
</div>

