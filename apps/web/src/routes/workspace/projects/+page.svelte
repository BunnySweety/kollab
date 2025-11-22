<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Archive, FolderKanban, Plus } from 'lucide-svelte';
	import ProjectGrid from '$lib/components/projects/ProjectGrid.svelte';
	import ProjectModal from '$lib/components/projects/ProjectModal.svelte';
	import { projectStore, activeProjects, archivedProjects, projectsLoading } from '$lib/stores/project-store';
	import { workspaceStore, currentWorkspaceId } from '$lib/stores/workspace';
	import type { Project } from '$lib/services/project-service';

	export let data: any;

	let showCreateModal = false;
	let showEditModal = false;
	let showArchived = false;
	let openMenuId: string | null = null;
	let editingProject: Project | null = null;

	$: currentWorkspace = $currentWorkspaceId;
	$: projects = $activeProjects;
	$: archived = $archivedProjects;
	$: loading = $projectsLoading;
	$: hasArchived = archived.length > 0;

	onMount(async () => {
		await projectStore.loadProjects();
	});

	async function handleCreate(event: CustomEvent<{ data: Parameters<typeof projectStore.createProject>[1] }>) {
		if (!currentWorkspace) {
			return;
		}
		await projectStore.createProject(currentWorkspace, event.detail.data);
		showCreateModal = false;
	}

	async function handleEdit(event: CustomEvent<{ data: Parameters<typeof projectStore.updateProject>[1] }>) {
		if (!editingProject) return;
		await projectStore.updateProject(editingProject.id, event.detail.data);
		showEditModal = false;
		editingProject = null;
	}

	async function handleDelete(project: Project) {
		if (!confirm('Are you sure you want to delete this project?')) return;
		await projectStore.deleteProject(project.id);
	}

	async function handleArchive(project: Project) {
		await projectStore.archiveProject(project.id);
	}

	async function handleUnarchive(project: Project) {
		await projectStore.unarchiveProject(project.id);
	}

	function handleProjectClick(event: CustomEvent<{ project: Project }>) {
		goto(`/workspace/projects/${event.detail.project.id}`);
	}

	function handleProjectEdit(event: CustomEvent<{ project: Project }>) {
		editingProject = event.detail.project;
		showEditModal = true;
		openMenuId = null;
	}

	function handleProjectShare(event: CustomEvent<{ project: Project }>) {
		openMenuId = null;
	}

	function handleProjectArchive(event: CustomEvent<{ project: Project }>) {
		handleArchive(event.detail.project);
	}

	function handleProjectUnarchive(event: CustomEvent<{ project: Project }>) {
		handleUnarchive(event.detail.project);
	}

	function handleProjectDelete(event: CustomEvent<{ project: Project }>) {
		handleDelete(event.detail.project);
	}

	function handleMenuToggle(event: CustomEvent<{ projectId: string }>) {
		openMenuId = openMenuId === event.detail.projectId ? null : event.detail.projectId;
	}

	function handleClickOutside() {
		openMenuId = null;
	}
</script>

<svelte:head>
	<title>Projects - Kollab</title>
</svelte:head>

<svelte:window on:click={handleClickOutside} />

<div class="flex-1 p-6">
	<!-- Header -->
	<div class="mb-6 flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold mb-2">Projects</h1>
			<p class="text-muted-foreground">Organize and manage all your workspace content</p>
		</div>
		<div class="flex items-center gap-2">
			{#if hasArchived}
				<Button variant="outline" on:click={() => showArchived = !showArchived}>
					<Archive class="h-4 w-4 mr-2" />
					{showArchived ? 'Masquer' : 'Afficher'} archivés ({archived.length})
				</Button>
			{/if}
			<Button on:click={() => showCreateModal = true}>
				<Plus class="h-4 w-4 mr-2" />
				New Project
			</Button>
		</div>
	</div>

	{#if loading}
		<div class="flex items-center justify-center py-12">
			<div class="text-center">
				<div class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
				<p class="mt-2 text-sm text-muted-foreground">Loading content...</p>
			</div>
		</div>
	{:else if !currentWorkspace}
		<!-- No Workspace State -->
		<div class="flex flex-col items-center justify-center py-12">
			<div class="w-16 h-16 rounded-full bg-orange-100 dark:bg-orange-900 flex items-center justify-center mb-4">
				<FolderKanban class="h-8 w-8 text-orange-600 dark:text-orange-400" />
			</div>
			<h2 class="text-xl font-semibold mb-2">No Workspace Found</h2>
			<p class="text-muted-foreground text-center mb-6 max-w-md">
				You need to create a workspace before you can create projects. Please create a workspace from the sidebar.
			</p>
		</div>
	{:else if projects.length === 0 && archived.length === 0}
		<!-- Empty State -->
		<div class="flex flex-col items-center justify-center py-12">
			<div class="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
				<FolderKanban class="h-8 w-8 text-primary" />
			</div>
			<h2 class="text-xl font-semibold mb-2">No content yet</h2>
			<p class="text-muted-foreground text-center mb-6 max-w-md">
				Create your first project or document to start organizing your work and collaborate with your team.
			</p>
			<Button on:click={() => showCreateModal = true}>
				<Plus class="h-4 w-4 mr-2" />
				Create Your First Project
			</Button>
		</div>
	{:else}
		<!-- Active Projects -->
		<ProjectGrid
			projects={projects}
			isArchived={false}
			{openMenuId}
			on:projectClick={handleProjectClick}
			on:projectEdit={handleProjectEdit}
			on:projectShare={handleProjectShare}
			on:projectArchive={handleProjectArchive}
			on:projectDelete={handleProjectDelete}
			on:createClick={() => showCreateModal = true}
			on:menuToggle={handleMenuToggle}
		/>

		<!-- Archived Projects -->
		{#if showArchived && archived.length > 0}
			<div class="mt-8 pt-8 border-t">
				<h2 class="text-xl font-semibold mb-4 flex items-center gap-2">
					<Archive class="h-5 w-5 text-muted-foreground" />
					Contenu archivé
				</h2>
				<ProjectGrid
					projects={archived}
					isArchived={true}
					showCreateButton={false}
					{openMenuId}
					on:projectClick={handleProjectClick}
					on:projectEdit={handleProjectEdit}
					on:projectUnarchive={handleProjectUnarchive}
					on:projectDelete={handleProjectDelete}
					on:menuToggle={handleMenuToggle}
				/>
			</div>
		{/if}
	{/if}
</div>

<!-- Create Project Modal -->
<ProjectModal
	open={showCreateModal}
	on:close={() => showCreateModal = false}
	on:save={handleCreate}
/>

<!-- Edit Project Modal -->
{#if editingProject}
	<ProjectModal
		project={editingProject}
		open={showEditModal}
		on:close={() => {
			showEditModal = false;
			editingProject = null;
		}}
		on:save={handleEdit}
	/>
{/if}
