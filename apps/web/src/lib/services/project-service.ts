import { api, endpoints } from '$lib/api-client';
import { handleError } from '$lib/error-handler';

export interface Project {
	id: string;
	workspaceId: string;
	userId: string | null; // For personal projects
	teamIds: string[]; // For team projects (can be multiple)
	name: string;
	description: string | null;
	icon: string | null;
	color: string | null;
	viewType: 'list' | 'board' | 'calendar' | 'table' | 'timeline';
	settings: Record<string, unknown> | null;
	isArchived: boolean;
	createdBy: string;
	createdAt: string;
	updatedAt: string;
}

export interface CreateProjectData {
	name: string;
	description?: string;
	icon?: string;
	color?: string;
	viewType?: 'list' | 'board' | 'calendar' | 'table' | 'timeline';
	settings?: Record<string, unknown>;
	userId?: string | null; // For personal projects
	teamIds?: string[]; // For team projects (can be multiple)
}

export interface UpdateProjectData {
	name?: string;
	description?: string;
	icon?: string;
	color?: string;
	viewType?: 'list' | 'board' | 'calendar' | 'table' | 'timeline';
	settings?: Record<string, unknown>;
	isArchived?: boolean;
	userId?: string | null; // For personal projects
	teamIds?: string[]; // For team projects (can be multiple)
}

export class ProjectService {
	static async listByWorkspace(workspaceId: string): Promise<Project[]> {
		try {
			const result = await api.get<{ projects: Project[] }>(endpoints.projects.listByWorkspace(workspaceId));
			return result.projects || [];
		} catch (error) {
			handleError(error, { action: 'load', resource: 'projects' }, { logContext: { workspaceId } });
			throw error;
		}
	}

	static async getById(projectId: string): Promise<Project> {
		try {
			const result = await api.get<{ project: Project }>(endpoints.projects.get(projectId));
			return result.project;
		} catch (error) {
			handleError(error, { action: 'load', resource: 'project' }, { logContext: { projectId } });
			throw error;
		}
	}

	static async create(workspaceId: string, data: CreateProjectData): Promise<Project> {
		try {
			const result = await api.post<{ project: Project }>(endpoints.projects.create, {
				...data,
				workspaceId
			});
			return result.project;
		} catch (error) {
			handleError(error, { action: 'create', resource: 'project' }, { logContext: { workspaceId, data } });
			throw error;
		}
	}

	static async update(projectId: string, data: UpdateProjectData): Promise<Project> {
		try {
			const result = await api.patch<{ project: Project }>(endpoints.projects.update(projectId), data);
			return result.project;
		} catch (error) {
			handleError(error, { action: 'update', resource: 'project' }, { logContext: { projectId, data } });
			throw error;
		}
	}

	static async delete(projectId: string): Promise<void> {
		try {
			await api.delete(endpoints.projects.delete(projectId));
		} catch (error) {
			handleError(error, { action: 'delete', resource: 'project' }, { logContext: { projectId } });
			throw error;
		}
	}

	static async archive(projectId: string): Promise<Project> {
		return this.update(projectId, { isArchived: true });
	}

	static async unarchive(projectId: string): Promise<Project> {
		return this.update(projectId, { isArchived: false });
	}
}

