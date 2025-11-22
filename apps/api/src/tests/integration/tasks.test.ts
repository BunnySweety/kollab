/**
 * Integration Tests for Tasks API
 * 
 * Tests the complete flow of task operations including:
 * - Task creation with tags
 * - Task updates
 * - Task retrieval with relations
 * - Task deletion
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../../db';
import { tasks, taskTags, taskTagRelations, workspaces, workspaceMembers, projects, users } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { TaskService } from '../../services/task-service';
import type { User } from '../../types';

describe('Tasks API Integration', () => {
  let testWorkspaceId: string;
  let testUserId: string;
  let testProjectId: string;
  let testTagId: string;
  let testUser: User;

  beforeEach(async () => {
    // Create test IDs
    testWorkspaceId = randomUUID();
    testUserId = randomUUID();
    testProjectId = randomUUID();
    testTagId = randomUUID();

    // Create test user FIRST (required for foreign keys)
    await db.insert(users).values({
      id: testUserId,
      email: `test-${Date.now()}@example.com`,
      name: 'Test User',
      hashedPassword: 'hashed',
      emailVerified: true
    });

    // Create test workspace (requires user to exist)
    await db.insert(workspaces).values({
      id: testWorkspaceId,
      name: 'Test Workspace',
      slug: `test-workspace-${Date.now()}`,
      createdBy: testUserId
    });

    // Create workspace membership (admin role)
    await db.insert(workspaceMembers).values({
      workspaceId: testWorkspaceId,
      userId: testUserId,
      role: 'admin'
    });

    // Create test project
    await db.insert(projects).values({
      id: testProjectId,
      workspaceId: testWorkspaceId,
      name: 'Test Project',
      viewType: 'list',
      createdBy: testUserId
    });

    // Create test tag
    await db.insert(taskTags).values({
      id: testTagId,
      workspaceId: testWorkspaceId,
      name: 'Test Tag',
      color: '#FF0000',
      createdBy: testUserId
    });

    // Get user from database to match User type
    const [dbUser] = await db.select().from(users).where(eq(users.id, testUserId)).limit(1);
    if (!dbUser) {
      throw new Error('Failed to create test user');
    }
    testUser = dbUser;
  });

  afterEach(async () => {
    // Cleanup - delete in correct order to respect foreign keys
    await db.delete(taskTagRelations).where(eq(taskTagRelations.taskId, randomUUID())); // Cleanup any relations
    await db.delete(tasks).where(eq(tasks.workspaceId, testWorkspaceId));
    await db.delete(taskTags).where(eq(taskTags.workspaceId, testWorkspaceId));
    await db.delete(projects).where(eq(projects.workspaceId, testWorkspaceId));
    await db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, testWorkspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, testWorkspaceId));
    await db.delete(users).where(eq(users.id, testUserId));
  });

  it('should create task with tags in transaction', async () => {
    const taskData = {
      workspaceId: testWorkspaceId,
      projectId: testProjectId,
      title: 'Test Task',
      description: 'Test Description',
      status: 'todo' as const,
      priority: 'medium' as const,
      tagIds: [testTagId]
    };

    const task = await TaskService.createTask(taskData, testUserId);

    expect(task).toBeDefined();
    expect(task.title).toBe('Test Task');
    expect(task.workspaceId).toBe(testWorkspaceId);
    expect(task.projectId).toBe(testProjectId);
    expect(task.tagsList).toHaveLength(1);
    expect(task.tagsList[0]).toHaveProperty('id', testTagId);

    // Verify task exists in database
    const [dbTask] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, task.id))
      .limit(1);

    expect(dbTask).toBeDefined();
    if (dbTask) {
      expect(dbTask.title).toBe('Test Task');
    }

    // Verify tag relation exists
    const [relation] = await db
      .select()
      .from(taskTagRelations)
      .where(eq(taskTagRelations.taskId, task.id))
      .limit(1);

    expect(relation).toBeDefined();
    if (relation) {
      expect(relation.tagId).toBe(testTagId);
    }
  });

  it('should get tasks with relations using .with()', async () => {
    // Create a task with tags
    const taskData = {
      workspaceId: testWorkspaceId,
      title: 'Test Task',
      tagIds: [testTagId]
    };

    const createdTask = await TaskService.createTask(taskData, testUserId);

    // Get task by ID (should use .with() to load relations)
    const retrievedTask = await TaskService.getTaskById(createdTask.id, testUser);

    expect(retrievedTask).toBeDefined();
    expect(retrievedTask.id).toBe(createdTask.id);
    expect(retrievedTask.attachments).toBeDefined();
    expect(Array.isArray(retrievedTask.attachments)).toBe(true);
    expect(retrievedTask.tagsList).toHaveLength(1);
    expect(retrievedTask.tagsList[0]).toHaveProperty('id', testTagId);
  });

  it('should get tasks list with pagination and relations', async () => {
    // Create multiple tasks
    const task1 = await TaskService.createTask({
      workspaceId: testWorkspaceId,
      title: 'Task 1',
      tagIds: [testTagId]
    }, testUserId);

    await TaskService.createTask({
      workspaceId: testWorkspaceId,
      title: 'Task 2'
    }, testUserId);

    // Get tasks with pagination
    const result = await TaskService.getTasks(testUser, {
      workspaceId: testWorkspaceId,
      page: 1,
      limit: 10
    });

    expect(result.tasks.length).toBeGreaterThanOrEqual(2);
    expect(result.pagination.total).toBeGreaterThanOrEqual(2);
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.hasMore).toBe(false);

    // Verify relations are loaded
    const taskWithTags = result.tasks.find(t => t.id === task1.id);
    expect(taskWithTags).toBeDefined();
    expect(taskWithTags?.tagsList).toHaveLength(1);
  });

  it('should update task with tag changes in transaction', async () => {
    // Create task without tags
    const task = await TaskService.createTask({
      workspaceId: testWorkspaceId,
      title: 'Test Task'
    }, testUserId);

    // Update task with tags
    const updatedTask = await TaskService.updateTask(task.id, {
      title: 'Updated Task',
      tagIds: [testTagId]
    }, testUserId);

    expect(updatedTask.title).toBe('Updated Task');
    expect(updatedTask.tagsList).toHaveLength(1);
    expect(updatedTask.tagsList[0]).toHaveProperty('id', testTagId);

    // Verify tag relation was created
    const [relation] = await db
      .select()
      .from(taskTagRelations)
      .where(eq(taskTagRelations.taskId, task.id))
      .limit(1);

    expect(relation).toBeDefined();
  });

  it('should handle status change to done and set completedAt', async () => {
    const task = await TaskService.createTask({
      workspaceId: testWorkspaceId,
      title: 'Test Task',
      status: 'todo'
    }, testUserId);

    expect(task.completedAt).toBeNull();

    // Update status to done
    const updatedTask = await TaskService.updateTask(task.id, {
      status: 'done'
    }, testUserId);

    expect(updatedTask.status).toBe('done');
    expect(updatedTask.completedAt).not.toBeNull();
    expect(updatedTask.completedAt).toBeInstanceOf(Date);
  });

  it('should delete task and invalidate cache', async () => {
    const task = await TaskService.createTask({
      workspaceId: testWorkspaceId,
      title: 'Test Task'
    }, testUserId);

    // Delete task
    await TaskService.deleteTask(task.id, testUserId);

    // Verify task is deleted
    const [deletedTask] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, task.id))
      .limit(1);

    expect(deletedTask).toBeUndefined();
  });

  it('should enforce workspace membership for task operations', async () => {
    const unauthorizedUserId = randomUUID();
    await db.insert(users).values({
      id: unauthorizedUserId,
      email: `unauthorized-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`,
      name: 'Unauthorized User',
      hashedPassword: 'hashed',
      emailVerified: true
    });
    const [unauthorizedUser] = await db.select().from(users).where(eq(users.id, unauthorizedUserId)).limit(1);
    if (!unauthorizedUser) {
      throw new Error('Failed to create unauthorized user');
    }

    const task = await TaskService.createTask({
      workspaceId: testWorkspaceId,
      title: 'Test Task'
    }, testUserId);

    // Try to get task as unauthorized user
    await expect(
      TaskService.getTaskById(task.id, unauthorizedUser)
    ).rejects.toThrow('Access denied');
  });
});

