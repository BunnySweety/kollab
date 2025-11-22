import { api, endpoints } from '$lib/api-client';
import { handleError } from '$lib/error-handler';

export interface DriveFolder {
	id: string;
	workspaceId: string;
	projectId: string | null;
	parentId: string | null;
	name: string;
	folderType: 'general' | 'tasks' | 'documents' | 'calendar' | 'custom';
	createdBy: string;
	createdAt: string;
	updatedAt: string;
}

export interface DriveFile {
	id: string;
	workspaceId: string;
	projectId: string | null;
	folderId: string | null;
	fileName: string;
	fileUrl: string;
	fileKey: string;
	fileSize: number | null;
	mimeType: string | null;
	fileType: 'document' | 'task-attachment' | 'calendar' | 'general';
	documentId: string | null;
	taskId: string | null;
	uploadedBy: string;
	createdAt: string;
	updatedAt: string;
}

export type CreateFolderData = Pick<DriveFolder, 'name' | 'folderType'> & {
	workspaceId: string;
	projectId?: string;
	parentId?: string;
};

export type UpdateFolderData = Partial<Pick<DriveFolder, 'name' | 'parentId'>>;

export class DriveService {
	static async getFolders(params: {
		workspaceId: string;
		projectId?: string;
		parentId?: string | null;
	}): Promise<DriveFolder[]> {
		try {
			const apiParams: Record<string, string | number | boolean> = {
				workspaceId: params.workspaceId
			};
			if (params.projectId) apiParams.projectId = params.projectId;
			if (params.parentId !== null && params.parentId !== undefined) apiParams.parentId = params.parentId;
			const result = await api.get<{ folders: DriveFolder[] }>(endpoints.drive.folders.list, { params: apiParams });
			return result.folders || [];
		} catch (error) {
			handleError(error, { action: 'load', resource: 'folders' }, { logContext: params });
			throw error;
		}
	}

	static async getFolder(folderId: string): Promise<DriveFolder> {
		try {
			const result = await api.get<{ folder: DriveFolder }>(endpoints.drive.folders.get(folderId));
			return result.folder;
		} catch (error) {
			handleError(error, { action: 'load', resource: 'folder' }, { logContext: { folderId } });
			throw error;
		}
	}

	static async createFolder(data: CreateFolderData): Promise<DriveFolder> {
		try {
			const result = await api.post<{ folder: DriveFolder }>(endpoints.drive.folders.create, data);
			return result.folder;
		} catch (error) {
			handleError(error, { action: 'create', resource: 'folder' }, { logContext: { data } });
			throw error;
		}
	}

	static async updateFolder(folderId: string, data: UpdateFolderData): Promise<DriveFolder> {
		try {
			const result = await api.patch<{ folder: DriveFolder }>(endpoints.drive.folders.update(folderId), data);
			return result.folder;
		} catch (error) {
			handleError(error, { action: 'update', resource: 'folder' }, { logContext: { folderId, data } });
			throw error;
		}
	}

	static async deleteFolder(folderId: string): Promise<void> {
		try {
			await api.delete(endpoints.drive.folders.delete(folderId));
		} catch (error) {
			handleError(error, { action: 'delete', resource: 'folder' }, { logContext: { folderId } });
			throw error;
		}
	}

	static async getFiles(params: {
		workspaceId: string;
		projectId?: string;
		folderId?: string | null;
		fileType?: string;
	}): Promise<DriveFile[]> {
		try {
			const apiParams: Record<string, string | number | boolean> = {
				workspaceId: params.workspaceId
			};
			if (params.projectId) apiParams.projectId = params.projectId;
			if (params.folderId !== null && params.folderId !== undefined) apiParams.folderId = params.folderId;
			if (params.fileType) apiParams.fileType = params.fileType;
			const result = await api.get<{ files: DriveFile[] }>(endpoints.drive.files.list, { params: apiParams });
			return result.files || [];
		} catch (error) {
			handleError(error, { action: 'load', resource: 'files' }, { logContext: params });
			throw error;
		}
	}

	static async uploadFile(
		file: File,
		params: {
			workspaceId: string;
			projectId?: string;
			folderId?: string | null;
			fileType?: string;
		}
	): Promise<DriveFile> {
		try {
			const formData = new FormData();
			formData.append('file', file);
			formData.append('workspaceId', params.workspaceId);
			if (params.projectId) {
				formData.append('projectId', params.projectId);
			}
			if (params.folderId) {
				formData.append('folderId', params.folderId);
			}
			if (params.fileType) {
				formData.append('fileType', params.fileType);
			}

			// Use fetch directly for file uploads (FormData needs special handling)
			const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
			const url = `${API_BASE_URL}${endpoints.drive.files.upload}`;

			// Get CSRF token
			const csrfResponse = await fetch(`${API_BASE_URL}/api/auth/csrf-token`, {
				credentials: 'include'
			});
			const csrfData = await csrfResponse.json();
			const csrfToken = csrfData.csrfToken || '';

			const response = await fetch(url, {
				method: 'POST',
				credentials: 'include',
				headers: {
					'X-CSRF-Token': csrfToken
					// Don't set Content-Type - browser will set it with boundary
				},
				body: formData
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to upload file');
			}

			const result = await response.json();
			return result.file;
		} catch (error) {
			handleError(error, { action: 'upload', resource: 'file' }, { logContext: params });
			throw error;
		}
	}

	static async deleteFile(fileId: string): Promise<void> {
		try {
			await api.delete(endpoints.drive.files.delete(fileId));
		} catch (error) {
			handleError(error, { action: 'delete', resource: 'file' }, { logContext: { fileId } });
			throw error;
		}
	}

	static formatFileSize(bytes: number | null): string {
		if (!bytes) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
	}

	static getFileIcon(mimeType: string | null): string {
		if (!mimeType) return 'file';
		if (mimeType.startsWith('image/')) return 'image';
		if (mimeType.startsWith('video/')) return 'video';
		if (mimeType.startsWith('audio/')) return 'audio';
		if (mimeType.includes('pdf')) return 'file-text';
		if (mimeType.includes('word') || mimeType.includes('document')) return 'file-text';
		if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'file-spreadsheet';
		if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'file-presentation';
		if (mimeType.includes('zip') || mimeType.includes('archive')) return 'archive';
		return 'file';
	}
}

