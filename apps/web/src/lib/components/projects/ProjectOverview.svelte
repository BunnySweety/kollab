<script lang="ts">
	import { onMount } from 'svelte';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { 
		CheckCircle2, 
		FileText, 
		TrendingUp, 
		AlertCircle, 
		Users, 
		Calendar,
		Target,
		ArrowRight,
		Folder
	} from 'lucide-svelte';
	import { api, endpoints } from '$lib/api-client';
	import { goto } from '$app/navigation';
	import type { Project } from '$lib/services/project-service';
	import { log } from '$lib/logger';

	export let project: Project;

	let stats = {
		tasks: {
			total: 0,
			todo: 0,
			inProgress: 0,
			done: 0,
			overdue: 0,
			urgent: 0
		},
		documents: 0,
		members: 0,
		loading: true
	};

	onMount(async () => {
		await loadStats();
	});

	async function loadStats() {
		try {
			const [tasksResult, documentsResult, membersResult] = await Promise.all([
				api.get(endpoints.tasks.list, {
					params: { projectId: project.id }
				}).catch(() => ({ tasks: [] })),
				api.get(endpoints.documents.listByWorkspace(project.workspaceId)).catch(() => ({ documents: [] })),
				api.get(endpoints.workspaces.members(project.workspaceId)).catch(() => ({ members: [] }))
			]);

			const tasks = tasksResult.tasks || [];
			const documents = documentsResult.documents || [];
			const members = membersResult.members || [];

			const now = new Date();
			stats = {
				tasks: {
					total: tasks.length,
					todo: tasks.filter((t: any) => t.status === 'todo').length,
					inProgress: tasks.filter((t: any) => t.status === 'in_progress').length,
					done: tasks.filter((t: any) => t.status === 'done').length,
					overdue: tasks.filter((t: any) => {
						if (!t.dueDate) return false;
						const dueDate = new Date(t.dueDate);
						return dueDate < now && t.status !== 'done';
					}).length,
					urgent: tasks.filter((t: any) => t.priority === 'urgent' && t.status !== 'done').length
				},
				documents: documents.filter((d: any) => !d.isArchived).length,
				members: members.length,
				loading: false
			};
		} catch (error) {
			log.error('Load stats error', error instanceof Error ? error : new Error(String(error)), { projectId: project.id });
			stats.loading = false;
		}
	}

	$: completionPercentage = stats.tasks.total > 0
		? Math.round((stats.tasks.done / stats.tasks.total) * 100)
		: 0;
</script>

<Card>
	<CardHeader>
		<CardTitle>Project Overview</CardTitle>
		<CardDescription>Quick insights and key metrics</CardDescription>
	</CardHeader>
	<CardContent>
		{#if stats.loading}
			<div class="text-center py-8">
				<div class="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-current border-r-transparent"></div>
			</div>
		{:else}
			<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
				<div class="space-y-1">
					<div class="flex items-center gap-2 text-sm text-muted-foreground">
						<CheckCircle2 class="h-4 w-4" />
						<span>Tasks</span>
					</div>
					<div class="text-2xl font-bold">{stats.tasks.total}</div>
					<div class="text-xs text-muted-foreground">
						{stats.tasks.done} done • {stats.tasks.inProgress} active
					</div>
				</div>

				<div class="space-y-1">
					<div class="flex items-center gap-2 text-sm text-muted-foreground">
						<TrendingUp class="h-4 w-4" />
						<span>Progress</span>
					</div>
					<div class="text-2xl font-bold">{completionPercentage}%</div>
					<div class="w-full bg-secondary rounded-full h-1.5 mt-2">
						<div
							class="bg-primary h-1.5 rounded-full transition-all"
							style="width: {completionPercentage}%"
						></div>
					</div>
				</div>

				<div class="space-y-1">
					<div class="flex items-center gap-2 text-sm text-muted-foreground">
						<Users class="h-4 w-4" />
						<span>Team</span>
					</div>
					<div class="text-2xl font-bold">{stats.members}</div>
					<div class="text-xs text-muted-foreground">Members</div>
				</div>

				<div class="space-y-1">
					<div class="flex items-center gap-2 text-sm text-muted-foreground">
						<AlertCircle class="h-4 w-4 {stats.tasks.overdue > 0 ? 'text-red-600' : ''}" />
						<span>Issues</span>
					</div>
					<div class="text-2xl font-bold {stats.tasks.overdue > 0 || stats.tasks.urgent > 0 ? 'text-red-600' : ''}">
						{stats.tasks.overdue + stats.tasks.urgent}
					</div>
					<div class="text-xs text-muted-foreground">
						{stats.tasks.overdue} overdue • {stats.tasks.urgent} urgent
					</div>
				</div>
			</div>

			<div class="mt-6 pt-6 border-t grid grid-cols-1 md:grid-cols-3 gap-4">
				<Button
					variant="outline"
					class="w-full justify-between"
					on:click={() => goto(`/workspace/tasks?projectId=${project.id}`)}
				>
					<div class="flex items-center gap-2">
						<CheckCircle2 class="h-4 w-4" />
						<span>View All Tasks</span>
					</div>
					<ArrowRight class="h-4 w-4" />
				</Button>

				<Button
					variant="outline"
					class="w-full justify-between"
					on:click={() => goto(`/workspace/documents?workspaceId=${project.workspaceId}`)}
				>
					<div class="flex items-center gap-2">
						<FileText class="h-4 w-4" />
						<span>View Documents</span>
					</div>
					<ArrowRight class="h-4 w-4" />
				</Button>

				<Button
					variant="outline"
					class="w-full justify-between"
					on:click={() => goto(`/workspace/drive?workspaceId=${project.workspaceId}&projectId=${project.id}`)}
				>
					<div class="flex items-center gap-2">
						<Folder class="h-4 w-4" />
						<span>Project Drive</span>
					</div>
					<ArrowRight class="h-4 w-4" />
				</Button>
			</div>
		{/if}
	</CardContent>
</Card>

