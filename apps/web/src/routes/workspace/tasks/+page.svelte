<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { ProjectService, type Project, type CreateProjectData } from '$lib/services/project-service';
	import { projectStore } from '$lib/stores/project-store';
	import TaskBoard from '$lib/components/tasks/TaskBoard.svelte';
	import TaskList from '$lib/components/tasks/TaskList.svelte';
	import TaskTable from '$lib/components/tasks/TaskTable.svelte';
	import {
		LayoutGrid,
		List,
		Table,
		Plus,
		Filter,
		Search,
		ChevronDown,
		Edit,
		Trash2,
		X,
		Paperclip,
		Image as ImageIcon,
		CheckSquare,
		Tag,
		User,
		FileText,
		FolderKanban
	} from 'lucide-svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';

	// Accept SvelteKit props to avoid warnings
	import type { PageData, Task, User } from '$lib/types';
	export let data: PageData;
	import { toast } from 'svelte-sonner';
	import { api, endpoints } from '$lib/api-client';
	import { workspaceStore, currentWorkspaceId } from '$lib/stores/workspace';
	import { getDemoTasks } from '$lib/config/demo-tasks';
	import { getDemoProjects } from '$lib/config/demo-projects';
	import { log } from '$lib/logger';

	type ViewType = 'kanban' | 'list' | 'table';

	let currentView: ViewType = 'kanban';
	let tasks: any[] = [];
	let projects: Project[] = [];
	let selectedProjectId: string | null = null;
	let isLoading = true;
	let searchQuery = '';
	let filterStatus = 'all';
	let filterPriority = 'all';
	let filterAssignee = 'all';
	
	// Modal states
	let showEditModal = false;
	let showDeleteConfirmModal = false;
	let showCreateTaskModal = false;
	let showCreateColumnModal = false;
	let showEditColumnModal = false;
	let showDeleteColumnConfirmModal = false;
	let showCreateProjectModal = false;
	let newBoardName = '';
	let creatingBoard = false;
	let boardProjectId: string | null = null;
	let createNewBoard = true;
	let selectedTask: any = null;
	let selectedColumn: { id: string; title: string; color: string } | null = null;
	let editingTask = false;
	let deletingTask = false;
	let creatingTask = false;
	let creatingColumn = false;
	let editingColumn = false;
	let deletingColumn = false;
	
	// Edit form fields
	let editTaskTitle = '';
	let editTaskDescription = '';
	let editTaskPriority: 'low' | 'medium' | 'high' | 'urgent' | '' = '';
	let editTaskDueDate: string = '';
	let editTaskStatus: 'todo' | 'in_progress' | 'done' = 'todo';
	let editTaskCoverUrl: string = '';
	let editTaskChecklists: Array<{ id: string; title: string; items: Array<{ id: string; text: string; completed: boolean }> }> = [];
	let editTaskTagIds: string[] = [];
	let editTaskAssigneeId: string = '';
	let editTaskProjectId: string | null = null;
	
	// Create task form fields
	let newTaskTitle = '';
	let newTaskStatus: string = 'todo';
	let newTaskDescription = '';
	let newTaskPriority: 'low' | 'medium' | 'high' | 'urgent' = 'medium';
	let newTaskDueDate: string = '';
	let newTaskCoverUrl: string = '';
	let newTaskChecklists: Array<{ id: string; title: string; items: Array<{ id: string; text: string; completed: boolean }> }> = [];
	let newTaskTagIds: string[] = [];
	let newTaskAssigneeId: string = '';
	let newTaskTemplateId: string = '';
	let newTaskProjectId: string | null = null;
	
	// Additional data
	let taskTemplates: unknown[] = [];
	let taskTags: unknown[] = [];
	let workspaceMembers: User[] = [];
	let uploadingAttachment = false;
	let uploadingCover = false;
	
	// Create column form fields
	let newColumnTitle = '';
	let newColumnColor = 'bg-gray-500';
	
	// Edit column form fields
	let editColumnTitle = '';
	let editColumnColor = 'bg-gray-500';
	
	// All columns (default and custom) loaded from database
	let columns: Array<{ id: string; title: string; color: string; order: number; statusId?: string | null }> = [];

	// Load tasks and columns when workspace or project changes
	$: if ($currentWorkspaceId) {
		loadProjects();
		loadTasks();
		loadColumns();
		loadTaskTemplates();
		loadTaskTags();
		loadWorkspaceMembers();
	} else {
		// Show demo tasks even without workspace (for development/testing)
		// Only if enabled via environment variable
		if (import.meta.env.VITE_ENABLE_DEMO_TASKS !== 'false') {
			tasks = getDemoTasks();
		} else {
			tasks = [];
		}
		projects = [];
		columns = [];
		taskTemplates = [];
		taskTags = [];
		workspaceMembers = [];
		isLoading = false;
	}

	onMount(async () => {
		// Ensure workspaces are loaded
		if ($workspaceStore.workspaces.length === 0) {
			await workspaceStore.loadWorkspaces();
		}
		
		// Read projectId from URL query params
		const projectIdFromUrl = $page.url.searchParams.get('projectId');
		if (projectIdFromUrl) {
			selectedProjectId = projectIdFromUrl;
		}
		
		// If we have a workspace, loadTasks will be triggered by the reactive statement
		if (!$currentWorkspaceId) {
			// Show demo tasks immediately if none loaded and enabled
			if (tasks.length === 0 && import.meta.env.VITE_ENABLE_DEMO_TASKS !== 'false') {
				tasks = getDemoTasks();
			}
			isLoading = false;
		}
	});
	
	// Watch for URL changes
	$: {
		const projectIdFromUrl = $page.url.searchParams.get('projectId');
		if (projectIdFromUrl !== selectedProjectId) {
			selectedProjectId = projectIdFromUrl;
			// Reload tasks when URL changes (e.g., browser back/forward)
			if ($currentWorkspaceId) {
				loadTasks();
			}
		}
	}

	async function loadProjects() {
		const workspaceId = $currentWorkspaceId;
		if (!workspaceId) {
			projects = [];
			return;
		}

		try {
			projects = await ProjectService.listByWorkspace(workspaceId);
		} catch (error) {
			log.error('Load projects error', error instanceof Error ? error : new Error(String(error)), { workspaceId });
			toast.error('Failed to load projects');
			projects = [];
		}
	}

	async function loadColumns() {
		const workspaceId = $currentWorkspaceId;
		if (!workspaceId) {
			columns = [];
			return;
		}

		try {
			const response = await api.get(endpoints.taskColumns.listByWorkspace(workspaceId));
			if (response.columns) {
				// All columns (default and custom) are loaded from database
				columns = response.columns.map((col: unknown) => ({
					id: col.id,
					title: col.title,
					color: col.color,
					order: col.order,
					statusId: col.statusId || null
				}));
			}
		} catch (error) {
			log.error('Load columns error', error instanceof Error ? error : new Error(String(error)), { workspaceId });
			// Don't show error toast, just use empty array
			columns = [];
		}
	}

	async function loadTaskTemplates() {
		const workspaceId = $currentWorkspaceId;
		if (!workspaceId) {
			taskTemplates = [];
			return;
		}

		try {
			const response = await api.get(endpoints.taskTemplates.listByWorkspace(workspaceId));
			taskTemplates = response.templates || [];
		} catch (error) {
			log.error('Load task templates error', error instanceof Error ? error : new Error(String(error)), { workspaceId });
			taskTemplates = [];
		}
	}

	async function loadTaskTags() {
		const workspaceId = $currentWorkspaceId;
		if (!workspaceId) {
			taskTags = [];
			return;
		}

		try {
			const response = await api.get(endpoints.taskTags.listByWorkspace(workspaceId));
			taskTags = response.tags || [];
		} catch (error) {
			log.error('Load task tags error', error instanceof Error ? error : new Error(String(error)), { workspaceId });
			taskTags = [];
		}
	}

	async function loadWorkspaceMembers() {
		const workspaceId = $currentWorkspaceId;
		if (!workspaceId) {
			workspaceMembers = [];
			return;
		}

		try {
			const response = await api.get(endpoints.workspaces.members(workspaceId));
			workspaceMembers = response.members || [];
		} catch (error) {
			log.error('Load workspace members error', error instanceof Error ? error : new Error(String(error)), { workspaceId });
			workspaceMembers = [];
		}
	}

	async function loadTasks() {
		const workspaceId = $currentWorkspaceId;
		if (!workspaceId) {
			// Don't show demo tasks if no workspace - user should select one
			tasks = [];
			isLoading = false;
			return;
		}

		isLoading = true;
		try {
			const params: Record<string, string> = { workspaceId };
			if (selectedProjectId) {
				params.projectId = selectedProjectId;
			}
			const response = await api.get<{ tasks: Task[] }>(endpoints.tasks.list, { params });
			tasks = response.tasks || [];
		} catch (error) {
			log.error('Load tasks error', error instanceof Error ? error : new Error(String(error)), { workspaceId, selectedProjectId });
			// If it's a 403, the user doesn't have access to this workspace
			if (error instanceof Error && error.message.includes('Access denied')) {
				toast.error('You do not have access to this workspace. Please select a different workspace.');
				workspaceStore.clearWorkspace();
				await workspaceStore.loadWorkspaces();
			}
			tasks = [];
		} finally {
			isLoading = false;
		}
	}


	function openCreateTaskModal(status: string = 'todo') {
		newTaskTitle = '';
		newTaskStatus = status;
		newTaskDescription = '';
		newTaskPriority = 'medium';
		newTaskDueDate = '';
		newTaskCoverUrl = '';
		newTaskChecklists = [];
		newTaskTagIds = [];
		newTaskAssigneeId = '';
		newTaskTemplateId = '';
		newTaskProjectId = selectedProjectId; // Initialize with current filter
		showCreateTaskModal = true;
	}

	function closeCreateTaskModal() {
		showCreateTaskModal = false;
		newTaskTitle = '';
		newTaskStatus = 'todo';
		newTaskDescription = '';
		newTaskPriority = 'medium';
		newTaskDueDate = '';
		newTaskCoverUrl = '';
		newTaskChecklists = [];
		newTaskTagIds = [];
		newTaskAssigneeId = '';
		newTaskTemplateId = '';
		newTaskProjectId = null;
	}

	async function createTask() {
		if (!newTaskTitle.trim()) {
			toast.error('Please enter a task title');
			return;
		}

		const workspaceId = $currentWorkspaceId;
		if (!workspaceId) {
			toast.error('Please select a workspace first');
			return;
		}

		creatingTask = true;
		try {
			// Find the column to get the correct status (statusId for default, id for custom)
			const selectedColumn = columns.find(col => 
				(col.statusId || col.id) === newTaskStatus
			);
			const taskStatus = selectedColumn?.statusId || selectedColumn?.id || newTaskStatus || 'todo';
			
			// If template is selected, load template data
			let templateData: Record<string, unknown> = {};
			if (newTaskTemplateId) {
				try {
					const templateResponse = await api.get(endpoints.taskTemplates.get(newTaskTemplateId));
					if (templateResponse.template) {
						const template = templateResponse.template;
						if (template.title && !newTaskTitle.trim()) {
							newTaskTitle = template.title;
						}
						if (template.descriptionTemplate && !newTaskDescription.trim()) {
							newTaskDescription = template.descriptionTemplate;
						}
						if (template.priority) {
							newTaskPriority = template.priority;
						}
						if (template.checklists && template.checklists.length > 0) {
							newTaskChecklists = template.checklists;
						}
						if (template.coverUrl) {
							newTaskCoverUrl = template.coverUrl;
						}
					}
				} catch (error) {
					log.error('Failed to load template', error instanceof Error ? error : new Error(String(error)), { templateId });
				}
			}
			
			const taskData: Record<string, unknown> = {
				workspaceId,
				title: newTaskTitle.trim(),
				status: taskStatus,
				priority: newTaskPriority
			};

			if (newTaskDescription.trim()) {
				taskData.description = newTaskDescription.trim();
			}
			if (newTaskDueDate) {
				taskData.dueDate = new Date(newTaskDueDate).toISOString();
			}
			if (newTaskCoverUrl) {
				taskData.coverUrl = newTaskCoverUrl;
			}
			if (newTaskChecklists.length > 0) {
				taskData.checklists = newTaskChecklists;
			}
			if (newTaskTagIds.length > 0) {
				taskData.tagIds = newTaskTagIds;
			}
			if (newTaskAssigneeId) {
				taskData.assigneeId = newTaskAssigneeId;
			}
			if (newTaskProjectId) {
				taskData.projectId = newTaskProjectId;
			} else if (selectedProjectId) {
				// Fallback to filter if no project selected in modal
				taskData.projectId = selectedProjectId;
			}
			if (newTaskTemplateId) {
				taskData.templateId = newTaskTemplateId;
			}

			const data = await api.post(endpoints.tasks.create, taskData);

			tasks = [...tasks, data.task];
			toast.success('Task created');
			closeCreateTaskModal();
		} catch (error) {
			log.error('Create task error', error instanceof Error ? error : new Error(String(error)), { workspaceId, projectId: newTaskProjectId, title: newTaskTitle });
			toast.error('Failed to create task');
		} finally {
			creatingTask = false;
		}
	}

	function handleCreateTask(event: CustomEvent<{ status: string }>) {
		openCreateTaskModal(event.detail.status);
	}

	// Helper functions for checklists
	function addChecklist(isEdit: boolean = false) {
		const newChecklist = {
			id: `checklist-${Date.now()}`,
			title: 'New Checklist',
			items: []
		};
		if (isEdit) {
			editTaskChecklists = [...editTaskChecklists, newChecklist];
		} else {
			newTaskChecklists = [...newTaskChecklists, newChecklist];
		}
	}

	function removeChecklist(checklistId: string, isEdit: boolean = false) {
		if (isEdit) {
			editTaskChecklists = editTaskChecklists.filter(c => c.id !== checklistId);
		} else {
			newTaskChecklists = newTaskChecklists.filter(c => c.id !== checklistId);
		}
	}

	function addChecklistItem(checklistId: string, isEdit: boolean = false) {
		const newItem = {
			id: `item-${Date.now()}`,
			text: '',
			completed: false
		};
		if (isEdit) {
			editTaskChecklists = editTaskChecklists.map(c =>
				c.id === checklistId ? { ...c, items: [...c.items, newItem] } : c
			);
		} else {
			newTaskChecklists = newTaskChecklists.map(c =>
				c.id === checklistId ? { ...c, items: [...c.items, newItem] } : c
			);
		}
	}

	function removeChecklistItem(checklistId: string, itemId: string, isEdit: boolean = false) {
		if (isEdit) {
			editTaskChecklists = editTaskChecklists.map(c =>
				c.id === checklistId ? { ...c, items: c.items.filter(i => i.id !== itemId) } : c
			);
		} else {
			newTaskChecklists = newTaskChecklists.map(c =>
				c.id === checklistId ? { ...c, items: c.items.filter(i => i.id !== itemId) } : c
			);
		}
	}

	function updateChecklistTitle(checklistId: string, title: string, isEdit: boolean = false) {
		if (isEdit) {
			editTaskChecklists = editTaskChecklists.map(c =>
				c.id === checklistId ? { ...c, title } : c
			);
		} else {
			newTaskChecklists = newTaskChecklists.map(c =>
				c.id === checklistId ? { ...c, title } : c
			);
		}
	}

	function updateChecklistItem(checklistId: string, itemId: string, updates: { text?: string; completed?: boolean }, isEdit: boolean = false) {
		if (isEdit) {
			editTaskChecklists = editTaskChecklists.map(c =>
				c.id === checklistId
					? { ...c, items: c.items.map(i => i.id === itemId ? { ...i, ...updates } : i) }
					: c
			);
		} else {
			newTaskChecklists = newTaskChecklists.map(c =>
				c.id === checklistId
					? { ...c, items: c.items.map(i => i.id === itemId ? { ...i, ...updates } : i) }
					: c
			);
		}
	}

	// Helper function to handle cover image upload
	async function handleCoverUpload(event: Event, isEdit: boolean = false) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;

		const workspaceId = $currentWorkspaceId;
		if (!workspaceId) {
			toast.error('Please select a workspace first');
			return;
		}

		// Get task ID if editing
		const taskId = isEdit && selectedTask ? selectedTask.id : null;

		uploadingCover = true;
		try {
			// Create FormData
			const formData = new FormData();
			formData.append('file', file);
			formData.append('type', 'task-cover');
			formData.append('workspaceId', workspaceId);
			if (taskId) {
				formData.append('taskId', taskId);
			}

			// Upload to backend
			const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
			const uploadUrl = `${API_BASE_URL}${endpoints.upload.upload}`;
			
			// Get CSRF token for the upload
			let csrfToken = '';
			try {
				const csrfResponse = await fetch(`${API_BASE_URL}/api/auth/csrf-token`, {
					credentials: 'include'
				});
				if (csrfResponse.ok) {
					const csrfData = await csrfResponse.json();
					csrfToken = csrfData.csrfToken || '';
				}
			} catch (e) {
				// CSRF token fetch failed, continue anyway
			}
			
			const response = await fetch(uploadUrl, {
				method: 'POST',
				headers: {
					// Don't set Content-Type, let browser set it with boundary for FormData
					...(csrfToken && { 'X-CSRF-Token': csrfToken })
				},
				body: formData,
				credentials: 'include'
			});

			if (!response.ok) {
				let errorMessage = 'Upload failed';
				try {
					const error = await response.json();
					errorMessage = error.message || error.error || errorMessage;
					log.error('Upload error details', new Error(errorMessage), { error });
				} catch {
					// If response is not JSON (e.g., HTML error page)
					const text = await response.text().catch(() => '');
					errorMessage = `Upload failed: ${response.status} ${response.statusText}${text ? ` - ${text.substring(0, 100)}` : ''}`;
					log.error('Upload error response', new Error(errorMessage), { status: response.status, statusText: response.statusText });
				}
				throw new Error(errorMessage);
			}

			const data = await response.json();
			
			if (isEdit) {
				editTaskCoverUrl = data.url;
				// If editing, automatically save the task with the new cover URL
				if (selectedTask) {
					// Auto-save the cover URL to the database
					const workspaceId = $currentWorkspaceId;
					if (workspaceId) {
						try {
							// Try to update, but if task doesn't exist (404), create it first
							try {
								await api.patch(endpoints.tasks.update(selectedTask.id), {
									coverUrl: data.url
								});
							} catch (updateError: unknown) {
								// If task doesn't exist (404), create it
								if (updateError?.message?.includes('404') || updateError?.message?.includes('not found')) {
									const taskData: Record<string, unknown> = {
										workspaceId,
										title: selectedTask.title || 'Untitled Task',
										status: selectedTask.status || 'todo',
										priority: selectedTask.priority || 'medium',
										coverUrl: data.url
									};
									if (selectedTask.description) {
										taskData.description = selectedTask.description;
									}
									if (selectedTask.dueDate) {
										taskData.dueDate = selectedTask.dueDate instanceof Date 
											? selectedTask.dueDate.toISOString()
											: new Date(selectedTask.dueDate).toISOString();
									}
									const createdTask = await api.post(endpoints.tasks.create, taskData);
									// Replace the demo task with the created task (new ID from database)
									tasks = tasks.map(task =>
										task.id === selectedTask.id
											? { ...createdTask.task, coverUrl: data.url }
											: task
									);
									selectedTask = { ...createdTask.task, coverUrl: data.url };
								} else {
									throw updateError;
								}
							}
							// Update task locally
							tasks = tasks.map(task =>
								task.id === selectedTask.id
									? { ...task, coverUrl: data.url }
									: task
							);
							toast.success('Cover image uploaded and saved');
						} catch (error) {
							log.error('Failed to save cover URL', error instanceof Error ? error : new Error(String(error)), { taskId: newTaskId });
							toast.error('Cover uploaded but failed to save');
						}
					}
				}
			} else {
				newTaskCoverUrl = data.url;
				toast.success('Cover image uploaded');
			}
		} catch (error) {
			log.error('Upload cover error', error instanceof Error ? error : new Error(String(error)), { taskId: editingTask?.id });
			toast.error(error instanceof Error ? error.message : 'Failed to upload cover image');
		} finally {
			uploadingCover = false;
			// Reset file input
			target.value = '';
		}
	}

	// Helper function to handle template selection
	function handleTemplateSelect(templateId: string) {
		newTaskTemplateId = templateId;
		// Template data will be loaded in createTask function
	}

	function openCreateColumnModal() {
		newColumnTitle = '';
		newColumnColor = 'bg-gray-500';
		showCreateColumnModal = true;
	}

	function closeCreateColumnModal() {
		showCreateColumnModal = false;
		newColumnTitle = '';
		newColumnColor = 'bg-gray-500';
	}

	async function createColumn() {
		if (!newColumnTitle.trim()) {
			toast.error('Please enter a column title');
			return;
		}

		const workspaceId = $currentWorkspaceId;
		if (!workspaceId) {
			toast.error('No workspace selected');
			return;
		}

		creatingColumn = true;
		try {
			const response = await api.post(endpoints.taskColumns.create, {
				workspaceId,
				title: newColumnTitle.trim(),
				color: newColumnColor,
				order: columns.length
			});

			if (response.column) {
				const newColumn = {
					id: response.column.id,
					title: response.column.title,
					color: response.column.color,
					order: response.column.order ?? columns.length,
					statusId: response.column.statusId || null
				};
				columns = [...columns, newColumn].sort((a, b) => a.order - b.order);
				toast.success('Column created');
				closeCreateColumnModal();
			}
		} catch (error) {
			log.error('Create column error', error instanceof Error ? error : new Error(String(error)), { workspaceId, title: newColumnTitle });
			toast.error('Failed to create column');
		} finally {
			creatingColumn = false;
		}
	}

	function handleEditColumn(event: CustomEvent<{ column: { id: string; title: string; color: string } }>) {
		selectedColumn = event.detail.column;
		editColumnTitle = event.detail.column.title;
		editColumnColor = event.detail.column.color;
		showEditColumnModal = true;
	}

	function closeEditColumnModal() {
		showEditColumnModal = false;
		selectedColumn = null;
		editColumnTitle = '';
		editColumnColor = 'bg-gray-500';
	}

	async function updateColumn() {
		if (!selectedColumn || !editColumnTitle.trim()) {
			toast.error('Please enter a column title');
			return;
		}

		editingColumn = true;
		try {
			// All columns are saved to database
			await api.patch(endpoints.taskColumns.update(selectedColumn!.id), {
				title: editColumnTitle.trim(),
				color: editColumnColor
			});
			columns = columns.map(col =>
				col.id === selectedColumn!.id
					? { ...col, title: editColumnTitle.trim(), color: editColumnColor }
					: col
			);
			toast.success('Column updated');
			closeEditColumnModal();
		} catch (error) {
			log.error('Update column error', error instanceof Error ? error : new Error(String(error)), { columnId: editingColumn?.id });
			toast.error('Failed to update column');
		} finally {
			editingColumn = false;
		}
	}

	function handleDeleteColumn(event: CustomEvent<{ column: { id: string; title: string; color: string } }>) {
		// For drag and drop deletion, delete directly without confirmation
		deleteColumnDirectly(event.detail.column);
	}

	async function deleteColumnDirectly(column: { id: string; title: string; color: string }) {
		deletingColumn = true;
		try {
			// Find the column to check if it's a default column (cannot be deleted)
			const columnToDelete = columns.find(col => col.id === column.id);
			if (columnToDelete?.statusId) {
				// Default columns cannot be deleted
				toast.error('Default columns cannot be deleted');
				return;
			}
			
			// Move all tasks from this column to "todo" (first default column)
			const todoColumn = columns.find(col => col.statusId === 'todo');
			const targetStatus = todoColumn?.statusId || 'todo';
			
			const tasksToUpdate = tasks.filter(t => t.status === column.id);
			for (const task of tasksToUpdate) {
				try {
					await api.patch(endpoints.tasks.update(task.id), { status: targetStatus });
					tasks = tasks.map(t =>
						t.id === task.id ? { ...t, status: targetStatus } : t
					);
				} catch (error) {
					log.error('Failed to update task status', error instanceof Error ? error : new Error(String(error)), { taskId: task.id, newStatus: targetStatus });
					// Update locally anyway
					tasks = tasks.map(t =>
						t.id === task.id ? { ...t, status: targetStatus } : t
					);
				}
			}

			// Delete from database
			await api.delete(endpoints.taskColumns.delete(column.id));
			columns = columns.filter(col => col.id !== column.id);
			toast.success('Column deleted');
		} catch (error) {
			log.error('Delete column error', error instanceof Error ? error : new Error(String(error)), { columnId: selectedColumn?.id });
		} finally {
			deletingColumn = false;
		}
	}

	async function handleUpdateColumnTitle(event: CustomEvent<{ columnId: string; newTitle: string }>) {
		const { columnId, newTitle } = event.detail;
		
		// All columns are saved to database
		try {
			await api.patch(endpoints.taskColumns.update(columnId), { title: newTitle });
			columns = columns.map(col =>
				col.id === columnId ? { ...col, title: newTitle } : col
			);
		} catch (error) {
		log.error('Failed to update column title', error instanceof Error ? error : new Error(String(error)), { columnId, newTitle });
			// Update locally anyway
			columns = columns.map(col =>
				col.id === columnId ? { ...col, title: newTitle } : col
			);
		}
	}

	async function handleUpdateColumnColor(event: CustomEvent<{ columnId: string; newColor: string }>) {
		const { columnId, newColor } = event.detail;
		
		// All columns are saved to database
		try {
			await api.patch(endpoints.taskColumns.update(columnId), { color: newColor });
			columns = columns.map(col =>
				col.id === columnId ? { ...col, color: newColor } : col
			);
		} catch (error) {
		log.error('Failed to update column color', error instanceof Error ? error : new Error(String(error)), { columnId, newColor });
			// Update locally anyway
			columns = columns.map(col =>
				col.id === columnId ? { ...col, color: newColor } : col
			);
		}
	}

	async function handleReorderColumn(event: CustomEvent<{ draggedColumnId: string; targetColumnId: string }>) {
		const { draggedColumnId, targetColumnId } = event.detail;
		
		// Work with current columns array (already sorted by order)
		const sortedColumns = [...columns].sort((a, b) => a.order - b.order);
		
		// Find positions in array
		const draggedIndex = sortedColumns.findIndex(col => col.id === draggedColumnId);
		const targetIndex = sortedColumns.findIndex(col => col.id === targetColumnId);
		
		if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) {
			if (draggedIndex === -1) {
				console.warn('Dragged column not found:', draggedColumnId, 'Available columns:', sortedColumns.map(c => c.id));
			}
			if (targetIndex === -1) {
				console.warn('Target column not found:', targetColumnId, 'Available columns:', sortedColumns.map(c => c.id));
			}
			return;
		}
		
		// Get the dragged column
		const draggedColumn = sortedColumns[draggedIndex];
		
		// Remove dragged column from array first
		const columnsWithoutDragged = sortedColumns.filter((_, index) => index !== draggedIndex);
		
		// Find where the target column is in the array WITHOUT the dragged column
		const targetIndexInFiltered = columnsWithoutDragged.findIndex(col => col.id === targetColumnId);
		
		if (targetIndexInFiltered === -1) {
			return;
		}
		
		// When moving right (draggedIndex < targetIndex): insert AFTER target
		// When moving left (draggedIndex > targetIndex): insert BEFORE target
		let insertIndex: number;
		if (draggedIndex < targetIndex) {
			insertIndex = targetIndexInFiltered + 1;
		} else {
			insertIndex = targetIndexInFiltered;
		}
		
		// Ensure insertIndex is within bounds
		if (insertIndex < 0) insertIndex = 0;
		if (insertIndex > columnsWithoutDragged.length) insertIndex = columnsWithoutDragged.length;
		
		// Insert dragged column at the calculated position
		const reorderedColumns = [
			...columnsWithoutDragged.slice(0, insertIndex),
			draggedColumn,
			...columnsWithoutDragged.slice(insertIndex)
		];
		
		// Update columns with new order
		const updatedColumns = reorderedColumns.map((col, index) => ({
			...col,
			order: index
		}));
		
		// Update local state immediately
		columns = updatedColumns;
		
		// Save the new order to database (all columns, including default ones)
		const workspaceId = $currentWorkspaceId;
		if (workspaceId) {
			try {
				const columnOrders = updatedColumns.map(col => ({
					id: col.id,
					order: col.order
				}));
				
				await api.post(endpoints.taskColumns.reorder, {
					workspaceId,
					columnOrders
				});
			} catch (error) {
			log.error('Failed to save column order', error instanceof Error ? error : new Error(String(error)), { workspaceId, columnOrders });
				toast.error('Failed to save column order');
				// Reload columns to restore correct order
				await loadColumns();
			}
		}
	}

	function closeDeleteColumnConfirm() {
		showDeleteColumnConfirmModal = false;
		selectedColumn = null;
	}

	async function confirmDeleteColumn() {
		if (!selectedColumn) {
			return;
		}

		deletingColumn = true;
		try {
			// Move all tasks from this column to "todo"
			const tasksToUpdate = tasks.filter(t => t.status === selectedColumn!.id);
			for (const task of tasksToUpdate) {
				try {
					await api.patch(endpoints.tasks.update(task.id), { status: 'todo' });
					tasks = tasks.map(t =>
						t.id === task.id ? { ...t, status: 'todo' } : t
					);
				} catch (error) {
					log.error('Failed to update task status', error instanceof Error ? error : new Error(String(error)), { taskId: task.id, newStatus: 'todo' });
					// Update locally anyway
					tasks = tasks.map(t =>
						t.id === task.id ? { ...t, status: 'todo' } : t
					);
				}
			}

			// Check if it's a default column (cannot be deleted)
			const columnToDelete = columns.find(col => col.id === selectedColumn!.id);
			if (columnToDelete?.statusId) {
				toast.error('Default columns cannot be deleted');
				closeDeleteColumnConfirm();
				return;
			}
			
			// Delete from database
			await api.delete(endpoints.taskColumns.delete(selectedColumn!.id));
			columns = columns.filter(col => col.id !== selectedColumn!.id);
			toast.success('Column deleted');
			closeDeleteColumnConfirm();
		} catch (error) {
			log.error('Delete column error', error instanceof Error ? error : new Error(String(error)), { columnId: selectedColumn?.id });
		} finally {
			deletingColumn = false;
		}
	}

	async function updateTaskStatus(taskId: string, newStatus: string) {

		try {
			await api.patch(endpoints.tasks.update(taskId), { status: newStatus });

			// Update local state
			tasks = tasks.map(task =>
				task.id === taskId ? { ...task, status: newStatus } : task
			);
		} catch (error) {
		log.error('Update task error', error instanceof Error ? error : new Error(String(error)), { taskId, newStatus });
			// Update local state anyway
			tasks = tasks.map(task =>
				task.id === taskId ? { ...task, status: newStatus } : task
			);
		}
	}

	function openEditModal(task: Task) {
		selectedTask = task;
		editTaskTitle = task.title || '';
		editTaskDescription = task.description || '';
		editTaskPriority = (task.priority as 'low' | 'medium' | 'high' | 'urgent' | '') || '';
		editTaskStatus = (task.status as 'todo' | 'in_progress' | 'done') || 'todo';
		editTaskCoverUrl = task.coverUrl || '';
		editTaskChecklists = task.checklists && Array.isArray(task.checklists) ? task.checklists : [];
		editTaskTagIds = task.tags && Array.isArray(task.tags) && task.tags.length > 0 && typeof task.tags[0] === 'object'
			? (Array.isArray(task.tags) ? task.tags.map((tag: unknown) => {
				if (typeof tag === 'object' && tag !== null && 'id' in tag) {
					return (tag as { id: string }).id;
				}
				return null;
			}).filter(Boolean) : [])
			: [];
		editTaskAssigneeId = task.assigneeId || '';
		editTaskProjectId = task.projectId || null;
		
		// Format due date for input
		if (task.dueDate) {
			const dueDate = task.dueDate instanceof Date 
				? task.dueDate 
				: new Date(task.dueDate);
			const year = dueDate.getFullYear();
			const month = String(dueDate.getMonth() + 1).padStart(2, '0');
			const day = String(dueDate.getDate()).padStart(2, '0');
			editTaskDueDate = `${year}-${month}-${day}`;
		} else {
			editTaskDueDate = '';
		}
		
		showEditModal = true;
	}

	function closeEditModal() {
		showEditModal = false;
		selectedTask = null;
		editTaskTitle = '';
		editTaskDescription = '';
		editTaskPriority = '';
		editTaskDueDate = '';
		editTaskStatus = 'todo';
		editTaskCoverUrl = '';
		editTaskChecklists = [];
		editTaskTagIds = [];
		editTaskAssigneeId = '';
	}

	async function openDeleteConfirm() {
		if (!selectedTask) return;
		showEditModal = false;
		await tick();
		showDeleteConfirmModal = true;
	}

	function closeDeleteConfirm() {
		showDeleteConfirmModal = false;
	}

	async function updateTask() {
		if (!selectedTask || !editTaskTitle.trim()) {
			toast.error('Please enter a title');
			return;
		}

		const workspaceId = $currentWorkspaceId;
		if (!workspaceId) {
			toast.error('Please select a workspace first');
			return;
		}

		editingTask = true;
		try {
			// Find the column to get the correct status
			const selectedColumn = columns.find(col => 
				(col.statusId || col.id) === editTaskStatus
			);
			const taskStatus = selectedColumn?.statusId || selectedColumn?.id || editTaskStatus;
			
			const taskData: Record<string, unknown> = {
				title: editTaskTitle.trim(),
				status: taskStatus
			};

			if (editTaskDescription.trim()) {
				taskData.description = editTaskDescription.trim();
			}

			if (editTaskDueDate) {
				taskData.dueDate = new Date(editTaskDueDate).toISOString();
			} else {
				taskData.dueDate = null;
			}

			if (editTaskPriority) {
				taskData.priority = editTaskPriority;
			}

			if (editTaskCoverUrl) {
				taskData.coverUrl = editTaskCoverUrl;
			} else {
				taskData.coverUrl = null;
			}

			if (editTaskChecklists.length > 0) {
				taskData.checklists = editTaskChecklists;
			}

			if (editTaskTagIds.length > 0) {
				taskData.tagIds = editTaskTagIds;
			} else {
				taskData.tagIds = [];
			}

			if (editTaskAssigneeId) {
				taskData.assigneeId = editTaskAssigneeId;
			} else {
				taskData.assigneeId = null;
			}
			
			if (editTaskProjectId !== undefined) {
				taskData.projectId = editTaskProjectId || null;
			}

			const response = await api.patch(endpoints.tasks.update(selectedTask.id), taskData);
			// Update task locally with the response data
			if (response.task) {
				tasks = tasks.map(task =>
					task.id === response.task.id ? response.task : task
				);
			} else {
				// Fallback: reload all tasks if response doesn't include task
				await loadTasks();
			}
			toast.success('Task updated');
			closeEditModal();
		} catch (error) {
			log.error('Update task error', error instanceof Error ? error : new Error(String(error)), { taskId: editingTask?.id });
			toast.error('Failed to update task');
		} finally {
			editingTask = false;
		}
	}

	async function confirmDelete() {
		if (!selectedTask) {
			return;
		}

		const workspaceId = $currentWorkspaceId;
		if (!workspaceId) {
			toast.error('Please select a workspace first');
			closeDeleteConfirm();
			return;
		}

		deletingTask = true;
		try {
			await api.delete(endpoints.tasks.delete(selectedTask.id));
			tasks = tasks.filter(t => t.id !== selectedTask!.id);
			toast.success('Task deleted');
			closeDeleteConfirm();
			closeEditModal();
		} catch (error) {
			log.error('Delete task error', error instanceof Error ? error : new Error(String(error)), { taskId: deletingTaskId });
			toast.error('Failed to delete task');
		} finally {
			deletingTask = false;
		}
	}

	function handleTaskClick(task: Task) {
		openEditModal(task);
	}

	// Filter tasks based on search and filters
	$: filteredTasks = tasks.filter(task => {
		const matchesSearch = searchQuery === '' ||
			task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
			task.description?.toLowerCase().includes(searchQuery.toLowerCase());

		const matchesStatus = filterStatus === 'all' || task.status === filterStatus;
		const matchesPriority = filterPriority === 'all' || task.priority === filterPriority;
		const matchesAssignee = filterAssignee === 'all' ||
			(filterAssignee === 'unassigned' && !task.assignee) ||
			task.assignee?.name === filterAssignee;

		// Project filter is already applied in loadTasks, but we keep it here for consistency
		const matchesProject = !selectedProjectId || task.projectId === selectedProjectId;

		return matchesSearch && matchesStatus && matchesPriority && matchesAssignee && matchesProject;
	});
	
	function handleProjectChange(projectId: string | null) {
		selectedProjectId = projectId;
		const url = new URL($page.url);
		if (projectId) {
			url.searchParams.set('projectId', projectId);
		} else {
			url.searchParams.delete('projectId');
		}
		goto(url.pathname + url.search, { replaceState: true, noScroll: true });
		// Reload tasks immediately when project changes
		if ($currentWorkspaceId) {
			loadTasks();
		}
	}
	
	async function createBoard() {
		if (createNewBoard && !newBoardName.trim()) {
			toast.error('Please enter a board name');
			return;
		}
		
		if (!createNewBoard && !boardProjectId) {
			toast.error('Please select a project');
			return;
		}
		
		const workspaceId = $currentWorkspaceId;
		if (!workspaceId) {
			toast.error('No workspace selected');
			return;
		}
		
		creatingBoard = true;
		try {
			if (createNewBoard) {
				// Create new board project
				const projectData: CreateProjectData = {
					name: newBoardName.trim(),
					viewType: 'board' as const,
					color: '#3B82F6'
				};
				
				const project = await projectStore.createProject(workspaceId, projectData);
				if (project) {
					// Reload projects list
					await loadProjects();
					// Select the newly created project
					handleProjectChange(project.id);
					toast.success('Board created successfully');
					showCreateProjectModal = false;
					newBoardName = '';
					createNewBoard = true;
					boardProjectId = null;
				}
			} else {
				// Use existing project
				if (boardProjectId) {
					handleProjectChange(boardProjectId);
					toast.success('Project selected');
					showCreateProjectModal = false;
					boardProjectId = null;
					createNewBoard = true;
				}
			}
		} catch (error) {
			log.error('Create board error', error instanceof Error ? error : new Error(String(error)), { workspaceId, newBoardName });
			toast.error('Failed to create board');
		} finally {
			creatingBoard = false;
		}
	}
</script>

<svelte:head>
	<title>Tasks - NotionClone</title>
</svelte:head>

<div class="flex h-full flex-col">
	<!-- Header -->
	<div class="border-b px-6 py-4">
		<div class="flex items-center justify-between">
			<div>
				<h1 class="text-2xl font-bold">Tasks</h1>
				<p class="text-sm text-muted-foreground">
					Manage and track your team's work
				</p>
			</div>
		</div>

		<!-- Toolbar -->
		<div class="mt-4 flex items-center justify-between">
			<!-- View switcher -->
			<div class="flex items-center gap-1 rounded-lg border p-1">
				<Button
					size="sm"
					variant={currentView === 'kanban' ? 'secondary' : 'ghost'}
					on:click={() => currentView = 'kanban'}
				>
					<LayoutGrid class="h-4 w-4" />
					<span class="ml-2 hidden sm:inline">Kanban</span>
				</Button>
				<Button
					size="sm"
					variant={currentView === 'list' ? 'secondary' : 'ghost'}
					on:click={() => currentView = 'list'}
				>
					<List class="h-4 w-4" />
					<span class="ml-2 hidden sm:inline">List</span>
				</Button>
				<Button
					size="sm"
					variant={currentView === 'table' ? 'secondary' : 'ghost'}
					on:click={() => currentView = 'table'}
				>
					<Table class="h-4 w-4" />
					<span class="ml-2 hidden sm:inline">Table</span>
				</Button>
			</div>

			<!-- Filters -->
			<div class="flex items-center gap-2">
				<!-- Project Selector -->
				<select
					bind:value={selectedProjectId}
					on:change={() => handleProjectChange(selectedProjectId)}
					class="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
				>
					<option value="">All Projects</option>
					{#each projects as project}
						<option value={project.id}>{project.name}</option>
					{/each}
				</select>
				
				<!-- New Board Button -->
				<Button
					variant="outline"
					size="sm"
					on:click={() => showCreateProjectModal = true}
				>
					<FolderKanban class="mr-2 h-4 w-4" />
					New Board
				</Button>

				<!-- Search -->
				<div class="relative">
					<Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
					<input
						type="text"
						placeholder="Search tasks..."
						bind:value={searchQuery}
						class="h-9 w-[200px] rounded-md border border-input bg-background pl-8 pr-3 text-sm"
					/>
				</div>

				<!-- Filter button -->
				<Button variant="outline" size="sm">
					<Filter class="mr-2 h-4 w-4" />
					Filter
					<ChevronDown class="ml-1 h-3 w-3" />
				</Button>
			</div>
		</div>
	</div>

	<!-- Content -->
	<div class="flex-1 overflow-auto p-6">
		{#if isLoading}
			<div class="flex h-full items-center justify-center">
				<div class="text-center">
					<div class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
					<p class="mt-2 text-sm text-muted-foreground">Loading tasks...</p>
				</div>
			</div>
		{:else if currentView === 'kanban'}
			<TaskBoard
				tasks={filteredTasks}
				{columns}
				on:statusChange={(e) => updateTaskStatus(e.detail.taskId, e.detail.newStatus)}
				on:taskClick={(e) => handleTaskClick(e.detail.task)}
				on:createTask={handleCreateTask}
				on:createColumn={openCreateColumnModal}
				on:editColumn={handleEditColumn}
				on:deleteColumn={handleDeleteColumn}
				on:deleteColumnWithConfirm={(e) => {
					selectedColumn = e.detail.column;
					showDeleteColumnConfirmModal = true;
				}}
				on:updateColumnTitle={handleUpdateColumnTitle}
				on:updateColumnColor={handleUpdateColumnColor}
				on:reorderColumn={handleReorderColumn}
			/>
		{:else if currentView === 'list'}
			<TaskList
				tasks={filteredTasks}
				on:statusChange={(e) => updateTaskStatus(e.detail.taskId, e.detail.newStatus)}
				on:taskClick={(e) => handleTaskClick(e.detail.task)}
			/>
		{:else if currentView === 'table'}
			<TaskTable
				tasks={filteredTasks}
				on:statusChange={(e) => updateTaskStatus(e.detail.taskId, e.detail.newStatus)}
				on:taskClick={(e) => handleTaskClick(e.detail.task)}
			/>
		{/if}
	</div>
</div>

<!-- Edit Task Modal -->
{#if showEditModal && selectedTask}
	<div class="fixed inset-0 z-[50] flex items-center justify-center bg-black/50" on:click={closeEditModal} role="button" tabindex="-1">
		<div class="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg bg-background p-6 shadow-lg" on:click|stopPropagation role="dialog" aria-modal="true" aria-labelledby="edit-modal-title" on:keydown={(e) => e.key === 'Escape' && closeEditModal()}>
			<div class="mb-4 flex items-center justify-between">
				<h2 id="edit-modal-title" class="text-xl font-semibold">Edit Task</h2>
				<Button variant="ghost" size="icon" on:click={closeEditModal} disabled={editingTask || deletingTask}>
					<X class="h-4 w-4" />
				</Button>
			</div>

			<div class="space-y-4">
				<!-- Cover Image -->
				<div>
					<Label for="edit-task-cover">Cover Image</Label>
					{#if editTaskCoverUrl}
						<div class="mb-2 relative">
							<img src={editTaskCoverUrl} alt="Cover" class="w-full h-32 object-cover rounded-md" />
							<Button
								variant="ghost"
								size="icon"
								class="absolute top-2 right-2"
								on:click={() => editTaskCoverUrl = ''}
								disabled={editingTask || deletingTask}
							>
								<X class="h-4 w-4" />
							</Button>
						</div>
					{/if}
					<input
						type="file"
						id="edit-task-cover"
						accept="image/*"
						class="hidden"
						on:change={(e) => handleCoverUpload(e, true)}
					/>
					<Button
						variant="outline"
						size="sm"
						type="button"
						on:click={() => document.getElementById('edit-task-cover')?.click()}
						disabled={editingTask || deletingTask}
					>
						<ImageIcon class="mr-2 h-4 w-4" />
						{editTaskCoverUrl ? 'Change Cover' : 'Add Cover'}
					</Button>
				</div>

				<!-- Title -->
				<div>
					<Label for="edit-title">Title *</Label>
					<Input
						id="edit-title"
						bind:value={editTaskTitle}
						placeholder="Task title"
						disabled={editingTask || deletingTask}
					/>
				</div>

				<!-- Description -->
				<div>
					<Label for="edit-description">Description</Label>
					<Textarea
						id="edit-description"
						bind:value={editTaskDescription}
						placeholder="Task description"
						rows="3"
						disabled={editingTask || deletingTask}
					/>
				</div>

				<!-- Status and Priority -->
				<div class="grid grid-cols-2 gap-4">
					<div>
						<Label for="edit-status">Status</Label>
						<select
							id="edit-status"
							bind:value={editTaskStatus}
							class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
							disabled={editingTask || deletingTask}
						>
							{#each columns.sort((a, b) => a.order - b.order) as column}
								<option value={column.statusId || column.id}>{column.title}</option>
							{/each}
						</select>
					</div>

					<div>
						<Label for="edit-priority">Priority</Label>
						<select
							id="edit-priority"
							bind:value={editTaskPriority}
							class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
							disabled={editingTask || deletingTask}
						>
							<option value="">None</option>
							<option value="low">Low</option>
							<option value="medium">Medium</option>
							<option value="high">High</option>
							<option value="urgent">Urgent</option>
						</select>
					</div>
				</div>

				<!-- Assignee and Due Date -->
				<div class="grid grid-cols-2 gap-4">
					<div>
						<Label for="edit-task-assignee">Assignee</Label>
						<select
							id="edit-task-assignee"
							bind:value={editTaskAssigneeId}
							class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
							disabled={editingTask || deletingTask}
						>
							<option value="">Unassigned</option>
							{#each workspaceMembers as member}
								<option value={member.userId || member.id}>{member.name || member.email}</option>
							{/each}
						</select>
					</div>
					<div>
						<Label for="edit-due-date">Due Date</Label>
						<Input
							id="edit-due-date"
							type="date"
							bind:value={editTaskDueDate}
							disabled={editingTask || deletingTask}
						/>
					</div>
				</div>

				<!-- Project -->
				<div>
					<Label for="edit-task-project">Project</Label>
					<select
						id="edit-task-project"
						value={editTaskProjectId || ''}
						on:change={(e) => {
							const target = e.target;
							if (target && target instanceof HTMLSelectElement) {
								editTaskProjectId = target.value || null;
							}
						}}
						class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
						disabled={editingTask || deletingTask}
					>
						<option value="">No Project</option>
						{#each projects as project}
							<option value={project.id}>{project.name}</option>
						{/each}
					</select>
				</div>

				<!-- Tags -->
				{#if taskTags.length > 0}
					<div>
						<Label>Tags</Label>
						<div class="flex flex-wrap gap-2 mt-2">
							{#each taskTags as tag}
								<button
									type="button"
									class="px-3 py-1 rounded-full text-xs font-medium transition-colors {editTaskTagIds.includes(tag.id) ? 'text-white' : 'text-muted-foreground border border-input'}"
									style:background-color={editTaskTagIds.includes(tag.id) ? (tag.color.startsWith('#') ? tag.color : `var(--color-${tag.color})`) : 'transparent'}
									on:click={() => {
										if (editTaskTagIds.includes(tag.id)) {
											editTaskTagIds = editTaskTagIds.filter(id => id !== tag.id);
										} else {
											editTaskTagIds = [...editTaskTagIds, tag.id];
										}
									}}
									disabled={editingTask || deletingTask}
								>
									{tag.name}
								</button>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Checklists -->
				<div>
					<div class="flex items-center justify-between mb-2">
						<Label>Checklists</Label>
						<Button
							variant="outline"
							size="sm"
							type="button"
							on:click={() => addChecklist(true)}
							disabled={editingTask || deletingTask}
						>
							<Plus class="mr-2 h-4 w-4" />
							Add Checklist
						</Button>
					</div>
					{#each editTaskChecklists as checklist}
						<div class="mb-4 p-3 border rounded-md">
							<div class="flex items-center justify-between mb-2">
								<Input
									value={checklist.title}
									placeholder="Checklist title"
									on:input={(e) => updateChecklistTitle(checklist.id, e.currentTarget.value, true)}
									disabled={editingTask || deletingTask}
								/>
								<Button
									variant="ghost"
									size="icon"
									on:click={() => removeChecklist(checklist.id, true)}
									disabled={editingTask || deletingTask}
								>
									<X class="h-4 w-4" />
								</Button>
							</div>
							{#each checklist.items as item}
								<div class="flex items-center gap-2 mb-1">
									<input
										type="checkbox"
										checked={item.completed}
										on:change={(e) => updateChecklistItem(checklist.id, item.id, { completed: e.currentTarget.checked }, true)}
										disabled={editingTask || deletingTask}
									/>
									<Input
										value={item.text}
										placeholder="Item text"
										on:input={(e) => updateChecklistItem(checklist.id, item.id, { text: e.currentTarget.value }, true)}
										disabled={editingTask || deletingTask}
									/>
									<Button
										variant="ghost"
										size="icon"
										on:click={() => removeChecklistItem(checklist.id, item.id, true)}
										disabled={editingTask || deletingTask}
									>
										<X class="h-3 w-3" />
									</Button>
								</div>
							{/each}
							<Button
								variant="outline"
								size="sm"
								type="button"
								on:click={() => addChecklistItem(checklist.id, true)}
								disabled={editingTask || deletingTask}
								class="mt-2"
							>
								<Plus class="mr-2 h-3 w-3" />
								Add Item
							</Button>
						</div>
					{/each}
				</div>
			</div>

			<div class="mt-6 flex gap-2 justify-end">
				<Button
					variant="destructive"
					on:click={openDeleteConfirm}
					disabled={editingTask || deletingTask}
				>
					<Trash2 class="mr-2 h-4 w-4" />
					Delete
				</Button>
				<Button
					variant="outline"
					on:click={closeEditModal}
					disabled={editingTask || deletingTask}
				>
					Cancel
				</Button>
				<Button
					on:click={updateTask}
					disabled={editingTask || deletingTask || !editTaskTitle.trim()}
				>
					{#if editingTask}
						Saving...
					{:else}
						<Edit class="mr-2 h-4 w-4" />
						Save
					{/if}
				</Button>
			</div>
		</div>
	</div>
{/if}

<!-- Delete Confirmation Modal -->
{#if showDeleteConfirmModal && selectedTask}
	<div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" on:click={closeDeleteConfirm} role="button" tabindex="-1">
		<div class="w-full max-w-md rounded-lg bg-background p-6 shadow-lg" on:click|stopPropagation role="dialog" aria-modal="true" aria-labelledby="delete-modal-title" on:keydown={(e) => e.key === 'Escape' && closeDeleteConfirm()}>
			<div class="mb-4 flex items-center justify-between">
				<h2 id="delete-modal-title" class="text-xl font-semibold text-destructive">Confirm Deletion</h2>
				<Button variant="ghost" size="icon" on:click={closeDeleteConfirm} disabled={deletingTask}>
					<X class="h-4 w-4" />
				</Button>
			</div>

			<div class="mb-6">
				<p class="text-sm text-muted-foreground">
					Are you sure you want to delete <strong>"{selectedTask.title}"</strong>?
				</p>
				<p class="mt-2 text-sm text-muted-foreground">
					This action cannot be undone.
				</p>
			</div>

			<div class="flex gap-2 justify-end">
				<Button
					variant="outline"
					on:click={closeDeleteConfirm}
					disabled={deletingTask}
				>
					Cancel
				</Button>
				<Button
					variant="destructive"
					on:click={confirmDelete}
					disabled={deletingTask}
				>
					{#if deletingTask}
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

<!-- Create Task Modal -->
{#if showCreateTaskModal}
	<div class="fixed inset-0 z-[50] flex items-center justify-center bg-black/50" on:click={closeCreateTaskModal} role="button" tabindex="-1">
		<div class="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg bg-background p-6 shadow-lg" on:click|stopPropagation role="dialog" aria-modal="true" aria-labelledby="create-task-modal-title" on:keydown={(e) => e.key === 'Escape' && closeCreateTaskModal()}>
			<div class="mb-4 flex items-center justify-between">
				<h2 id="create-task-modal-title" class="text-xl font-semibold">Create New Task</h2>
				<Button variant="ghost" size="icon" on:click={closeCreateTaskModal} disabled={creatingTask}>
					<X class="h-4 w-4" />
				</Button>
			</div>

			<div class="space-y-4">
				<!-- Template Selection -->
				{#if taskTemplates.length > 0}
					<div>
						<Label for="new-task-template">Template (Optional)</Label>
						<select
							id="new-task-template"
							bind:value={newTaskTemplateId}
							class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
							disabled={creatingTask}
						>
							<option value="">No template</option>
							{#each taskTemplates as template}
								<option value={template.id}>{template.name}</option>
							{/each}
						</select>
					</div>
				{/if}

				<!-- Cover Image -->
				<div>
					<Label for="new-task-cover">Cover Image</Label>
					{#if newTaskCoverUrl}
						<div class="mb-2 relative">
							<img src={newTaskCoverUrl} alt="Cover" class="w-full h-32 object-cover rounded-md" />
							<Button
								variant="ghost"
								size="icon"
								class="absolute top-2 right-2"
								on:click={() => newTaskCoverUrl = ''}
							>
								<X class="h-4 w-4" />
							</Button>
						</div>
					{/if}
					<input
						type="file"
						id="new-task-cover"
						accept="image/*"
						class="hidden"
						on:change={(e) => handleCoverUpload(e, false)}
					/>
					<Button
						variant="outline"
						size="sm"
						type="button"
						on:click={() => document.getElementById('new-task-cover')?.click()}
						disabled={creatingTask}
					>
						<ImageIcon class="mr-2 h-4 w-4" />
						{newTaskCoverUrl ? 'Change Cover' : 'Add Cover'}
					</Button>
				</div>

				<!-- Title -->
				<div>
					<Label for="new-task-title">Title *</Label>
					<Input
						id="new-task-title"
						bind:value={newTaskTitle}
						placeholder="Task title"
						disabled={creatingTask}
					/>
				</div>

				<!-- Description -->
				<div>
					<Label for="new-task-description">Description</Label>
					<Textarea
						id="new-task-description"
						bind:value={newTaskDescription}
						placeholder="Task description"
						rows="3"
						disabled={creatingTask}
					/>
				</div>

				<!-- Status and Priority -->
				<div class="grid grid-cols-2 gap-4">
					<div>
						<Label for="new-task-status">Status</Label>
						<select
							id="new-task-status"
							bind:value={newTaskStatus}
							class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
							disabled={creatingTask}
						>
							{#each columns.sort((a, b) => a.order - b.order) as column}
								<option value={column.statusId || column.id}>{column.title}</option>
							{/each}
						</select>
					</div>
					<div>
						<Label for="new-task-priority">Priority</Label>
						<select
							id="new-task-priority"
							bind:value={newTaskPriority}
							class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
							disabled={creatingTask}
						>
							<option value="low">Low</option>
							<option value="medium">Medium</option>
							<option value="high">High</option>
							<option value="urgent">Urgent</option>
						</select>
					</div>
				</div>

				<!-- Assignee and Due Date -->
				<div class="grid grid-cols-2 gap-4">
					<div>
						<Label for="new-task-assignee">Assignee</Label>
						<select
							id="new-task-assignee"
							bind:value={newTaskAssigneeId}
							class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
							disabled={creatingTask}
						>
							<option value="">Unassigned</option>
							{#each workspaceMembers as member}
								<option value={member.userId || member.id}>{member.name || member.email}</option>
							{/each}
						</select>
					</div>
					<div>
						<Label for="new-task-due-date">Due Date</Label>
						<Input
							id="new-task-due-date"
							type="date"
							bind:value={newTaskDueDate}
							disabled={creatingTask}
						/>
					</div>
				</div>

				<!-- Project -->
				<div>
					<Label for="new-task-project">Project</Label>
					<select
						id="new-task-project"
						value={newTaskProjectId || ''}
						on:change={(e) => {
							const target = e.target;
							if (target && target instanceof HTMLSelectElement) {
								newTaskProjectId = target.value || null;
							}
						}}
						class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
						disabled={creatingTask}
					>
						<option value="">No Project</option>
						{#each projects as project}
							<option value={project.id}>{project.name}</option>
						{/each}
					</select>
					{#if projects.length === 0}
						<p class="mt-1 text-xs text-muted-foreground">
							No projects yet. <button type="button" class="text-primary hover:underline" on:click={() => { showCreateTaskModal = false; showCreateProjectModal = true; }}>Create a new board</button>
						</p>
					{/if}
				</div>

				<!-- Tags -->
				{#if taskTags.length > 0}
					<div>
						<Label>Tags</Label>
						<div class="flex flex-wrap gap-2 mt-2">
							{#each taskTags as tag}
								<button
									type="button"
									class="px-3 py-1 rounded-full text-xs font-medium transition-colors {newTaskTagIds.includes(tag.id) ? 'text-white' : 'text-muted-foreground border border-input'}"
									style:background-color={newTaskTagIds.includes(tag.id) ? (tag.color.startsWith('#') ? tag.color : `var(--color-${tag.color})`) : 'transparent'}
									on:click={() => {
										if (newTaskTagIds.includes(tag.id)) {
											newTaskTagIds = newTaskTagIds.filter(id => id !== tag.id);
										} else {
											newTaskTagIds = [...newTaskTagIds, tag.id];
										}
									}}
									disabled={creatingTask}
								>
									{tag.name}
								</button>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Checklists -->
				<div>
					<div class="flex items-center justify-between mb-2">
						<Label>Checklists</Label>
						<Button
							variant="outline"
							size="sm"
							type="button"
							on:click={() => addChecklist(false)}
							disabled={creatingTask}
						>
							<Plus class="mr-2 h-4 w-4" />
							Add Checklist
						</Button>
					</div>
					{#each newTaskChecklists as checklist}
						<div class="mb-4 p-3 border rounded-md">
							<div class="flex items-center justify-between mb-2">
								<Input
									value={checklist.title}
									placeholder="Checklist title"
									on:input={(e) => updateChecklistTitle(checklist.id, e.currentTarget.value, false)}
									disabled={creatingTask}
								/>
								<Button
									variant="ghost"
									size="icon"
									on:click={() => removeChecklist(checklist.id, false)}
									disabled={creatingTask}
								>
									<X class="h-4 w-4" />
								</Button>
							</div>
							{#each checklist.items as item}
								<div class="flex items-center gap-2 mb-1">
									<input
										type="checkbox"
										checked={item.completed}
										on:change={(e) => updateChecklistItem(checklist.id, item.id, { completed: e.currentTarget.checked }, false)}
										disabled={creatingTask}
									/>
									<Input
										value={item.text}
										placeholder="Item text"
										on:input={(e) => updateChecklistItem(checklist.id, item.id, { text: e.currentTarget.value }, false)}
										disabled={creatingTask}
									/>
									<Button
										variant="ghost"
										size="icon"
										on:click={() => removeChecklistItem(checklist.id, item.id, false)}
										disabled={creatingTask}
									>
										<X class="h-3 w-3" />
									</Button>
								</div>
							{/each}
							<Button
								variant="outline"
								size="sm"
								type="button"
								on:click={() => addChecklistItem(checklist.id, false)}
								disabled={creatingTask}
								class="mt-2"
							>
								<Plus class="mr-2 h-3 w-3" />
								Add Item
							</Button>
						</div>
					{/each}
				</div>
			</div>

			<div class="mt-6 flex gap-2 justify-end">
				<Button
					variant="outline"
					on:click={closeCreateTaskModal}
					disabled={creatingTask}
				>
					Cancel
				</Button>
				<Button
					on:click={createTask}
					disabled={creatingTask || !newTaskTitle.trim()}
				>
					{#if creatingTask}
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

<!-- Create Column Modal -->
{#if showCreateColumnModal}
	<div class="fixed inset-0 z-[50] flex items-center justify-center bg-black/50" on:click={closeCreateColumnModal} role="button" tabindex="-1">
		<div class="w-full max-w-md rounded-lg bg-background p-6 shadow-lg" on:click|stopPropagation role="dialog" aria-modal="true" aria-labelledby="create-column-modal-title" on:keydown={(e) => e.key === 'Escape' && closeCreateColumnModal()}>
			<div class="mb-4 flex items-center justify-between">
				<h2 id="create-column-modal-title" class="text-xl font-semibold">Create New Column</h2>
				<Button variant="ghost" size="icon" on:click={closeCreateColumnModal} disabled={creatingColumn}>
					<X class="h-4 w-4" />
				</Button>
			</div>

			<div class="space-y-4">
				<div>
					<Label for="new-column-title">Title *</Label>
					<Input
						id="new-column-title"
						bind:value={newColumnTitle}
						placeholder="Column title"
						disabled={creatingColumn}
						on:keydown={(e) => e.key === 'Enter' && !creatingColumn && createColumn()}
					/>
				</div>

				<div>
					<Label for="new-column-color">Color</Label>
					<select
						id="new-column-color"
						bind:value={newColumnColor}
						class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
						disabled={creatingColumn}
					>
						<option value="bg-gray-500">Gray</option>
						<option value="bg-blue-500">Blue</option>
						<option value="bg-green-500">Green</option>
						<option value="bg-yellow-500">Yellow</option>
						<option value="bg-orange-500">Orange</option>
						<option value="bg-red-500">Red</option>
						<option value="bg-purple-500">Purple</option>
						<option value="bg-pink-500">Pink</option>
					</select>
				</div>
			</div>

			<div class="mt-6 flex gap-2 justify-end">
				<Button
					variant="outline"
					on:click={closeCreateColumnModal}
					disabled={creatingColumn}
				>
					Cancel
				</Button>
				<Button
					on:click={createColumn}
					disabled={creatingColumn || !newColumnTitle.trim()}
				>
					{#if creatingColumn}
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

<!-- Edit Column Modal -->
{#if showEditColumnModal && selectedColumn}
	<div class="fixed inset-0 z-[50] flex items-center justify-center bg-black/50" on:click={closeEditColumnModal} role="button" tabindex="-1">
		<div class="w-full max-w-md rounded-lg bg-background p-6 shadow-lg" on:click|stopPropagation role="dialog" aria-modal="true" aria-labelledby="edit-column-modal-title" on:keydown={(e) => e.key === 'Escape' && closeEditColumnModal()}>
			<div class="mb-4 flex items-center justify-between">
				<h2 id="edit-column-modal-title" class="text-xl font-semibold">Edit Column</h2>
				<Button variant="ghost" size="icon" on:click={closeEditColumnModal} disabled={editingColumn}>
					<X class="h-4 w-4" />
				</Button>
			</div>

			<div class="space-y-4">
				<div>
					<Label for="edit-column-title">Title *</Label>
					<Input
						id="edit-column-title"
						bind:value={editColumnTitle}
						placeholder="Column title"
						disabled={editingColumn}
						on:keydown={(e) => e.key === 'Enter' && !editingColumn && updateColumn()}
					/>
				</div>

				<div>
					<Label for="edit-column-color">Color</Label>
					<select
						id="edit-column-color"
						bind:value={editColumnColor}
						class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
						disabled={editingColumn}
					>
						<option value="bg-gray-500">Gray</option>
						<option value="bg-blue-500">Blue</option>
						<option value="bg-green-500">Green</option>
						<option value="bg-yellow-500">Yellow</option>
						<option value="bg-orange-500">Orange</option>
						<option value="bg-red-500">Red</option>
						<option value="bg-purple-500">Purple</option>
						<option value="bg-pink-500">Pink</option>
					</select>
				</div>
			</div>

			<div class="mt-6 flex gap-2 justify-end">
				<Button
					variant="outline"
					on:click={closeEditColumnModal}
					disabled={editingColumn}
				>
					Cancel
				</Button>
				<Button
					on:click={updateColumn}
					disabled={editingColumn || !editColumnTitle.trim()}
				>
					{#if editingColumn}
						Saving...
					{:else}
						<Edit class="mr-2 h-4 w-4" />
						Save
					{/if}
				</Button>
			</div>
		</div>
	</div>
{/if}

<!-- Delete Column Confirmation Modal -->
{#if showDeleteColumnConfirmModal && selectedColumn}
	<div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" on:click={closeDeleteColumnConfirm} role="button" tabindex="-1">
		<div class="w-full max-w-md rounded-lg bg-background p-6 shadow-lg" on:click|stopPropagation role="dialog" aria-modal="true" aria-labelledby="delete-column-modal-title" on:keydown={(e) => e.key === 'Escape' && closeDeleteColumnConfirm()}>
			<div class="mb-4 flex items-center justify-between">
				<h2 id="delete-column-modal-title" class="text-xl font-semibold text-destructive">Confirm Column Deletion</h2>
				<Button variant="ghost" size="icon" on:click={closeDeleteColumnConfirm} disabled={deletingColumn}>
					<X class="h-4 w-4" />
				</Button>
			</div>

			<div class="mb-6">
				<p class="text-sm text-muted-foreground">
					Are you sure you want to delete the column <strong>"{selectedColumn.title}"</strong>?
				</p>
				<p class="mt-2 text-sm text-muted-foreground">
					All tasks in this column will be moved to "To Do". This action cannot be undone.
				</p>
			</div>

			<div class="flex gap-2 justify-end">
				<Button
					variant="outline"
					on:click={closeDeleteColumnConfirm}
					disabled={deletingColumn}
				>
					Cancel
				</Button>
				<Button
					variant="destructive"
					on:click={confirmDeleteColumn}
					disabled={deletingColumn}
				>
					{#if deletingColumn}
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

<!-- Create Board Modal -->
{#if showCreateProjectModal}
	<div 
		class="fixed inset-0 z-[50] flex items-center justify-center bg-black/50" 
		on:click={() => { showCreateProjectModal = false; newBoardName = ''; createNewBoard = true; boardProjectId = null; }}
		on:keydown={(e) => e.key === 'Escape' && (showCreateProjectModal = false) && (newBoardName = '')}
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
			aria-labelledby="create-board-title"
			on:keydown={(e) => e.key === 'Escape' && (showCreateProjectModal = false) && (newBoardName = '')}
		>
			<div class="mb-4 flex items-center justify-between">
				<h2 id="create-board-title" class="text-xl font-semibold">Create New Board</h2>
				<Button variant="ghost" size="icon" on:click={() => { showCreateProjectModal = false; newBoardName = ''; createNewBoard = true; boardProjectId = null; }} disabled={creatingBoard}>
					<X class="h-4 w-4" />
				</Button>
			</div>

			<div class="space-y-4">
				<!-- Option: Create new or select existing -->
				<div class="flex gap-4">
					<label class="flex items-center gap-2 cursor-pointer">
						<input
							type="radio"
							bind:group={createNewBoard}
							value={true}
							disabled={creatingBoard}
							class="h-4 w-4"
						/>
						<span class="text-sm">Create New Board</span>
					</label>
					<label class="flex items-center gap-2 cursor-pointer">
						<input
							type="radio"
							bind:group={createNewBoard}
							value={false}
							disabled={creatingBoard}
							class="h-4 w-4"
						/>
						<span class="text-sm">Select Existing Project</span>
					</label>
				</div>

				{#if createNewBoard}
					<div>
						<Label for="board-name">Board Name *</Label>
						<Input
							id="board-name"
							bind:value={newBoardName}
							placeholder="Enter board name"
							disabled={creatingBoard}
							on:keydown={(e) => e.key === 'Enter' && !creatingBoard && createBoard()}
							autofocus
						/>
					</div>
				{:else}
					<div>
						<Label for="board-project">Select Project</Label>
						<select
							id="board-project"
							value={boardProjectId || ''}
							on:change={(e) => {
								const target = e.target;
								if (target && target instanceof HTMLSelectElement) {
									boardProjectId = target.value || null;
								}
							}}
							class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
							disabled={creatingBoard}
						>
							<option value="">Select a project...</option>
							{#each projects as project}
								<option value={project.id}>{project.name}</option>
							{/each}
						</select>
					</div>
				{/if}
			</div>

			<div class="mt-6 flex gap-2 justify-end">
				<Button
					variant="outline"
					on:click={() => { showCreateProjectModal = false; newBoardName = ''; createNewBoard = true; boardProjectId = null; }}
					disabled={creatingBoard}
				>
					Cancel
				</Button>
				<Button
					on:click={createBoard}
					disabled={creatingBoard || (createNewBoard && !newBoardName.trim()) || (!createNewBoard && !boardProjectId)}
				>
					{#if creatingBoard}
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
