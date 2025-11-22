/**
 * Demo tasks configuration
 * Can be overridden via environment variables
 */

type DemoTask = {
	id: string;
	title: string;
	description: string;
	status: 'todo' | 'in_progress' | 'done' | 'cancelled';
	priority: 'low' | 'medium' | 'high' | 'urgent';
	assignee: { name: string; avatar: string | null } | null;
	dueDate: Date | null;
	tags: string[];
};

/**
 * Generate a UUID for demo tasks
 */
function generateUUID(): string {
	if (typeof crypto !== 'undefined' && crypto.randomUUID) {
		return crypto.randomUUID();
	}
	// Fallback UUID generator
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
		const r = Math.random() * 16 | 0;
		const v = c === 'x' ? r : (r & 0x3 | 0x8);
		return v.toString(16);
	});
}

/**
 * Parse demo tasks from environment variable or use defaults
 */
export function getDemoTasks(): DemoTask[] {
	// Check if demo tasks are disabled
	const enableDemoTasks = import.meta.env.VITE_ENABLE_DEMO_TASKS !== 'false';
	if (!enableDemoTasks) {
		return [];
	}

	// Try to parse from environment variable
	const envTasks = import.meta.env.VITE_DEMO_TASKS;
	if (envTasks) {
		try {
			const parsed = JSON.parse(envTasks);
			// Convert parsed tasks to DemoTask format
			return parsed.map((task: any) => ({
				id: task.id || generateUUID(),
				title: task.title,
				description: task.description || '',
				status: task.status || 'todo',
				priority: task.priority || 'medium',
				assignee: task.assignee || null,
				dueDate: task.dueDateDaysOffset !== undefined && task.dueDateDaysOffset !== null
					? new Date(Date.now() + task.dueDateDaysOffset * 24 * 60 * 60 * 1000)
					: task.dueDate ? new Date(task.dueDate) : null,
				tags: task.tags || task.tagNames || []
			}));
		} catch (error) {
			console.warn('Failed to parse VITE_DEMO_TASKS, using defaults', error);
		}
	}

	// Default demo tasks
	const defaultTasks = [
		{
			title: 'Design new landing page',
			description: 'Create mockups for the new marketing site',
			status: 'todo' as const,
			priority: 'high' as const,
			assignee: { name: 'Alice', avatar: null },
			dueDateDaysOffset: 7,
			tags: ['design', 'marketing']
		},
		{
			title: 'Implement user authentication',
			description: 'Add OAuth providers and email auth',
			status: 'in_progress' as const,
			priority: 'urgent' as const,
			assignee: { name: 'Bob', avatar: null },
			dueDateDaysOffset: 3,
			tags: ['backend', 'security']
		},
		{
			title: 'Write API documentation',
			description: 'Document all REST endpoints',
			status: 'in_progress' as const,
			priority: 'medium' as const,
			assignee: { name: 'Charlie', avatar: null },
			dueDateDaysOffset: 5,
			tags: ['documentation']
		},
		{
			title: 'Setup CI/CD pipeline',
			description: 'Configure GitHub Actions for automated deployment',
			status: 'done' as const,
			priority: 'high' as const,
			assignee: { name: 'Dave', avatar: null },
			dueDateDaysOffset: -2,
			tags: ['devops']
		},
		{
			title: 'Optimize database queries',
			description: 'Improve query performance and add indexes',
			status: 'todo' as const,
			priority: 'medium' as const,
			assignee: { name: 'Eve', avatar: null },
			dueDateDaysOffset: 10,
			tags: ['backend', 'performance']
		},
		{
			title: 'Add dark mode support',
			description: 'Implement theme switching functionality',
			status: 'todo' as const,
			priority: 'low' as const,
			assignee: null,
			dueDateDaysOffset: null,
			tags: ['frontend', 'ui']
		}
	];

	return defaultTasks.map(task => ({
		id: generateUUID(),
		title: task.title,
		description: task.description,
		status: task.status,
		priority: task.priority,
		assignee: task.assignee,
		dueDate: task.dueDateDaysOffset !== null && task.dueDateDaysOffset !== undefined
			? new Date(Date.now() + task.dueDateDaysOffset * 24 * 60 * 60 * 1000)
			: null,
		tags: task.tags
	}));
}

