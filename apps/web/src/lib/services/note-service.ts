import { api, endpoints } from '$lib/api-client';
import { log } from '$lib/logger';
import { handleError } from '$lib/error-handler';

export interface Note {
	id: string;
	workspaceId: string;
	projectId: string | null;
	userId: string | null;
	title: string;
	content: string | null;
	tags: string[];
	color: string | null;
	isPinned: boolean;
	isArchived: boolean;
	createdBy: string;
	createdAt: string;
	updatedAt: string;
}

export type CreateNoteData = {
	workspaceId: string;
	projectId?: string;
	userId?: string;
	title: string;
	content?: string;
	tags?: string[];
	color?: string;
	isPinned?: boolean;
};

export type UpdateNoteData = {
	title?: string;
	content?: string;
	tags?: string[];
	color?: string;
	isPinned?: boolean;
	isArchived?: boolean;
};

export class NoteService {
	static async listByWorkspace(workspaceId: string, options?: { projectId?: string; userId?: string; archived?: boolean }): Promise<Note[]> {
		try {
			const params: Record<string, string> = {};
			if (options?.projectId) params.projectId = options.projectId;
			if (options?.userId) params.userId = options.userId;
			if (options?.archived) params.archived = 'true';

			const result = await api.get<{ notes: Note[] }>(endpoints.notes.listByWorkspace(workspaceId), { params });
			return result.notes || [];
		} catch (error) {
			log.error('Failed to load notes', error, { workspaceId });
			throw error;
		}
	}

	static async get(noteId: string): Promise<Note> {
		try {
			const result = await api.get<{ note: Note }>(endpoints.notes.get(noteId));
			return result.note;
		} catch (error) {
			log.error('Failed to load note', error, { noteId });
			throw error;
		}
	}

	static async create(data: CreateNoteData): Promise<Note> {
		try {
			const result = await api.post<{ note: Note }>(endpoints.notes.create, data);
			return result.note;
		} catch (error) {
			handleError(error, { action: 'create', resource: 'note' }, { logContext: { data } });
			throw error;
		}
	}

	static async update(noteId: string, data: UpdateNoteData): Promise<Note> {
		try {
			const result = await api.patch<{ note: Note }>(endpoints.notes.update(noteId), data);
			return result.note;
		} catch (error) {
			handleError(error, { action: 'update', resource: 'note' }, { logContext: { noteId, data } });
			throw error;
		}
	}

	static async delete(noteId: string): Promise<void> {
		try {
			await api.delete(endpoints.notes.delete(noteId));
		} catch (error) {
			handleError(error, { action: 'delete', resource: 'note' }, { logContext: { noteId } });
			throw error;
		}
	}
}

