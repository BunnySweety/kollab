<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { Plus, Calendar as CalendarIcon, Clock, AlertCircle, CheckSquare, Edit, Trash2, X } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import Calendar from '$lib/components/calendar/Calendar.svelte';
	
	// CalendarEvent type definition (matches Calendar.svelte)
	type CalendarEvent = {
		id: string;
		title: string;
		date: Date | string;
		priority?: string;
		status?: string;
		type?: string;
		description?: string;
		projectId?: string | null;
		[key: string]: unknown;
	};

	type CalendarEventDetail = {
		date: Date;
	};

	type CalendarOpenDetail = {
		event: CalendarEvent;
	};
	import { toast } from 'svelte-sonner';
	import { api, endpoints } from '$lib/api-client';
	import { workspaceStore, currentWorkspaceId } from '$lib/stores/workspace';
	import { ProjectService, type Project, type CreateProjectData } from '$lib/services/project-service';
	import { projectStore } from '$lib/stores/project-store';
	import { log } from '$lib/logger';

	// SvelteKit page props (used by framework)
	import type { PageData, PageParams, Task, CalendarEvent, TaskStatus, TaskPriority } from '$lib/types';
	export const data: PageData = undefined as unknown as PageData;
	export const params: PageParams = undefined as unknown as PageParams;
	let tasks: Task[] = [];
	let projects: Project[] = [];
	let selectedProjectId: string | null = null;
	let isLoading = true;
	let showCreateModal = false;
	let showEditModal = false;
	let showDeleteConfirmModal = false;
	let showCreateProjectModal = false;
	let newCalendarName = '';
	let creatingCalendar = false;
	let calendarProjectId: string | null = null;
	let createNewCalendar = true;
	let selectedDate: Date | null = null;
	let selectedEvent: CalendarEvent | null = null;
	let newEventType: 'task' | 'event' = 'task';
	let newTaskTitle = '';
	let newTaskDescription = '';
	let newTaskPriority: 'low' | 'medium' | 'high' | 'urgent' | '' = '';
	let newTaskDueDate: string = '';
	let newTaskProjectId: string | null = null;
	let creatingTask = false;
	let updatingTask = false;
	let deletingTask = false;
	let events: CalendarEvent[] = []; // Store events separately from tasks

	// Convert tasks and events to calendar events
	let calendarEvents: CalendarEvent[] = [];
	$: {
		calendarEvents = [
			...tasks.map(task => ({
				id: task.id,
				title: task.title,
				date: task.dueDate ? new Date(task.dueDate) : new Date(),
				priority: task.priority,
				status: task.status,
				type: 'task' as const,
				description: task.description,
				projectId: task.projectId,
				workspaceId: task.workspaceId,
				assigneeId: task.assigneeId,
				dueDate: task.dueDate,
				tags: task.tags,
				coverUrl: task.coverUrl,
				checklists: task.checklists,
				order: task.order,
				parentTaskId: task.parentTaskId,
				templateId: task.templateId,
				createdBy: task.createdBy,
				completedAt: task.completedAt,
				createdAt: task.createdAt,
				updatedAt: task.updatedAt
			} as CalendarEvent)),
			...events.map(event => {
				let eventDate: Date;
				if (event.date instanceof Date) {
					eventDate = event.date;
				} else if (event.date) {
					eventDate = new Date(event.date);
				} else {
					eventDate = new Date();
				}
				// Normalize date to midnight in local timezone to match Calendar component normalization
				const normalizedDate = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
				return {
					id: event.id,
					title: event.title,
					date: normalizedDate,
					priority: event.priority,
					status: event.status,
					type: 'event' as const,
					description: event.description,
					projectId: event.projectId
				} as CalendarEvent;
			})
		];
	}

	// Load tasks and events when workspace changes
	$: if ($currentWorkspaceId) {
		loadProjects();
		loadTasks();
		loadEvents();
	} else {
		// Show demo tasks even without workspace (for development/testing)
		tasks = createDemoTasks();
		events = [];
		projects = [];
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
		
		// If we have a workspace, loadTasks and loadEvents will be triggered by the reactive statement
		if (!$currentWorkspaceId) {
			// Show demo tasks immediately if none loaded
			if (tasks.length === 0) {
				tasks = createDemoTasks();
			}
			events = [];
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
			projects = [];
		}
	}
	
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
	
	async function createCalendar() {
		if (createNewCalendar && !newCalendarName.trim()) {
			toast.error('Please enter a calendar name');
			return;
		}
		
		if (!createNewCalendar && !calendarProjectId) {
			toast.error('Please select a project');
			return;
		}
		
		const workspaceId = $currentWorkspaceId;
		if (!workspaceId) {
			toast.error('No workspace selected');
			return;
		}
		
		creatingCalendar = true;
		try {
			if (createNewCalendar) {
				// Create new calendar project
				const projectData: CreateProjectData = {
					name: newCalendarName.trim(),
					viewType: 'calendar' as const,
					color: '#3B82F6'
				};
				
				const project = await projectStore.createProject(workspaceId, projectData);
				if (project) {
					// Reload projects list
					await loadProjects();
					// Select the newly created project
					handleProjectChange(project.id);
					toast.success('Calendar created successfully');
					showCreateProjectModal = false;
					newCalendarName = '';
					createNewCalendar = true;
					calendarProjectId = null;
				}
			} else {
				// Use existing project
				if (calendarProjectId) {
					handleProjectChange(calendarProjectId);
					toast.success('Project selected');
					showCreateProjectModal = false;
					calendarProjectId = null;
					createNewCalendar = true;
				}
			}
		} catch (error) {
			log.error('Create calendar error', error instanceof Error ? error : new Error(String(error)), { workspaceId, newCalendarName });
			toast.error('Failed to create calendar');
		} finally {
			creatingCalendar = false;
		}
	}

	function createDemoTasks(): Task[] {
		const workspaceId = $currentWorkspaceId || 'demo-workspace';
		const now = new Date().toISOString();
		return [
			{
				id: '1',
				workspaceId,
				projectId: null,
				title: 'Design new landing page',
				description: 'Create mockups for the new marketing site',
				status: 'todo' as TaskStatus,
				priority: 'high' as TaskPriority,
				assigneeId: null,
				assignee: null,
				dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
				tags: ['design', 'marketing'],
				coverUrl: null,
				checklists: [],
				order: 0,
				parentTaskId: null,
				templateId: null,
				createdBy: 'demo-user',
				completedAt: null,
				createdAt: now,
				updatedAt: now
			},
			{
				id: '2',
				workspaceId,
				projectId: null,
				title: 'Implement user authentication',
				description: 'Add OAuth providers and email auth',
				status: 'in_progress' as TaskStatus,
				priority: 'urgent' as TaskPriority,
				assigneeId: null,
				assignee: null,
				dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
				tags: ['backend', 'security'],
				coverUrl: null,
				checklists: [],
				order: 0,
				parentTaskId: null,
				templateId: null,
				createdBy: 'demo-user',
				completedAt: null,
				createdAt: now,
				updatedAt: now
			},
			{
				id: '3',
				workspaceId,
				projectId: null,
				title: 'Write API documentation',
				description: 'Document all REST endpoints',
				status: 'in_progress' as TaskStatus,
				priority: 'medium' as TaskPriority,
				assigneeId: null,
				assignee: null,
				dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
				tags: ['documentation'],
				coverUrl: null,
				checklists: [],
				order: 0,
				parentTaskId: null,
				templateId: null,
				createdBy: 'demo-user',
				completedAt: null,
				createdAt: now,
				updatedAt: now
			},
			{
				id: '4',
				workspaceId,
				projectId: null,
				title: 'Setup CI/CD pipeline',
				description: 'Configure GitHub Actions for automated deployment',
				status: 'done' as TaskStatus,
				priority: 'high' as TaskPriority,
				assigneeId: null,
				assignee: null,
				dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
				tags: ['devops'],
				coverUrl: null,
				checklists: [],
				order: 0,
				parentTaskId: null,
				templateId: null,
				createdBy: 'demo-user',
				completedAt: new Date().toISOString(),
				createdAt: now,
				updatedAt: now
			},
			{
				id: '5',
				workspaceId,
				projectId: null,
				title: 'Optimize database queries',
				description: 'Improve query performance and add indexes',
				status: 'todo' as TaskStatus,
				priority: 'medium' as TaskPriority,
				assigneeId: null,
				assignee: null,
				dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
				tags: ['backend', 'performance'],
				coverUrl: null,
				checklists: [],
				order: 0,
				parentTaskId: null,
				templateId: null,
				createdBy: 'demo-user',
				completedAt: null,
				createdAt: now,
				updatedAt: now
			},
			{
				id: '6',
				workspaceId,
				projectId: null,
				title: 'Add dark mode support',
				description: 'Implement theme switching functionality',
				status: 'todo' as TaskStatus,
				priority: 'low' as TaskPriority,
				assigneeId: null,
				assignee: null,
				dueDate: null,
				tags: ['frontend', 'ui'],
				coverUrl: null,
				checklists: [],
				order: 0,
				parentTaskId: null,
				templateId: null,
				createdBy: 'demo-user',
				completedAt: null,
				createdAt: now,
				updatedAt: now
			}
		];
	}

	async function loadTasks() {
		const workspaceId = $currentWorkspaceId;
		if (!workspaceId) {
			// Show demo tasks even without workspace (for development/testing)
			tasks = createDemoTasks();
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

			// Add some demo tasks if empty
			if (tasks.length === 0) {
				tasks = createDemoTasks();
			}
		} catch (error) {
			log.error('Load tasks error', error instanceof Error ? error : new Error(String(error)), { workspaceId, selectedProjectId });
			// If it's a 403, the user doesn't have access to this workspace
			if (error instanceof Error && error.message.includes('Access denied')) {
				toast.error('You do not have access to this workspace. Please select a different workspace.');
				workspaceStore.clearWorkspace();
				await workspaceStore.loadWorkspaces();
				// Show demo tasks for testing even on 403
				tasks = createDemoTasks();
			} else {
				// Use demo tasks as fallback for other errors
				tasks = createDemoTasks();
			}
		} finally {
			isLoading = false;
		}
	}

	async function loadEvents() {
		const workspaceId = $currentWorkspaceId;
		if (!workspaceId) {
			events = [];
			return;
		}

		try {
			const response = await api.get<{ events: CalendarEvent[] }>(endpoints.events.listByWorkspace(workspaceId));
			// Normalize dates immediately when loading to ensure consistency
			events = (response.events || []).map((event: CalendarEvent) => ({
				...event,
				date: event.date ? new Date(event.date) : new Date(),
				type: 'event'
			}));
		} catch (error) {
			log.error('Load events error', error instanceof Error ? error : new Error(String(error)), { workspaceId, selectedProjectId });
			// If it's a 403, the user doesn't have access to this workspace
			if (error instanceof Error && error.message.includes('Access denied')) {
				events = [];
			} else {
				events = [];
			}
		}
	}

	function handleCreate(event: CustomEvent<CalendarEventDetail>) {
		// Open modal with the selected date
		selectedDate = event.detail.date;
		if (!selectedDate) return;
		
		// Initialize form fields
		newTaskTitle = '';
		newTaskDescription = '';
		newTaskPriority = '';
		newTaskDueDate = '';
		newTaskProjectId = selectedProjectId; // Initialize with current filter
		
		// Format date in local timezone to avoid timezone shift issues
		// Use local date methods instead of toISOString() which converts to UTC
		const year = selectedDate.getFullYear();
		const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
		const day = String(selectedDate.getDate()).padStart(2, '0');
		const dateStr = `${year}-${month}-${day}`; // Format YYYY-MM-DD for input[type="date"]
		newTaskDueDate = dateStr;
		newTaskProjectId = selectedProjectId; // Initialize with current filter
		showCreateModal = true;
	}

	function handleOpen(event: CustomEvent<CalendarOpenDetail>) {
		// Open edit modal for the event/task
		const calendarEvent = event.detail.event;
		openEditModal(calendarEvent);
	}

	function openEditModal(calendarEvent: CalendarEvent) {
		selectedEvent = calendarEvent;
		
		// Populate form with event/task data
		newEventType = (calendarEvent.type === 'event' ? 'event' : 'task') as 'task' | 'event';
		newTaskTitle = calendarEvent.title || '';
		newTaskDescription = (calendarEvent.description as string) || '';
		newTaskPriority = (calendarEvent.priority as 'low' | 'medium' | 'high' | 'urgent' | '') || '';
		newTaskProjectId = (calendarEvent as any).projectId || null;
		
		// Format date for input
		if (calendarEvent.date) {
			const eventDate = calendarEvent.date instanceof Date 
				? calendarEvent.date 
				: new Date(calendarEvent.date);
			const year = eventDate.getFullYear();
			const month = String(eventDate.getMonth() + 1).padStart(2, '0');
			const day = String(eventDate.getDate()).padStart(2, '0');
			newTaskDueDate = `${year}-${month}-${day}`;
		}
		
		showEditModal = true;
	}

	function handleStatusChange(event: CustomEvent<{ taskId: string; newStatus: string }>) {
		// Update task status
		const { taskId, newStatus } = event.detail;
		tasks = tasks.map(task =>
			task.id === taskId ? { ...task, status: newStatus as TaskStatus } : task
		);
	}

	// Get upcoming events (next 7 days)
	$: upcomingEvents = calendarEvents
		.filter(event => {
			if (!event.date || event.status === 'done' || event.status === 'completed') return false;
			const eventDate = new Date(event.date);
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			const nextWeek = new Date(today);
			nextWeek.setDate(nextWeek.getDate() + 7);
			eventDate.setHours(0, 0, 0, 0);
			return eventDate >= today && eventDate <= nextWeek;
		})
		.sort((a, b) => {
			const dateA = new Date(a.date);
			const dateB = new Date(b.date);
			return dateA.getTime() - dateB.getTime();
		})
		.slice(0, 5); // Limit to 5 upcoming events

	function formatDate(date: Date | string | null) {
		if (!date) return '';

		const eventDate = typeof date === 'string' ? new Date(date) : date;
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const dateOnly = new Date(eventDate);
		dateOnly.setHours(0, 0, 0, 0);

		const diffDays = Math.floor((dateOnly.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

		if (diffDays === 0) return 'Today';
		if (diffDays === 1) return 'Tomorrow';
		if (diffDays < 0) return `${Math.abs(diffDays)} days overdue`;
		if (diffDays > 1 && diffDays <= 7) return `In ${diffDays} days`;

		return eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function getPriorityColor(priority?: string) {
		if (!priority) return 'text-gray-600 dark:text-gray-400';
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

	function closeCreateModal() {
		showCreateModal = false;
		selectedDate = null;
		newEventType = 'task';
		newTaskTitle = '';
		newTaskDescription = '';
		newTaskPriority = '';
		newTaskDueDate = '';
		newTaskProjectId = null;
	}

	function closeEditModal() {
		showEditModal = false;
		selectedEvent = null;
		newTaskTitle = '';
		newTaskDescription = '';
		newTaskPriority = '';
		newTaskDueDate = '';
	}

	async function openDeleteConfirm() {
		if (!selectedEvent) return;
		// Close edit modal first to avoid z-index conflicts
		showEditModal = false;
		// Wait for DOM update to ensure edit modal closes before opening delete modal
		await tick();
		showDeleteConfirmModal = true;
	}

	function closeDeleteConfirm() {
		showDeleteConfirmModal = false;
	}

	async function createTask() {
		if (!newTaskTitle.trim()) {
			toast.error('Please enter a title');
			return;
		}

		const workspaceId = $currentWorkspaceId;
		if (!workspaceId) {
			toast.error('Please select a workspace first');
			return;
		}

		creatingTask = true;
		try {
			if (newEventType === 'task') {
				// Create a task via API
				const taskData: Record<string, unknown> = {
					workspaceId,
					title: newTaskTitle.trim(),
					status: 'todo'
				};

				if (newTaskDescription.trim()) {
					taskData.description = newTaskDescription.trim();
				}

				if (newTaskDueDate) {
					taskData.dueDate = new Date(newTaskDueDate).toISOString();
				}

				if (newTaskPriority) {
					taskData.priority = newTaskPriority;
				}

				if (newTaskProjectId) {
					taskData.projectId = newTaskProjectId;
				} else if (selectedProjectId) {
					// Fallback to filter if no project selected in modal
					taskData.projectId = selectedProjectId;
				}

				const response = await api.post<{ task: Task }>(endpoints.tasks.create, taskData);
				tasks = [...tasks, response.task];
				toast.success('Task created');
			} else {
				// Create an event via API
				// Parse the date string and create a date at midnight UTC to avoid timezone issues
				let dateString: string;
				if (newTaskDueDate) {
					// Use the date string directly and append midnight UTC
					dateString = `${newTaskDueDate}T00:00:00.000Z`;
				} else if (selectedDate) {
					// Format selected date as YYYY-MM-DD and append midnight UTC
					const year = selectedDate.getFullYear();
					const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
					const day = String(selectedDate.getDate()).padStart(2, '0');
					dateString = `${year}-${month}-${day}T00:00:00.000Z`;
				} else {
					// Use today's date at midnight UTC
					const today = new Date();
					const year = today.getFullYear();
					const month = String(today.getMonth() + 1).padStart(2, '0');
					const day = String(today.getDate()).padStart(2, '0');
					dateString = `${year}-${month}-${day}T00:00:00.000Z`;
				}
				
				const eventData: Record<string, unknown> = {
					workspaceId,
					title: newTaskTitle.trim(),
					description: newTaskDescription.trim(),
					date: dateString,
					status: 'scheduled'
				};

				if (newTaskPriority) {
					eventData.priority = newTaskPriority;
				}

				const response = await api.post<{ event: CalendarEvent }>(endpoints.events.create, eventData);
				// Parse the date from the API response and normalize it
				// The API returns the date as stored in the database (UTC)
				let eventDate: Date;
				if (response.event.date) {
					const parsedDate = new Date(response.event.date as string);
					// Normalize to midnight in local timezone (same as Calendar component does)
					eventDate = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
				} else {
					const today = new Date();
					eventDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
				}
				const createdEvent: CalendarEvent = {
					...response.event,
					date: eventDate,
					type: 'event'
				};
				// Add to events array - this will trigger reactivity for calendarEvents
				events = [...events, createdEvent];
				// Wait for reactivity to update calendarEvents
				await tick();
				// Force a complete recalculation of calendarEvents to ensure Calendar component updates
				// This ensures the reactive statement runs and calendarEvents gets a new reference
				// Force recalculation by reassigning calendarEvents (reactive statement will recalculate)
				calendarEvents = calendarEvents;
				toast.success('Event created');
			}
			closeCreateModal();
		} catch (error) {
			log.error('Create event error', error instanceof Error ? error : new Error(String(error)), { newEventType, newEventTitle: newTaskTitle || newTaskDescription });
			// Fallback: create locally
			if (newEventType === 'task') {
				const workspaceId = $currentWorkspaceId || 'demo-workspace';
				const now = new Date().toISOString();
				const newTask: Task = {
					id: Date.now().toString(),
					workspaceId,
					projectId: newTaskProjectId,
					title: newTaskTitle.trim(),
					description: newTaskDescription.trim(),
					status: 'todo' as TaskStatus,
					priority: (newTaskPriority || 'medium') as TaskPriority,
					assigneeId: null,
					assignee: null,
					dueDate: newTaskDueDate ? new Date(newTaskDueDate).toISOString() : null,
					tags: [],
					coverUrl: null,
					checklists: [],
					order: 0,
					parentTaskId: null,
					templateId: null,
					createdBy: 'demo-user',
					completedAt: null,
					createdAt: now,
					updatedAt: now
				};
				tasks = [...tasks, newTask];
				toast.success('Task created locally');
			} else {
				// Fallback: create event locally
				let eventDate: Date;
				if (newTaskDueDate) {
					// Parse YYYY-MM-DD format and create date at midnight local time
					const [year, month, day] = newTaskDueDate.split('-').map(Number);
					eventDate = new Date(year, month - 1, day, 0, 0, 0, 0);
				} else if (selectedDate) {
					// Use selected date, normalized to midnight
					eventDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 0, 0, 0, 0);
				} else {
					eventDate = new Date();
					eventDate.setHours(0, 0, 0, 0);
				}
				
				const newEvent: CalendarEvent = {
					id: `event-${Date.now()}`,
					title: newTaskTitle.trim(),
					description: newTaskDescription.trim(),
					date: eventDate.toISOString(),
					status: 'scheduled',
					type: 'event'
				};

				if (newTaskPriority) {
					newEvent.priority = newTaskPriority;
				}
				events = [...events, newEvent as CalendarEvent];
				toast.success('Event created locally');
			}
			closeCreateModal();
		} finally {
			creatingTask = false;
		}
	}

	async function updateEvent() {
		if (!selectedEvent || !newTaskTitle.trim()) {
			toast.error('Please enter a title');
			return;
		}

		const workspaceId = $currentWorkspaceId;
		if (!workspaceId) {
			toast.error('Please select a workspace first');
			return;
		}

		updatingTask = true;
		try {
			if (selectedEvent.type === 'event') {
				// Update event via API
				let dateString: string;
				if (newTaskDueDate) {
					dateString = `${newTaskDueDate}T00:00:00.000Z`;
				} else if (selectedEvent.date) {
					const eventDate = selectedEvent.date instanceof Date 
						? selectedEvent.date 
						: new Date(selectedEvent.date);
					const year = eventDate.getFullYear();
					const month = String(eventDate.getMonth() + 1).padStart(2, '0');
					const day = String(eventDate.getDate()).padStart(2, '0');
					dateString = `${year}-${month}-${day}T00:00:00.000Z`;
				} else {
					dateString = new Date().toISOString();
				}

				const eventData: Record<string, unknown> = {
					title: newTaskTitle.trim(),
					description: newTaskDescription.trim(),
					date: dateString
				};

				if (newTaskPriority) {
					eventData.priority = newTaskPriority;
				}

				await api.patch(endpoints.events.update(selectedEvent.id), eventData);
				await loadEvents();
				toast.success('Event updated');
			} else {
				// Update task via API
				const taskData: Record<string, unknown> = {
					title: newTaskTitle.trim()
				};

				if (newTaskDescription.trim()) {
					taskData.description = newTaskDescription.trim();
				}

				if (newTaskDueDate) {
					taskData.dueDate = new Date(newTaskDueDate).toISOString();
				}

				if (newTaskPriority) {
					taskData.priority = newTaskPriority;
				}
				
				if (newTaskProjectId !== undefined) {
					taskData.projectId = newTaskProjectId || null;
				}

				await api.patch(endpoints.tasks.update(selectedEvent.id), taskData);
				await loadTasks();
				toast.success('Task updated');
			}
			closeEditModal();
		} catch (error) {
			log.error('Update event error', error instanceof Error ? error : new Error(String(error)), { eventId: selectedEvent?.id });
			toast.error('Failed to update');
		} finally {
			updatingTask = false;
		}
	}

	async function confirmDelete() {
		if (!selectedEvent) {
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
			if (selectedEvent.type === 'event') {
				await api.delete(endpoints.events.delete(selectedEvent.id));
				events = events.filter(e => e.id !== selectedEvent!.id);
				toast.success('Event deleted');
			} else {
				await api.delete(endpoints.tasks.delete(selectedEvent.id));
				tasks = tasks.filter(t => t.id !== selectedEvent!.id);
				toast.success('Task deleted');
			}
			closeDeleteConfirm();
			closeEditModal();
		} catch (error) {
			log.error('Delete event error', error instanceof Error ? error : new Error(String(error)), { eventId: selectedEvent?.id });
			toast.error('Failed to delete');
		} finally {
			deletingTask = false;
		}
	}
</script>

<div class="flex h-full flex-col">
	<!-- Header -->
	<div class="border-b px-6 py-4">
		<div class="flex items-center justify-between">
			<div>
				<h1 class="text-2xl font-bold">Calendar</h1>
				<p class="text-sm text-muted-foreground">
					View your events and deadlines by date
				</p>
			</div>
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
			
			<!-- New Calendar Button -->
			<Button
				variant="outline"
				size="sm"
				on:click={() => showCreateProjectModal = true}
			>
				<CalendarIcon class="mr-2 h-4 w-4" />
				New Calendar
			</Button>
		</div>
	</div>

	<!-- Calendar Content -->
	<div class="flex-1 overflow-auto">
		{#if isLoading}
			<div class="flex h-full items-center justify-center">
				<div class="text-center">
					<div class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
					<p class="mt-2 text-sm text-muted-foreground">Loading calendar...</p>
				</div>
			</div>
		{:else}
			<div class="flex flex-col h-full">
				<!-- Upcoming Events Section -->
				{#if upcomingEvents.length > 0}
					<div class="border-b px-6 py-4 bg-muted/30">
						<h2 class="text-lg font-semibold mb-3 flex items-center gap-2">
							<Clock class="h-5 w-5" />
							Upcoming Events
						</h2>
						<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
							{#each upcomingEvents as event}
								<button
									class="text-left rounded-lg border bg-background p-3 hover:shadow-md transition-shadow"
									on:click={() => openEditModal(event)}
								>
									<div class="flex items-start justify-between gap-2">
										<div class="flex-1 min-w-0">
											<div class="flex items-center gap-2 mb-1">
												{#if event.type === 'event'}
													<CalendarIcon class="h-4 w-4 text-purple-500 flex-shrink-0" />
												{:else}
													<CheckSquare class="h-4 w-4 text-blue-500 flex-shrink-0" />
												{/if}
												{#if event.priority === 'urgent' && event.type !== 'event'}
													<AlertCircle class="h-4 w-4 text-red-500 flex-shrink-0" />
												{/if}
												<h3 class="font-medium text-sm truncate {event.status === 'done' || event.status === 'completed' ? 'line-through opacity-60' : ''}">
													{event.title}
												</h3>
											</div>
											{#if event.description}
												<p class="text-xs text-muted-foreground line-clamp-1 mb-2">
													{event.description}
												</p>
											{/if}
											<div class="flex items-center gap-3 text-xs">
												<span class="flex items-center gap-1 text-muted-foreground">
													<CalendarIcon class="h-3 w-3" />
													{formatDate(event.date)}
												</span>
												{#if event.priority}
													<span class="font-medium {getPriorityColor(event.priority)}">
														{event.priority}
													</span>
												{/if}
											</div>
										</div>
									</div>
								</button>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Calendar -->
				<div class="flex-1 overflow-auto">
					<Calendar
						events={calendarEvents}
						showCreateButton={true}
						on:create={handleCreate}
						on:open={handleOpen}
					/>
				</div>
			</div>
		{/if}
	</div>
</div>

<!-- Create Event Modal -->
{#if showCreateModal}
	<div 
		class="fixed inset-0 z-[50] flex items-center justify-center bg-black/50" 
		on:click={closeCreateModal}
		on:keydown={(e) => e.key === 'Escape' && closeCreateModal()}
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
			aria-labelledby="modal-title" 
			on:keydown={(e) => e.key === 'Escape' && closeCreateModal()}
		>
			<h2 id="modal-title" class="mb-4 text-xl font-semibold">Create New {newEventType === 'task' ? 'Task' : 'Event'}</h2>

			<div class="space-y-4">
				<div>
					<Label for="event-type">Type *</Label>
					<select
						id="event-type"
						bind:value={newEventType}
						disabled={creatingTask}
						class="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
					>
						<option value="task">Task</option>
						<option value="event">Event</option>
					</select>
				</div>

				<div>
					<Label for="task-title">Title *</Label>
					<Input
						id="task-title"
						type="text"
						bind:value={newTaskTitle}
						placeholder="Enter {newEventType === 'task' ? 'task' : 'event'} title..."
						disabled={creatingTask}
						class="mt-1"
					/>
				</div>

				<div>
					<Label for="task-description">Description</Label>
					<Textarea
						id="task-description"
						bind:value={newTaskDescription}
						placeholder="Enter {newEventType === 'task' ? 'task' : 'event'} description..."
						rows={3}
						disabled={creatingTask}
						class="mt-1"
					/>
				</div>

				{#if newEventType === 'task'}
					<div>
						<Label for="task-due-date">Due Date</Label>
						<Input
							id="task-due-date"
							type="date"
							bind:value={newTaskDueDate}
							disabled={creatingTask}
							class="mt-1"
						/>
					</div>

					<div>
						<Label for="task-priority">Priority (Optional)</Label>
						<select
							id="task-priority"
							bind:value={newTaskPriority}
							disabled={creatingTask}
							class="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
						>
							<option value="">None</option>
							<option value="low">Low</option>
							<option value="medium">Medium</option>
							<option value="high">High</option>
							<option value="urgent">Urgent</option>
						</select>
					</div>

					<!-- Project -->
					<div>
						<Label for="task-project">Project</Label>
						<select
							id="task-project"
							value={newTaskProjectId || ''}
							on:change={(e) => {
								const target = e.target;
								if (target && target instanceof HTMLSelectElement) {
									newTaskProjectId = target.value || null;
								}
							}}
							disabled={creatingTask}
							class="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
						>
							<option value="">No Project</option>
							{#each projects as project}
								<option value={project.id}>{project.name}</option>
							{/each}
						</select>
						{#if projects.length === 0}
							<p class="mt-1 text-xs text-muted-foreground">
								No projects yet. <button type="button" class="text-primary hover:underline" on:click={() => { showCreateModal = false; showCreateProjectModal = true; }}>Create a new calendar</button>
							</p>
						{/if}
					</div>
				{:else}
					<div>
						<Label for="event-date">Date</Label>
						<Input
							id="event-date"
							type="date"
							bind:value={newTaskDueDate}
							disabled={creatingTask}
							class="mt-1"
						/>
					</div>
				{/if}
			</div>

			<div class="mt-6 flex gap-2">
				<Button
					variant="outline"
					on:click={closeCreateModal}
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
						Create {newEventType === 'task' ? 'Task' : 'Event'}
					{/if}
				</Button>
			</div>
		</div>
	</div>
{/if}

<!-- Delete Confirmation Modal -->
{#if showDeleteConfirmModal && selectedEvent}
	<div 
		class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" 
		on:click={closeDeleteConfirm}
		on:keydown={(e) => e.key === 'Escape' && closeDeleteConfirm()}
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
			aria-labelledby="delete-modal-title" 
			on:keydown={(e) => e.key === 'Escape' && closeDeleteConfirm()}
		>
			<div class="mb-4 flex items-center justify-between">
				<h2 id="delete-modal-title" class="text-xl font-semibold text-destructive">Confirm Deletion</h2>
				<Button variant="ghost" size="icon" on:click={closeDeleteConfirm} disabled={deletingTask}>
					<X class="h-4 w-4" />
				</Button>
			</div>

			<div class="mb-6">
				<p class="text-sm text-muted-foreground">
					Are you sure you want to delete <strong>"{selectedEvent.title}"</strong>?
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

<style>
	.line-clamp-1 {
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 1;
		line-clamp: 1;
		-webkit-box-orient: vertical;
	}
</style>

<!-- Edit Event/Task Modal -->
{#if showEditModal && selectedEvent}
	<div 
		class="fixed inset-0 z-[50] flex items-center justify-center bg-black/50" 
		on:click={closeEditModal}
		on:keydown={(e) => e.key === 'Escape' && closeEditModal()}
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
			aria-labelledby="edit-modal-title" 
			on:keydown={(e) => e.key === 'Escape' && closeEditModal()}
		>
			<div class="mb-4 flex items-center justify-between">
				<h2 id="edit-modal-title" class="text-xl font-semibold">Edit {selectedEvent.type === 'event' ? 'Event' : 'Task'}</h2>
				<Button variant="ghost" size="icon" on:click={closeEditModal} disabled={updatingTask || deletingTask}>
					<X class="h-4 w-4" />
				</Button>
			</div>

			<div class="space-y-4">
				<div>
					<Label for="edit-title">Title *</Label>
					<Input
						id="edit-title"
						type="text"
						bind:value={newTaskTitle}
						placeholder="Enter {selectedEvent.type === 'event' ? 'event' : 'task'} title..."
						disabled={updatingTask || deletingTask}
						class="mt-1"
					/>
				</div>

				<div>
					<Label for="edit-description">Description</Label>
					<Textarea
						id="edit-description"
						bind:value={newTaskDescription}
						placeholder="Enter {selectedEvent.type === 'event' ? 'event' : 'task'} description..."
						rows={3}
						disabled={updatingTask || deletingTask}
						class="mt-1"
					/>
				</div>

				<div>
					<Label for="edit-date">{selectedEvent.type === 'task' ? 'Due Date' : 'Date'}</Label>
					<Input
						id="edit-date"
						type="date"
						bind:value={newTaskDueDate}
						disabled={updatingTask || deletingTask}
						class="mt-1"
					/>
				</div>

				<div>
					<Label for="edit-priority">Priority (Optional)</Label>
					<select
						id="edit-priority"
						bind:value={newTaskPriority}
						disabled={updatingTask || deletingTask}
						class="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
					>
						<option value="">None</option>
						<option value="low">Low</option>
						<option value="medium">Medium</option>
						<option value="high">High</option>
						<option value="urgent">Urgent</option>
					</select>
				</div>

				<!-- Project (only for tasks) -->
				{#if selectedEvent.type === 'task'}
					<div>
						<Label for="edit-task-project">Project</Label>
						<select
							id="edit-task-project"
							value={newTaskProjectId || ''}
							on:change={(e) => {
								const target = e.target;
								if (target && target instanceof HTMLSelectElement) {
									newTaskProjectId = target.value || null;
								}
							}}
							disabled={updatingTask || deletingTask}
							class="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
						>
							<option value="">No Project</option>
							{#each projects as project}
								<option value={project.id}>{project.name}</option>
							{/each}
						</select>
					</div>
				{/if}
			</div>

			<div class="mt-6 flex gap-2">
				<Button
					variant="destructive"
					on:click={openDeleteConfirm}
					disabled={updatingTask || deletingTask}
					class="flex-1"
				>
					<Trash2 class="mr-2 h-4 w-4" />
					Delete
				</Button>
				<Button
					variant="outline"
					on:click={closeEditModal}
					disabled={updatingTask || deletingTask}
				>
					Cancel
				</Button>
				<Button
					on:click={updateEvent}
					disabled={updatingTask || deletingTask || !newTaskTitle.trim()}
				>
					{#if updatingTask}
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

<!-- Create Calendar Modal -->
{#if showCreateProjectModal}
	<div 
		class="fixed inset-0 z-[50] flex items-center justify-center bg-black/50" 
		on:click={() => { showCreateProjectModal = false; newCalendarName = ''; createNewCalendar = true; calendarProjectId = null; }}
		on:keydown={(e) => e.key === 'Escape' && (showCreateProjectModal = false) && (newCalendarName = '')}
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
			aria-labelledby="create-calendar-title"
			on:keydown={(e) => e.key === 'Escape' && (showCreateProjectModal = false) && (newCalendarName = '')}
		>
			<div class="mb-4 flex items-center justify-between">
				<h2 id="create-calendar-title" class="text-xl font-semibold">Create New Calendar</h2>
				<Button variant="ghost" size="icon" on:click={() => { showCreateProjectModal = false; newCalendarName = ''; createNewCalendar = true; calendarProjectId = null; }} disabled={creatingCalendar}>
					<X class="h-4 w-4" />
				</Button>
			</div>

			<div class="space-y-4">
				<!-- Option: Create new or select existing -->
				<div class="flex gap-4">
					<label class="flex items-center gap-2 cursor-pointer">
						<input
							type="radio"
							bind:group={createNewCalendar}
							value={true}
							disabled={creatingCalendar}
							class="h-4 w-4"
						/>
						<span class="text-sm">Create New Calendar</span>
					</label>
					<label class="flex items-center gap-2 cursor-pointer">
						<input
							type="radio"
							bind:group={createNewCalendar}
							value={false}
							disabled={creatingCalendar}
							class="h-4 w-4"
						/>
						<span class="text-sm">Select Existing Project</span>
					</label>
				</div>

				{#if createNewCalendar}
					<div>
						<Label for="calendar-name">Calendar Name *</Label>
						<Input
							id="calendar-name"
							bind:value={newCalendarName}
							placeholder="Enter calendar name"
							disabled={creatingCalendar}
							on:keydown={(e) => e.key === 'Enter' && !creatingCalendar && createCalendar()}
							autofocus
						/>
					</div>
				{:else}
					<div>
						<Label for="calendar-project">Select Project</Label>
						<select
							id="calendar-project"
							value={calendarProjectId || ''}
							on:change={(e) => {
								const target = e.target;
								if (target && target instanceof HTMLSelectElement) {
									calendarProjectId = target.value || null;
								}
							}}
							class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
							disabled={creatingCalendar}
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
					on:click={() => { showCreateProjectModal = false; newCalendarName = ''; createNewCalendar = true; calendarProjectId = null; }}
					disabled={creatingCalendar}
				>
					Cancel
				</Button>
				<Button
					on:click={createCalendar}
					disabled={creatingCalendar || (createNewCalendar && !newCalendarName.trim()) || (!createNewCalendar && !calendarProjectId)}
				>
					{#if creatingCalendar}
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
