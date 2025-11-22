<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import {
		FileText,
		CheckSquare,
		Calendar,
		Clock,
		TrendingUp,
		Users,
		Plus,
		ArrowRight,
		FolderKanban,
		StickyNote,
		BookOpen,
		Database,
		Search,
		Activity
	} from 'lucide-svelte';
	import { api, endpoints } from '$lib/api-client';
	import { workspaceStore, currentWorkspaceId } from '$lib/stores/workspace';
	import { toast } from 'svelte-sonner';
	import { log } from '$lib/logger';

	// Accept SvelteKit props to avoid warnings
	export let data: any;

	let loading = true;
	let recentDocuments: any[] = [];
	let recentTasks: any[] = [];
	let stats = {
		totalDocuments: 0,
		totalTasks: 0,
		completedTasks: 0,
		activeProjects: 0,
		activeCollaborators: 0
	};

	$: currentWorkspace = $workspaceStore.currentWorkspace;
	$: workspaceId = $currentWorkspaceId || currentWorkspace?.id;

	onMount(async () => {
		if (workspaceId) {
			await loadDashboardData();
		}
	});

	$: if (workspaceId) {
		loadDashboardData();
	}

	async function loadDashboardData() {
		if (!workspaceId) {
			loading = false;
			return;
		}

		loading = true;
		try {
			await Promise.all([
				loadDocuments(),
				loadTasks(),
				loadStats()
			]);
		} catch (error) {
			log.error('Failed to load dashboard data', error, { workspaceId });
			toast.error('Failed to load dashboard data');
		} finally {
			loading = false;
		}
	}

	async function loadDocuments() {
		if (!workspaceId) return;

		try {
			const response = await api.get(endpoints.documents.listByWorkspace(workspaceId));
			const allDocuments = response.documents || [];
			
			// Sort by updatedAt descending and take the 5 most recent
			recentDocuments = allDocuments
				.sort((a: any, b: any) => {
					const dateA = new Date(a.updatedAt || a.createdAt).getTime();
					const dateB = new Date(b.updatedAt || b.createdAt).getTime();
					return dateB - dateA;
				})
				.slice(0, 5);

			stats.totalDocuments = allDocuments.length;
		} catch (error) {
			log.error('Failed to load documents', error, { workspaceId });
			recentDocuments = [];
		}
	}

	async function loadTasks() {
		if (!workspaceId) return;

		try {
			const response = await api.get(endpoints.tasks.listByWorkspace(workspaceId), {
				params: { limit: 10 }
			});
			const allTasks = response.tasks || [];
			
			// Filter out completed tasks and sort by updatedAt
			recentTasks = allTasks
				.filter((task: any) => task.status !== 'done' && task.status !== 'cancelled')
				.sort((a: any, b: any) => {
					const dateA = new Date(a.updatedAt || a.createdAt).getTime();
					const dateB = new Date(b.updatedAt || b.createdAt).getTime();
					return dateB - dateA;
				})
				.slice(0, 5);

			// Calculate task statistics
			stats.totalTasks = allTasks.length;
			stats.completedTasks = allTasks.filter((task: any) => task.status === 'done').length;
		} catch (error) {
			log.error('Failed to load tasks', error, { workspaceId });
			recentTasks = [];
		}
	}

	async function loadStats() {
		if (!workspaceId) return;

		try {
			// Load projects count
			const projectsResponse = await api.get(endpoints.projects.listByWorkspace(workspaceId));
			const projects = projectsResponse.projects || [];
			stats.activeProjects = projects.filter((p: any) => !p.isArchived).length;

			// Load workspace members count
			const membersResponse = await api.get(endpoints.workspaces.members(workspaceId));
			const members = membersResponse.members || [];
			stats.activeCollaborators = members.length;
		} catch (error) {
			log.error('Failed to load stats', error, { workspaceId });
		}
	}

	function formatDate(date: Date | string) {
		const dateObj = typeof date === 'string' ? new Date(date) : date;
		const now = new Date();
		const diff = now.getTime() - dateObj.getTime();
		const hours = Math.floor(diff / (1000 * 60 * 60));

		if (hours < 1) return 'Just now';
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		if (days < 7) return `${days}d ago`;
		return dateObj.toLocaleDateString();
	}

	function getPriorityColor(priority: string) {
		switch (priority) {
			case 'urgent':
				return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300';
			case 'high':
				return 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300';
			case 'medium':
				return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300';
			case 'low':
				return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
			default:
				return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
		}
	}

	function getStatusColor(status: string) {
		switch (status) {
			case 'done':
				return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
			case 'in_progress':
				return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
			case 'todo':
				return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
			case 'cancelled':
				return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300';
			default:
				return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
		}
	}

	const completionRate = stats.totalTasks > 0
		? Math.round((stats.completedTasks / stats.totalTasks) * 100)
		: 0;
</script>

<svelte:head>
	<title>{currentWorkspace?.name || 'Workspace'} - Kollab</title>
</svelte:head>

<div class="container mx-auto max-w-7xl p-6">
	{#if loading}
		<div class="flex h-96 items-center justify-center">
			<div class="text-center">
				<Activity class="mx-auto mb-4 h-12 w-12 animate-pulse text-muted-foreground" />
				<p class="text-muted-foreground">Loading dashboard...</p>
			</div>
		</div>
	{:else if !workspaceId}
		<div class="flex h-96 items-center justify-center">
			<div class="text-center">
				<FolderKanban class="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
				<h3 class="mb-2 text-xl font-semibold">No workspace selected</h3>
				<p class="mb-4 text-sm text-muted-foreground">Please select a workspace to view the dashboard</p>
			</div>
		</div>
	{:else}
		<!-- Welcome section -->
		<div class="mb-8">
			<h1 class="text-3xl font-bold">
				Welcome to {currentWorkspace?.name || 'Workspace'}
			</h1>
			<p class="text-muted-foreground">
				Here's what's happening in your workspace today.
			</p>
		</div>

		<!-- Stats cards -->
		<div class="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
			<Card>
				<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle class="text-sm font-medium">Total Documents</CardTitle>
					<FileText class="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold">{stats.totalDocuments}</div>
					<p class="text-xs text-muted-foreground">
						{#if recentDocuments.length > 0}
							{recentDocuments.length} recently updated
						{:else}
							No documents yet
						{/if}
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle class="text-sm font-medium">Active Tasks</CardTitle>
					<CheckSquare class="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold">{stats.totalTasks - stats.completedTasks}</div>
					<p class="text-xs text-muted-foreground">
						{stats.completedTasks} completed of {stats.totalTasks} total
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle class="text-sm font-medium">Completion Rate</CardTitle>
					<TrendingUp class="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold">{completionRate}%</div>
					<p class="text-xs text-muted-foreground">
						{stats.completedTasks} of {stats.totalTasks} tasks done
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle class="text-sm font-medium">Collaborators</CardTitle>
					<Users class="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold">{stats.activeCollaborators}</div>
					<p class="text-xs text-muted-foreground">Team members</p>
				</CardContent>
			</Card>
		</div>

		<div class="grid gap-6 md:grid-cols-2">
			<!-- Recent documents -->
			<Card>
				<CardHeader>
					<div class="flex items-center justify-between">
						<div>
							<CardTitle>Recent Documents</CardTitle>
							<CardDescription>Your most recently updated documents</CardDescription>
						</div>
						<Button size="sm" variant="ghost" on:click={() => goto('/workspace/search')}>
							View all
							<ArrowRight class="ml-2 h-4 w-4" />
						</Button>
					</div>
				</CardHeader>
				<CardContent>
					{#if recentDocuments.length > 0}
						<div class="space-y-2">
							{#each recentDocuments as doc}
								<button
									class="flex w-full items-center justify-between rounded-lg p-3 text-left hover:bg-accent transition-colors"
									on:click={() => goto(`/workspace/document/${doc.id}`)}
								>
									<div class="flex items-center gap-3 flex-1 min-w-0">
										<FileText class="h-5 w-5 text-muted-foreground flex-shrink-0" />
										<div class="flex-1 min-w-0">
											<p class="font-medium truncate">{doc.title}</p>
											<p class="text-sm text-muted-foreground flex items-center gap-1">
												<Clock class="h-3 w-3" />
												{formatDate(doc.updatedAt || doc.createdAt)}
											</p>
										</div>
									</div>
								</button>
							{/each}
						</div>
					{:else}
						<div class="py-8 text-center">
							<FileText class="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
							<p class="text-sm text-muted-foreground mb-4">No documents yet</p>
							<Button size="sm" variant="outline" on:click={() => goto('/workspace/search')}>
								<Plus class="mr-2 h-4 w-4" />
								Create your first document
							</Button>
						</div>
					{/if}
				</CardContent>
			</Card>

			<!-- Recent tasks -->
			<Card>
				<CardHeader>
					<div class="flex items-center justify-between">
						<div>
							<CardTitle>Your Tasks</CardTitle>
							<CardDescription>Active tasks that need your attention</CardDescription>
						</div>
						<Button size="sm" variant="ghost" on:click={() => goto('/workspace/tasks')}>
							View all
							<ArrowRight class="ml-2 h-4 w-4" />
						</Button>
					</div>
				</CardHeader>
				<CardContent>
					{#if recentTasks.length > 0}
						<div class="space-y-2">
							{#each recentTasks as task}
								<button
									class="flex w-full items-center justify-between rounded-lg p-3 text-left hover:bg-accent transition-colors"
									on:click={() => goto(`/workspace/tasks?taskId=${task.id}`)}
								>
									<div class="flex items-center gap-3 flex-1 min-w-0">
										<input
											type="checkbox"
											checked={task.status === 'done'}
											class="h-4 w-4 rounded flex-shrink-0"
											on:click|stopPropagation
										/>
										<div class="flex-1 min-w-0">
											<p class="font-medium truncate">{task.title}</p>
											<div class="flex items-center gap-2 mt-1 flex-wrap">
												{#if task.priority}
													<Badge class="text-xs {getPriorityColor(task.priority)}">
														{task.priority}
													</Badge>
												{/if}
												<Badge class="text-xs {getStatusColor(task.status)}">
													{task.status.replace('_', ' ')}
												</Badge>
												{#if task.dueDate}
													<span class="text-xs text-muted-foreground flex items-center gap-1">
														<Calendar class="h-3 w-3" />
														{new Date(task.dueDate).toLocaleDateString()}
													</span>
												{/if}
											</div>
										</div>
									</div>
								</button>
							{/each}
						</div>
					{:else}
						<div class="py-8 text-center">
							<CheckSquare class="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
							<p class="text-sm text-muted-foreground mb-4">No active tasks</p>
							<Button size="sm" variant="outline" on:click={() => goto('/workspace/tasks')}>
								<Plus class="mr-2 h-4 w-4" />
								Create your first task
							</Button>
						</div>
					{/if}
				</CardContent>
			</Card>
		</div>

		<!-- Quick actions -->
		<Card class="mt-6">
			<CardHeader>
				<CardTitle>Quick Actions</CardTitle>
				<CardDescription>Common tasks and shortcuts</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<Button variant="outline" class="h-auto flex-col py-4" on:click={() => goto('/workspace/search')}>
						<Search class="mb-2 h-5 w-5" />
						<span>Quick Search</span>
					</Button>
					<Button variant="outline" class="h-auto flex-col py-4" on:click={() => goto('/workspace/projects')}>
						<FolderKanban class="mb-2 h-5 w-5" />
						<span>Projects</span>
					</Button>
					<Button variant="outline" class="h-auto flex-col py-4" on:click={() => goto('/workspace/calendar')}>
						<Calendar class="mb-2 h-5 w-5" />
						<span>Calendar</span>
					</Button>
					<Button variant="outline" class="h-auto flex-col py-4" on:click={() => goto('/workspace/settings')}>
						<Users class="mb-2 h-5 w-5" />
						<span>Settings</span>
					</Button>
				</div>
			</CardContent>
		</Card>

		<!-- Additional resources -->
		<div class="mt-6 grid gap-4 md:grid-cols-3">
			<Card class="cursor-pointer hover:bg-accent transition-colors" on:click={() => goto('/workspace/notes')}>
				<CardHeader>
					<div class="flex items-center gap-2">
						<StickyNote class="h-5 w-5 text-muted-foreground" />
						<CardTitle class="text-base">Notes</CardTitle>
					</div>
				</CardHeader>
				<CardContent>
					<p class="text-sm text-muted-foreground">Quick notes and reminders</p>
				</CardContent>
			</Card>

			<Card class="cursor-pointer hover:bg-accent transition-colors" on:click={() => goto('/workspace/wiki')}>
				<CardHeader>
					<div class="flex items-center gap-2">
						<BookOpen class="h-5 w-5 text-muted-foreground" />
						<CardTitle class="text-base">Wiki</CardTitle>
					</div>
				</CardHeader>
				<CardContent>
					<p class="text-sm text-muted-foreground">Knowledge base and documentation</p>
				</CardContent>
			</Card>

			<Card class="cursor-pointer hover:bg-accent transition-colors" on:click={() => goto('/workspace/databases')}>
				<CardHeader>
					<div class="flex items-center gap-2">
						<Database class="h-5 w-5 text-muted-foreground" />
						<CardTitle class="text-base">Databases</CardTitle>
					</div>
				</CardHeader>
				<CardContent>
					<p class="text-sm text-muted-foreground">Structured data and tables</p>
				</CardContent>
			</Card>
		</div>
	{/if}
</div>
