<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		Calendar,
		User,
		AlertCircle,
		ChevronRight,
		ChevronDown,
		Circle,
		CheckCircle2,
		Clock
	} from 'lucide-svelte';

	export let tasks: any[] = [];

	const dispatch = createEventDispatcher();

	let expandedGroups = new Set(['todo', 'in_progress', 'done']);

	// Group tasks by status
	$: groupedTasks = tasks.reduce((acc, task) => {
		const status = task.status || 'todo';
		if (!acc[status]) acc[status] = [];
		acc[status].push(task);
		return acc;
	}, {} as Record<string, any[]>);

	const statusConfig = {
		todo: { label: 'To Do', icon: Circle, color: 'text-gray-500' },
		in_progress: { label: 'In Progress', icon: Clock, color: 'text-blue-500' },
		done: { label: 'Done', icon: CheckCircle2, color: 'text-green-500' }
	};

	function toggleGroup(status: string) {
		if (expandedGroups.has(status)) {
			expandedGroups.delete(status);
		} else {
			expandedGroups.add(status);
		}
		expandedGroups = expandedGroups;
	}

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
</script>

<div class="space-y-4">
	<!-- Table header -->
	<div class="hidden md:grid md:grid-cols-12 gap-4 border-b px-4 py-2 text-sm font-medium text-muted-foreground">
		<div class="col-span-5">Task</div>
		<div class="col-span-2">Assignee</div>
		<div class="col-span-2">Due Date</div>
		<div class="col-span-2">Priority</div>
		<div class="col-span-1">Status</div>
	</div>

	<!-- Task groups -->
	{#each Object.entries(statusConfig) as [status, config]}
		{#if groupedTasks[status] && groupedTasks[status].length > 0}
			<div class="space-y-1">
				<!-- Group header -->
				<button
					class="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium hover:bg-accent"
					on:click={() => toggleGroup(status)}
				>
					{#if expandedGroups.has(status)}
						<ChevronDown class="h-4 w-4" />
					{:else}
						<ChevronRight class="h-4 w-4" />
					{/if}
					<svelte:component this={config.icon} class="h-4 w-4 {config.color}" />
					<span>{config.label}</span>
					<span class="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">
						{groupedTasks[status].length}
					</span>
				</button>

				<!-- Tasks in group -->
				{#if expandedGroups.has(status)}
					<div class="space-y-1">
						{#each groupedTasks[status] as task}
							<div class="group grid grid-cols-1 md:grid-cols-12 gap-4 rounded-lg border bg-background p-4 hover:shadow-md transition-shadow cursor-pointer" on:click={() => dispatch('taskClick', { task })} role="button" tabindex="0" on:keydown={(e) => e.key === 'Enter' && dispatch('taskClick', { task })}>
								<!-- Task title and description -->
								<div class="col-span-1 md:col-span-5">
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
										<div class="flex-1">
											<h4 class="font-medium {task.status === 'done' ? 'line-through opacity-60' : ''}">
												{task.title}
											</h4>
											{#if task.description}
												<p class="mt-1 text-sm text-muted-foreground line-clamp-2">
													{task.description}
												</p>
											{/if}
											{#if task.tags && task.tags.length > 0}
												<div class="mt-2 flex flex-wrap gap-1">
													{#each task.tags as tag}
														<span class="rounded-full bg-primary/10 px-2 py-0.5 text-xs">
															{tag}
														</span>
													{/each}
												</div>
											{/if}
										</div>
									</div>
								</div>

								<!-- Assignee -->
								<div class="col-span-1 md:col-span-2 flex items-center">
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
								</div>

								<!-- Due date -->
								<div class="col-span-1 md:col-span-2 flex items-center">
									{#if task.dueDate}
										<span class="flex items-center gap-1 text-sm">
											<Calendar class="h-3 w-3" />
											{formatDueDate(task.dueDate)}
										</span>
									{:else}
										<span class="text-sm text-muted-foreground">No due date</span>
									{/if}
								</div>

								<!-- Priority -->
								<div class="col-span-1 md:col-span-2 flex items-center">
									{#if task.priority}
										<span class="flex items-center gap-1 text-sm font-medium {getPriorityColor(task.priority)}">
											{#if task.priority === 'urgent'}
												<AlertCircle class="h-3 w-3" />
											{/if}
											{task.priority}
										</span>
									{/if}
								</div>

								<!-- Status dropdown -->
								<div class="col-span-1 md:col-span-1 flex items-center">
									<select
										class="rounded-md border bg-background px-2 py-1 text-sm"
										value={task.status}
										on:change={(e) => handleStatusChange(task.id, e.currentTarget.value)}
										on:click|stopPropagation
									>
										<option value="todo">To Do</option>
										<option value="in_progress">In Progress</option>
										<option value="done">Done</option>
									</select>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	{/each}

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
	.line-clamp-2 {
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
	}
</style>