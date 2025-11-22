/**
 * Document Service
 * 
 * Business logic for document management
 */

import { db } from '../db';
import { documents } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { checkWorkspaceMembership } from '../lib/workspace-helpers';
import { cacheGetOrSet, cacheDel, cacheDelPattern, CACHE_KEYS, CACHE_TTL } from '../lib/cache';
import { log } from '../lib/logger';
import { ValidationError, NotFoundError, ForbiddenError, InternalServerError } from '../lib/errors';
import type { User } from '../types';

/**
 * Input for creating a document
 */
export interface CreateDocumentInput {
  workspaceId: string;
  parentId?: string;
  title: string;
  icon?: string;
  content?: unknown;
}

/**
 * Input for updating a document
 */
export interface UpdateDocumentInput {
  title?: string;
  icon?: string;
  coverUrl?: string;
  content?: unknown;
  isArchived?: boolean;
  isPublished?: boolean;
  publishedSlug?: string;
  parentId?: string | null;
}

/**
 * Document Service Class
 */
export class DocumentService {
  /**
   * Get all documents in a workspace
   */
  static async getDocuments(workspaceId: string, user: User): Promise<unknown[]> {
    // Check workspace membership
    const membership = await checkWorkspaceMembership(workspaceId, user.id);
    if (!membership) {
      throw new ForbiddenError('Access denied: User is not a member of this workspace');
    }

    // Cache key for documents list
    const cacheKey = `${CACHE_KEYS.DOCUMENTS_LIST}${workspaceId}`;

    // Get documents with cache
    const allDocuments = await cacheGetOrSet(
      cacheKey,
      async () => {
        return await db
          .select()
          .from(documents)
          .where(
            and(
              eq(documents.workspaceId, workspaceId),
              eq(documents.isArchived, false)
            )
          )
          .orderBy(documents.order);
      },
      CACHE_TTL.DOCUMENTS_LIST
    );

    return allDocuments;
  }

  /**
   * Get a single document by ID
   */
  static async getDocumentById(documentId: string, user: User): Promise<typeof documents.$inferSelect> {
    // Get document
    const [document] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    if (!document) {
      throw new NotFoundError('Document');
    }

    // Check workspace membership
    const membership = await checkWorkspaceMembership(document.workspaceId, user.id);
    if (!membership) {
      throw new ForbiddenError('Access denied: User is not a member of this workspace');
    }

    return document;
  }

  /**
   * Create a new document
   */
  static async createDocument(data: CreateDocumentInput, userId: string): Promise<typeof documents.$inferSelect> {
    // Check workspace membership (editors+ only)
    const membership = await checkWorkspaceMembership(data.workspaceId, userId, ['editor', 'admin', 'owner']);
    if (!membership) {
      throw new ForbiddenError('Access denied: Editor role or higher required');
    }

    try {
      // Create document
      const [newDocument] = await db
        .insert(documents)
        .values({
          workspaceId: data.workspaceId,
          parentId: data.parentId,
          title: data.title,
          icon: data.icon,
          content: data.content || { type: 'doc', content: [] },
          createdBy: userId
        })
        .returning();

      if (!newDocument) {
        throw new Error('No document returned from insert');
      }

      // Invalidate documents list cache
      await cacheDelPattern(`${CACHE_KEYS.DOCUMENTS_LIST}${data.workspaceId}*`);

      log.info('Document created', { 
        documentId: newDocument.id, 
        workspaceId: newDocument.workspaceId, 
        userId 
      });

      return newDocument;
    } catch (error) {
      if (error instanceof ValidationError || error instanceof ForbiddenError) {
        throw error;
      }
      log.error('Failed to create document', error as Error, { data, userId });
      throw new InternalServerError('Failed to create document', { userId });
    }
  }

  /**
   * Update a document
   */
  static async updateDocument(
    documentId: string,
    data: UpdateDocumentInput,
    userId: string
  ): Promise<typeof documents.$inferSelect> {
    // Get existing document
    const [existingDocument] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    if (!existingDocument) {
      throw new NotFoundError('Document');
    }

    // Check workspace membership (editors+ only)
    const membership = await checkWorkspaceMembership(existingDocument.workspaceId, userId, ['editor', 'admin', 'owner']);
    if (!membership) {
      throw new ForbiddenError('Access denied: Editor role or higher required');
    }

    try {
      // Update document
      const [updatedDocument] = await db
        .update(documents)
        .set({
          title: data.title,
          icon: data.icon,
          coverUrl: data.coverUrl,
          content: data.content,
          isArchived: data.isArchived,
          isPublished: data.isPublished,
          publishedSlug: data.publishedSlug,
          parentId: data.parentId,
          lastEditedBy: userId,
          updatedAt: new Date()
        })
        .where(eq(documents.id, documentId))
        .returning();

      if (!updatedDocument) {
        throw new Error('No document returned from update');
      }

      // Invalidate cache
      await Promise.all([
        cacheDelPattern(`${CACHE_KEYS.DOCUMENTS_LIST}${updatedDocument.workspaceId}*`),
        cacheDel(`${CACHE_KEYS.DOCUMENT}${documentId}`)
      ]);

      log.info('Document updated', { documentId, userId });
      return updatedDocument;
    } catch (error) {
      if (error instanceof ValidationError || error instanceof ForbiddenError) {
        throw error;
      }
      log.error('Failed to update document', error as Error, { documentId, data, userId });
      throw new InternalServerError('Failed to update document', { documentId, userId });
    }
  }

  /**
   * Delete a document
   */
  static async deleteDocument(documentId: string, userId: string): Promise<void> {
    // Get existing document
    const [document] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    if (!document) {
      throw new NotFoundError('Document');
    }

    // Check workspace membership (editors+ only)
    const membership = await checkWorkspaceMembership(document.workspaceId, userId, ['editor', 'admin', 'owner']);
    if (!membership) {
      throw new ForbiddenError('Access denied: Editor role or higher required');
    }

    try {
      await db.delete(documents).where(eq(documents.id, documentId));

      // Invalidate cache
      await Promise.all([
        cacheDelPattern(`${CACHE_KEYS.DOCUMENTS_LIST}${document.workspaceId}*`),
        cacheDel(`${CACHE_KEYS.DOCUMENT}${documentId}`)
      ]);

      log.info('Document deleted', { documentId, userId });
    } catch (error) {
      log.error('Failed to delete document', error as Error, { documentId, userId });
      throw new InternalServerError('Failed to delete document', { documentId, userId });
    }
  }
}

