import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db';
import { taskAttachments, tasks } from '../db/schema';
import { eq } from 'drizzle-orm';
import type { InferInsertModel } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { checkWorkspaceMembership } from '../lib/workspace-helpers';
import type { User } from '../types';
import { log } from '../lib/logger';

const taskAttachmentRoutes = new Hono();

// Create attachment schema
const createAttachmentSchema = z.object({
  taskId: z.string().uuid(),
  fileName: z.string().min(1),
  fileUrl: z.string().url(),
  fileSize: z.number().int().optional(),
  mimeType: z.string().optional()
});

// Get attachments by task
taskAttachmentRoutes.get('/task/:taskId', requireAuth, async (c) => {
  const user = c.get('user') as User;
  const taskId = c.req.param('taskId');

  try {
    z.string().uuid().parse(taskId);
  } catch {
    return c.json({ error: 'Invalid task ID format. Expected UUID.' }, 400);
  }

  // Get task to check workspace access
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }

  const membership = await checkWorkspaceMembership(task.workspaceId, user.id);
  if (!membership) {
    return c.json({ error: 'Access denied' }, 403);
  }

  try {
    const attachmentsList = await db
      .select()
      .from(taskAttachments)
      .where(eq(taskAttachments.taskId, taskId))
      .orderBy(taskAttachments.createdAt);

    return c.json({ attachments: attachmentsList });
  } catch (error) {
    log.error('Failed to fetch task attachments', error as Error, { taskId, userId: user.id });
    return c.json({ error: 'Failed to fetch task attachments' }, 500);
  }
});

// Create attachment
taskAttachmentRoutes.post('/', requireAuth, zValidator('json', createAttachmentSchema), async (c) => {
  const user = c.get('user') as User;
  const body = c.req.valid('json');

  // Get task to check workspace access
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, body.taskId))
    .limit(1);

  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }

  const membership = await checkWorkspaceMembership(task.workspaceId, user.id, ['editor', 'admin', 'owner']);
  if (!membership) {
    return c.json({ error: 'Access denied' }, 403);
  }

  try {
    const attachmentData: InferInsertModel<typeof taskAttachments> = {
      taskId: body.taskId,
      fileName: body.fileName,
      fileUrl: body.fileUrl,
      fileSize: body.fileSize,
      mimeType: body.mimeType,
      uploadedBy: user.id
    };

    const result = await db.insert(taskAttachments).values(attachmentData).returning();
    const newAttachment = result[0];

    if (!newAttachment) {
      log.error('Failed to create task attachment: no attachment returned', new Error('No attachment returned from insert'), { body, userId: user.id });
      return c.json({ error: 'Failed to create task attachment' }, 500);
    }

    log.info('Task attachment created', { attachmentId: newAttachment.id, taskId: newAttachment.taskId, userId: user.id });
    return c.json({ attachment: newAttachment }, 201);
  } catch (error) {
    log.error('Failed to create task attachment', error as Error, { body, userId: user.id });
    return c.json({ error: 'Failed to create task attachment' }, 500);
  }
});

// Delete attachment
taskAttachmentRoutes.delete('/:id', requireAuth, async (c) => {
  const user = c.get('user') as User;
  const attachmentId = c.req.param('id');

  try {
    z.string().uuid().parse(attachmentId);
  } catch {
    return c.json({ error: 'Invalid attachment ID format. Expected UUID.' }, 400);
  }

  // Get attachment to check task and workspace access
  const [attachment] = await db
    .select()
    .from(taskAttachments)
    .where(eq(taskAttachments.id, attachmentId))
    .limit(1);

  if (!attachment) {
    return c.json({ error: 'Attachment not found' }, 404);
  }

  // Get task to check workspace access
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, attachment.taskId))
    .limit(1);

  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }

  // Allow deletion if user uploaded it or has editor+ permissions
  const membership = await checkWorkspaceMembership(task.workspaceId, user.id, ['editor', 'admin', 'owner']);
  const isOwner = attachment.uploadedBy === user.id;

  if (!membership && !isOwner) {
    return c.json({ error: 'Access denied' }, 403);
  }

  try {
    await db.delete(taskAttachments).where(eq(taskAttachments.id, attachmentId));
    log.info('Task attachment deleted', { attachmentId, taskId: attachment.taskId, userId: user.id });
    return c.json({ success: true, message: 'Attachment deleted' });
  } catch (error) {
    log.error('Failed to delete task attachment', error as Error, { attachmentId, userId: user.id });
    return c.json({ error: 'Failed to delete task attachment' }, 500);
  }
});

export default taskAttachmentRoutes;

