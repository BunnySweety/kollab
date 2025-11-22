import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db';
import { taskTags } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import type { InferInsertModel } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { checkWorkspaceMembership } from '../lib/workspace-helpers';
import type { User } from '../types';
import { log } from '../lib/logger';

const taskTagRoutes = new Hono();

// Create tag schema
const createTagSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(100),
  color: z.string().min(1) // Hex color or Tailwind class
});

// Update tag schema - SECURITY: Whitelist allowed fields
const updateTagSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().min(1).optional()
});

// Get tags by workspace
taskTagRoutes.get('/workspace/:workspaceId', requireAuth, async (c) => {
  const user = c.get('user') as User;
  const workspaceId = c.req.param('workspaceId');

  const membership = await checkWorkspaceMembership(workspaceId, user.id);
  if (!membership) {
    return c.json({ error: 'Access denied' }, 403);
  }

  try {
    const tagsList = await db
      .select()
      .from(taskTags)
      .where(eq(taskTags.workspaceId, workspaceId))
      .orderBy(taskTags.name);

    return c.json({ tags: tagsList });
  } catch (error) {
    log.error('Failed to fetch task tags', error as Error, { workspaceId, userId: user.id });
    return c.json({ error: 'Failed to fetch task tags' }, 500);
  }
});

// Create tag
taskTagRoutes.post('/', requireAuth, zValidator('json', createTagSchema), async (c) => {
  const user = c.get('user') as User;
  const body = c.req.valid('json');

  const membership = await checkWorkspaceMembership(body.workspaceId, user.id, ['editor', 'admin', 'owner']);
  if (!membership) {
    return c.json({ error: 'Access denied' }, 403);
  }

  try {
    // Check if tag with same name already exists in workspace
    const [existingTag] = await db
      .select()
      .from(taskTags)
      .where(and(
        eq(taskTags.workspaceId, body.workspaceId),
        eq(taskTags.name, body.name)
      ))
      .limit(1);

    if (existingTag) {
      return c.json({ error: 'A tag with this name already exists in this workspace' }, 400);
    }

    const tagData: InferInsertModel<typeof taskTags> = {
      workspaceId: body.workspaceId,
      name: body.name,
      color: body.color,
      createdBy: user.id,
      updatedAt: new Date()
    };

    const result = await db.insert(taskTags).values(tagData).returning();
    const newTag = result[0];

    if (!newTag) {
      log.error('Failed to create task tag: no tag returned', new Error('No tag returned from insert'), { body, userId: user.id });
      return c.json({ error: 'Failed to create task tag' }, 500);
    }

    log.info('Task tag created', { tagId: newTag.id, workspaceId: newTag.workspaceId, userId: user.id });
    return c.json({ tag: newTag }, 201);
  } catch (error) {
    log.error('Failed to create task tag', error as Error, { body, userId: user.id });
    return c.json({ error: 'Failed to create task tag' }, 500);
  }
});

// Update tag
taskTagRoutes.patch('/:id', requireAuth, zValidator('json', updateTagSchema), async (c) => {
  const user = c.get('user') as User;
  const tagId = c.req.param('id');
  const body = c.req.valid('json');

  try {
    z.string().uuid().parse(tagId);
  } catch {
    return c.json({ error: 'Invalid tag ID format. Expected UUID.' }, 400);
  }

  const [existingTag] = await db
    .select()
    .from(taskTags)
    .where(eq(taskTags.id, tagId))
    .limit(1);

  if (!existingTag) {
    return c.json({ error: 'Tag not found' }, 404);
  }

  const membership = await checkWorkspaceMembership(existingTag.workspaceId, user.id, ['editor', 'admin', 'owner']);
  if (!membership) {
    return c.json({ error: 'Access denied' }, 403);
  }

  try {
    // If name is being updated, check for duplicates
    if (body.name && body.name !== existingTag.name) {
      const [duplicateTag] = await db
        .select()
        .from(taskTags)
        .where(and(
          eq(taskTags.workspaceId, existingTag.workspaceId),
          eq(taskTags.name, body.name)
        ))
        .limit(1);

      if (duplicateTag) {
        return c.json({ error: 'A tag with this name already exists in this workspace' }, 400);
      }
    }

    const updates: Partial<InferInsertModel<typeof taskTags>> & { updatedAt: Date } = {
      ...body,
      updatedAt: new Date()
    };

    const updatedTag = await db
      .update(taskTags)
      .set(updates)
      .where(eq(taskTags.id, tagId))
      .returning();

    if (!updatedTag[0]) {
      log.error('Failed to update task tag: no tag returned', new Error('No tag returned from update'), { tagId, body, userId: user.id });
      return c.json({ error: 'Failed to update task tag' }, 500);
    }

    log.info('Task tag updated', { tagId: updatedTag[0].id, workspaceId: updatedTag[0].workspaceId, userId: user.id });
    return c.json({ tag: updatedTag[0] });
  } catch (error) {
    log.error('Failed to update task tag', error as Error, { tagId, body, userId: user.id });
    return c.json({ error: 'Failed to update task tag' }, 500);
  }
});

// Delete tag
taskTagRoutes.delete('/:id', requireAuth, async (c) => {
  const user = c.get('user') as User;
  const tagId = c.req.param('id');

  try {
    z.string().uuid().parse(tagId);
  } catch {
    return c.json({ error: 'Invalid tag ID format. Expected UUID.' }, 400);
  }

  const [existingTag] = await db
    .select()
    .from(taskTags)
    .where(eq(taskTags.id, tagId))
    .limit(1);

  if (!existingTag) {
    return c.json({ error: 'Tag not found' }, 404);
  }

  const membership = await checkWorkspaceMembership(existingTag.workspaceId, user.id, ['admin', 'owner']);
  if (!membership) {
    return c.json({ error: 'Access denied' }, 403);
  }

  try {
    // Relations will be deleted automatically due to CASCADE
    await db.delete(taskTags).where(eq(taskTags.id, tagId));
    log.info('Task tag deleted', { tagId, workspaceId: existingTag.workspaceId, userId: user.id });
    return c.json({ success: true, message: 'Tag deleted' });
  } catch (error) {
    log.error('Failed to delete task tag', error as Error, { tagId, userId: user.id });
    return c.json({ error: 'Failed to delete task tag' }, 500);
  }
});

export default taskTagRoutes;

