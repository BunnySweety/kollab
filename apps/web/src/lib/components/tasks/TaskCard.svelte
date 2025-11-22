<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Calendar, Clock, User, AlertCircle, CheckSquare, Paperclip, Image as ImageIcon } from 'lucide-svelte';

	export let task: any;

	const dispatch = createEventDispatcher();

	function handleClick() {
		dispatch('taskClick', { task });
	}

	function getPriorityColor(priority: string) {
		switch (priority) {
			case 'urgent':
				return 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400';
			case 'high':
				return 'text-orange-600 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400';
			case 'medium':
				return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400';
			case 'low':
				return 'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400';
			default:
				return 'text-gray-600 bg-gray-100 dark:bg-gray-800 dark:text-gray-400';
		}
	}

	function formatDueDate(date: Date | string | null) {
		if (!date) return null;

		const dueDate = typeof date === 'string' ? new Date(date) : date;
		const today = new Date();
		const tomorrow = new Date(today);
		tomorrow.setDate(tomorrow.getDate() + 1);

		// Reset time for comparison
		today.setHours(0, 0, 0, 0);
		tomorrow.setHours(0, 0, 0, 0);
		const dueDateOnly = new Date(dueDate);
		dueDateOnly.setHours(0, 0, 0, 0);

		if (dueDateOnly.getTime() === today.getTime()) {
			return { text: 'Today', urgent: true };
		} else if (dueDateOnly.getTime() === tomorrow.getTime()) {
			return { text: 'Tomorrow', urgent: false };
		} else if (dueDateOnly < today) {
			const daysOverdue = Math.floor((today.getTime() - dueDateOnly.getTime()) / (1000 * 60 * 60 * 24));
			return { text: `${daysOverdue}d overdue`, urgent: true };
		} else {
			const daysUntil = Math.floor((dueDateOnly.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
			if (daysUntil <= 7) {
				return { text: `${daysUntil}d left`, urgent: daysUntil <= 2 };
			}
			return { text: dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), urgent: false };
		}
	}

	$: dueDateInfo = formatDueDate(task.dueDate);
	
	// Calculate checklist progress
	$: checklistProgress = task.checklists && Array.isArray(task.checklists) && task.checklists.length > 0
		? task.checklists.reduce((total: number, checklist: any) => {
				const completed = checklist.items?.filter((item: any) => item.completed).length || 0;
				const totalItems = checklist.items?.length || 0;
				return total + (totalItems > 0 ? completed / totalItems : 0);
			}, 0) / task.checklists.length
		: null;
	
	$: totalChecklistItems = task.checklists && Array.isArray(task.checklists)
		? task.checklists.reduce((total: number, checklist: any) => total + (checklist.items?.length || 0), 0)
		: 0;
	
	$: completedChecklistItems = task.checklists && Array.isArray(task.checklists)
		? task.checklists.reduce((total: number, checklist: any) => {
				return total + (checklist.items?.filter((item: any) => item.completed).length || 0);
			}, 0)
		: 0;
	
	// Get colored tags (new system) or legacy tags
	$: coloredTags = task.tags && Array.isArray(task.tags) && task.tags.length > 0 && typeof task.tags[0] === 'object'
		? task.tags.filter((tag: any) => tag.id && tag.name && tag.color)
		: [];
	
	$: legacyTags = task.tags && Array.isArray(task.tags) && task.tags.length > 0 && typeof task.tags[0] === 'string'
		? task.tags
		: [];
</script>

<div class="group rounded-lg border bg-background shadow-sm transition-shadow hover:shadow-md cursor-pointer overflow-hidden" on:click={handleClick} role="button" tabindex="0" on:keydown={(e) => e.key === 'Enter' && handleClick()}>
	<!-- Cover Image -->
	{#if task.coverUrl}
		<div class="w-full h-32 overflow-hidden bg-muted">
			<img src={task.coverUrl} alt={task.title} class="w-full h-full object-cover" />
		</div>
	{/if}
	
	<div class="p-3">
		<!-- Title -->
		<h4 class="mb-2 font-medium {task.status === 'done' ? 'line-through opacity-60' : ''}">
			{task.title}
		</h4>

	<!-- Description -->
	{#if task.description}
		<p class="mb-2 text-sm text-muted-foreground line-clamp-2">
			{task.description}
		</p>
	{/if}

		<!-- Colored Tags (new system) -->
		{#if coloredTags.length > 0}
			<div class="mb-2 flex flex-wrap gap-1">
				{#each coloredTags as tag}
					<span 
						class="rounded-full px-2 py-0.5 text-xs font-medium text-white"
						style="background-color: {tag.color.startsWith('#') ? tag.color : `var(--color-${tag.color})`};"
					>
						{tag.name}
					</span>
				{/each}
			</div>
		{/if}
		
		<!-- Legacy Tags -->
		{#if legacyTags.length > 0}
			<div class="mb-2 flex flex-wrap gap-1">
				{#each legacyTags as tag}
					<span class="rounded-full bg-primary/10 px-2 py-0.5 text-xs">
						{tag}
					</span>
				{/each}
			</div>
		{/if}
		
		<!-- Checklists Progress -->
		{#if task.checklists && Array.isArray(task.checklists) && task.checklists.length > 0 && totalChecklistItems > 0}
			<div class="mb-2 flex items-center gap-2">
				<CheckSquare class="h-3 w-3 text-muted-foreground" />
				<span class="text-xs text-muted-foreground">
					{completedChecklistItems}/{totalChecklistItems} items
				</span>
				<div class="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
					<div 
						class="h-full bg-primary transition-all"
						style="width: {checklistProgress * 100}%"
					></div>
				</div>
			</div>
		{/if}
		
		<!-- Attachments -->
		{#if task.attachments && Array.isArray(task.attachments) && task.attachments.length > 0}
			<div class="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
				<Paperclip class="h-3 w-3" />
				<span>{task.attachments.length} {task.attachments.length === 1 ? 'attachment' : 'attachments'}</span>
			</div>
		{/if}

		<!-- Footer -->
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<!-- Priority -->
				{#if task.priority}
					<span class="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium {getPriorityColor(task.priority)}">
						{#if task.priority === 'urgent'}
							<AlertCircle class="h-3 w-3" />
						{/if}
						{task.priority}
					</span>
				{/if}

				<!-- Due date -->
				{#if dueDateInfo}
					<span class="flex items-center gap-1 text-xs {dueDateInfo.urgent ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}">
						<Calendar class="h-3 w-3" />
						{dueDateInfo.text}
					</span>
				{/if}
			</div>

			<!-- Assignee -->
			{#if task.assignee}
				<div class="flex items-center gap-1">
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
				</div>
			{/if}
		</div>

		<!-- Subtasks indicator -->
		{#if task.subtasks && task.subtasks.length > 0}
			<div class="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
				<CheckSquare class="h-3 w-3" />
				<span>
					{task.subtasks.filter(st => st.completed).length}/{task.subtasks.length} subtasks
				</span>
			</div>
		{/if}
	</div>
</div>

<style>
	.line-clamp-2 {
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
	}
</style>