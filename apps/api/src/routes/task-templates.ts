import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db';
import { taskTemplates } from '../db/schema';
import { eq, and, or } from 'drizzle-orm';
import type { InferInsertModel } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { checkWorkspaceMembership } from '../lib/workspace-helpers';
import type { User } from '../types';
import { log } from '../lib/logger';

const taskTemplateRoutes = new Hono();

// Checklist item schema
const checklistItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  completed: z.boolean()
});

// Checklist schema
const checklistSchema = z.object({
  id: z.string(),
  title: z.string(),
  items: z.array(checklistItemSchema)
});

// Create template schema
const createTemplateSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  title: z.string().optional(),
  descriptionTemplate: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  status: z.enum(['todo', 'in_progress', 'done', 'cancelled']).default('todo'),
  checklists: z.array(checklistSchema).optional(),
  coverUrl: z.string().url().optional(),
  icon: z.string().optional(),
  isPublic: z.boolean().default(false)
});

// Update template schema - SECURITY: Whitelist allowed fields
const updateTemplateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  title: z.string().optional(),
  descriptionTemplate: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  status: z.enum(['todo', 'in_progress', 'done', 'cancelled']).optional(),
  checklists: z.array(checklistSchema).optional(),
  coverUrl: z.string().url().optional(),
  icon: z.string().optional(),
  isPublic: z.boolean().optional()
});

// Get templates by workspace
taskTemplateRoutes.get('/workspace/:workspaceId', requireAuth, async (c) => {
  const user = c.get('user') as User;
  const workspaceId = c.req.param('workspaceId');

  const membership = await checkWorkspaceMembership(workspaceId, user.id);
  if (!membership) {
    return c.json({ error: 'Access denied' }, 403);
  }

  try {
    const templatesList = await db
      .select()
      .from(taskTemplates)
      .where(
        or(
          eq(taskTemplates.workspaceId, workspaceId),
          and(
            eq(taskTemplates.isPublic, true),
            eq(taskTemplates.createdBy, user.id)
          )
        )
      )
      .orderBy(taskTemplates.createdAt);

    return c.json({ templates: templatesList });
  } catch (error) {
    log.error('Failed to fetch task templates', error as Error, { workspaceId, userId: user.id });
    return c.json({ error: 'Failed to fetch task templates' }, 500);
  }
});

// Get template by ID
taskTemplateRoutes.get('/:id', requireAuth, async (c) => {
  const user = c.get('user') as User;
  const templateId = c.req.param('id');

  try {
    z.string().uuid().parse(templateId);
  } catch {
    return c.json({ error: 'Invalid template ID format. Expected UUID.' }, 400);
  }

  const [template] = await db
    .select()
    .from(taskTemplates)
    .where(eq(taskTemplates.id, templateId))
    .limit(1);

  if (!template) {
    return c.json({ error: 'Template not found' }, 404);
  }

  // Check access: must be in workspace or public and created by user
  const membership = await checkWorkspaceMembership(template.workspaceId, user.id);
  const isPublicAndOwned = template.isPublic && template.createdBy === user.id;

  if (!membership && !isPublicAndOwned) {
    return c.json({ error: 'Access denied' }, 403);
  }

  return c.json({ template });
});

// Create template
taskTemplateRoutes.post('/', requireAuth, zValidator('json', createTemplateSchema), async (c) => {
  const user = c.get('user') as User;
  const body = c.req.valid('json');

  const membership = await checkWorkspaceMembership(body.workspaceId, user.id, ['editor', 'admin', 'owner']);
  if (!membership) {
    return c.json({ error: 'Access denied' }, 403);
  }

  try {
    const templateData: InferInsertModel<typeof taskTemplates> = {
      workspaceId: body.workspaceId,
      name: body.name,
      description: body.description,
      title: body.title,
      descriptionTemplate: body.descriptionTemplate,
      priority: body.priority,
      status: body.status,
      checklists: body.checklists || [],
      coverUrl: body.coverUrl,
      icon: body.icon,
      isPublic: body.isPublic,
      createdBy: user.id,
      updatedAt: new Date()
    };

    const result = await db.insert(taskTemplates).values(templateData).returning();
    const newTemplate = result[0];

    if (!newTemplate) {
      log.error('Failed to create task template: no template returned', new Error('No template returned from insert'), { body, userId: user.id });
      return c.json({ error: 'Failed to create task template' }, 500);
    }

    log.info('Task template created', { templateId: newTemplate.id, workspaceId: newTemplate.workspaceId, userId: user.id });
    return c.json({ template: newTemplate }, 201);
  } catch (error) {
    log.error('Failed to create task template', error as Error, { body, userId: user.id });
    return c.json({ error: 'Failed to create task template' }, 500);
  }
});

// Update template
taskTemplateRoutes.patch('/:id', requireAuth, zValidator('json', updateTemplateSchema), async (c) => {
  const user = c.get('user') as User;
  const templateId = c.req.param('id');
  const body = c.req.valid('json');

  try {
    z.string().uuid().parse(templateId);
  } catch {
    return c.json({ error: 'Invalid template ID format. Expected UUID.' }, 400);
  }

  const [existingTemplate] = await db
    .select()
    .from(taskTemplates)
    .where(eq(taskTemplates.id, templateId))
    .limit(1);

  if (!existingTemplate) {
    return c.json({ error: 'Template not found' }, 404);
  }

  const membership = await checkWorkspaceMembership(existingTemplate.workspaceId, user.id, ['editor', 'admin', 'owner']);
  if (!membership) {
    return c.json({ error: 'Access denied' }, 403);
  }

  try {
    const updates: Partial<InferInsertModel<typeof taskTemplates>> & { updatedAt: Date } = {
      ...body,
      updatedAt: new Date()
    };

    const updatedTemplate = await db
      .update(taskTemplates)
      .set(updates)
      .where(eq(taskTemplates.id, templateId))
      .returning();

    if (!updatedTemplate[0]) {
      log.error('Failed to update task template: no template returned', new Error('No template returned from update'), { templateId, body, userId: user.id });
      return c.json({ error: 'Failed to update task template' }, 500);
    }

    log.info('Task template updated', { templateId: updatedTemplate[0].id, workspaceId: updatedTemplate[0].workspaceId, userId: user.id });
    return c.json({ template: updatedTemplate[0] });
  } catch (error) {
    log.error('Failed to update task template', error as Error, { templateId, body, userId: user.id });
    return c.json({ error: 'Failed to update task template' }, 500);
  }
});

// Delete template
taskTemplateRoutes.delete('/:id', requireAuth, async (c) => {
  const user = c.get('user') as User;
  const templateId = c.req.param('id');

  try {
    z.string().uuid().parse(templateId);
  } catch {
    return c.json({ error: 'Invalid template ID format. Expected UUID.' }, 400);
  }

  const [existingTemplate] = await db
    .select()
    .from(taskTemplates)
    .where(eq(taskTemplates.id, templateId))
    .limit(1);

  if (!existingTemplate) {
    return c.json({ error: 'Template not found' }, 404);
  }

  const membership = await checkWorkspaceMembership(existingTemplate.workspaceId, user.id, ['admin', 'owner']);
  if (!membership) {
    return c.json({ error: 'Access denied' }, 403);
  }

  try {
    await db.delete(taskTemplates).where(eq(taskTemplates.id, templateId));
    log.info('Task template deleted', { templateId, workspaceId: existingTemplate.workspaceId, userId: user.id });
    return c.json({ success: true, message: 'Template deleted' });
  } catch (error) {
    log.error('Failed to delete task template', error as Error, { templateId, userId: user.id });
    return c.json({ error: 'Failed to delete task template' }, 500);
  }
});

export default taskTemplateRoutes;

