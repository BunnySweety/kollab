<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { X } from 'lucide-svelte';
	import { iconOptions, viewTypes, colorOptions } from '$lib/utils/project-utils';
	import type { Project, CreateProjectData } from '$lib/services/project-service';
	import { TeamService, type Team } from '$lib/services/team-service';
	import { workspaceStore, currentWorkspaceId } from '$lib/stores/workspace';
	import { api, endpoints } from '$lib/api-client';

	export let project: Project | null = null;
	export let open = false;

	let teams: Team[] = [];
	let loadingTeams = false;
	let projectType: 'workspace' | 'personal' | 'teams' = 'workspace';
	let selectedTeamIds: string[] = [];
	let currentUserId: string | null = null;

	const dispatch = createEventDispatcher<{
		close: void;
		save: { data: CreateProjectData };
	}>();

	let formData: CreateProjectData = {
		name: '',
		description: '',
		icon: 'Folder',
		color: '#3B82F6',
		viewType: 'board'
	};

	$: if (open && project) {
		formData = {
			name: project.name,
			description: project.description || '',
			icon: project.icon || 'Folder',
			color: project.color || '#3B82F6',
			viewType: project.viewType
		};
		if (project.userId) {
			projectType = 'personal';
		} else if (project.teamIds && project.teamIds.length > 0) {
			projectType = 'teams';
			selectedTeamIds = project.teamIds;
		} else {
			projectType = 'workspace';
		}
	} else if (open && !project) {
		formData = {
			name: '',
			description: '',
			icon: 'Folder',
			color: '#3B82F6',
			viewType: 'board'
		};
		projectType = 'workspace';
		selectedTeamIds = [];
	}

	$: if (open && $currentWorkspaceId) {
		loadTeams();
		loadCurrentUser();
	}

	async function loadCurrentUser() {
		if (currentUserId) return;
		try {
			const data = await api.get(endpoints.auth.me);
			currentUserId = data.user?.id || null;
		} catch (error) {
			// Silently fail - user ID is optional for project creation
		}
	}

	async function loadTeams() {
		if (!$currentWorkspaceId || loadingTeams) return;
		loadingTeams = true;
		try {
			teams = await TeamService.listByWorkspace($currentWorkspaceId);
		} catch (error) {
			// Error handled by toast in parent component if needed
		} finally {
			loadingTeams = false;
		}
	}

	function handleSubmit() {
		if (!formData.name.trim()) return;
		
		// Validate teams selection
		if (projectType === 'teams' && selectedTeamIds.length === 0) {
			// If teams type is selected but no teams are chosen, treat as workspace project
			projectType = 'workspace';
		}
		
		const submitData: CreateProjectData = { ...formData };
		
		if (projectType === 'personal') {
			submitData.userId = currentUserId;
			submitData.teamIds = undefined;
		} else if (projectType === 'teams') {
			submitData.userId = null;
			submitData.teamIds = selectedTeamIds.length > 0 ? selectedTeamIds : undefined;
		} else {
			submitData.userId = null;
			submitData.teamIds = undefined;
		}
		
		dispatch('save', { data: submitData });
	}

	function toggleTeam(teamId: string) {
		if (selectedTeamIds.includes(teamId)) {
			selectedTeamIds = selectedTeamIds.filter(id => id !== teamId);
		} else {
			selectedTeamIds = [...selectedTeamIds, teamId];
		}
	}

	function handleClose() {
		dispatch('close');
	}
</script>

{#if open}
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div
		class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
		on:click={handleClose}
		on:keydown={(e) => e.key === 'Escape' && handleClose()}
	>
		<div
			class="bg-background rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
			role="dialog"
			aria-modal="true"
			aria-labelledby={project ? 'edit-project-title' : 'create-project-title'}
			on:click|stopPropagation
		>
			<div class="sticky top-0 bg-background border-b px-6 py-4 flex items-center justify-between">
				<h2
					id={project ? 'edit-project-title' : 'create-project-title'}
					class="text-2xl font-bold"
				>
					{project ? 'Project Settings' : 'Create New Project'}
				</h2>
				<button
					on:click={handleClose}
					class="p-2 hover:bg-accent rounded-lg transition-colors"
					aria-label="Close"
				>
					<X class="h-5 w-5" />
				</button>
			</div>

			<form on:submit|preventDefault={handleSubmit} class="p-6 space-y-6">
				<div class="space-y-2">
					<Label for="name" class="text-sm font-semibold">Project Name *</Label>
					<Input
						id="name"
						bind:value={formData.name}
						placeholder="Enter project name"
						required
						class="text-base"
					/>
				</div>

				<div class="space-y-2">
					<Label for="description" class="text-sm font-semibold">Description</Label>
					<Textarea
						id="description"
						bind:value={formData.description}
						placeholder="What is this project about?"
						rows="4"
						class="resize-none"
					/>
				</div>

				<div class="space-y-3">
					<Label class="text-sm font-semibold">Icon</Label>
					<div class="grid grid-cols-6 gap-3">
						{#each iconOptions as iconOption}
							<button
								type="button"
								class="h-12 w-12 rounded-lg flex items-center justify-center transition-all border-2 {formData.icon === iconOption.name
									? 'border-primary bg-primary/10 scale-105'
									: 'border-transparent hover:bg-accent hover:border-accent-foreground/20'}"
								style="{formData.icon === iconOption.name ? `--tw-ring-color: ${formData.color};` : ''}"
								on:click|preventDefault|stopPropagation={() => {
									formData = { ...formData, icon: iconOption.name };
								}}
							>
								<svelte:component
									this={iconOption.component}
									class="h-6 w-6"
									style="color: {formData.icon === iconOption.name ? formData.color : 'currentColor'}"
								/>
							</button>
						{/each}
					</div>
				</div>

				<div class="space-y-3">
					<Label class="text-sm font-semibold">Color</Label>
					<div class="flex flex-wrap gap-3">
						{#each colorOptions as color}
							<button
								type="button"
								class="w-10 h-10 rounded-full transition-all border-2 {formData.color === color
									? 'border-foreground scale-110 ring-2 ring-offset-2'
									: 'border-transparent hover:scale-105 hover:ring-1 hover:ring-offset-1'}"
								style="background-color: {color}; {formData.color === color
									? `--tw-ring-color: ${color};`
									: ''}"
								on:click|preventDefault|stopPropagation={() => {
									formData = { ...formData, color };
								}}
							/>
						{/each}
					</div>
				</div>

				<div class="space-y-3">
					<Label class="text-sm font-semibold">Default View Type</Label>
					<div class="grid grid-cols-5 gap-3">
						{#each viewTypes as view}
							<button
								type="button"
								class="p-4 rounded-lg border-2 flex flex-col items-center gap-2 transition-all {formData.viewType === view.value
									? 'border-primary bg-primary/10'
									: 'border-border hover:bg-accent hover:border-accent-foreground/20'}"
								on:click={() => formData = { ...formData, viewType: view.value }}
							>
								<svelte:component this={view.icon} class="h-5 w-5" />
								<span class="text-xs font-medium">{view.label}</span>
							</button>
						{/each}
					</div>
				</div>

				<div class="space-y-3">
					<Label class="text-sm font-semibold">Project Type</Label>
					<div class="space-y-2">
						<label class="flex items-center gap-2 cursor-pointer">
							<input
								type="radio"
								bind:group={projectType}
								value="workspace"
								class="h-4 w-4"
							/>
							<span class="text-sm">Workspace (Shared with all workspace members)</span>
						</label>
						<label class="flex items-center gap-2 cursor-pointer">
							<input
								type="radio"
								bind:group={projectType}
								value="personal"
								class="h-4 w-4"
							/>
							<span class="text-sm">Personal (Only for me)</span>
						</label>
						<label class="flex items-center gap-2 cursor-pointer">
							<input
								type="radio"
								bind:group={projectType}
								value="teams"
								class="h-4 w-4"
							/>
							<span class="text-sm">Teams (Shared with selected teams)</span>
						</label>
					</div>
				</div>

				{#if projectType === 'teams'}
					<div class="space-y-2">
						<Label class="text-sm font-semibold">Select Teams</Label>
						<div class="max-h-48 overflow-y-auto rounded-md border border-input bg-background p-2">
							{#if teams.length === 0}
								<p class="text-sm text-muted-foreground">No teams available. Create teams first.</p>
							{:else}
								<div class="space-y-2">
									{#each teams as team}
										<label class="flex items-center gap-2 cursor-pointer rounded-md p-2 hover:bg-accent">
											<input
												type="checkbox"
												checked={selectedTeamIds.includes(team.id)}
												on:change={() => toggleTeam(team.id)}
												class="h-4 w-4"
											/>
											<div class="flex items-center gap-2 flex-1">
												<div
													class="h-3 w-3 rounded-full"
													style="background-color: {team.color || '#3B82F6'}"
												></div>
												<span class="text-sm">{team.name}</span>
											</div>
										</label>
									{/each}
								</div>
							{/if}
						</div>
						<p class="text-xs text-muted-foreground">Select one or more teams to share this project with</p>
					</div>
				{/if}

				<div class="flex gap-3 pt-4 border-t">
					<Button type="button" variant="outline" class="flex-1" on:click={handleClose}>
						Cancel
					</Button>
					<Button type="submit" class="flex-1">
						{project ? 'Save Changes' : 'Create Project'}
					</Button>
				</div>
			</form>
		</div>
	</div>
{/if}
