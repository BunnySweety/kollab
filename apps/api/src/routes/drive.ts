import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db';
import { driveFolders, driveFiles, projects } from '../db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { checkWorkspaceMembership } from '../lib/workspace-helpers';
import type { User } from '../types';
import { log } from '../lib/logger';
import { uploadFile, deleteFile } from '../lib/storage';
import { uploadRateLimiter, createRateLimiter, updateRateLimiter, deleteRateLimiter } from '../middleware/rate-limiter';
import { ValidationError } from '../lib/errors';

// File type enum matching schema
type FileType = 'document' | 'task-attachment' | 'calendar' | 'general';

const driveRoutes = new Hono();

// Create folder schema
const createFolderSchema = z.object({
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  parentId: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  folderType: z.enum(['general', 'tasks', 'documents', 'calendar', 'custom']).optional(),
});

// Update folder schema
const updateFolderSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  parentId: z.string().uuid().nullable().optional(),
});

// Get folders by project or workspace
driveRoutes.get('/folders', requireAuth, async (c) => {
  const user = c.get('user') as User;
  const projectId = c.req.query('projectId');
  const workspaceId = c.req.query('workspaceId');
  const parentId = c.req.query('parentId');

  if (!workspaceId) {
    return c.json({ error: 'workspaceId is required' }, 400);
  }

  try {
    z.string().uuid().parse(workspaceId);
  } catch {
    return c.json({ error: 'Invalid workspace ID format' }, 400);
  }

  const membership = await checkWorkspaceMembership(workspaceId, user.id);
  if (!membership) {
    return c.json({ error: 'Access denied' }, 403);
  }

  try {
    const conditions = [eq(driveFolders.workspaceId, workspaceId)];

    // If projectId is specified, filter by project
    // Otherwise, show all folders in the workspace (both workspace-level and project-level)
    if (projectId) {
      try {
        z.string().uuid().parse(projectId);
        conditions.push(eq(driveFolders.projectId, projectId));
      } catch {
        return c.json({ error: 'Invalid project ID format' }, 400);
      }
    }
    // Removed: else { conditions.push(isNull(driveFolders.projectId)); }
    // This allows showing all folders (workspace and project) when no projectId is specified

    if (parentId === 'null' || parentId === null) {
      conditions.push(isNull(driveFolders.parentId));
    } else if (parentId) {
      try {
        z.string().uuid().parse(parentId);
        conditions.push(eq(driveFolders.parentId, parentId));
      } catch {
        return c.json({ error: 'Invalid parent ID format' }, 400);
      }
    }

    const folders = await db
      .select()
      .from(driveFolders)
      .where(and(...conditions))
      .orderBy(driveFolders.name);

    return c.json({ folders });
  } catch (error) {
    log.error('Failed to fetch folders', error as Error, { workspaceId, projectId, userId: user.id });
    return c.json({ error: 'Failed to fetch folders' }, 500);
  }
});

// Get single folder
driveRoutes.get('/folders/:id', requireAuth, async (c) => {
  const user = c.get('user') as User;
  const folderId = c.req.param('id');

  try {
    z.string().uuid().parse(folderId);
  } catch {
    return c.json({ error: 'Invalid folder ID format' }, 400);
  }

  try {
    const [folder] = await db
      .select()
      .from(driveFolders)
      .where(eq(driveFolders.id, folderId))
      .limit(1);

    if (!folder) {
      return c.json({ error: 'Folder not found' }, 404);
    }

    const membership = await checkWorkspaceMembership(folder.workspaceId, user.id);
    if (!membership) {
      return c.json({ error: 'Access denied' }, 403);
    }

    return c.json({ folder });
  } catch (error) {
    log.error('Failed to fetch folder', error as Error, { folderId, userId: user.id });
    return c.json({ error: 'Failed to fetch folder' }, 500);
  }
});

// Create folder
driveRoutes.post('/folders', requireAuth, createRateLimiter, zValidator('json', createFolderSchema), async (c) => {
  const user = c.get('user') as User;
  const body = c.req.valid('json');

  const membership = await checkWorkspaceMembership(body.workspaceId, user.id, ['editor', 'admin', 'owner']);
  if (!membership) {
    return c.json({ error: 'Access denied' }, 403);
  }

  // Verify project access if projectId is provided
  if (body.projectId) {
    const [project] = await db
      .select({
        id: projects.id,
        workspaceId: projects.workspaceId
      })
      .from(projects)
      .where(eq(projects.id, body.projectId))
      .limit(1);

    if (!project || project.workspaceId !== body.workspaceId) {
      return c.json({ error: 'Project not found or access denied' }, 404);
    }
  }

  // Verify parent folder access if parentId is provided
  if (body.parentId) {
    const [parent] = await db
      .select({
        id: driveFolders.id,
        workspaceId: driveFolders.workspaceId
      })
      .from(driveFolders)
      .where(eq(driveFolders.id, body.parentId))
      .limit(1);

    if (!parent || parent.workspaceId !== body.workspaceId) {
      return c.json({ error: 'Parent folder not found or access denied' }, 404);
    }
  }

  try {
    const result = await db
      .insert(driveFolders)
      .values({
        workspaceId: body.workspaceId,
        projectId: body.projectId || null,
        parentId: body.parentId || null,
        name: body.name,
        folderType: body.folderType || 'general',
        createdBy: user.id,
      })
      .returning();

    const folder = result[0];
    if (!folder) {
      return c.json({ error: 'Failed to create folder' }, 500);
    }

    log.info('Folder created', { folderId: folder.id, workspaceId: body.workspaceId, userId: user.id });
    return c.json({ folder }, 201);
  } catch (error) {
    log.error('Failed to create folder', error as Error, { body, userId: user.id });
    return c.json({ error: 'Failed to create folder' }, 500);
  }
});

// Update folder
driveRoutes.patch('/folders/:id', requireAuth, updateRateLimiter, zValidator('json', updateFolderSchema), async (c) => {
  const user = c.get('user') as User;
  const folderId = c.req.param('id');
  const body = c.req.valid('json');

  try {
    z.string().uuid().parse(folderId);
  } catch {
    return c.json({ error: 'Invalid folder ID format' }, 400);
  }

  const [folder] = await db
    .select()
    .from(driveFolders)
    .where(eq(driveFolders.id, folderId))
    .limit(1);

  if (!folder) {
    return c.json({ error: 'Folder not found' }, 404);
  }

  const membership = await checkWorkspaceMembership(folder.workspaceId, user.id, ['editor', 'admin', 'owner']);
  if (!membership) {
    return c.json({ error: 'Access denied' }, 403);
  }

  // Verify parent folder if changing parent
  if (body.parentId !== undefined && body.parentId !== null) {
    const [parent] = await db
      .select({
        id: driveFolders.id,
        workspaceId: driveFolders.workspaceId
      })
      .from(driveFolders)
      .where(eq(driveFolders.id, body.parentId))
      .limit(1);

    if (!parent || parent.workspaceId !== folder.workspaceId) {
      return c.json({ error: 'Parent folder not found or access denied' }, 404);
    }

    // Prevent circular reference
    if (body.parentId === folderId) {
      return c.json({ error: 'Cannot set folder as its own parent' }, 400);
    }
  }

  try {
    const [updated] = await db
      .update(driveFolders)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(driveFolders.id, folderId))
      .returning();

    log.info('Folder updated', { folderId, userId: user.id });
    return c.json({ folder: updated });
  } catch (error) {
    log.error('Failed to update folder', error as Error, { folderId, userId: user.id });
    return c.json({ error: 'Failed to update folder' }, 500);
  }
});

// Delete folder
driveRoutes.delete('/folders/:id', requireAuth, deleteRateLimiter, async (c) => {
  const user = c.get('user') as User;
  const folderId = c.req.param('id');

  try {
    z.string().uuid().parse(folderId);
  } catch {
    return c.json({ error: 'Invalid folder ID format' }, 400);
  }

  const [folder] = await db
    .select()
    .from(driveFolders)
    .where(eq(driveFolders.id, folderId))
    .limit(1);

  if (!folder) {
    return c.json({ error: 'Folder not found' }, 404);
  }

  const membership = await checkWorkspaceMembership(folder.workspaceId, user.id, ['editor', 'admin', 'owner']);
  if (!membership) {
    return c.json({ error: 'Access denied' }, 403);
  }

  // Check if folder has children or files
  const [children] = await db
    .select({ id: driveFolders.id })
    .from(driveFolders)
    .where(eq(driveFolders.parentId, folderId))
    .limit(1);

  const [files] = await db
    .select({ id: driveFiles.id })
    .from(driveFiles)
    .where(eq(driveFiles.folderId, folderId))
    .limit(1);

  if (children || files) {
    return c.json({ error: 'Cannot delete folder with contents. Delete or move contents first.' }, 400);
  }

  try {
    await db.delete(driveFolders).where(eq(driveFolders.id, folderId));
    log.info('Folder deleted', { folderId, userId: user.id });
    return c.json({ success: true, message: 'Folder deleted' });
  } catch (error) {
    log.error('Failed to delete folder', error as Error, { folderId, userId: user.id });
    return c.json({ error: 'Failed to delete folder' }, 500);
  }
});

// Get files
driveRoutes.get('/files', requireAuth, async (c) => {
  const user = c.get('user') as User;
  const projectId = c.req.query('projectId');
  const workspaceId = c.req.query('workspaceId');
  const folderId = c.req.query('folderId');
  const fileType = c.req.query('fileType');

  if (!workspaceId) {
    return c.json({ error: 'workspaceId is required' }, 400);
  }

  try {
    z.string().uuid().parse(workspaceId);
  } catch {
    return c.json({ error: 'Invalid workspace ID format' }, 400);
  }

  const membership = await checkWorkspaceMembership(workspaceId, user.id);
  if (!membership) {
    return c.json({ error: 'Access denied' }, 403);
  }

  try {
    const conditions = [eq(driveFiles.workspaceId, workspaceId)];

    if (projectId) {
      try {
        z.string().uuid().parse(projectId);
        conditions.push(eq(driveFiles.projectId, projectId));
      } catch {
        return c.json({ error: 'Invalid project ID format' }, 400);
      }
    }

    if (folderId === 'null' || folderId === null) {
      conditions.push(isNull(driveFiles.folderId));
    } else if (folderId) {
      try {
        z.string().uuid().parse(folderId);
        conditions.push(eq(driveFiles.folderId, folderId));
      } catch {
        return c.json({ error: 'Invalid folder ID format' }, 400);
      }
    }

    if (fileType) {
      // Validate fileType against schema enum
      const validFileTypes: FileType[] = ['document', 'task-attachment', 'calendar', 'general'];
      if (!validFileTypes.includes(fileType as FileType)) {
        throw new ValidationError(`Invalid fileType. Must be one of: ${validFileTypes.join(', ')}`);
      }
      conditions.push(eq(driveFiles.fileType, fileType as FileType));
    }

    const files = await db
      .select()
      .from(driveFiles)
      .where(and(...conditions))
      .orderBy(driveFiles.fileName);

    return c.json({ files });
  } catch (error) {
    log.error('Failed to fetch files', error as Error, { workspaceId, projectId, userId: user.id });
    return c.json({ error: 'Failed to fetch files' }, 500);
  }
});

// Upload file to drive
driveRoutes.post('/files', requireAuth, uploadRateLimiter, async (c) => {
  const user = c.get('user') as User;

  try {
    const formData = await c.req.formData();
    const file = formData.get('file');
    const workspaceId = formData.get('workspaceId') as string | null;
    const projectId = formData.get('projectId') as string | null;
    const folderId = formData.get('folderId') as string | null;
    const fileTypeRaw = (formData.get('fileType') as string) || 'general';
    // Validate fileType against schema enum
    const validFileTypes: FileType[] = ['document', 'task-attachment', 'calendar', 'general'];
    if (!validFileTypes.includes(fileTypeRaw as FileType)) {
      throw new ValidationError(`Invalid fileType. Must be one of: ${validFileTypes.join(', ')}`);
    }
    const fileType = fileTypeRaw as FileType;

    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No file provided or invalid file' }, 400);
    }

    if (!workspaceId) {
      return c.json({ error: 'workspaceId is required' }, 400);
    }

    try {
      z.string().uuid().parse(workspaceId);
    } catch {
      return c.json({ error: 'Invalid workspace ID format' }, 400);
    }

    const membership = await checkWorkspaceMembership(workspaceId, user.id, ['editor', 'admin', 'owner']);
    if (!membership) {
      return c.json({ error: 'Access denied' }, 403);
    }

    // Validate file size (default: 100MB)
    const maxSizeBytes = process.env.MAX_UPLOAD_SIZE_BYTES
      ? parseInt(process.env.MAX_UPLOAD_SIZE_BYTES, 10)
      : 100 * 1024 * 1024;
    const maxSizeMB = Math.round(maxSizeBytes / (1024 * 1024));

    if (file.size > maxSizeBytes) {
      return c.json({ error: `File size exceeds ${maxSizeMB}MB limit` }, 400);
    }

    // Verify folder access if folderId is provided
    if (folderId) {
      try {
        z.string().uuid().parse(folderId);
        const [folder] = await db
          .select({
            id: driveFolders.id,
            workspaceId: driveFolders.workspaceId
          })
          .from(driveFolders)
          .where(eq(driveFolders.id, folderId))
          .limit(1);

        if (!folder || folder.workspaceId !== workspaceId) {
          return c.json({ error: 'Folder not found or access denied' }, 404);
        }
      } catch {
        return c.json({ error: 'Invalid folder ID format' }, 400);
      }
    }

    // Verify project access if projectId is provided
    if (projectId) {
      try {
        z.string().uuid().parse(projectId);
        const [project] = await db
          .select({
            id: projects.id,
            workspaceId: projects.workspaceId
          })
          .from(projects)
          .where(eq(projects.id, projectId))
          .limit(1);

        if (!project || project.workspaceId !== workspaceId) {
          return c.json({ error: 'Project not found or access denied' }, 404);
        }
      } catch {
        return c.json({ error: 'Invalid project ID format' }, 400);
      }
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Generate unique file key
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    const fileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `drive/${workspaceId}${projectId ? `/${projectId}` : ''}${folderId ? `/${folderId}` : ''}/${timestamp}-${randomId}-${fileName}`;

    // Upload to Garage
    const fileUrl = await uploadFile(buffer, key, file.type);

    // Create drive file record
    const driveFileResult = await db
      .insert(driveFiles)
      .values({
        workspaceId,
        projectId: projectId || null,
        folderId: folderId || null,
        fileName: file.name,
        fileUrl,
        fileKey: key,
        fileSize: file.size,
        mimeType: file.type,
        fileType: fileType,
        uploadedBy: user.id,
      })
      .returning();

    const driveFile = driveFileResult[0];
    if (!driveFile) {
      return c.json({ error: 'Failed to create drive file record' }, 500);
    }

    log.info('File uploaded to drive', {
      fileId: driveFile.id,
      workspaceId,
      projectId: projectId || undefined,
      folderId: folderId || undefined,
      userId: user.id,
    });

    return c.json({ file: driveFile }, 201);
  } catch (error) {
    log.error('Failed to upload file to drive', error as Error, { userId: user.id });
    return c.json({ error: 'Failed to upload file' }, 500);
  }
});

// Delete file
driveRoutes.delete('/files/:id', requireAuth, deleteRateLimiter, async (c) => {
  const user = c.get('user') as User;
  const fileId = c.req.param('id');

  try {
    z.string().uuid().parse(fileId);
  } catch {
    return c.json({ error: 'Invalid file ID format' }, 400);
  }

  const [file] = await db
    .select()
    .from(driveFiles)
    .where(eq(driveFiles.id, fileId))
    .limit(1);

  if (!file) {
    return c.json({ error: 'File not found' }, 404);
  }

  const membership = await checkWorkspaceMembership(file.workspaceId, user.id, ['editor', 'admin', 'owner']);
  const isOwner = file.uploadedBy === user.id;

  if (!membership && !isOwner) {
    return c.json({ error: 'Access denied' }, 403);
  }

  try {
    // Delete from Garage
    await deleteFile(file.fileKey);

    // Delete from database
    await db.delete(driveFiles).where(eq(driveFiles.id, fileId));

    log.info('File deleted from drive', { fileId, userId: user.id });
    return c.json({ success: true, message: 'File deleted' });
  } catch (error) {
    log.error('Failed to delete file', error as Error, { fileId, userId: user.id });
    return c.json({ error: 'Failed to delete file' }, 500);
  }
});

export default driveRoutes;

