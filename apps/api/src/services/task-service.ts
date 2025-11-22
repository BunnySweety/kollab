/**
 * Task Service
 * 
 * Business logic for task management
 * Extracted from routes to improve maintainability and reusability
 */

import { db } from '../db';
import { tasks, projects, taskAttachments, taskTagRelations, taskTags } from '../db/schema';
import { eq, and, inArray, sql, or, gt, lt, type SQL } from 'drizzle-orm';
import { checkWorkspaceMembership } from '../lib/workspace-helpers';
import { withTransaction } from '../lib/db-transaction';
import { cacheGetOrSet, cacheDelPattern, CACHE_KEYS, CACHE_TTL } from '../lib/cache';
import { log } from '../lib/logger';
import { ValidationError, NotFoundError, ForbiddenError, InternalServerError } from '../lib/errors';
import { createCursorPaginationResult, type CursorPaginationResult } from '../lib/pagination';
import type { User } from '../types';

/**
 * Input for creating a task
 */
export interface CreateTaskInput {
  workspaceId: string;
  projectId?: string;
  title: string;
  description?: string;
  status?: 'todo' | 'in_progress' | 'done' | 'cancelled';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assigneeId?: string;
  dueDate?: string;
  tags?: string[];
  tagIds?: string[];
  coverUrl?: string;
  checklists?: unknown[];
  templateId?: string;
}

/**
 * Input for updating a task
 */
export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: 'todo' | 'in_progress' | 'done' | 'cancelled';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assigneeId?: string | null;
  dueDate?: string | null;
  tags?: string[];
  tagIds?: string[];
  coverUrl?: string | null;
  checklists?: unknown[];
  parentTaskId?: string | null;
  order?: number;
  projectId?: string | null;
}

/**
 * Task with enriched data (attachments, tags)
 */
export interface EnrichedTask {
  id: string;
  workspaceId: string;
  projectId?: string | null;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  assigneeId?: string | null;
  dueDate?: Date | null;
  tags?: unknown;
  coverUrl?: string | null;
  checklists?: unknown;
  order: number;
  parentTaskId?: string | null;
  templateId?: string | null;
  createdBy: string;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  attachments: unknown[];
  tagsList: unknown[];
}

/**
 * Pagination options (offset-based)
 */
export interface TaskPaginationOptions {
  page?: number;
  limit?: number;
  projectId?: string;
  workspaceId?: string;
}

/**
 * Cursor-based pagination options
 */
export interface TaskCursorPaginationOptions {
  cursor?: string;
  limit?: number;
  direction?: 'forward' | 'backward';
  projectId?: string;
  workspaceId?: string;
}

/**
 * Task Service Class
 */
export class TaskService {
  /**
   * Get tasks with pagination and filtering
   */
  static async getTasks(
    user: User,
    options: TaskPaginationOptions
  ): Promise<{ tasks: EnrichedTask[]; pagination: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean } }> {
    const { projectId, workspaceId, page = 1, limit = 50 } = options;
    const maxLimit = Math.min(limit, 100);
    const offset = (page - 1) * maxLimit;

    // Must provide either projectId or workspaceId
    if (!projectId && !workspaceId) {
      throw new ValidationError('Either projectId or workspaceId is required');
    }

    // If projectId is provided, get the project and its workspace
    let targetWorkspaceId = workspaceId;
    if (projectId) {
      const [project] = await db
        .select({
          id: projects.id,
          workspaceId: projects.workspaceId
        })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!project) {
        throw new NotFoundError('Project');
      }

      targetWorkspaceId = project.workspaceId;
    }

    // Check workspace membership
    const membership = await checkWorkspaceMembership(targetWorkspaceId!, user.id);
    if (!membership) {
      throw new ForbiddenError('Access denied: User is not a member of this workspace');
    }

    // Build query conditions
    const conditions: ReturnType<typeof eq>[] = [];
    if (projectId) {
      conditions.push(eq(tasks.projectId, projectId));
    } else {
      conditions.push(eq(tasks.workspaceId, targetWorkspaceId!));
    }

    // Cache key for tasks list
    const cacheKey = projectId 
      ? `${CACHE_KEYS.TASKS_LIST}project:${projectId}:page:${page}:limit:${maxLimit}`
      : `${CACHE_KEYS.TASKS_LIST}workspace:${targetWorkspaceId}:page:${page}:limit:${maxLimit}`;

    // Get tasks with cache
    const cachedResult = await cacheGetOrSet(
      cacheKey,
      async () => {
        // Get total count for pagination
        const countResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(tasks)
          .where(and(...conditions));
        const totalCount = countResult[0]?.count || 0;

        // Get tasks with pagination
        const tasksList = await db
          .select()
          .from(tasks)
          .where(and(...conditions))
          .orderBy(tasks.createdAt)
          .limit(maxLimit)
          .offset(offset);

        return { tasksList, totalCount };
      },
      CACHE_TTL.TASKS_LIST
    );

    const { tasksList, totalCount } = cachedResult;

    if (tasksList.length === 0) {
      return {
        tasks: [],
        pagination: {
          page,
          limit: maxLimit,
          total: Number(totalCount),
          totalPages: Math.ceil(Number(totalCount) / maxLimit),
          hasMore: false
        }
      };
    }

    // Enrich tasks with attachments and tags
    const enrichedTasks = await this.enrichTasksWithRelations(tasksList);

    return {
      tasks: enrichedTasks,
      pagination: {
        page,
        limit: maxLimit,
        total: Number(totalCount),
        totalPages: Math.ceil(Number(totalCount) / maxLimit),
        hasMore: offset + enrichedTasks.length < Number(totalCount)
      }
    };
  }

  /**
   * Get tasks with cursor-based pagination (better performance for large lists)
   */
  static async getTasksWithCursor(
    user: User,
    options: TaskCursorPaginationOptions
  ): Promise<CursorPaginationResult<EnrichedTask>> {
    const { projectId, workspaceId, cursor, limit = 50, direction = 'forward' } = options;
    const maxLimit = Math.min(limit, 100);

    // Must provide either projectId or workspaceId
    if (!projectId && !workspaceId) {
      throw new ValidationError('Either projectId or workspaceId is required');
    }

    // If projectId is provided, get the project and its workspace
    let targetWorkspaceId = workspaceId;
    if (projectId) {
      const [project] = await db
        .select({
          id: projects.id,
          workspaceId: projects.workspaceId
        })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!project) {
        throw new NotFoundError('Project');
      }

      targetWorkspaceId = project.workspaceId;
    }

    // Check workspace membership
    const membership = await checkWorkspaceMembership(targetWorkspaceId!, user.id);
    if (!membership) {
      throw new ForbiddenError('Access denied: User is not a member of this workspace');
    }

    // Build base query conditions
    const baseConditions: ReturnType<typeof eq>[] = [];
    if (projectId) {
      baseConditions.push(eq(tasks.projectId, projectId));
    } else {
      baseConditions.push(eq(tasks.workspaceId, targetWorkspaceId!));
    }

    // Build cursor conditions
    // If cursor is provided, find the task and use its createdAt for filtering
    // (since we order by createdAt, not id)
    const cursorConditions: SQL[] = [...baseConditions];
    
    if (cursor) {
      // Verify cursor exists and get its createdAt
      const [cursorTask] = await db
        .select({ id: tasks.id, createdAt: tasks.createdAt })
        .from(tasks)
        .where(and(
          eq(tasks.id, cursor),
          ...baseConditions
        ))
        .limit(1);

      if (cursorTask) {
        // Use createdAt for cursor filtering (matches the orderBy)
        if (direction === 'forward') {
          // Get items created after the cursor task, or same createdAt but different id
          const orCondition: SQL<unknown> = or(
            gt(tasks.createdAt, cursorTask.createdAt),
            and(
              eq(tasks.createdAt, cursorTask.createdAt),
              gt(tasks.id, cursorTask.id)
            )
          ) as SQL<unknown>;
          cursorConditions.push(orCondition);
        } else {
          // Get items created before the cursor task, or same createdAt but different id
          const orCondition2: SQL<unknown> = or(
            lt(tasks.createdAt, cursorTask.createdAt),
            and(
              eq(tasks.createdAt, cursorTask.createdAt),
              lt(tasks.id, cursorTask.id)
            )
          ) as SQL<unknown>;
          cursorConditions.push(orCondition2);
        }
      } else {
        // Cursor doesn't exist, return empty result
        return {
          items: [],
          nextCursor: undefined,
          prevCursor: undefined,
          hasMore: false
        };
      }
    }

    // Get tasks with cursor pagination (fetch limit + 1 to detect hasMore)
    // Always order by createdAt ASC, then id ASC for consistent pagination
    const tasksList = await db
      .select()
      .from(tasks)
      .where(and(...cursorConditions))
      .orderBy(tasks.createdAt, tasks.id)
      .limit(maxLimit + 1);

    // Enrich tasks with attachments and tags
    const enrichedTasks = await this.enrichTasksWithRelations(tasksList);

    // Create cursor pagination result
    return createCursorPaginationResult(enrichedTasks, maxLimit, direction);
  }

  /**
   * Get a single task by ID using Drizzle relations
   */
  static async getTaskById(taskId: string, user: User): Promise<EnrichedTask> {
    // Get task with relations using Drizzle .with()
    const task = await db.query.tasks.findFirst({
      where: (tasks, { eq }) => eq(tasks.id, taskId),
      with: {
        attachments: true,
        tagRelations: {
          with: {
            tag: true
          }
        }
      }
    });

    if (!task) {
      throw new NotFoundError('Task');
    }

    // Check workspace membership
    const membership = await checkWorkspaceMembership(task.workspaceId, user.id);
    if (!membership) {
      throw new ForbiddenError('Access denied: User is not a member of this workspace');
    }

    // Return enriched task
    return {
      ...task,
      attachments: task.attachments || [],
      tagsList: task.tagRelations?.map((tr: { tag: unknown }) => tr.tag) || []
    } as EnrichedTask;
  }

  /**
   * Create a new task
   */
  static async createTask(data: CreateTaskInput, userId: string): Promise<EnrichedTask> {
    // Check workspace membership (editors+ only)
    const membership = await checkWorkspaceMembership(data.workspaceId, userId, ['editor', 'admin', 'owner']);
    if (!membership) {
      throw new ForbiddenError('Access denied: Editor role or higher required');
    }

    // Validate projectId if provided
    if (data.projectId) {
      const [project] = await db
        .select({
          id: projects.id,
          workspaceId: projects.workspaceId
        })
        .from(projects)
        .where(and(
          eq(projects.id, data.projectId),
          eq(projects.workspaceId, data.workspaceId)
        ))
        .limit(1);

      if (!project) {
        throw new ValidationError('Project not found or does not belong to this workspace');
      }
    }

    try {
      // Verify tags exist before transaction
      type TaskTag = { id: string; workspaceId: string };
      let existingTags: TaskTag[] = [];
      if (data.tagIds && data.tagIds.length > 0) {
        const tags = await db
          .select()
          .from(taskTags)
          .where(and(
            eq(taskTags.workspaceId, data.workspaceId),
            inArray(taskTags.id, data.tagIds)
          ));

        existingTags = tags as TaskTag[];

        if (existingTags.length !== data.tagIds.length) {
          log.warn('Some tags not found or not in workspace', { 
            tagIds: data.tagIds, 
            found: existingTags.length, 
            userId 
          });
        }
      }

      // Use transaction to ensure atomicity
      const enrichedTask = await withTransaction(async (tx) => {
        // Create task
        const [newTask] = await tx
          .insert(tasks)
          .values({
            workspaceId: data.workspaceId,
            projectId: data.projectId,
            title: data.title,
            description: data.description,
            status: data.status || 'todo',
            priority: data.priority || 'medium',
            assigneeId: data.assigneeId,
            dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
            tags: data.tags || [],
            coverUrl: data.coverUrl,
            checklists: data.checklists || [],
            templateId: data.templateId,
            createdBy: userId
          })
          .returning();

        if (!newTask) {
          throw new Error('No task returned from insert');
        }

        // Create tag relations if tagIds provided
        if (existingTags.length > 0) {
          await tx.insert(taskTagRelations).values(
            existingTags.map(tag => ({
              taskId: newTask.id,
              tagId: tag.id
            }))
          );
        }

        // Fetch enriched task data (in transaction, use manual queries)
        const [attachments, tagRelations] = await Promise.all([
          tx.select().from(taskAttachments).where(eq(taskAttachments.taskId, newTask.id)),
          tx.select().from(taskTagRelations).where(eq(taskTagRelations.taskId, newTask.id))
        ]);

        let taskTagsList: unknown[] = [];
        if (tagRelations.length > 0) {
          const tagIds = tagRelations.map(tr => tr.tagId);
          taskTagsList = await tx.select().from(taskTags).where(inArray(taskTags.id, tagIds));
        }

        return {
          ...newTask,
          attachments,
          tagsList: taskTagsList
        } as EnrichedTask;
      });

      // Invalidate tasks list cache
      await Promise.all([
        cacheDelPattern(`${CACHE_KEYS.TASKS_LIST}workspace:${enrichedTask.workspaceId}:*`),
        data.projectId ? cacheDelPattern(`${CACHE_KEYS.TASKS_LIST}project:${data.projectId}:*`) : Promise.resolve()
      ]);

      log.info('Task created', { 
        taskId: enrichedTask.id, 
        workspaceId: enrichedTask.workspaceId, 
        userId 
      });

      return enrichedTask;
    } catch (error) {
      // Re-throw AppError instances
      if (error instanceof ValidationError || error instanceof ForbiddenError) {
        throw error;
      }
      log.error('Failed to create task', error as Error, { data, userId });
      throw new InternalServerError('Failed to create task', { userId });
    }
  }

  /**
   * Update a task
   */
  static async updateTask(
    taskId: string,
    data: UpdateTaskInput,
    userId: string
  ): Promise<EnrichedTask> {
    // Get existing task
    const [existingTask] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);

    if (!existingTask) {
      throw new NotFoundError('Task');
    }

    // Check workspace membership (editors+ only)
    const membership = await checkWorkspaceMembership(existingTask.workspaceId, userId, ['editor', 'admin', 'owner']);
    if (!membership) {
      throw new ForbiddenError('Access denied: Editor role or higher required');
    }

    // Validate projectId if provided
    if (data.projectId) {
      const [project] = await db
        .select({
          id: projects.id,
          workspaceId: projects.workspaceId
        })
        .from(projects)
        .where(and(
          eq(projects.id, data.projectId),
          eq(projects.workspaceId, existingTask.workspaceId)
        ))
        .limit(1);

      if (!project) {
        throw new ValidationError('Project not found or does not belong to this workspace');
      }
    }

    try {
      // Verify tags exist if tagIds provided
      let existingTags: { id: string }[] = [];
      if (data.tagIds && data.tagIds.length > 0) {
        const tags = await db
          .select()
          .from(taskTags)
          .where(and(
            eq(taskTags.workspaceId, existingTask.workspaceId),
            inArray(taskTags.id, data.tagIds)
          ));

        existingTags = tags;
      }

      // Prepare update data
      const updateData: Record<string, unknown> = {
        updatedAt: new Date()
      };

      // Whitelist allowed fields
      if (data.title !== undefined) updateData.title = data.title;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.priority !== undefined) updateData.priority = data.priority;
      if (data.assigneeId !== undefined) updateData.assigneeId = data.assigneeId;
      if (data.checklists !== undefined) updateData.checklists = data.checklists;
      if (data.parentTaskId !== undefined) updateData.parentTaskId = data.parentTaskId;
      if (data.order !== undefined) updateData.order = data.order;
      if (data.tags !== undefined) updateData.tags = data.tags;

      // Handle coverUrl: convert empty string to null
      if (data.coverUrl !== undefined) {
        updateData.coverUrl = data.coverUrl === '' || data.coverUrl === null ? null : data.coverUrl;
      }

      // Handle dueDate: convert string to Date if provided
      if (data.dueDate !== undefined) {
        updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
      }

      // Handle projectId
      if (data.projectId !== undefined) {
        updateData.projectId = data.projectId;
      }

      // Handle status change to done (set completedAt)
      if (data.status === 'done' && existingTask.status !== 'done') {
        updateData.completedAt = new Date();
      } else if (data.status !== 'done' && existingTask.status === 'done') {
        updateData.completedAt = null;
      }

      // Use transaction for atomicity
      const updatedTask = await withTransaction(async (tx) => {
        // Update task
        const [task] = await tx
          .update(tasks)
          .set(updateData as Partial<typeof tasks.$inferInsert>)
          .where(eq(tasks.id, taskId))
          .returning();

        if (!task) {
          throw new Error('No task returned from update');
        }

        // Update tag relations if tagIds provided
        if (data.tagIds !== undefined) {
          // Delete existing relations
          await tx.delete(taskTagRelations).where(eq(taskTagRelations.taskId, taskId));

          // Create new relations
          if (existingTags.length > 0) {
            await tx.insert(taskTagRelations).values(
              existingTags.map(tag => ({
                taskId: task.id,
                tagId: tag.id
              }))
            );
          }
        }

        // Fetch enriched task data (in transaction, use manual queries)
        const [attachments, tagRelations] = await Promise.all([
          tx.select().from(taskAttachments).where(eq(taskAttachments.taskId, task.id)),
          tx.select().from(taskTagRelations).where(eq(taskTagRelations.taskId, task.id))
        ]);

        let taskTagsList: unknown[] = [];
        if (tagRelations.length > 0) {
          const tagIds = tagRelations.map(tr => tr.tagId);
          taskTagsList = await tx.select().from(taskTags).where(inArray(taskTags.id, tagIds));
        }

        return {
          ...task,
          attachments,
          tagsList: taskTagsList
        } as EnrichedTask;
      });

      // Invalidate cache
      await Promise.all([
        cacheDelPattern(`${CACHE_KEYS.TASKS_LIST}workspace:${updatedTask.workspaceId}:*`),
        updatedTask.projectId ? cacheDelPattern(`${CACHE_KEYS.TASKS_LIST}project:${updatedTask.projectId}:*`) : Promise.resolve(),
        cacheDelPattern(`${CACHE_KEYS.TASK}${taskId}`)
      ]);

      log.info('Task updated', { taskId, userId });
      return updatedTask;
    } catch (error) {
      if (error instanceof ValidationError || error instanceof ForbiddenError) {
        throw error;
      }
      log.error('Failed to update task', error as Error, { taskId, data, userId });
      throw new InternalServerError('Failed to update task', { taskId, userId });
    }
  }

  /**
   * Delete a task
   */
  static async deleteTask(taskId: string, userId: string): Promise<void> {
    // Get existing task
    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);

    if (!task) {
      throw new NotFoundError('Task');
    }

    // Check workspace membership (owner/admin only for deletion)
    const membership = await checkWorkspaceMembership(task.workspaceId, userId, ['owner', 'admin']);
    if (!membership) {
      throw new ForbiddenError('Access denied: Owner or admin role required');
    }

    try {
      await db.delete(tasks).where(eq(tasks.id, taskId));

      // Invalidate cache
      await Promise.all([
        cacheDelPattern(`${CACHE_KEYS.TASKS_LIST}workspace:${task.workspaceId}:*`),
        task.projectId ? cacheDelPattern(`${CACHE_KEYS.TASKS_LIST}project:${task.projectId}:*`) : Promise.resolve(),
        cacheDelPattern(`${CACHE_KEYS.TASK}${taskId}`)
      ]);

      log.info('Task deleted', { taskId, userId });
    } catch (error) {
      log.error('Failed to delete task', error as Error, { taskId, userId });
      throw new InternalServerError('Failed to delete task', { taskId, userId });
    }
  }

  /**
   * Enrich tasks with attachments and tags using Drizzle relations
   * Uses .with() to automatically handle JOINs and avoid N+1 queries
   */
  private static async enrichTasksWithRelations(
    tasksList: Array<typeof tasks.$inferSelect>
  ): Promise<EnrichedTask[]> {
    if (tasksList.length === 0) {
      return [];
    }

    // Get all task IDs
    const taskIds = tasksList.map(t => t.id);

    // Use Drizzle relations with .with() to fetch attachments and tags in optimized queries
    // This automatically handles JOINs and avoids N+1 queries
    const tasksWithRelations = await db.query.tasks.findMany({
      where: (tasks, { inArray }) => inArray(tasks.id, taskIds),
      with: {
        attachments: true,
        tagRelations: {
          with: {
            tag: true
          }
        }
      }
    });

    // Create a map for quick lookup
    const tasksMap = new Map(tasksWithRelations.map(t => [t.id, t]));

    // Enrich tasks with relations data
    return tasksList.map(task => {
      const taskWithRelations = tasksMap.get(task.id);
      return {
        ...task,
        attachments: taskWithRelations?.attachments || [],
        tagsList: taskWithRelations?.tagRelations?.map((tr: { tag: unknown }) => tr.tag) || []
      } as EnrichedTask;
    });
  }
}

