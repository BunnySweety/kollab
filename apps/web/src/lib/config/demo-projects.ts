/**
 * Demo projects configuration
 * Can be overridden via environment variables
 */

type DemoProject = {
	id: string;
	name: string;
	workspaceId: string;
};

/**
 * Get demo projects from environment variable or use defaults
 */
export function getDemoProjects(workspaceId: string): DemoProject[] {
	// Try to parse from environment variable
	const envProjects = import.meta.env.VITE_DEMO_PROJECTS;
	if (envProjects) {
		try {
			const parsed = JSON.parse(envProjects);
			// Convert parsed projects to DemoProject format
			return parsed.map((project: any) => ({
				id: project.id || `project-${Date.now()}-${Math.random()}`,
				name: project.name,
				workspaceId: workspaceId
			}));
		} catch (error) {
			console.warn('Failed to parse VITE_DEMO_PROJECTS, using defaults', error);
		}
	}

	// Default demo projects
	return [
		{ id: 'default', name: 'All Tasks', workspaceId },
		{ id: 'project-1', name: 'Product Launch', workspaceId },
		{ id: 'project-2', name: 'Marketing Campaign', workspaceId }
	];
}

