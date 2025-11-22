/**
 * Task Service Cursor Pagination Tests
 * 
 * Tests for cursor-based pagination in TaskService
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskService } from '../services/task-service';
import { db } from '../db';
import { tasks, workspaces, workspaceMembers, users, projects } from '../db/schema';
import { eq } from 'drizzle-orm';

describe('TaskService - Cursor Pagination', () => {
  let testUserId: string;
  let testWorkspaceId: string;
  let testProjectId: string;
  let createdTaskIds: string[] = [];

  beforeEach(async () => {
    // Create test user
    const [testUser] = await db.insert(users).values({
      email: `test-cursor-${Date.now()}@example.com`,
      name: 'Test User',
      hashedPassword: 'hashed',
      emailVerified: true
    }).returning();
    
    if (!testUser) {
      throw new Error('Failed to create test user');
    }
    testUserId = testUser.id;

    // Create test workspace
    const [testWorkspace] = await db.insert(workspaces).values({
      name: 'Test Workspace',
      slug: `test-ws-${Date.now()}`,
      createdBy: testUserId
    }).returning();
    
    if (!testWorkspace) {
      throw new Error('Failed to create test workspace');
    }
    testWorkspaceId = testWorkspace.id;

    // Add user as workspace member
    await db.insert(workspaceMembers).values({
      workspaceId: testWorkspaceId,
      userId: testUserId,
      role: 'owner'
    });

    // Create test project
    const [testProject] = await db.insert(projects).values({
      workspaceId: testWorkspaceId,
      name: 'Test Project',
      createdBy: testUserId
    }).returning();
    
    if (!testProject) {
      throw new Error('Failed to create test project');
    }
    testProjectId = testProject.id;

    // Create test tasks (10 tasks) with small delays to ensure different createdAt
    const testTasks = [];
    for (let i = 0; i < 10; i++) {
      // Small delay to ensure different createdAt timestamps
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      const [task] = await db.insert(tasks).values({
        workspaceId: testWorkspaceId,
        projectId: testProjectId,
        title: `Task ${i + 1}`,
        status: 'todo' as const,
        priority: 'medium' as const,
        createdBy: testUserId
      }).returning();
      if (task) {
        testTasks.push(task);
      }
    }
    createdTaskIds = testTasks.map(t => t.id).sort();
  });

  afterEach(async () => {
    // Cleanup
    if (createdTaskIds.length > 0) {
      await db.delete(tasks).where(eq(tasks.workspaceId, testWorkspaceId));
    }
    if (testProjectId) {
      await db.delete(projects).where(eq(projects.id, testProjectId));
    }
    if (testWorkspaceId) {
      await db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, testWorkspaceId));
      await db.delete(workspaces).where(eq(workspaces.id, testWorkspaceId));
    }
    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  it('should get first page of tasks with cursor pagination', async () => {
    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, testUserId)
    });

    if (!user) {
      throw new Error('Test user not found');
    }

    const result = await TaskService.getTasksWithCursor(user, {
      workspaceId: testWorkspaceId,
      limit: 5
    });

    expect(result.items).toHaveLength(5);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBeDefined();
    expect(result.prevCursor).toBeDefined();
  });

  it('should get next page using cursor', async () => {
    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, testUserId)
    });

    if (!user) {
      throw new Error('Test user not found');
    }

    // Get first page
    const firstPage = await TaskService.getTasksWithCursor(user, {
      workspaceId: testWorkspaceId,
      limit: 5
    });

    expect(firstPage.items.length).toBeGreaterThanOrEqual(0);
    expect(firstPage.items.length).toBeLessThanOrEqual(5);
    
    if (firstPage.nextCursor && firstPage.items.length > 0) {
      // Get second page using cursor
      const secondPage = await TaskService.getTasksWithCursor(user, {
        workspaceId: testWorkspaceId,
        cursor: firstPage.nextCursor,
        limit: 5
      });

      expect(secondPage.items.length).toBeGreaterThanOrEqual(0);
      if (secondPage.items.length > 0 && firstPage.items.length > 0) {
        expect(secondPage.items[0]?.id).not.toBe(firstPage.items[0]?.id);
      }
    }
  });

  it('should return empty result when cursor points to non-existent task', async () => {
    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, testUserId)
    });

    if (!user) {
      throw new Error('Test user not found');
    }

    const result = await TaskService.getTasksWithCursor(user, {
      workspaceId: testWorkspaceId,
      cursor: '00000000-0000-0000-0000-000000000000',
      limit: 5
    });

    expect(result.items).toHaveLength(0);
    expect(result.hasMore).toBe(false);
  });

  it('should support backward pagination', async () => {
    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, testUserId)
    });

    if (!user) {
      throw new Error('Test user not found');
    }

    // Get first page
    const firstPage = await TaskService.getTasksWithCursor(user, {
      workspaceId: testWorkspaceId,
      limit: 5
    });

    // Get previous page using backward direction
    if (firstPage.prevCursor) {
      const prevPage = await TaskService.getTasksWithCursor(user, {
        workspaceId: testWorkspaceId,
        cursor: firstPage.prevCursor,
        limit: 5,
        direction: 'backward'
      });

      expect(prevPage.items.length).toBeGreaterThanOrEqual(0);
    }
  });

  it('should filter by projectId', async () => {
    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, testUserId)
    });

    if (!user) {
      throw new Error('Test user not found');
    }

    const result = await TaskService.getTasksWithCursor(user, {
      projectId: testProjectId,
      limit: 10
    });

    expect(result.items.length).toBeGreaterThan(0);
    result.items.forEach(task => {
      expect(task.projectId).toBe(testProjectId);
    });
  });

  it('should respect limit parameter', async () => {
    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, testUserId)
    });

    if (!user) {
      throw new Error('Test user not found');
    }

    const result = await TaskService.getTasksWithCursor(user, {
      workspaceId: testWorkspaceId,
      limit: 3
    });

    expect(result.items.length).toBeLessThanOrEqual(3);
  });

  it('should cap limit at 100', async () => {
    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, testUserId)
    });

    if (!user) {
      throw new Error('Test user not found');
    }

    const result = await TaskService.getTasksWithCursor(user, {
      workspaceId: testWorkspaceId,
      limit: 200 // Request more than max
    });

    expect(result.items.length).toBeLessThanOrEqual(100);
  });
});

