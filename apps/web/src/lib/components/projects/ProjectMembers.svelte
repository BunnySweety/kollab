<script lang="ts">
	import { onMount } from 'svelte';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { UserPlus, User, X, Search, Mail } from 'lucide-svelte';
	import { api, endpoints } from '$lib/api-client';
	import { toast } from 'svelte-sonner';
	import type { Project } from '$lib/services/project-service';
	import { log } from '$lib/logger';

	export let project: Project;

	let workspaceMembers: any[] = [];
	let loading = false;
	let showInviteModal = false;
	let userSearchQuery = '';
	let searchResults: any[] = [];
	let selectedUsers: any[] = [];
	let searching = false;

	onMount(async () => {
		await loadMembers();
	});

	async function loadMembers() {
		loading = true;
		try {
			const result = await api.get(endpoints.workspaces.members(project.workspaceId));
			workspaceMembers = result.members || [];
		} catch (error) {
			log.error('Load members error', error instanceof Error ? error : new Error(String(error)), { projectId: project.id, workspaceId: project.workspaceId });
			toast.error('Failed to load members');
		} finally {
			loading = false;
		}
	}

	async function searchUsers() {
		if (userSearchQuery.trim().length < 2) {
			searchResults = [];
			return;
		}

		searching = true;
		try {
			const result = await api.get(`/api/workspaces/${project.workspaceId}/search-users`, {
				params: { q: userSearchQuery }
			});
			searchResults = result.users || [];
		} catch (error) {
			log.error('Search users error', error instanceof Error ? error : new Error(String(error)), { workspaceId: project.workspaceId, query: userSearchQuery });
			searchResults = [];
		} finally {
			searching = false;
		}
	}

	function addUser(user: any) {
		if (!selectedUsers.find((u) => u.id === user.id)) {
			selectedUsers = [...selectedUsers, user];
		}
		userSearchQuery = '';
		searchResults = [];
	}

	function removeUser(userId: string) {
		selectedUsers = selectedUsers.filter((u) => u.id !== userId);
	}

	async function inviteUsers() {
		if (selectedUsers.length === 0) {
			toast.error('Please select at least one user');
			return;
		}

		try {
			await api.post(endpoints.workspaces.invite(project.workspaceId), {
				userIds: selectedUsers.map((u) => u.id),
				role: 'viewer'
			});

			toast.success(`${selectedUsers.length} user(s) invited successfully`);
			selectedUsers = [];
			showInviteModal = false;
			await loadMembers();
		} catch (error: any) {
			log.error('Invite users error', error instanceof Error ? error : new Error(String(error)), { projectId: project.id, workspaceId: project.workspaceId, userIds: selectedUsers.map(u => u.id) });
			toast.error(error?.message || 'Failed to invite users');
		}
	}

	async function removeMember(member: any) {
		if (!confirm(`Remove ${member.name || member.email} from workspace?`)) return;

		try {
			await api.delete(`/api/workspaces/${project.workspaceId}/members/${member.userId}`);
			toast.success('Member removed successfully');
			await loadMembers();
		} catch (error) {
			log.error('Remove member error', error instanceof Error ? error : new Error(String(error)), { projectId: project.id, memberId: member.userId });
			toast.error('Failed to remove member');
		}
	}

	function getRoleColor(role: string) {
		switch (role) {
			case 'owner':
				return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
			case 'admin':
				return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
			case 'editor':
				return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
			default:
				return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
		}
	}
</script>

<Card>
	<CardHeader>
		<div class="flex items-center justify-between">
			<div>
				<CardTitle>Workspace Members</CardTitle>
				<CardDescription>All workspace members have access to this project</CardDescription>
			</div>
			<Button size="sm" on:click={() => showInviteModal = true}>
				<UserPlus class="h-4 w-4 mr-2" />
				Invite
			</Button>
		</div>
	</CardHeader>
	<CardContent>
		{#if loading}
			<div class="text-center py-8">
				<div class="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-current border-r-transparent"></div>
			</div>
		{:else if workspaceMembers.length === 0}
			<div class="text-center py-8">
				<div class="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
					<User class="h-8 w-8 text-muted-foreground" />
				</div>
				<p class="text-sm font-medium mb-1">No members yet</p>
				<p class="text-xs text-muted-foreground mb-4">Invite team members to collaborate</p>
				<Button size="sm" on:click={() => showInviteModal = true}>
					<UserPlus class="h-4 w-4 mr-2" />
					Invite Members
				</Button>
			</div>
		{:else}
			<div class="space-y-2">
				{#each workspaceMembers as member}
					<div class="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
						<div class="flex items-center gap-3 flex-1 min-w-0">
							<div class="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
								<User class="h-5 w-5 text-primary" />
							</div>
							<div class="flex-1 min-w-0">
								<p class="font-medium text-sm truncate">{member.name || member.email}</p>
								<p class="text-xs text-muted-foreground truncate">{member.email}</p>
							</div>
						</div>
						<div class="flex items-center gap-2 flex-shrink-0">
							<span class="text-xs px-2.5 py-1 rounded-full font-medium capitalize {getRoleColor(member.role)}">
								{member.role}
							</span>
							{#if member.role !== 'owner'}
								<button
									on:click={() => removeMember(member)}
									class="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
									title="Remove from workspace"
								>
									<X class="h-4 w-4" />
								</button>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</CardContent>
</Card>

{#if showInviteModal}
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div
		class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
		on:click={() => showInviteModal = false}
		on:keydown={(e) => e.key === 'Escape' && (showInviteModal = false)}
	>
		<div
			class="bg-background rounded-lg shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
			role="dialog"
			aria-modal="true"
			aria-labelledby="invite-users-title"
			on:click|stopPropagation
		>
			<div class="sticky top-0 bg-background border-b px-6 py-4 flex items-center justify-between">
				<h2 id="invite-users-title" class="text-2xl font-bold">Invite Users</h2>
				<button
					on:click={() => showInviteModal = false}
					class="p-2 hover:bg-accent rounded-lg transition-colors"
					aria-label="Close"
				>
					<X class="h-5 w-5" />
				</button>
			</div>

			<div class="p-6 space-y-6">
				<div class="space-y-2">
					<Label for="search-users" class="text-sm font-semibold">Search Users</Label>
					<div class="relative">
						<Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
						<Input
							id="search-users"
							type="text"
							class="pl-10"
							placeholder="Search by email..."
							bind:value={userSearchQuery}
							on:input={searchUsers}
						/>
					</div>
					<p class="text-xs text-muted-foreground">Type at least 2 characters to search</p>
				</div>

				{#if searching}
					<div class="text-center py-4">
						<div class="inline-block h-5 w-5 animate-spin rounded-full border-2 border-solid border-current border-r-transparent"></div>
					</div>
				{:else if searchResults.length > 0}
					<div class="space-y-2">
						<Label class="text-sm font-semibold">Search Results</Label>
						<div class="space-y-1 max-h-48 overflow-y-auto border rounded-lg p-2">
							{#each searchResults as user}
								<button
									class="w-full text-left px-3 py-2 hover:bg-accent rounded transition-colors flex items-center gap-3"
									on:click={() => addUser(user)}
								>
									<div class="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
										<Mail class="h-4 w-4 text-primary" />
									</div>
									<div class="flex-1 min-w-0">
										<p class="font-medium text-sm truncate">{user.name || 'No name'}</p>
										<p class="text-xs text-muted-foreground truncate">{user.email}</p>
									</div>
								</button>
							{/each}
						</div>
					</div>
				{/if}

				{#if selectedUsers.length > 0}
					<div class="space-y-2">
						<Label class="text-sm font-semibold">Selected Users ({selectedUsers.length})</Label>
						<div class="space-y-2 border rounded-lg p-3">
							{#each selectedUsers as user}
								<div class="flex items-center justify-between p-2 bg-accent rounded-lg">
									<div class="flex items-center gap-2 flex-1 min-w-0">
										<div class="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
											<User class="h-4 w-4 text-primary" />
										</div>
										<div class="flex-1 min-w-0">
											<p class="text-sm font-medium truncate">{user.name || user.email}</p>
											{#if user.name}
												<p class="text-xs text-muted-foreground truncate">{user.email}</p>
											{/if}
										</div>
									</div>
									<button
										on:click={() => removeUser(user.id)}
										class="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors flex-shrink-0"
									>
										<X class="h-4 w-4" />
									</button>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<div class="flex gap-3 pt-4 border-t">
					<Button variant="outline" class="flex-1" on:click={() => showInviteModal = false}>
						Cancel
					</Button>
					<Button class="flex-1" on:click={inviteUsers} disabled={selectedUsers.length === 0}>
						<UserPlus class="h-4 w-4 mr-2" />
						Invite {selectedUsers.length > 0 ? `${selectedUsers.length} user(s)` : ''}
					</Button>
				</div>
			</div>
		</div>
	</div>
{/if}
