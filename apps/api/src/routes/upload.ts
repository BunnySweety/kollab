import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { fileUploadRateLimiter } from '../middleware/rate-limiter';
import type { User } from '../types';
import { log } from '../lib/logger';
import { uploadFile } from '../lib/storage';
import { db } from '../db';
import { driveFiles, tasks, driveFolders } from '../db/schema';
import { eq, and } from 'drizzle-orm';

const uploadRoutes = new Hono();

// Separate router for file serving (without secureHeaders middleware)
// This allows cross-origin access for images while keeping security for other routes
const fileRoutes = new Hono();

// Handle file upload
uploadRoutes.post('/', requireAuth, fileUploadRateLimiter, async (c) => {
  const user = c.get('user') as User;
  
  try {
    // Get form data (Hono automatically parses multipart/form-data)
    const formData = await c.req.formData();
    const file = formData.get('file');
    
    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No file provided or invalid file' }, 400);
    }
    
    const type = formData.get('type') as string | null;
    const taskId = formData.get('taskId') as string | null;
    const workspaceId = formData.get('workspaceId') as string | null;

    if (!type || !['task-cover', 'task-attachment', 'document-cover', 'avatar'].includes(type)) {
      return c.json({ error: 'Invalid upload type' }, 400);
    }

    // Validate file size (configurable via environment variable, default: 100MB)
    const maxSizeBytes = process.env.MAX_UPLOAD_SIZE_BYTES 
      ? parseInt(process.env.MAX_UPLOAD_SIZE_BYTES, 10)
      : 100 * 1024 * 1024; // Default: 100MB
    const maxSizeMB = Math.round(maxSizeBytes / (1024 * 1024));
    
    if (file.size > maxSizeBytes) {
      return c.json({ error: `File size exceeds ${maxSizeMB}MB limit` }, 400);
    }

    // Validate file type based on upload type with whitelist
    const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    const allowedExtensions = {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/jpg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/gif': ['.gif'],
      'image/webp': ['.webp'],
      'image/svg+xml': ['.svg']
    };

    if (type === 'task-cover' || type === 'document-cover' || type === 'avatar') {
      if (!allowedImageTypes.includes(file.type)) {
        return c.json({ 
          error: `Invalid file type. Allowed types: ${allowedImageTypes.join(', ')}` 
        }, 400);
      }
      
      // Additional validation: check file extension matches MIME type
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      const expectedExtensions = allowedExtensions[file.type as keyof typeof allowedExtensions];
      if (expectedExtensions && !expectedExtensions.includes(fileExtension)) {
        return c.json({ 
          error: `File extension does not match MIME type. Expected: ${expectedExtensions.join(', ')}` 
        }, 400);
      }
    }

    // For task-related uploads, verify workspace access
    if ((type === 'task-cover' || type === 'task-attachment') && workspaceId) {
      const { checkWorkspaceMembership } = await import('../lib/workspace-helpers');
      const membership = await checkWorkspaceMembership(workspaceId, user.id, ['editor', 'admin', 'owner']);
      if (!membership) {
        return c.json({ error: 'Access denied' }, 403);
      }
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Generate unique file key
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    const fileExtension = file.name.split('.').pop() || 'bin';
    const fileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    
    let key: string;
    if (type === 'task-cover' && taskId) {
      key = `tasks/${taskId}/covers/${timestamp}-${randomId}.${fileExtension}`;
    } else if (type === 'task-attachment' && taskId) {
      key = `tasks/${taskId}/attachments/${timestamp}-${fileName}`;
    } else if (type === 'document-cover') {
      key = `documents/covers/${timestamp}-${randomId}.${fileExtension}`;
    } else if (type === 'avatar') {
      key = `avatars/${user.id}/${timestamp}-${randomId}.${fileExtension}`;
    } else {
      return c.json({ error: 'Invalid upload type or missing required parameters' }, 400);
    }

    // Upload to Garage
    const fileUrl = await uploadFile(buffer, key, file.type);

    // If this is a task attachment, also create a Drive file record
    if (type === 'task-attachment' && taskId && workspaceId) {
      try {
        // Get task to find projectId
        const [task] = await db
          .select()
          .from(tasks)
          .where(eq(tasks.id, taskId))
          .limit(1);

        if (task && task.projectId) {
          // Find Tasks folder for the project
          const [tasksFolder] = await db
            .select()
            .from(driveFolders)
            .where(
              and(
                eq(driveFolders.projectId, task.projectId),
                eq(driveFolders.folderType, 'tasks')
              )
            )
            .limit(1);

          // Create drive file record
          await db.insert(driveFiles).values({
            workspaceId,
            projectId: task.projectId || null,
            folderId: tasksFolder?.id || null,
            fileName: file.name,
            fileUrl,
            fileKey: key,
            fileSize: file.size,
            mimeType: file.type,
            fileType: 'task-attachment',
            taskId: taskId,
            uploadedBy: user.id
          });

          log.info('Drive file record created for task attachment', {
            taskId,
            fileName: file.name,
            userId: user.id
          });
        }
      } catch (error) {
        // Log error but don't fail the upload
        log.error('Failed to create Drive file record for task attachment', error as Error, {
          taskId,
          fileName: file.name,
          userId: user.id
        });
      }
    }

    // If this is a document cover, also create a Drive file record
    if (type === 'document-cover' && workspaceId) {
      try {
        // Find Documents folder for the workspace (or create if doesn't exist)
        // For now, we'll just create the record without a specific folder
        // The documentId will be set when the document is updated with the coverUrl
        await db.insert(driveFiles).values({
          workspaceId,
          projectId: null,
          folderId: null,
          fileName: file.name,
          fileUrl,
          fileKey: key,
          fileSize: file.size,
          mimeType: file.type,
          fileType: 'document',
          documentId: null, // Will be updated when document coverUrl is set
          uploadedBy: user.id
        });

        log.info('Drive file record created for document cover', {
          fileName: file.name,
          userId: user.id
        });
      } catch (error) {
        // Log error but don't fail the upload
        log.error('Failed to create Drive file record for document cover', error as Error, {
          fileName: file.name,
          userId: user.id
        });
      }
    }

    log.info('File uploaded successfully', {
      type,
      key,
      fileName: file.name,
      fileSize: file.size,
      contentType: file.type,
      userId: user.id,
      taskId: taskId || undefined
    });

    return c.json({
      url: fileUrl,
      key,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type
    }, 201);
  } catch (error) {
    log.error('File upload failed', error as Error, { 
      userId: user.id,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined
    });
    
    // Return more detailed error in development
    const errorMessage = error instanceof Error ? error.message : 'Failed to upload file';
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    return c.json({ 
      error: 'Failed to upload file',
      message: isDevelopment ? errorMessage : undefined
    }, 500);
  }
});

// Delete file
uploadRoutes.delete('/:key', requireAuth, async (c) => {
  const user = c.get('user') as User;
  const key = decodeURIComponent(c.req.param('key'));

  try {
    const { deleteFile } = await import('../lib/storage');
    await deleteFile(key);

    log.info('File deleted successfully', { key, userId: user.id });
    return c.json({ success: true, message: 'File deleted' });
  } catch (error) {
    log.error('File deletion failed', error as Error, { key, userId: user.id });
    return c.json({ error: 'Failed to delete file' }, 500);
  }
});

// Handle OPTIONS preflight for CORS (on fileRoutes)
fileRoutes.options('/*', async (c) => {
  const origin = c.req.header('Origin') || process.env.FRONTEND_URL || 'http://localhost:3000';
  return c.body(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    }
  });
});

// Proxy endpoint to serve files permanently (no expiration)
// This allows the frontend to access files without presigned URLs
// Registered on fileRoutes (separate router) to avoid secureHeaders middleware
fileRoutes.get('/*', requireAuth, async (c) => {
  const user = c.get('user') as User;
  // Extract the key from the path (everything after /api/upload/file/)
  // The route is registered under /api/upload/file, so the path is /api/upload/file/...
  const path = c.req.path;
  // Remove /api/upload/file prefix to get the key
  const keyMatch = path.match(/\/api\/upload\/file\/(.+)$/);
  const key = keyMatch && keyMatch[1] ? decodeURIComponent(keyMatch[1]) : null;
  
  if (!key) {
    log.error('Invalid file path', new Error('Key extraction failed'), { path });
    return c.json({ error: 'Invalid file path' }, 400);
  }
  
  // key is now guaranteed to be non-null after the check above
  const fileKey: string = key;
  log.info('Serving file from Garage', { key: fileKey, path });

  const hasAccess = await verifyFileAccess(fileKey, user.id);
  if (!hasAccess) {
    log.warn('Unauthorized file access attempt', { userId: user.id, fileKey });
    return c.json({ error: 'Access denied' }, 403);
  }

  try {
    const { getFileStream } = await import('../lib/storage');
    const { stream, contentType, contentLength } = await getFileStream(fileKey);

    // Set all headers using c.header() so CORS middleware can process them
    const origin = c.req.header('Origin') || process.env.FRONTEND_URL || 'http://localhost:3000';
    
    // Set content headers
    if (contentType) {
      c.header('Content-Type', contentType);
    }
    if (contentLength) {
      c.header('Content-Length', contentLength.toString());
    }
    c.header('Cache-Control', 'public, max-age=31536000, immutable');
    
    // Set explicit CORS headers (in addition to middleware)
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Credentials', 'true');
    c.header('Access-Control-Expose-Headers', 'Content-Type, Content-Length, Cache-Control');
    
    // Set security headers for file serving: allow cross-origin resource sharing
    // This route is excluded from global secureHeaders middleware, so we set them manually
    // with values that allow cross-origin access for images
    c.header('Cross-Origin-Resource-Policy', 'cross-origin');
    c.header('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    // Keep other security headers but with permissive values for file serving
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'SAMEORIGIN');

    // Convert Node.js Readable stream to ReadableStream for Hono
    const readableStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk) => controller.enqueue(chunk));
        stream.on('end', () => controller.close());
        stream.on('error', (err) => controller.error(err));
      }
    });

    // Return using c.body() so middleware applies
    return c.body(readableStream);
  } catch (error) {
    log.error('Failed to serve file', error as Error, { key: fileKey });
    
    // Check if it's a 404
    if (error instanceof Error && error.message.includes('NoSuchKey')) {
      return c.json({ error: 'File not found' }, 404);
    }
    
    return c.json({ error: 'Failed to serve file' }, 500);
  }
});

// Export both routers
export default uploadRoutes;
export { fileRoutes };

async function verifyFileAccess(fileKey: string, userId: string): Promise<boolean> {
  // Try drive file record first
  const driveFileRecord = await db
    .select({
      workspaceId: driveFiles.workspaceId
    })
    .from(driveFiles)
    .where(eq(driveFiles.fileKey, fileKey))
    .limit(1);

  if (driveFileRecord[0]) {
    return ensureWorkspaceAccess(driveFileRecord[0].workspaceId, userId);
  }

  const taskCoverMatch = fileKey.match(/^tasks\/([a-f0-9-]+)\/covers\//);
  if (taskCoverMatch) {
    const taskId = taskCoverMatch[1];
    const [task] = await db
      .select({ workspaceId: tasks.workspaceId })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);

    if (!task) {
      return false;
    }

    return ensureWorkspaceAccess(task.workspaceId, userId);
  }

  const avatarMatch = fileKey.match(/^avatars\/([^/]+)\//);
  if (avatarMatch) {
    return avatarMatch[1] === userId;
  }

  return false;
}

async function ensureWorkspaceAccess(workspaceId: string, userId: string): Promise<boolean> {
  const { checkWorkspaceMembership } = await import('../lib/workspace-helpers');
  const membership = await checkWorkspaceMembership(workspaceId, userId);
  return Boolean(membership);
}

