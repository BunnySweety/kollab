import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validateUUID } from '../middleware/validation';
import { taskCreateRateLimiter, updateRateLimiter, deleteRateLimiter } from '../middleware/rate-limiter';
import { TaskService } from '../services/task-service';
import type { CreateTaskInput, UpdateTaskInput } from '../services/task-service';

const taskRoutes = new Hono();

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

// Create task schema
const createTaskSchema = z.object({
  workspaceId: z.string().uuid('L\'ID du workspace doit être un UUID valide'),
  projectId: z.string().uuid('L\'ID du projet doit être un UUID valide').optional(),
  title: z.string()
    .min(1, 'Le titre est requis')
    .max(255, 'Le titre ne peut pas dépasser 255 caractères'),
  description: z.string().optional(),
  status: z.enum(['todo', 'in_progress', 'done', 'cancelled'], {
    errorMap: () => ({ message: 'Le statut doit être: todo, in_progress, done ou cancelled' })
  }).default('todo'),
  priority: z.enum(['low', 'medium', 'high', 'urgent'], {
    errorMap: () => ({ message: 'La priorité doit être: low, medium, high ou urgent' })
  }).default('medium'),
  assigneeId: z.string().uuid('L\'ID de l\'assigné doit être un UUID valide').optional(),
  dueDate: z.string().datetime('La date d\'échéance doit être au format ISO 8601 (datetime)').optional(),
  tags: z.array(z.string()).optional(), // Legacy tags
  tagIds: z.array(z.string().uuid('Chaque ID de tag doit être un UUID valide')).optional(), // New colored tags
  coverUrl: z.string().url('L\'URL de la couverture doit être une URL valide').optional().or(z.literal('')),
  checklists: z.array(checklistSchema).optional(),
  templateId: z.string().uuid('L\'ID du template doit être un UUID valide').optional()
});

// Update task schema - SECURITY: Whitelist allowed fields
const updateTaskSchema = z.object({
  title: z.string()
    .min(1, 'Le titre est requis')
    .max(255, 'Le titre ne peut pas dépasser 255 caractères')
    .optional(),
  description: z.string().optional(),
  status: z.enum(['todo', 'in_progress', 'done', 'cancelled'], {
    errorMap: () => ({ message: 'Le statut doit être: todo, in_progress, done ou cancelled' })
  }).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent'], {
    errorMap: () => ({ message: 'La priorité doit être: low, medium, high ou urgent' })
  }).optional(),
  assigneeId: z.string().uuid('L\'ID de l\'assigné doit être un UUID valide').nullable().optional(),
  dueDate: z.string().datetime('La date d\'échéance doit être au format ISO 8601 (datetime)').nullable().optional(),
  tags: z.array(z.string()).optional(), // Legacy tags
  tagIds: z.array(z.string().uuid('Chaque ID de tag doit être un UUID valide')).optional(), // New colored tags
  coverUrl: z.union([z.string().url('L\'URL de la couverture doit être une URL valide'), z.literal(''), z.null()]).optional(),
  checklists: z.array(checklistSchema).optional(),
  parentTaskId: z.string().uuid('L\'ID de la tâche parente doit être un UUID valide').nullable().optional(),
  order: z.number().int('L\'ordre doit être un nombre entier').optional(),
  projectId: z.string().uuid('L\'ID du projet doit être un UUID valide').nullable().optional()
});

// Get tasks with optional filtering and pagination
// Supports both offset-based (page) and cursor-based pagination
taskRoutes.get('/', requireAuth, async (c) => {
  const user = c.get('user');
  const projectId = c.req.query('projectId');
  const workspaceId = c.req.query('workspaceId');
  const cursor = c.req.query('cursor');
  const page = c.req.query('page');
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const direction = c.req.query('direction') === 'backward' ? 'backward' : 'forward';

  // Use cursor-based pagination if cursor is provided, otherwise use offset-based
  if (cursor || !page) {
    const result = await TaskService.getTasksWithCursor(user, {
      projectId: projectId || undefined,
      workspaceId: workspaceId || undefined,
      cursor: cursor || undefined,
      limit,
      direction
    });

    return c.json({
      tasks: result.items.map(t => ({
        ...t,
        tags: t.tagsList // Map tagsList to tags for API compatibility
      })),
      pagination: {
        nextCursor: result.nextCursor,
        prevCursor: result.prevCursor,
        hasMore: result.hasMore,
        limit
      }
    });
  } else {
    // Offset-based pagination (backward compatibility)
    const pageNum = parseInt(page || '1', 10);
    const result = await TaskService.getTasks(user, {
      projectId: projectId || undefined,
      workspaceId: workspaceId || undefined,
      page: pageNum,
      limit
    });

    return c.json({
      tasks: result.tasks.map(t => ({
        ...t,
        tags: t.tagsList // Map tagsList to tags for API compatibility
      })),
      pagination: result.pagination
    });
  }
});

// Get all tasks in a workspace with pagination
// Supports both offset-based (page) and cursor-based pagination
taskRoutes.get('/workspace/:workspaceId', requireAuth, validateUUID('workspaceId'), async (c) => {
  const user = c.get('user');
  const workspaceId = c.req.param('workspaceId');
  const cursor = c.req.query('cursor');
  const page = c.req.query('page');
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const direction = c.req.query('direction') === 'backward' ? 'backward' : 'forward';

  // Use cursor-based pagination if cursor is provided, otherwise use offset-based
  if (cursor || !page) {
    const result = await TaskService.getTasksWithCursor(user, {
      workspaceId,
      cursor: cursor || undefined,
      limit,
      direction
    });

    return c.json({
      tasks: result.items.map(t => ({
        ...t,
        tags: t.tagsList // Map tagsList to tags for API compatibility
      })),
      pagination: {
        nextCursor: result.nextCursor,
        prevCursor: result.prevCursor,
        hasMore: result.hasMore,
        limit
      }
    });
  } else {
    // Offset-based pagination (backward compatibility)
    const pageNum = parseInt(page || '1', 10);
    const result = await TaskService.getTasks(user, {
      workspaceId,
      page: pageNum,
      limit
    });

    return c.json({
      tasks: result.tasks.map(t => ({
        ...t,
        tags: t.tagsList // Map tagsList to tags for API compatibility
      })),
      pagination: result.pagination
    });
  }
});

// Create new task
taskRoutes.post('/', requireAuth, taskCreateRateLimiter, zValidator('json', createTaskSchema), async (c) => {
  const user = c.get('user');
  const data = c.req.valid('json');

  const task = await TaskService.createTask(data as CreateTaskInput, user.id);

  return c.json({
    task: {
      ...task,
      tags: task.tagsList // Map tagsList to tags for API compatibility
    }
  }, 201);
});

// Get task by ID
taskRoutes.get('/:id', requireAuth, validateUUID('id'), async (c) => {
  const user = c.get('user');
  const taskId = c.req.param('id');

  const task = await TaskService.getTaskById(taskId, user);

  return c.json({
    task: {
      ...task,
      tags: task.tagsList // Map tagsList to tags for API compatibility
    }
  });
});

// Update task
taskRoutes.patch('/:id', requireAuth, updateRateLimiter, validateUUID('id'), zValidator('json', updateTaskSchema), async (c) => {
  const user = c.get('user');
  const taskId = c.req.param('id');
  const body = c.req.valid('json');

  const task = await TaskService.updateTask(taskId, body as UpdateTaskInput, user.id);

  return c.json({
    task: {
      ...task,
      tags: task.tagsList // Map tagsList to tags for API compatibility
    }
  });
});

// Delete task
taskRoutes.delete('/:id', requireAuth, deleteRateLimiter, validateUUID('id'), async (c) => {
  const user = c.get('user');
  const taskId = c.req.param('id');

  await TaskService.deleteTask(taskId, user.id);

  return c.json({ success: true });
});

export default taskRoutes;