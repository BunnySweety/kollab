import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db';
import { documents, driveFiles, driveFolders } from '../db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { checkWorkspaceMembership } from '../lib/workspace-helpers';
import { log } from '../lib/logger';
import { documentCreateRateLimiter, updateRateLimiter, deleteRateLimiter } from '../middleware/rate-limiter';
import { tipTapContentSchema } from '../types/content';
import { ValidationError, NotFoundError, ForbiddenError } from '../lib/errors';
import { cacheGetOrSet, cacheDel, CACHE_KEYS, CACHE_TTL } from '../lib/cache';

const documentRoutes = new Hono();

// Create document schema
const createDocumentSchema = z.object({
  workspaceId: z.string().uuid('L\'ID du workspace doit être un UUID valide'),
  parentId: z.string().uuid('L\'ID du document parent doit être un UUID valide').optional(),
  title: z.string()
    .min(1, 'Le titre est requis')
    .max(255, 'Le titre ne peut pas dépasser 255 caractères'),
  icon: z.string().optional(),
  content: tipTapContentSchema.optional()
});

// Update document schema - SECURITY: Whitelist allowed fields
const updateDocumentSchema = z.object({
  title: z.string()
    .min(1, 'Le titre est requis')
    .max(255, 'Le titre ne peut pas dépasser 255 caractères')
    .optional(),
  icon: z.string().max(50, 'L\'icône ne peut pas dépasser 50 caractères').optional(),
  coverUrl: z.string().url('L\'URL de la couverture doit être une URL valide').optional(),
  content: tipTapContentSchema.optional(),
  isArchived: z.boolean().optional(),
  isPublished: z.boolean().optional(),
  publishedSlug: z.string().max(255, 'Le slug publié ne peut pas dépasser 255 caractères').optional(),
  parentId: z.string().uuid('L\'ID du document parent doit être un UUID valide').nullable().optional()
});

// Get all documents in a workspace
documentRoutes.get('/workspace/:workspaceId', requireAuth, async (c) => {
  const user = c.get('user');
  const workspaceId = c.req.param('workspaceId');

  // Validate workspaceId is a UUID
  try {
    z.string().uuid().parse(workspaceId);
  } catch {
    throw new ValidationError('Invalid workspace ID format. Expected UUID.');
  }

  // Check workspace membership with Redis cache
  const membership = await checkWorkspaceMembership(workspaceId, user.id);
  if (!membership) {
    throw new ForbiddenError('Access denied: User is not a member of this workspace');
  }

  // Cache key for documents list
  const cacheKey = `${CACHE_KEYS.DOCUMENTS_LIST}${workspaceId}`;

  // Get documents tree with cache
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

  return c.json({ documents: allDocuments });
});

// Create new document
documentRoutes.post('/', requireAuth, documentCreateRateLimiter, zValidator('json', createDocumentSchema), async (c) => {
  const user = c.get('user');
  const { workspaceId, parentId, title, icon, content } = c.req.valid('json');

  // Check workspace membership with Redis cache (editors+ only)
  const membership = await checkWorkspaceMembership(workspaceId, user.id, ['editor', 'admin', 'owner']);
  if (!membership) {
    throw new ForbiddenError('Access denied: Editor role or higher required');
  }

  // Create document
  const result = await db
    .insert(documents)
    .values({
      workspaceId,
      parentId,
      title,
      icon,
      content: content || { type: 'doc', content: [] },
      createdBy: user.id,
      lastEditedBy: user.id
    })
    .returning();

  const newDocument = result[0];
  if (!newDocument) {
    return c.json({ error: 'Failed to create document' }, 500);
  }

  // Invalidate documents list cache
  await cacheDel(`${CACHE_KEYS.DOCUMENTS_LIST}${workspaceId}`);

  log.info('Document created', { documentId: newDocument.id, workspaceId, userId: user.id });
  return c.json({ document: newDocument }, 201);
});

// Get document by ID
documentRoutes.get('/:id', requireAuth, async (c) => {
  const user = c.get('user');
  const documentId = c.req.param('id');

  // Get document
  const [document] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  if (!document) {
    throw new NotFoundError('Document');
  }

  // Check workspace membership with Redis cache
  const membership = await checkWorkspaceMembership(document.workspaceId, user.id);
  
  if (!membership) {
    // Check if document is published
    if (!document.isPublished) {
      throw new ForbiddenError('Access denied: Document is not published and user is not a workspace member');
    }
  }

  return c.json({ document });
});

// Update document
documentRoutes.patch('/:id', requireAuth, updateRateLimiter, zValidator('json', updateDocumentSchema), async (c) => {
  const user = c.get('user');
  const documentId = c.req.param('id');
  const body = c.req.valid('json');

  // Get document
  const [document] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  if (!document) {
    throw new NotFoundError('Document');
  }

  // Check workspace membership with Redis cache (editors+ only)
  const membership = await checkWorkspaceMembership(document.workspaceId, user.id, ['editor', 'admin', 'owner']);
  if (!membership) {
    throw new ForbiddenError('Access denied: Editor role or higher required');
  }

  // Update document
  const [updatedDocument] = await db
    .update(documents)
    .set({
      ...body,
      lastEditedBy: user.id,
      updatedAt: new Date()
    })
    .where(eq(documents.id, documentId))
    .returning();

  // If coverUrl was updated, link it to a Drive file record
  if (body.coverUrl && updatedDocument) {
    try {
      // Find the Drive file record for this coverUrl
      const [driveFile] = await db
        .select()
        .from(driveFiles)
        .where(
          and(
            eq(driveFiles.fileUrl, body.coverUrl),
            eq(driveFiles.workspaceId, document.workspaceId),
            eq(driveFiles.fileType, 'document')
          )
        )
        .limit(1);

      if (driveFile && !driveFile.documentId) {
        // Find Documents folder for the workspace
        const [documentsFolder] = await db
          .select()
          .from(driveFolders)
          .where(
            and(
              eq(driveFolders.workspaceId, document.workspaceId),
              eq(driveFolders.folderType, 'documents'),
              isNull(driveFolders.projectId)
            )
          )
          .limit(1);

        // Update the Drive file record to link it to the document
        await db
          .update(driveFiles)
          .set({
            documentId: documentId,
            folderId: documentsFolder?.id || null
          })
          .where(eq(driveFiles.id, driveFile.id));

        log.info('Drive file linked to document', {
          documentId,
          fileId: driveFile.id,
          userId: user.id
        });
      }
    } catch (error) {
      // Log error but don't fail the update
      log.error('Failed to link Drive file to document', error as Error, {
        documentId,
        userId: user.id
      });
    }
  }

  // Invalidate documents list cache
  await cacheDel(`${CACHE_KEYS.DOCUMENTS_LIST}${document.workspaceId}`);

  log.info('Document updated', { documentId, workspaceId: document.workspaceId, userId: user.id });
  return c.json({ document: updatedDocument });
});

// Archive document
documentRoutes.post('/:id/archive', requireAuth, async (c) => {
  const user = c.get('user');
  const documentId = c.req.param('id');

  // Get document
  const [document] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  if (!document) {
    throw new NotFoundError('Document');
  }

  // Check workspace membership with Redis cache (editors+ only)
  const membership = await checkWorkspaceMembership(document.workspaceId, user.id, ['editor', 'admin', 'owner']);
  if (!membership) {
    throw new ForbiddenError('Access denied: Editor role or higher required');
  }

  // Archive document and its children
  await db
    .update(documents)
    .set({
      isArchived: true,
      updatedAt: new Date()
    })
    .where(eq(documents.id, documentId));

  // Invalidate documents list cache
  await cacheDel(`${CACHE_KEYS.DOCUMENTS_LIST}${document.workspaceId}`);

  log.info('Document archived', { documentId, workspaceId: document.workspaceId, userId: user.id });
  return c.json({ success: true });
});

// Delete document permanently
documentRoutes.delete('/:id', requireAuth, deleteRateLimiter, async (c) => {
  const user = c.get('user');
  const documentId = c.req.param('id');

  // Get document
  const [document] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  if (!document) {
    throw new NotFoundError('Document');
  }

  // Check workspace membership with Redis cache (owner/admin only)
  const membership = await checkWorkspaceMembership(document.workspaceId, user.id, ['owner', 'admin']);
  if (!membership) {
    throw new ForbiddenError('Access denied: Owner or admin role required');
  }

  // Delete document (cascade will handle children)
  await db.delete(documents).where(eq(documents.id, documentId));

  // Invalidate documents list cache
  await cacheDel(`${CACHE_KEYS.DOCUMENTS_LIST}${document.workspaceId}`);

  log.info('Document deleted', { documentId, workspaceId: document.workspaceId, userId: user.id });
  return c.json({ success: true });
});

export default documentRoutes;