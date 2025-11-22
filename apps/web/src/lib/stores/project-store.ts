import { writable, derived, get } from 'svelte/store';
import { ProjectService, type Project } from '$lib/services/project-service';
import { workspaceStore } from './workspace';
import { toast } from 'svelte-sonner';
import { log } from '$lib/logger';

interface ProjectStoreState {
	projects: Project[];
	archivedProjects: Project[];
	loading: boolean;
	error: string | null;
}

function createProjectStore() {
	const { subscribe, set, update } = writable<ProjectStoreState>({
		projects: [],
		archivedProjects: [],
		loading: false,
		error: null
	});

	return {
		subscribe,

		async loadProjects(workspaceId: string | null = null): Promise<void> {
			const targetWorkspaceId = workspaceId || workspaceStore.getCurrentWorkspaceId();

			if (!targetWorkspaceId) {
				update(state => ({
					...state,
					projects: [],
					archivedProjects: [],
					loading: false,
					error: 'No workspace selected'
				}));
				return;
			}

			update(state => ({ ...state, loading: true, error: null }));

			try {
				const allProjects = await ProjectService.listByWorkspace(targetWorkspaceId);
				
				update(state => ({
					...state,
					projects: allProjects.filter(p => !p.isArchived),
					archivedProjects: allProjects.filter(p => p.isArchived),
					loading: false,
					error: null
				}));
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Failed to load projects';
				log.error('Load projects error', error instanceof Error ? error : new Error(String(error)), { workspaceId: targetWorkspaceId });
				update(state => ({
					...state,
					projects: [],
					archivedProjects: [],
					loading: false,
					error: errorMessage
				}));
				toast.error('Failed to load projects');
			}
		},

		async createProject(workspaceId: string, data: Parameters<typeof ProjectService.create>[1]): Promise<Project | null> {
			try {
				const project = await ProjectService.create(workspaceId, data);
				
				update(state => ({
					...state,
					projects: [...state.projects, project]
				}));

				toast.success('Project created successfully');
				return project;
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Failed to create project';
				log.error('Create project error', error instanceof Error ? error : new Error(String(error)), { workspaceId, data });
				toast.error(errorMessage);
				return null;
			}
		},

		async updateProject(projectId: string, data: Parameters<typeof ProjectService.update>[1]): Promise<Project | null> {
			try {
				const project = await ProjectService.update(projectId, data);
				
				update(state => {
					const isArchived = project.isArchived;
					const projects = isArchived 
						? state.projects.filter(p => p.id !== projectId)
						: state.projects.map(p => p.id === projectId ? project : p);
					
					const archivedProjects = isArchived
						? [...state.archivedProjects.filter(p => p.id !== projectId), project]
						: state.archivedProjects.filter(p => p.id !== projectId);

					return {
						...state,
						projects,
						archivedProjects
					};
				});

				toast.success('Project updated successfully');
				return project;
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Failed to update project';
				log.error('Update project error', error instanceof Error ? error : new Error(String(error)), { projectId, data });
				toast.error(errorMessage);
				return null;
			}
		},

		async deleteProject(projectId: string): Promise<boolean> {
			try {
				await ProjectService.delete(projectId);
				
				update(state => ({
					...state,
					projects: state.projects.filter(p => p.id !== projectId),
					archivedProjects: state.archivedProjects.filter(p => p.id !== projectId)
				}));

				toast.success('Project deleted successfully');
				return true;
			} catch (error) {
				log.error('Delete project error', error instanceof Error ? error : new Error(String(error)), { projectId });
				toast.error('Failed to delete project');
				return false;
			}
		},

		async archiveProject(projectId: string): Promise<boolean> {
			const project = await this.updateProject(projectId, { isArchived: true });
			return project !== null;
		},

		async unarchiveProject(projectId: string): Promise<boolean> {
			const project = await this.updateProject(projectId, { isArchived: false });
			return project !== null;
		},

		reset(): void {
			set({
				projects: [],
				archivedProjects: [],
				loading: false,
				error: null
			});
		}
	};
}

export const projectStore = createProjectStore();

export const activeProjects = derived(projectStore, $store => $store.projects);
export const archivedProjects = derived(projectStore, $store => $store.archivedProjects);
export const projectsLoading = derived(projectStore, $store => $store.loading);
export const projectsError = derived(projectStore, $store => $store.error);

