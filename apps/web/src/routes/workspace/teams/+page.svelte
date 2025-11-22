<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Card } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Badge } from '$lib/components/ui/badge';
	import { Plus, Users, X, Edit, Trash2, MoreVertical, UserPlus, UserMinus, Crown } from 'lucide-svelte';
	import { TeamService, type Team, type TeamMember, type CreateTeamData, type UpdateTeamData } from '$lib/services/team-service';
	import { workspaceStore, currentWorkspaceId } from '$lib/stores/workspace';
	import { toast } from 'svelte-sonner';
	import { api, endpoints } from '$lib/api-client';
	import { log } from '$lib/logger';

	export let data: any;

	let teams: Team[] = [];
	let loading = true;
	let showCreateModal = false;
	let showEditModal = false;
	let showAddMemberModal = false;
	let showDeleteTeamModal = false;
	let showRemoveMemberModal = false;
	let showUpdateRoleModal = false;
	let editingTeam: Team | null = null;
	let selectedTeam: Team | null = null;
	let teamToDelete: Team | null = null;
	let memberToRemove: { team: Team; userId: string; memberName: string } | null = null;
	let memberToUpdateRole: { team: Team; userId: string; currentRole: 'leader' | 'member'; memberName: string } | null = null;
	let newRole: 'leader' | 'member' = 'member';
	let openMenuId: string | null = null;

	// Form data
	let newTeamName = '';
	let newTeamDescription = '';
	let newTeamColor = '#3B82F6';
	let editTeamName = '';
	let editTeamDescription = '';
	let editTeamColor = '';

	// Member management
	let availableMembers: Array<{ id: string; name: string; email: string; avatarUrl: string | null }> = [];
	let selectedMemberId = '';
	let selectedMemberRole: 'leader' | 'member' = 'member';
	let creatingTeam = false;
	let updatingTeam = false;
	let addingMember = false;
	let deletingTeam = false;
	let removingMember = false;
	let updatingRole = false;

	$: currentWorkspace = $currentWorkspaceId;

	onMount(async () => {
		await loadTeams();
		if (currentWorkspace) {
			await loadAvailableMembers();
		}
	});

	$: if (currentWorkspace) {
		loadTeams();
		loadAvailableMembers();
	}

	async function loadTeams() {
		if (!currentWorkspace) {
			teams = [];
			loading = false;
			return;
		}

		loading = true;
		try {
			teams = await TeamService.listByWorkspace(currentWorkspace);
		} catch (error) {
			log.error('Failed to load teams', error, { workspaceId: $currentWorkspaceId });
			toast.error('Failed to load teams');
		} finally {
			loading = false;
		}
	}

	async function loadAvailableMembers() {
		if (!currentWorkspace) return;

		try {
			const result = await api.get(endpoints.workspaces.members(currentWorkspace));
			availableMembers = result.members || [];
		} catch (error) {
			log.error('Failed to load members', error, { teamId: selectedTeamId });
		}
	}

	async function createTeam() {
		if (!currentWorkspace || !newTeamName.trim()) {
			toast.error('Please enter a team name');
			return;
		}

		creatingTeam = true;
		try {
			const data: CreateTeamData = {
				workspaceId: currentWorkspace,
				name: newTeamName.trim(),
				description: newTeamDescription.trim() || undefined,
				color: newTeamColor
			};

			await TeamService.create(data);
			toast.success('Team created successfully');
			showCreateModal = false;
			newTeamName = '';
			newTeamDescription = '';
			newTeamColor = '#3B82F6';
			await loadTeams();
		} catch (error: any) {
			log.error('Create team error', error, { workspaceId: $currentWorkspaceId });
			toast.error(error?.message || 'Failed to create team');
		} finally {
			creatingTeam = false;
		}
	}

	async function updateTeam() {
		if (!editingTeam || !editTeamName.trim()) {
			return;
		}

		updatingTeam = true;
		try {
			const data: UpdateTeamData = {
				name: editTeamName.trim(),
				description: editTeamDescription.trim() || undefined,
				color: editTeamColor
			};

			await TeamService.update(editingTeam.id, data);
			toast.success('Team updated successfully');
			showEditModal = false;
			editingTeam = null;
			await loadTeams();
		} catch (error: any) {
			log.error('Update team error', error, { teamId: editingTeam?.id });
			toast.error(error?.message || 'Failed to update team');
		} finally {
			updatingTeam = false;
		}
	}

	function openDeleteTeamModal(team: Team) {
		teamToDelete = team;
		showDeleteTeamModal = true;
		openMenuId = null;
	}

	async function deleteTeam() {
		if (!teamToDelete) return;

		deletingTeam = true;
		try {
			await TeamService.delete(teamToDelete.id);
			toast.success('Team deleted successfully');
			showDeleteTeamModal = false;
			teamToDelete = null;
			await loadTeams();
		} catch (error: any) {
			log.error('Delete team error', error, { teamId: teamToDelete?.id });
			toast.error(error?.message || 'Failed to delete team');
		} finally {
			deletingTeam = false;
		}
	}

	async function openEditModal(team: Team) {
		openMenuId = null;
		await tick();
		editingTeam = team;
		editTeamName = team.name;
		editTeamDescription = team.description || '';
		editTeamColor = team.color || '#3B82F6';
		showEditModal = true;
	}

	function openAddMemberModal(team: Team) {
		selectedTeam = team;
		selectedMemberId = '';
		selectedMemberRole = 'member';
		showAddMemberModal = true;
		openMenuId = null;
	}

	async function addMember() {
		if (!selectedTeam || !selectedMemberId) {
			toast.error('Please select a member');
			return;
		}

		addingMember = true;
		try {
			await TeamService.addMember(selectedTeam.id, {
				userId: selectedMemberId,
				role: selectedMemberRole
			});
			toast.success('Member added successfully');
			showAddMemberModal = false;
			selectedTeam = null;
			await loadTeams();
		} catch (error: any) {
			log.error('Add member error', error, { teamId: selectedTeamId, userId: newMemberId });
			toast.error(error?.message || 'Failed to add member');
		} finally {
			addingMember = false;
		}
	}

	function openRemoveMemberModal(team: Team, userId: string) {
		const member = team.members?.find(m => m.userId === userId);
		if (!member) return;
		memberToRemove = {
			team,
			userId,
			memberName: member.name
		};
		showRemoveMemberModal = true;
	}

	async function removeMember() {
		if (!memberToRemove) return;

		removingMember = true;
		try {
			await TeamService.removeMember(memberToRemove.team.id, memberToRemove.userId);
			toast.success('Member removed successfully');
			showRemoveMemberModal = false;
			memberToRemove = null;
			await loadTeams();
		} catch (error: any) {
			log.error('Remove member error', error, { teamId: memberToRemove?.team.id, userId: memberToRemove?.userId });
			toast.error(error?.message || 'Failed to remove member');
		} finally {
			removingMember = false;
		}
	}

	function openUpdateRoleModal(team: Team, userId: string) {
		const member = team.members?.find(m => m.userId === userId);
		if (!member) return;
		memberToUpdateRole = {
			team,
			userId,
			currentRole: member.role,
			memberName: member.name
		};
		newRole = member.role;
		showUpdateRoleModal = true;
	}

	async function updateMemberRole() {
		if (!memberToUpdateRole) return;

		updatingRole = true;
		try {
			await TeamService.updateMemberRole(memberToUpdateRole.team.id, memberToUpdateRole.userId, newRole);
			toast.success('Member role updated successfully');
			showUpdateRoleModal = false;
			memberToUpdateRole = null;
			await loadTeams();
		} catch (error: any) {
			log.error('Update member role error', error, { teamId: memberToUpdateRole?.team.id, userId: memberToUpdateRole?.userId, role: newRole });
			toast.error(error?.message || 'Failed to update member role');
		} finally {
			updatingRole = false;
		}
	}

	function getAvailableMembersForTeam(team: Team) {
		const teamMemberIds = new Set(team.members?.map(m => m.userId) || []);
		return availableMembers.filter(m => !teamMemberIds.has(m.id));
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		// Ne pas fermer si on clique sur le menu ou ses enfants
		if (target.closest('[data-menu]')) {
			return;
		}
		// Ne pas fermer si on clique sur le bouton qui ouvre le menu
		if (target.closest('button[data-menu-button]')) {
			return;
		}
		openMenuId = null;
	}
</script>

<svelte:head>
	<title>Teams - Kollab</title>
</svelte:head>

<svelte:window on:click={handleClickOutside} />

<div class="flex-1 p-6">
	<div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Teams</h1>
			<p class="mt-1 text-sm text-muted-foreground">Organize and manage your workspace teams and members</p>
		</div>
		<Button 
			on:click={() => { showCreateModal = true; newTeamName = ''; newTeamDescription = ''; newTeamColor = '#3B82F6'; }}
			class="w-full sm:w-auto"
		>
			<Plus class="mr-2 h-4 w-4" />
			New Team
		</Button>
	</div>

	{#if loading}
		<div class="flex items-center justify-center py-20">
			<div class="text-center">
				<div class="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
				<p class="mt-4 text-sm text-muted-foreground">Loading teams...</p>
			</div>
		</div>
	{:else if teams.length === 0}
		<Card class="p-16 text-center">
			<div class="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
				<Users class="h-10 w-10 text-primary" />
			</div>
			<h3 class="mb-2 text-xl font-semibold">No teams yet</h3>
			<p class="mb-6 text-sm text-muted-foreground">Create your first team to organize your workspace members and collaborate effectively</p>
			<Button on:click={() => { showCreateModal = true; }}>
				<Plus class="mr-2 h-4 w-4" />
				Create Team
			</Button>
		</Card>
	{:else}
		<div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
			{#each teams as team}
				<Card class="group relative overflow-hidden border-2 transition-all duration-200 hover:border-primary/50 hover:shadow-lg">
					<!-- Color accent bar -->
					<div
						class="absolute left-0 top-0 h-1 w-full"
						style="background-color: {team.color || '#3B82F6'}"
					></div>
					
					<div class="p-6">
						<div class="mb-5 flex items-start justify-between">
							<div class="flex-1 min-w-0">
								<div class="mb-2 flex items-center gap-3">
									<div
										class="h-4 w-4 shrink-0 rounded-full ring-2 ring-background"
										style="background-color: {team.color || '#3B82F6'}"
									></div>
									<h3 class="truncate text-lg font-semibold">{team.name}</h3>
								</div>
								{#if team.description}
									<p class="line-clamp-2 text-sm text-muted-foreground">{team.description}</p>
								{/if}
							</div>
							<div class="relative ml-2 shrink-0">
								<Button
									data-menu-button
									variant="ghost"
									size="icon"
									class="h-8 w-8"
									on:click={(e) => {
										e.stopPropagation();
										openMenuId = openMenuId === team.id ? null : team.id;
									}}
								>
									<MoreVertical class="h-4 w-4" />
								</Button>
								{#if openMenuId === team.id}
									<div
										data-menu
										class="absolute right-0 top-10 z-20 w-48 animate-in fade-in-0 zoom-in-95 rounded-md border bg-background shadow-lg"
										on:click|stopPropagation
									>
										<button
											class="flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-accent"
											on:click={() => {
												openEditModal(team);
											}}
										>
											<Edit class="h-4 w-4" />
											Edit
										</button>
										<button
											class="flex w-full items-center gap-2 px-4 py-2 text-sm text-destructive transition-colors hover:bg-accent"
											on:click={() => {
												openDeleteTeamModal(team);
											}}
										>
											<Trash2 class="h-4 w-4" />
											Delete
										</button>
									</div>
								{/if}
							</div>
						</div>

						<div class="space-y-4">
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2">
									<Users class="h-4 w-4 text-muted-foreground" />
									<span class="text-sm font-medium">Members</span>
									<Badge variant="secondary" class="ml-1">
										{team.members?.length || 0}
									</Badge>
								</div>
								<Button
									variant="ghost"
									size="sm"
									class="h-8"
									on:click={() => openAddMemberModal(team)}
									disabled={getAvailableMembersForTeam(team).length === 0}
								>
									<UserPlus class="mr-1 h-3 w-3" />
									Add
								</Button>
							</div>
							<div class="space-y-2">
								{#if team.members && team.members.length > 0}
									{#each team.members as member}
										<div class="group/member flex items-center justify-between rounded-lg border bg-card p-3 transition-all hover:border-primary/50 hover:shadow-sm">
											<div class="flex min-w-0 flex-1 items-center gap-3">
												{#if member.avatarUrl}
													<img 
														src={member.avatarUrl} 
														alt={member.name} 
														class="h-10 w-10 shrink-0 rounded-full ring-2 ring-background" 
													/>
												{:else}
													<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/10 ring-2 ring-background text-sm font-semibold">
														{member.name.charAt(0).toUpperCase()}
													</div>
												{/if}
												<div class="min-w-0 flex-1">
													<div class="flex items-center gap-1.5">
														<span class="truncate text-sm font-medium">{member.name}</span>
														{#if member.role === 'leader'}
															<Crown class="h-3.5 w-3.5 shrink-0 text-yellow-500" />
														{/if}
													</div>
													<p class="truncate text-xs text-muted-foreground">{member.email}</p>
												</div>
											</div>
											<div class="ml-2 flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/member:opacity-100">
												<Badge variant={member.role === 'leader' ? 'default' : 'secondary'} class="text-xs">
													{member.role}
												</Badge>
												<Button
													variant="ghost"
													size="icon"
													class="h-8 w-8"
													on:click={() => openUpdateRoleModal(team, member.userId)}
													title="Update role"
												>
													<Crown class="h-3.5 w-3.5" />
												</Button>
												<Button
													variant="ghost"
													size="icon"
													class="h-8 w-8 text-destructive hover:text-destructive"
													on:click={() => openRemoveMemberModal(team, member.userId)}
													title="Remove member"
												>
													<UserMinus class="h-3.5 w-3.5" />
												</Button>
											</div>
										</div>
									{/each}
								{:else}
									<div class="rounded-lg border border-dashed p-6 text-center">
										<Users class="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
										<p class="text-sm text-muted-foreground">No members yet</p>
										<Button
											variant="ghost"
											size="sm"
											class="mt-2"
											on:click={() => openAddMemberModal(team)}
											disabled={getAvailableMembersForTeam(team).length === 0}
										>
											<UserPlus class="mr-1 h-3 w-3" />
											Add first member
										</Button>
									</div>
								{/if}
							</div>
						</div>
					</div>
				</Card>
			{/each}
		</div>
	{/if}
</div>

<!-- Create Team Modal -->
{#if showCreateModal}
	<div
		class="fixed inset-0 z-[50] flex items-center justify-center bg-black/50"
		on:click={() => { showCreateModal = false; }}
		on:keydown={(e) => e.key === 'Escape' && (showCreateModal = false)}
		role="button"
		tabindex="-1"
		aria-label="Close modal"
	>
		<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
		<div
			class="w-full max-w-md rounded-lg bg-background p-6 shadow-lg"
			on:click|stopPropagation
			role="dialog"
			aria-modal="true"
			aria-labelledby="create-team-title"
			on:keydown={(e) => e.key === 'Escape' && (showCreateModal = false)}
		>
			<div class="mb-4 flex items-center justify-between">
				<h2 id="create-team-title" class="text-xl font-semibold">Create New Team</h2>
				<Button
					variant="ghost"
					size="icon"
					on:click={() => { showCreateModal = false; }}
					disabled={creatingTeam}
				>
					<X class="h-4 w-4" />
				</Button>
			</div>

			<div class="space-y-4">
				<div>
					<Label for="team-name">Team Name *</Label>
					<Input
						id="team-name"
						bind:value={newTeamName}
						placeholder="Enter team name"
						disabled={creatingTeam}
						autofocus
					/>
				</div>

				<div>
					<Label for="team-description">Description</Label>
					<Textarea
						id="team-description"
						bind:value={newTeamDescription}
						placeholder="Enter team description (optional)"
						disabled={creatingTeam}
						rows={3}
					/>
				</div>

				<div>
					<Label for="team-color">Color</Label>
					<Input
						id="team-color"
						type="color"
						bind:value={newTeamColor}
						disabled={creatingTeam}
						class="h-10 w-full"
					/>
				</div>
			</div>

			<div class="mt-6 flex gap-2 justify-end">
				<Button
					variant="outline"
					on:click={() => { showCreateModal = false; }}
					disabled={creatingTeam}
				>
					Cancel
				</Button>
				<Button on:click={createTeam} disabled={creatingTeam || !newTeamName.trim()}>
					{#if creatingTeam}
						Creating...
					{:else}
						<Plus class="mr-2 h-4 w-4" />
						Create
					{/if}
				</Button>
			</div>
		</div>
	</div>
{/if}

<!-- Edit Team Modal -->
{#if showEditModal && editingTeam}
	<div
		class="fixed inset-0 z-[50] flex items-center justify-center bg-black/50"
		on:click={() => { showEditModal = false; editingTeam = null; }}
		on:keydown={(e) => e.key === 'Escape' && (showEditModal = false) && (editingTeam = null)}
		role="button"
		tabindex="-1"
		aria-label="Close modal"
	>
		<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
		<div
			class="w-full max-w-md rounded-lg bg-background p-6 shadow-lg"
			on:click|stopPropagation
			role="dialog"
			aria-modal="true"
			aria-labelledby="edit-team-title"
			on:keydown={(e) => e.key === 'Escape' && (showEditModal = false) && (editingTeam = null)}
		>
			<div class="mb-4 flex items-center justify-between">
				<h2 id="edit-team-title" class="text-xl font-semibold">Edit Team</h2>
				<Button
					variant="ghost"
					size="icon"
					on:click={() => { showEditModal = false; editingTeam = null; }}
					disabled={updatingTeam}
				>
					<X class="h-4 w-4" />
				</Button>
			</div>

			<div class="space-y-4">
				<div>
					<Label for="edit-team-name">Team Name *</Label>
					<Input
						id="edit-team-name"
						bind:value={editTeamName}
						placeholder="Enter team name"
						disabled={updatingTeam}
						autofocus
					/>
				</div>

				<div>
					<Label for="edit-team-description">Description</Label>
					<Textarea
						id="edit-team-description"
						bind:value={editTeamDescription}
						placeholder="Enter team description (optional)"
						disabled={updatingTeam}
						rows={3}
					/>
				</div>

				<div>
					<Label for="edit-team-color">Color</Label>
					<Input
						id="edit-team-color"
						type="color"
						bind:value={editTeamColor}
						disabled={updatingTeam}
						class="h-10 w-full"
					/>
				</div>
			</div>

			<div class="mt-6 flex gap-2 justify-end">
				<Button
					variant="outline"
					on:click={() => { showEditModal = false; editingTeam = null; }}
					disabled={updatingTeam}
				>
					Cancel
				</Button>
				<Button on:click={updateTeam} disabled={updatingTeam || !editTeamName.trim()}>
					{#if updatingTeam}
						Updating...
					{:else}
						<Edit class="mr-2 h-4 w-4" />
						Update
					{/if}
				</Button>
			</div>
		</div>
	</div>
{/if}

<!-- Delete Team Modal -->
{#if showDeleteTeamModal && teamToDelete}
	<div
		class="fixed inset-0 z-[50] flex items-center justify-center bg-black/50"
		on:click={() => { showDeleteTeamModal = false; teamToDelete = null; }}
		on:keydown={(e) => e.key === 'Escape' && (showDeleteTeamModal = false) && (teamToDelete = null)}
		role="button"
		tabindex="-1"
		aria-label="Close modal"
	>
		<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
		<div
			class="w-full max-w-md rounded-lg bg-background p-6 shadow-lg"
			on:click|stopPropagation
			role="dialog"
			aria-modal="true"
			aria-labelledby="delete-team-title"
			on:keydown={(e) => e.key === 'Escape' && (showDeleteTeamModal = false) && (teamToDelete = null)}
		>
			<div class="mb-4 flex items-center justify-between">
				<h2 id="delete-team-title" class="text-xl font-semibold">Delete Team</h2>
				<Button
					variant="ghost"
					size="icon"
					on:click={() => { showDeleteTeamModal = false; teamToDelete = null; }}
					disabled={deletingTeam}
				>
					<X class="h-4 w-4" />
				</Button>
			</div>

			<div class="space-y-4">
				<p class="text-sm text-muted-foreground">
					Are you sure you want to delete <strong>{teamToDelete.name}</strong>? This action cannot be undone.
				</p>
			</div>

			<div class="mt-6 flex gap-2 justify-end">
				<Button
					variant="outline"
					on:click={() => { showDeleteTeamModal = false; teamToDelete = null; }}
					disabled={deletingTeam}
				>
					Cancel
				</Button>
				<Button variant="destructive" on:click={deleteTeam} disabled={deletingTeam}>
					{#if deletingTeam}
						Deleting...
					{:else}
						<Trash2 class="mr-2 h-4 w-4" />
						Delete
					{/if}
				</Button>
			</div>
		</div>
	</div>
{/if}

<!-- Add Member Modal -->
{#if showAddMemberModal && selectedTeam}
	<div
		class="fixed inset-0 z-[50] flex items-center justify-center bg-black/50"
		on:click={() => { showAddMemberModal = false; selectedTeam = null; }}
		on:keydown={(e) => e.key === 'Escape' && (showAddMemberModal = false) && (selectedTeam = null)}
		role="button"
		tabindex="-1"
		aria-label="Close modal"
	>
		<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
		<div
			class="w-full max-w-md rounded-lg bg-background p-6 shadow-lg"
			on:click|stopPropagation
			role="dialog"
			aria-modal="true"
			aria-labelledby="add-member-title"
			on:keydown={(e) => e.key === 'Escape' && (showAddMemberModal = false) && (selectedTeam = null)}
		>
			<div class="mb-4 flex items-center justify-between">
				<h2 id="add-member-title" class="text-xl font-semibold">Add Member to {selectedTeam.name}</h2>
				<Button
					variant="ghost"
					size="icon"
					on:click={() => { showAddMemberModal = false; selectedTeam = null; }}
					disabled={addingMember}
				>
					<X class="h-4 w-4" />
				</Button>
			</div>

			<div class="space-y-4">
				<div>
					<Label for="member-select">Select Member</Label>
					<select
						id="member-select"
						bind:value={selectedMemberId}
						disabled={addingMember}
						class="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
					>
						<option value="">Select a member...</option>
						{#each getAvailableMembersForTeam(selectedTeam) as member}
							<option value={member.id}>{member.name} ({member.email})</option>
						{/each}
					</select>
				</div>

				<div>
					<Label for="member-role">Role</Label>
					<select
						id="member-role"
						bind:value={selectedMemberRole}
						disabled={addingMember}
						class="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
					>
						<option value="member">Member</option>
						<option value="leader">Leader</option>
					</select>
				</div>
			</div>

			<div class="mt-6 flex gap-2 justify-end">
				<Button
					variant="outline"
					on:click={() => { showAddMemberModal = false; selectedTeam = null; }}
					disabled={addingMember}
				>
					Cancel
				</Button>
				<Button on:click={addMember} disabled={addingMember || !selectedMemberId}>
					{#if addingMember}
						Adding...
					{:else}
						<UserPlus class="mr-2 h-4 w-4" />
						Add Member
					{/if}
				</Button>
			</div>
		</div>
	</div>
{/if}

<!-- Remove Member Modal -->
{#if showRemoveMemberModal && memberToRemove}
	<div
		class="fixed inset-0 z-[50] flex items-center justify-center bg-black/50"
		on:click={() => { showRemoveMemberModal = false; memberToRemove = null; }}
		on:keydown={(e) => e.key === 'Escape' && (showRemoveMemberModal = false) && (memberToRemove = null)}
		role="button"
		tabindex="-1"
		aria-label="Close modal"
	>
		<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
		<div
			class="w-full max-w-md rounded-lg bg-background p-6 shadow-lg"
			on:click|stopPropagation
			role="dialog"
			aria-modal="true"
			aria-labelledby="remove-member-title"
			on:keydown={(e) => e.key === 'Escape' && (showRemoveMemberModal = false) && (memberToRemove = null)}
		>
			<div class="mb-4 flex items-center justify-between">
				<h2 id="remove-member-title" class="text-xl font-semibold">Remove Member</h2>
				<Button
					variant="ghost"
					size="icon"
					on:click={() => { showRemoveMemberModal = false; memberToRemove = null; }}
					disabled={removingMember}
				>
					<X class="h-4 w-4" />
				</Button>
			</div>

			<div class="space-y-4">
				<p class="text-sm text-muted-foreground">
					Are you sure you want to remove <strong>{memberToRemove.memberName}</strong> from <strong>{memberToRemove.team.name}</strong>?
				</p>
			</div>

			<div class="mt-6 flex gap-2 justify-end">
				<Button
					variant="outline"
					on:click={() => { showRemoveMemberModal = false; memberToRemove = null; }}
					disabled={removingMember}
				>
					Cancel
				</Button>
				<Button variant="destructive" on:click={removeMember} disabled={removingMember}>
					{#if removingMember}
						Removing...
					{:else}
						<UserMinus class="mr-2 h-4 w-4" />
						Remove
					{/if}
				</Button>
			</div>
		</div>
	</div>
{/if}

<!-- Update Role Modal -->
{#if showUpdateRoleModal && memberToUpdateRole}
	<div
		class="fixed inset-0 z-[50] flex items-center justify-center bg-black/50"
		on:click={() => { showUpdateRoleModal = false; memberToUpdateRole = null; }}
		on:keydown={(e) => e.key === 'Escape' && (showUpdateRoleModal = false) && (memberToUpdateRole = null)}
		role="button"
		tabindex="-1"
		aria-label="Close modal"
	>
		<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
		<div
			class="w-full max-w-md rounded-lg bg-background p-6 shadow-lg"
			on:click|stopPropagation
			role="dialog"
			aria-modal="true"
			aria-labelledby="update-role-title"
			on:keydown={(e) => e.key === 'Escape' && (showUpdateRoleModal = false) && (memberToUpdateRole = null)}
		>
			<div class="mb-4 flex items-center justify-between">
				<h2 id="update-role-title" class="text-xl font-semibold">Update Member Role</h2>
				<Button
					variant="ghost"
					size="icon"
					on:click={() => { showUpdateRoleModal = false; memberToUpdateRole = null; }}
					disabled={updatingRole}
				>
					<X class="h-4 w-4" />
				</Button>
			</div>

			<div class="space-y-4">
				<p class="text-sm text-muted-foreground">
					Update role for <strong>{memberToUpdateRole.memberName}</strong> in <strong>{memberToUpdateRole.team.name}</strong>
				</p>
				<div>
					<Label for="role-select">Role</Label>
					<select
						id="role-select"
						bind:value={newRole}
						disabled={updatingRole}
						class="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
					>
						<option value="member">Member</option>
						<option value="leader">Leader</option>
					</select>
				</div>
			</div>

			<div class="mt-6 flex gap-2 justify-end">
				<Button
					variant="outline"
					on:click={() => { showUpdateRoleModal = false; memberToUpdateRole = null; }}
					disabled={updatingRole}
				>
					Cancel
				</Button>
				<Button on:click={updateMemberRole} disabled={updatingRole}>
					{#if updatingRole}
						Updating...
					{:else}
						<Crown class="mr-2 h-4 w-4" />
						Update Role
					{/if}
				</Button>
			</div>
		</div>
	</div>
{/if}
