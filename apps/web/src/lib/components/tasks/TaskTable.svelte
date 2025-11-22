<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import {
		Calendar,
		User,
		AlertCircle,
		Circle,
		CheckCircle2,
		ArrowUpDown,
		ArrowUp,
		ArrowDown
	} from 'lucide-svelte';

	export let tasks: any[] = [];

	const dispatch = createEventDispatcher();

	type SortField = 'title' | 'status' | 'priority' | 'dueDate' | 'assignee';
	type SortDirection = 'asc' | 'desc';

	let sortField: SortField = 'title';
	let sortDirection: SortDirection = 'asc';

	function handleSort(field: SortField) {
		if (sortField === field) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortField = field;
			sortDirection = 'asc';
		}
	}

	function getSortIcon(field: SortField) {
		if (sortField !== field) {
			return ArrowUpDown;
		}
		return sortDirection === 'asc' ? ArrowUp : ArrowDown;
	}

	$: sortedTasks = [...tasks].sort((a, b) => {
		let aValue: any;
		let bValue: any;

		switch (sortField) {
			case 'title':
				aValue = a.title?.toLowerCase() || '';
				bValue = b.title?.toLowerCase() || '';
				break;
			case 'status':
				aValue = a.status || '';
				bValue = b.status || '';
				break;
			case 'priority': {
				const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
				aValue = priorityOrder[a.priority as keyof typeof priorityOrder] || 0;
				bValue = priorityOrder[b.priority as keyof typeof priorityOrder] || 0;
				break;
			}
			case 'dueDate':
				aValue = a.dueDate ? new Date(a.dueDate).getTime() : 0;
				bValue = b.dueDate ? new Date(b.dueDate).getTime() : 0;
				break;
			case 'assignee':
				aValue = a.assignee?.name?.toLowerCase() || '';
				bValue = b.assignee?.name?.toLowerCase() || '';
				break;
			default:
				return 0;
		}

		if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
		if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
		return 0;
	});

	function handleStatusChange(taskId: string, newStatus: string) {
		dispatch('statusChange', { taskId, newStatus });
	}

	function getPriorityColor(priority: string) {
		switch (priority) {
			case 'urgent':
				return 'text-red-600 dark:text-red-400';
			case 'high':
				return 'text-orange-600 dark:text-orange-400';
			case 'medium':
				return 'text-yellow-600 dark:text-yellow-400';
			case 'low':
				return 'text-blue-600 dark:text-blue-400';
			default:
				return 'text-gray-600 dark:text-gray-400';
		}
	}

	function getStatusColor(status: string) {
		switch (status) {
			case 'todo':
				return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
			case 'in_progress':
				return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
			case 'done':
				return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
			default:
				return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
		}
	}

	function formatDueDate(date: Date | string | null) {
		if (!date) return '';

		const dueDate = typeof date === 'string' ? new Date(date) : date;
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const dueDateOnly = new Date(dueDate);
		dueDateOnly.setHours(0, 0, 0, 0);

		const diffDays = Math.floor((dueDateOnly.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

		if (diffDays === 0) return 'Today';
		if (diffDays === 1) return 'Tomorrow';
		if (diffDays === -1) return 'Yesterday';
		if (diffDays < -1) return `${Math.abs(diffDays)} days overdue`;
		if (diffDays > 1 && diffDays <= 7) return `In ${diffDays} days`;

		return dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function getStatusLabel(status: string) {
		switch (status) {
			case 'todo':
				return 'To Do';
			case 'in_progress':
				return 'In Progress';
			case 'done':
				return 'Done';
			default:
				return status;
		}
	}
</script>

<div class="overflow-x-auto">
	<table class="w-full border-collapse">
		<thead>
			<tr class="border-b">
				<th class="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
					<button
						class="flex items-center gap-2 hover:text-foreground"
						on:click={() => handleSort('title')}
					>
						Task
						<svelte:component this={getSortIcon('title')} class="h-4 w-4" />
					</button>
				</th>
				<th class="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
					<button
						class="flex items-center gap-2 hover:text-foreground"
						on:click={() => handleSort('status')}
					>
						Status
						<svelte:component this={getSortIcon('status')} class="h-4 w-4" />
					</button>
				</th>
				<th class="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
					<button
						class="flex items-center gap-2 hover:text-foreground"
						on:click={() => handleSort('priority')}
					>
						Priority
						<svelte:component this={getSortIcon('priority')} class="h-4 w-4" />
					</button>
				</th>
				<th class="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
					<button
						class="flex items-center gap-2 hover:text-foreground"
						on:click={() => handleSort('assignee')}
					>
						Assignee
						<svelte:component this={getSortIcon('assignee')} class="h-4 w-4" />
					</button>
				</th>
				<th class="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
					<button
						class="flex items-center gap-2 hover:text-foreground"
						on:click={() => handleSort('dueDate')}
					>
						Due Date
						<svelte:component this={getSortIcon('dueDate')} class="h-4 w-4" />
					</button>
				</th>
				<th class="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Tags</th>
			</tr>
		</thead>
		<tbody>
			{#each sortedTasks as task}
				<tr
					class="border-b hover:bg-muted/50 transition-colors cursor-pointer {task.status === 'done' ? 'opacity-60' : ''}"
					on:click={() => dispatch('taskClick', { task })}
					role="button"
					tabindex="0"
					on:keydown={(e) => e.key === 'Enter' && dispatch('taskClick', { task })}
				>
					<!-- Task title and description -->
					<td class="px-4 py-3">
						<div class="flex items-start gap-3">
							<button
								class="mt-0.5"
								on:click|stopPropagation={() => handleStatusChange(task.id, task.status === 'done' ? 'todo' : 'done')}
							>
								{#if task.status === 'done'}
									<CheckCircle2 class="h-5 w-5 text-green-500" />
								{:else}
									<Circle class="h-5 w-5 text-muted-foreground hover:text-foreground" />
								{/if}
							</button>
							<div class="flex-1 min-w-0">
								<h4 class="font-medium {task.status === 'done' ? 'line-through' : ''}">
									{task.title}
								</h4>
								{#if task.description}
									<p class="mt-1 text-sm text-muted-foreground line-clamp-1">
										{task.description}
									</p>
								{/if}
							</div>
						</div>
					</td>

					<!-- Status -->
					<td class="px-4 py-3">
						<select
							class="rounded-md border bg-background px-2 py-1 text-xs font-medium {getStatusColor(task.status || 'todo')}"
							value={task.status || 'todo'}
							on:change={(e) => handleStatusChange(task.id, e.currentTarget.value)}
							on:click|stopPropagation
						>
							<option value="todo">To Do</option>
							<option value="in_progress">In Progress</option>
							<option value="done">Done</option>
						</select>
					</td>

					<!-- Priority -->
					<td class="px-4 py-3">
						{#if task.priority}
							<span class="flex items-center gap-1 text-sm font-medium {getPriorityColor(task.priority)}">
								{#if task.priority === 'urgent'}
									<AlertCircle class="h-3 w-3" />
								{/if}
								{task.priority}
							</span>
						{:else}
							<span class="text-sm text-muted-foreground">-</span>
						{/if}
					</td>

					<!-- Assignee -->
					<td class="px-4 py-3">
						{#if task.assignee}
							<div class="flex items-center gap-2">
								{#if task.assignee.avatar}
									<img
										src={task.assignee.avatar}
										alt={task.assignee.name}
										class="h-6 w-6 rounded-full"
									/>
								{:else}
									<div class="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium">
										{task.assignee.name?.[0]}
									</div>
								{/if}
								<span class="text-sm">{task.assignee.name}</span>
							</div>
						{:else}
							<span class="text-sm text-muted-foreground">Unassigned</span>
						{/if}
					</td>

					<!-- Due date -->
					<td class="px-4 py-3">
						{#if task.dueDate}
							<span class="flex items-center gap-1 text-sm">
								<Calendar class="h-3 w-3" />
								{formatDueDate(task.dueDate)}
							</span>
						{:else}
							<span class="text-sm text-muted-foreground">-</span>
						{/if}
					</td>

					<!-- Tags -->
					<td class="px-4 py-3">
						{#if task.tags && task.tags.length > 0}
							<div class="flex flex-wrap gap-1">
								{#each task.tags.slice(0, 3) as tag}
									<span class="rounded-full bg-primary/10 px-2 py-0.5 text-xs">
										{tag}
									</span>
								{/each}
								{#if task.tags.length > 3}
									<span class="text-xs text-muted-foreground">+{task.tags.length - 3}</span>
								{/if}
							</div>
						{:else}
							<span class="text-sm text-muted-foreground">-</span>
						{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>

	<!-- Empty state -->
	{#if tasks.length === 0}
		<div class="flex h-[400px] items-center justify-center">
			<div class="text-center">
				<Circle class="mx-auto h-12 w-12 text-muted-foreground" />
				<p class="mt-2 text-lg font-medium">No tasks yet</p>
				<p class="text-sm text-muted-foreground">Create your first task to get started</p>
			</div>
		</div>
	{/if}
</div>

<style>
	.line-clamp-1 {
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 1;
		-webkit-box-orient: vertical;
	}
</style>

