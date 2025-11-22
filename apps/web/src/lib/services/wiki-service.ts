import { api, endpoints } from '$lib/api-client';
import { log } from '$lib/logger';
import { handleError } from '$lib/error-handler';

export interface WikiPage {
	id: string;
	workspaceId: string;
	projectId: string | null;
	parentId: string | null;
	title: string;
	slug: string;
	content: unknown; // TipTap JSON
	excerpt: string | null;
	icon: string | null;
	coverUrl: string | null;
	isPublished: boolean;
	isArchived: boolean;
	order: number;
	createdBy: string;
	lastEditedBy: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface WikiPageLink {
	id: string;
	fromPageId: string;
	toPageId: string;
	createdAt: string;
}

export interface WikiComment {
  id: string;
  pageId: string;
  content: string;
  isResolved: boolean;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
}

export type CreateWikiPageData = {
	workspaceId: string;
	projectId?: string;
	parentId?: string;
	title: string;
	slug?: string;
	content?: unknown;
	excerpt?: string;
	icon?: string;
	coverUrl?: string;
	isPublished?: boolean;
};

export type UpdateWikiPageData = {
	title?: string;
	slug?: string;
	content?: unknown;
	excerpt?: string;
	icon?: string;
	coverUrl?: string;
	isPublished?: boolean;
	isArchived?: boolean;
	parentId?: string | null;
	order?: number;
};

export class WikiService {
	static async listByWorkspace(workspaceId: string, options?: { projectId?: string; archived?: boolean }): Promise<WikiPage[]> {
		try {
			const params: Record<string, string> = {};
			if (options?.projectId) params.projectId = options.projectId;
			if (options?.archived) params.archived = 'true';

			const result = await api.get<{ pages: WikiPage[] }>(endpoints.wiki.listByWorkspace(workspaceId), { params });
			return result.pages || [];
		} catch (error) {
			log.error('Failed to load wiki pages', error, { workspaceId });
			throw error;
		}
	}

	static async get(pageId: string): Promise<{ page: WikiPage; linkedPages: WikiPageLink[] }> {
		try {
			const result = await api.get<{ page: WikiPage; linkedPages: WikiPageLink[] }>(endpoints.wiki.get(pageId));
			return result;
		} catch (error) {
			log.error('Failed to load wiki page', error, { pageId });
			throw error;
		}
	}

	static async getBySlug(workspaceId: string, slug: string): Promise<WikiPage> {
		try {
			const result = await api.get<{ page: WikiPage }>(endpoints.wiki.getBySlug(workspaceId, slug));
			return result.page;
		} catch (error) {
			log.error('Failed to load wiki page by slug', error, { workspaceId, slug });
			throw error;
		}
	}

	static async create(data: CreateWikiPageData): Promise<WikiPage> {
		try {
			const result = await api.post<{ page: WikiPage }>(endpoints.wiki.create, data);
			return result.page;
		} catch (error) {
			handleError(error, { action: 'create', resource: 'wiki page' }, { logContext: { data } });
			throw error;
		}
	}

	static async update(pageId: string, data: UpdateWikiPageData): Promise<WikiPage> {
		try {
			const result = await api.patch<{ page: WikiPage }>(endpoints.wiki.update(pageId), data);
			return result.page;
		} catch (error) {
			handleError(error, { action: 'update', resource: 'wiki page' }, { logContext: { pageId, data } });
			throw error;
		}
	}

	static async delete(pageId: string): Promise<void> {
		try {
			await api.delete(endpoints.wiki.delete(pageId));
		} catch (error) {
			handleError(error, { action: 'delete', resource: 'wiki page' }, { logContext: { pageId } });
			throw error;
		}
	}

	static async createLink(fromPageId: string, toPageId: string): Promise<WikiPageLink> {
		try {
			const result = await api.post<{ link: WikiPageLink }>(endpoints.wiki.links.create(fromPageId), { toPageId });
			return result.link;
		} catch (error) {
			handleError(error, { action: 'create', resource: 'wiki page link' }, { logContext: { fromPageId, toPageId } });
			throw error;
		}
	}

	static async deleteLink(fromPageId: string, toPageId: string): Promise<void> {
		try {
			await api.delete(endpoints.wiki.links.delete(fromPageId, toPageId));
		} catch (error) {
			handleError(error, { action: 'delete', resource: 'wiki page link' }, { logContext: { fromPageId, toPageId } });
			throw error;
		}
	}

	static async listComments(pageId: string): Promise<WikiComment[]> {
		try {
			const result = await api.get<{ comments: WikiComment[] }>(endpoints.wiki.comments.list(pageId));
			return result.comments || [];
		} catch (error) {
			log.error('Failed to load wiki comments', error, { pageId });
			throw error;
		}
	}

	static async createComment(pageId: string, content: string): Promise<WikiComment> {
		try {
			const result = await api.post<{ comment: WikiComment }>(endpoints.wiki.comments.create(pageId), { content });
			return result.comment;
		} catch (error) {
			handleError(error, { action: 'create', resource: 'wiki comment' }, { logContext: { pageId } });
			throw error;
		}
	}

	static async updateComment(commentId: string, data: { content?: string; isResolved?: boolean }): Promise<WikiComment> {
		try {
			const result = await api.patch<{ comment: WikiComment }>(endpoints.wiki.comments.update(commentId), data);
			return result.comment;
		} catch (error) {
			handleError(error, { action: 'update', resource: 'wiki comment' }, { logContext: { commentId, data } });
			throw error;
		}
	}

	static async deleteComment(commentId: string): Promise<void> {
		try {
			await api.delete(endpoints.wiki.comments.delete(commentId));
		} catch (error) {
			handleError(error, { action: 'delete', resource: 'wiki comment' }, { logContext: { commentId } });
			throw error;
		}
	}

	static async getBacklinks(pageId: string): Promise<WikiPage[]> {
		try {
			const result = await api.get<{ pages: WikiPage[] }>(endpoints.wiki.backlinks(pageId));
			return result.pages || [];
		} catch (error) {
			log.error('Failed to load wiki backlinks', error, { pageId });
			return [];
		}
	}

	static async getAnalytics(pageId: string): Promise<{ totalViews: number; uniqueViewers: number; lastViewed: string | null; viewsByDay: unknown[]; topViewers: unknown[] }> {
		try {
			const result = await api.get<{ totalViews: number; uniqueViewers: number; lastViewed: string | null; viewsByDay: unknown[]; topViewers: unknown[] }>(endpoints.wiki.analytics(pageId));
			return result;
		} catch (error) {
			log.error('Failed to load wiki analytics', error, { pageId });
			return { totalViews: 0, uniqueViewers: 0, lastViewed: null, viewsByDay: [], topViewers: [] };
		}
	}

	static async recordView(pageId: string): Promise<void> {
		try {
			await api.post(endpoints.wiki.recordView(pageId), {});
		} catch (error) {
			// Silently fail - view tracking is not critical
			log.error('Failed to record wiki view', error, { pageId });
		}
	}
}
