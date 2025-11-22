<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import TaskCard from './TaskCard.svelte';
	import { Plus, MoreVertical, Trash2 } from 'lucide-svelte';

	export let tasks: any[] = [];
	export let columns: Array<{ id: string; title: string; color: string; order: number; statusId?: string | null }> = [];

	const dispatch = createEventDispatcher();

	// Sort columns by order
	$: sortedColumns = [...columns].sort((a, b) => a.order - b.order);
	
	// Track which column is being edited
	let editingColumnId: string | null = null;
	let editingColumnTitle: string = '';
	let editingColumnColorId: string | null = null;

	// Group tasks by status
	// Tasks use statusId for default columns (todo, in_progress, done) or column id for custom columns
	$: tasksByStatus = tasks.reduce((acc, task) => {
		const status = task.status || 'todo';
		if (!acc[status]) acc[status] = [];
		acc[status].push(task);
		return acc;
	}, {} as Record<string, any[]>);
	
	// Map column id to status for task grouping
	$: columnStatusMap = new Map(
		sortedColumns.map(col => [
			col.id,
			col.statusId || col.id // Use statusId for default columns, id for custom
		])
	);

	// Drag and drop state
	let draggedTask: any = null;
	let draggedOverColumn: string | null = null;
	let draggedColumn: { id: string; title: string; color: string } | null = null;
	let draggedOverDeleteZone = false;

	function handleDragStart(e: DragEvent, task: any) {
		draggedTask = task;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/html', ''); // Required for Firefox
		}
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'move';
		}
	}

	function handleDragEnter(columnId: string) {
		draggedOverColumn = columnId;
	}

	function handleDragLeave() {
		draggedOverColumn = null;
	}

	function handleDrop(e: DragEvent, columnId: string) {
		e.preventDefault();
		draggedOverColumn = null;

		if (draggedTask) {
			// Find the column to get the correct status (statusId for default, id for custom)
			const column = sortedColumns.find(col => col.id === columnId);
			const newStatus = column?.statusId || column?.id;
			
			if (draggedTask.status !== newStatus) {
				dispatch('statusChange', {
					taskId: draggedTask.id,
					newStatus: newStatus
				});
			}
		}

		draggedTask = null;
	}

	function handleDragEnd() {
		draggedTask = null;
		draggedOverColumn = null;
		draggedColumn = null;
		draggedOverDeleteZone = false;
	}

	function handleColumnDragStart(e: DragEvent, column: { id: string; title: string; color: string }) {
		draggedColumn = column;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/html', '');
		}
		// Stop propagation to prevent task drag
		e.stopPropagation();
	}

	function handleColumnDragOver(e: DragEvent) {
		if (!draggedColumn) return;
		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'move';
		}
	}

	function handleColumnDragEnter(columnId: string) {
		if (!draggedColumn) return;
		if (columnId !== draggedColumn.id) {
			draggedOverColumn = columnId;
		}
	}

	function handleColumnDragLeave() {
		draggedOverColumn = null;
	}

	function handleColumnDrop(e: DragEvent, targetColumnId: string) {
		if (!draggedColumn) return;
		e.preventDefault();
		draggedOverColumn = null;

		if (draggedColumn.id !== targetColumnId) {
			dispatch('reorderColumn', {
				draggedColumnId: draggedColumn.id,
				targetColumnId: targetColumnId
			});
		}

		draggedColumn = null;
	}

	function handleDeleteZoneDragEnter() {
		if (draggedColumn) {
			draggedOverDeleteZone = true;
		}
	}

	function handleDeleteZoneDragLeave() {
		draggedOverDeleteZone = false;
	}

	function handleDeleteZoneDrop(e: DragEvent) {
		if (!draggedColumn) return;
		e.preventDefault();
		draggedOverDeleteZone = false;
		
		dispatch('deleteColumn', { column: draggedColumn });
		draggedColumn = null;
	}

	function getTaskCount(column: { id: string; statusId?: string | null }): number {
		const status = column.statusId || column.id;
		return tasksByStatus[status]?.length || 0;
	}

	function addTask(columnId: string) {
		// Find the column to get the correct status (statusId for default, id for custom)
		const column = sortedColumns.find(col => col.id === columnId);
		const status = column?.statusId || column?.id || columnId;
		// Emit event to parent to create new task with this status
		dispatch('createTask', { status });
	}

	function isDefaultColumn(columnId: string): boolean {
		const column = columns.find(col => col.id === columnId);
		return column?.statusId !== null && column?.statusId !== undefined;
	}

	function handleColumnEdit(column: { id: string; title: string; color: string }) {
		dispatch('editColumn', { column });
	}

	function handleColumnDelete(column: { id: string; title: string; color: string }) {
		dispatch('deleteColumn', { column });
	}

	function startEditingColumn(column: { id: string; title: string; color: string }, e: MouseEvent) {
		e.stopPropagation();
		editingColumnId = column.id;
		editingColumnTitle = column.title;
	}

	function cancelEditingColumn() {
		editingColumnId = null;
		editingColumnTitle = '';
	}

	function saveColumnTitle(column: { id: string; title: string; color: string }) {
		if (!editingColumnTitle.trim()) {
			editingColumnTitle = column.title;
			editingColumnId = null;
			return;
		}

		const newTitle = editingColumnTitle.trim();
		dispatch('updateColumnTitle', { 
			columnId: column.id, 
			newTitle 
		});
		editingColumnId = null;
		editingColumnTitle = '';
	}

	const availableColors = [
		{ value: 'bg-gray-500', label: 'Gray' },
		{ value: 'bg-blue-500', label: 'Blue' },
		{ value: 'bg-green-500', label: 'Green' },
		{ value: 'bg-yellow-500', label: 'Yellow' },
		{ value: 'bg-orange-500', label: 'Orange' },
		{ value: 'bg-red-500', label: 'Red' },
		{ value: 'bg-purple-500', label: 'Purple' },
		{ value: 'bg-pink-500', label: 'Pink' }
	];

	function startEditingColor(column: { id: string; title: string; color: string }, e: MouseEvent) {
		e.stopPropagation();
		editingColumnColorId = column.id;
	}

	function cancelEditingColor() {
		editingColumnColorId = null;
	}

	function saveColumnColor(column: { id: string; title: string; color: string }, newColor: string) {
		dispatch('updateColumnColor', { 
			columnId: column.id, 
			newColor 
		});
		editingColumnColorId = null;
	}

	onMount(() => {
		// Close menus and color pickers when clicking outside
		function handleClickOutside(event: MouseEvent) {
			const target = event.target as HTMLElement;
			if (!target.closest('[id^="column-menu-"]') && !target.closest('button[aria-label*="column menu"]')) {
				document.querySelectorAll('[id^="column-menu-"]').forEach(menu => {
					menu.classList.add('hidden');
				});
			}
			// Close color picker if clicking outside
			if (!target.closest('button[title="Click to change color"]') && !target.closest('.color-picker-menu')) {
				editingColumnColorId = null;
			}
		}

		document.addEventListener('click', handleClickOutside);
		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	});
</script>

	<div class="flex h-full gap-4 overflow-x-auto">
	{#each sortedColumns as column}
		<div
			class="flex min-w-[320px] flex-1 flex-col rounded-lg border bg-muted/30 {draggedOverColumn === column.id ? 'border-primary' : ''} {draggedColumn?.id === column.id ? 'opacity-50' : ''} cursor-move"
			role="region"
			aria-label="{column.title} column"
			draggable="true"
			on:dragstart={(e) => handleColumnDragStart(e, column)}
			on:dragover={(e) => {
				if (draggedColumn) {
					handleColumnDragOver(e);
				} else {
					handleDragOver(e);
				}
			}}
			on:dragenter={(e) => {
				if (draggedColumn) {
					handleColumnDragEnter(column.id);
				} else {
					handleDragEnter(column.id);
				}
			}}
			on:dragleave={(e) => {
				if (draggedColumn) {
					handleColumnDragLeave();
				} else {
					handleDragLeave();
				}
			}}
			on:drop={(e) => {
				if (draggedColumn) {
					handleColumnDrop(e, column.id);
				} else {
					handleDrop(e, column.id);
				}
			}}
			on:dragend={handleDragEnd}
		>
			<!-- Column header -->
			<div class="flex items-center justify-between border-b p-3">
				<div class="flex items-center gap-2 flex-1 min-w-0">
					<div class="relative">
						<button
							type="button"
							class="h-2 w-2 rounded-full {column.color} flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-primary hover:ring-offset-1 transition-all"
							on:click={(e) => startEditingColor(column, e)}
							on:mousedown|stopPropagation
							title="Click to change color"
						></button>
						{#if editingColumnColorId === column.id}
							<div 
								class="color-picker-menu absolute left-0 top-6 z-20 w-48 rounded-md border bg-background shadow-lg p-2"
								on:click|stopPropagation
							>
								<div class="grid grid-cols-4 gap-2">
									{#each availableColors as color}
										<button
											type="button"
											class="h-8 w-8 rounded-full {color.value} hover:ring-2 hover:ring-primary hover:ring-offset-1 transition-all {column.color === color.value ? 'ring-2 ring-primary ring-offset-1' : ''}"
											on:click={() => saveColumnColor(column, color.value)}
											title={color.label}
										></button>
									{/each}
								</div>
							</div>
						{/if}
					</div>
					{#if editingColumnId === column.id}
						<input
							type="text"
							bind:value={editingColumnTitle}
							class="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary"
							on:blur={() => saveColumnTitle(column)}
							on:keydown={(e) => {
								if (e.key === 'Enter') {
									saveColumnTitle(column);
								} else if (e.key === 'Escape') {
									cancelEditingColumn();
								}
							}}
							autofocus
							on:click|stopPropagation
							on:mousedown|stopPropagation
						/>
					{:else}
						<h3 
							class="font-semibold cursor-pointer hover:bg-accent rounded px-1 py-0.5 -mx-1 flex-1 min-w-0 truncate" 
							on:click={(e) => startEditingColumn(column, e)}
							on:mousedown|stopPropagation
							title="Click to edit"
						>
							{column.title}
						</h3>
					{/if}
					<span class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground flex-shrink-0">
						{getTaskCount(column)}
					</span>
				</div>
				<div class="flex items-center gap-1">
					<Button
						size="icon"
						variant="ghost"
						class="h-6 w-6"
						on:click={(e) => {
							e.stopPropagation();
							addTask(column.id);
						}}
						on:mousedown={(e) => {
							e.stopPropagation();
						}}
					>
						<Plus class="h-4 w-4" />
					</Button>
					<div class="relative">
						<Button
							size="icon"
							variant="ghost"
							class="h-6 w-6"
							on:click={(e) => {
								e.stopPropagation();
								// Close all other menus
								document.querySelectorAll('[id^="column-menu-"]').forEach(menu => {
									if (menu.id !== `column-menu-${column.id}`) {
										menu.classList.add('hidden');
									}
								});
								const menu = document.getElementById(`column-menu-${column.id}`);
								if (menu) {
									menu.classList.toggle('hidden');
								}
							}}
							on:mousedown={(e) => {
								e.stopPropagation();
							}}
						>
							<MoreVertical class="h-4 w-4" />
						</Button>
						<div
							id="column-menu-{column.id}"
							class="hidden absolute right-0 top-8 z-10 w-48 rounded-md border bg-background shadow-lg"
							on:click|stopPropagation
						>
							<div class="p-1">
								<button
									class="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
									on:click={() => {
										handleColumnEdit(column);
										const menu = document.getElementById(`column-menu-${column.id}`);
										if (menu) menu.classList.add('hidden');
									}}
								>
									Edit
								</button>
								<button
									class="w-full rounded-sm px-2 py-1.5 text-left text-sm text-destructive hover:bg-accent"
									on:click={() => {
										dispatch('deleteColumnWithConfirm', { column });
										const menu = document.getElementById(`column-menu-${column.id}`);
										if (menu) menu.classList.add('hidden');
									}}
								>
									Delete
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Tasks -->
			<div class="flex-1 space-y-2 overflow-y-auto p-3">
				{#if tasksByStatus[column.statusId || column.id]}
					{#each tasksByStatus[column.statusId || column.id] as task (task.id)}
						<div
							draggable="true"
							role="button"
							tabindex="0"
							aria-label="Draggable task: {task.title}"
							on:dragstart={(e) => {
								// Prevent column drag when dragging task
								if (draggedColumn) {
									e.preventDefault();
									return;
								}
								handleDragStart(e, task);
							}}
							on:dragend={handleDragEnd}
							class="cursor-move"
							on:click|stopPropagation
						>
							<TaskCard {task} on:taskClick={(e) => {
								// Only open edit modal if not dragging
								if (!draggedTask) {
									dispatch('taskClick', e.detail);
								}
							}} />
						</div>
					{/each}
				{/if}

				{#if !tasksByStatus[column.statusId || column.id] || tasksByStatus[column.statusId || column.id].length === 0}
					<div class="rounded-lg border-2 border-dashed border-muted-foreground/25 p-4 text-center">
						<p class="text-sm text-muted-foreground">No tasks yet</p>
						<Button
							variant="ghost"
							size="sm"
							class="mt-2"
							on:click={() => addTask(column.id)}
						>
							<Plus class="mr-1 h-3 w-3" />
							Add task
						</Button>
					</div>
				{/if}
			</div>
		</div>
	{/each}

	<!-- Add new column button / Delete zone -->
	<div 
		class="flex min-w-[320px] items-center justify-center rounded-lg border-2 border-dashed transition-colors {draggedOverDeleteZone ? 'border-destructive bg-destructive/10' : 'border-muted-foreground/25'}"
		on:dragover={(e) => {
			if (draggedColumn) {
				e.preventDefault();
				if (e.dataTransfer) {
					e.dataTransfer.dropEffect = 'move';
				}
			}
		}}
		on:dragenter={handleDeleteZoneDragEnter}
		on:dragleave={handleDeleteZoneDragLeave}
		on:drop={handleDeleteZoneDrop}
	>
		{#if draggedOverDeleteZone && draggedColumn}
			<div class="text-center">
				<Trash2 class="mx-auto h-8 w-8 text-destructive mb-2" />
				<p class="text-sm font-medium text-destructive">Drop to delete</p>
			</div>
		{:else}
			<Button variant="ghost" on:click={() => dispatch('createColumn')}>
				<Plus class="mr-2 h-4 w-4" />
				Add Column
			</Button>
		{/if}
	</div>
</div>

<style>
	/* Smooth transitions for drag feedback */
	:global(.dragging) {
		opacity: 0.5;
	}
</style>