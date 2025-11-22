<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import ProjectHeader from '$lib/components/projects/ProjectHeader.svelte';
	import ProjectInfo from '$lib/components/projects/ProjectInfo.svelte';
	import ProjectOverview from '$lib/components/projects/ProjectOverview.svelte';
	import ProjectMembers from '$lib/components/projects/ProjectMembers.svelte';
	import ProjectActivity from '$lib/components/projects/ProjectActivity.svelte';
	import ProjectModal from '$lib/components/projects/ProjectModal.svelte';
	import { projectStore } from '$lib/stores/project-store';
	import { ProjectService, type Project } from '$lib/services/project-service';
	import { toast } from 'svelte-sonner';
	import { log } from '$lib/logger';

	export const data = $page.data;

	let project: Project | null = null;
	let loading = true;
	let showSettingsModal = false;

	onMount(async () => {
		await loadProject();
	});

	async function loadProject() {
		try {
			project = await ProjectService.getById(data.projectId);
		} catch (error: any) {
			log.error('Load project error', error instanceof Error ? error : new Error(String(error)), { projectId: data.projectId });
			if (error.status === 404) {
				toast.error('Project not found');
			} else {
				toast.error('Failed to load project');
			}
			goto('/workspace/projects');
		} finally {
			loading = false;
		}
	}

	async function handleArchive() {
		if (!project) return;
		if (!confirm('Are you sure you want to archive this project?')) return;
		await projectStore.archiveProject(project.id);
		project = await ProjectService.getById(project.id);
		toast.success('Project archived successfully');
	}

	async function handleUnarchive() {
		if (!project) return;
		await projectStore.unarchiveProject(project.id);
		project = await ProjectService.getById(project.id);
		toast.success('Project restored successfully');
	}

	async function handleSettings() {
		showSettingsModal = true;
	}

	async function handleSaveSettings(event: CustomEvent<{ data: Parameters<typeof projectStore.updateProject>[1] }>) {
		if (!project) return;
		await projectStore.updateProject(project.id, event.detail.data);
		project = await ProjectService.getById(project.id);
			showSettingsModal = false;
		toast.success('Project settings updated successfully');
	}

	function handleShare() {
		toast.info('Share functionality coming soon');
	}
</script>

<svelte:head>
	<title>{project ? `${project.name} - Projects` : 'Project - Kollab'}</title>
</svelte:head>

{#if loading}
	<div class="flex-1 flex flex-col h-screen overflow-hidden">
		<div class="border-b bg-background p-4">
			<div class="flex items-center justify-between mb-4">
				<div class="flex items-center gap-4">
					<Skeleton class="h-9 w-24" />
					<div class="space-y-2">
						<Skeleton class="h-7 w-48" />
						<Skeleton class="h-4 w-64" />
					</div>
				</div>
				<div class="flex gap-2">
					<Skeleton class="h-9 w-20" />
					<Skeleton class="h-9 w-9" />
				</div>
			</div>
			</div>
		<div class="flex-1 overflow-auto p-6">
			<div class="max-w-6xl mx-auto space-y-6">
				<Skeleton class="h-48 w-full" />
				<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
					<Skeleton class="h-64 w-full" />
					<Skeleton class="h-64 w-full" />
		</div>
			</div>
		</div>
	</div>
{:else if project}
	<div class="flex-1 flex flex-col h-screen overflow-hidden">
		<ProjectHeader
			{project}
			on:settings={handleSettings}
			on:share={handleShare}
			on:archive={handleArchive}
			on:unarchive={handleUnarchive}
		/>

		<div class="flex-1 overflow-auto p-6">
				<div class="max-w-6xl mx-auto space-y-6">
				<ProjectOverview {project} />

					<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
					<div class="lg:col-span-2 space-y-6">
						<ProjectInfo {project} />
						<ProjectMembers {project} />
										</div>
						<div class="lg:col-span-1">
						<ProjectActivity {project} />
										</div>
																</div>
															</div>
															</div>
														</div>
																{/if}

{#if showSettingsModal && project}
	<ProjectModal
		project={project}
		open={showSettingsModal}
		on:close={() => showSettingsModal = false}
		on:save={handleSaveSettings}
	/>
{/if}
