/**
 * Database Transaction Tests
 * 
 * Tests for the transaction helper to ensure atomicity and rollback behavior
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../db';
import { withTransaction } from '../lib/db-transaction';
import { DatabaseError } from '../lib/errors';
import { tasks, taskTagRelations, taskTags, workspaces, workspaceMembers, teams, teamMembers, users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

describe('Database Transactions', () => {
  let testWorkspaceId: string;
  let testUserId: string;

  beforeEach(async () => {
    // Create test workspace and user IDs
    testWorkspaceId = randomUUID();
    testUserId = randomUUID();

    // Create test user FIRST (required for foreign keys)
    await db.insert(users).values({
      id: testUserId,
      email: `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`,
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
  });

  afterEach(async () => {
    // Cleanup: Delete test data in correct order
    try {
      await db.delete(taskTagRelations).where(eq(taskTagRelations.taskId, testWorkspaceId));
      await db.delete(tasks).where(eq(tasks.workspaceId, testWorkspaceId));
      await db.delete(taskTags).where(eq(taskTags.workspaceId, testWorkspaceId));
      await db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, testWorkspaceId));
      await db.delete(teams).where(eq(teams.workspaceId, testWorkspaceId));
      await db.delete(workspaces).where(eq(workspaces.id, testWorkspaceId));
      await db.delete(users).where(eq(users.id, testUserId));
    } catch (_error) {
      // Ignore cleanup errors
    }
  });

  describe('withTransaction', () => {
    it('should commit all operations when successful', async () => {
      const taskId = randomUUID();
      const tagId = randomUUID();

      // Create a tag first
      await db.insert(taskTags).values({
        id: tagId,
        workspaceId: testWorkspaceId,
        name: 'Test Tag',
        color: '#FF0000',
        createdBy: testUserId,
      });

      // Execute transaction
      await withTransaction(async (tx) => {
        // Create task
        await tx.insert(tasks).values({
          id: taskId,
          workspaceId: testWorkspaceId,
          title: 'Test Task',
          status: 'todo',
          priority: 'medium',
          createdBy: testUserId,
        });

        // Create tag relation
        await tx.insert(taskTagRelations).values({
          taskId,
          tagId,
        });
      });

      // Verify both operations were committed
      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, taskId))
        .limit(1);

      const [relation] = await db
        .select()
        .from(taskTagRelations)
        .where(eq(taskTagRelations.taskId, taskId))
        .limit(1);

      expect(task).toBeDefined();
      expect(task?.title).toBe('Test Task');
      expect(relation).toBeDefined();
      expect(relation?.tagId).toBe(tagId);
    });

    it('should rollback all operations when an error occurs', async () => {
      const taskId = randomUUID();
      const tagId = randomUUID();

      // Create a tag first
      await db.insert(taskTags).values({
        id: tagId,
        workspaceId: testWorkspaceId,
        name: 'Test Tag',
        color: '#FF0000',
        createdBy: testUserId,
      });

      // Attempt transaction that will fail
      try {
        await withTransaction(async (tx) => {
          // Create task
          await tx.insert(tasks).values({
            id: taskId,
            workspaceId: testWorkspaceId,
            title: 'Test Task',
            status: 'todo',
            priority: 'medium',
            createdBy: testUserId,
          });

          // Create tag relation
          await tx.insert(taskTagRelations).values({
            taskId,
            tagId,
          });

          // Force an error
          throw new Error('Transaction test error');
        });
      } catch (error) {
        // Expected error
        expect(error).toBeInstanceOf(Error);
      }

      // Verify neither operation was committed
      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, taskId))
        .limit(1);

      const [relation] = await db
        .select()
        .from(taskTagRelations)
        .where(eq(taskTagRelations.taskId, taskId))
        .limit(1);

      expect(task).toBeUndefined();
      expect(relation).toBeUndefined();
    });

    it('should handle database constraint violations', async () => {
      const taskId = randomUUID();
      const invalidTagId = randomUUID(); // Tag that doesn't exist

      // Attempt transaction with invalid foreign key
      try {
        await withTransaction(async (tx) => {
          // Create task
          await tx.insert(tasks).values({
            id: taskId,
            workspaceId: testWorkspaceId,
            title: 'Test Task',
            status: 'todo',
            priority: 'medium',
            createdBy: testUserId,
          });

          // Try to create relation with non-existent tag (should fail)
          await tx.insert(taskTagRelations).values({
            taskId,
            tagId: invalidTagId,
          });
        });
      } catch (error) {
        // Expected database error
        expect(error).toBeDefined();
      }

      // Verify task was not created (rollback occurred)
      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, taskId))
        .limit(1);

      expect(task).toBeUndefined();
    });

    it('should return the result from the transaction callback', async () => {
      const taskId = randomUUID();

      const result = await withTransaction(async (tx) => {
        const [task] = await tx
          .insert(tasks)
          .values({
            id: taskId,
            workspaceId: testWorkspaceId,
            title: 'Test Task',
            status: 'todo',
            priority: 'medium',
            createdBy: testUserId,
          })
          .returning();

        if (!task) {
          throw new Error('Task creation failed');
        }

        return { taskId: task.id, title: task.title };
      });

      expect(result).toBeDefined();
      expect(result.taskId).toBe(taskId);
      expect(result.title).toBe('Test Task');
    });

    it('should support nested transactions (same transaction context)', async () => {
      const taskId1 = randomUUID();
      const taskId2 = randomUUID();

      await withTransaction(async (tx) => {
        // First operation
        await tx.insert(tasks).values({
          id: taskId1,
          workspaceId: testWorkspaceId,
          title: 'Task 1',
          status: 'todo',
          priority: 'medium',
          createdBy: testUserId,
        });

        // Nested operation in same transaction
        await tx.insert(tasks).values({
          id: taskId2,
          workspaceId: testWorkspaceId,
          title: 'Task 2',
          status: 'todo',
          priority: 'medium',
          createdBy: testUserId,
        });
      });

      // Verify both tasks were created
      const tasksList = await db
        .select()
        .from(tasks)
        .where(eq(tasks.workspaceId, testWorkspaceId));

      expect(tasksList.length).toBeGreaterThanOrEqual(2);
      expect(tasksList.some(t => t.id === taskId1)).toBe(true);
      expect(tasksList.some(t => t.id === taskId2)).toBe(true);
    });
  });

  describe('Workspace creation transaction', () => {
    it('should create workspace and add owner member atomically', async () => {
      const workspaceId = randomUUID();
      const slug = `test-workspace-${Date.now()}`;

      const result = await withTransaction(async (tx) => {
        // Create workspace
        const [workspace] = await tx
          .insert(workspaces)
          .values({
            id: workspaceId,
            name: 'Test Workspace',
            slug,
            createdBy: testUserId,
          })
          .returning();

        if (!workspace) {
          throw new Error('No workspace returned from insert');
        }

        // Add creator as owner
        await tx.insert(workspaceMembers).values({
          workspaceId: workspace.id,
          userId: testUserId,
          role: 'owner',
        });

        return { workspace };
      });

      // Verify both operations were committed
      const [workspace] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);

      const [member] = await db
        .select()
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, workspaceId))
        .limit(1);

      expect(workspace).toBeDefined();
      expect(workspace?.slug).toBe(slug);
      expect(member).toBeDefined();
      expect(member?.userId).toBe(testUserId);
      expect(member?.role).toBe('owner');
      expect(result.workspace.id).toBe(workspaceId);
    });

    it('should rollback workspace creation if member addition fails', async () => {
      const workspaceId = randomUUID();
      const slug = `test-workspace-${Date.now()}`;

      try {
        await withTransaction(async (tx) => {
          // Create workspace
          await tx
            .insert(workspaces)
            .values({
              id: workspaceId,
              name: 'Test Workspace',
              slug,
              createdBy: testUserId,
            })
            .returning();

          // Force an error before adding member
          throw new Error('Transaction test error');
        });
      } catch (error) {
        // Expected error
        expect(error).toBeInstanceOf(Error);
      }

      // Verify workspace was not created
      const [workspace] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);

      expect(workspace).toBeUndefined();
    });
  });

  describe('Team creation transaction', () => {
    it('should create team and add leader member atomically', async () => {
      const teamId = randomUUID();

      const result = await withTransaction(async (tx) => {
        // Create team
        const [team] = await tx
          .insert(teams)
          .values({
            id: teamId,
            workspaceId: testWorkspaceId,
            name: 'Test Team',
            createdBy: testUserId,
          })
          .returning();

        if (!team) {
          throw new Error('No team returned from insert');
        }

        // Add creator as leader
        await tx.insert(teamMembers).values({
          teamId: team.id,
          userId: testUserId,
          role: 'leader',
        });

        return { team };
      });

      // Verify both operations were committed
      const [team] = await db
        .select()
        .from(teams)
        .where(eq(teams.id, teamId))
        .limit(1);

      const [member] = await db
        .select()
        .from(teamMembers)
        .where(eq(teamMembers.teamId, teamId))
        .limit(1);

      expect(team).toBeDefined();
      expect(team?.name).toBe('Test Team');
      expect(member).toBeDefined();
      expect(member?.userId).toBe(testUserId);
      expect(member?.role).toBe('leader');
      expect(result.team.id).toBe(teamId);
    });

    it('should rollback team creation if member addition fails', async () => {
      const teamId = randomUUID();

      try {
        await withTransaction(async (tx) => {
          // Create team
          await tx
            .insert(teams)
            .values({
              id: teamId,
              workspaceId: testWorkspaceId,
              name: 'Test Team',
              createdBy: testUserId,
            })
            .returning();

          // Force an error before adding member
          throw new Error('Transaction test error');
        });
      } catch (error) {
        // Expected error
        expect(error).toBeInstanceOf(Error);
      }

      // Verify team was not created
      const [team] = await db
        .select()
        .from(teams)
        .where(eq(teams.id, teamId))
        .limit(1);

      expect(team).toBeUndefined();
    });
  });

  afterEach(async () => {
    // Cleanup: Delete test data
    try {
      await db.delete(teamMembers).where(eq(teamMembers.teamId, testWorkspaceId));
      await db.delete(teams).where(eq(teams.workspaceId, testWorkspaceId));
      await db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, testWorkspaceId));
      await db.delete(workspaces).where(eq(workspaces.id, testWorkspaceId));
      await db.delete(taskTagRelations).where(eq(taskTagRelations.taskId, testWorkspaceId));
      await db.delete(tasks).where(eq(tasks.workspaceId, testWorkspaceId));
      await db.delete(taskTags).where(eq(taskTags.workspaceId, testWorkspaceId));
    } catch (_error) {
      // Ignore cleanup errors
    }
  });

  describe('Transaction Timeout', () => {
    it('should complete transaction within timeout', async () => {
      const result = await withTransaction(async (tx) => {
        const newTaskResult = await tx
          .insert(tasks)
          .values({
            id: randomUUID(),
            workspaceId: testWorkspaceId,
            title: 'Test Task',
            createdBy: testUserId
          })
          .returning();
        return newTaskResult[0];
      }, { timeout: 5000 }); // 5 second timeout

      expect(result).toBeDefined();
      if (result) {
        expect(result.title).toBe('Test Task');
      }
    });

    it('should throw DatabaseError on timeout', async () => {
      // Create a transaction that takes longer than the timeout
      await expect(
        withTransaction(async (tx) => {
          // Simulate a long-running operation
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const [newTask] = await tx
            .insert(tasks)
            .values({
              id: randomUUID(),
              workspaceId: testWorkspaceId,
              title: 'Test Task',
              createdBy: testUserId
            })
            .returning();
          return newTask;
        }, { timeout: 500 }) // 500ms timeout, but operation takes 2000ms
      ).rejects.toThrow(DatabaseError);
    }, 10000); // 10 second timeout for this test

    it('should use default timeout of 30 seconds', async () => {
      const start = Date.now();
      
      const result = await withTransaction(async (tx) => {
        const [newTask] = await tx
          .insert(tasks)
          .values({
            id: randomUUID(),
            workspaceId: testWorkspaceId,
            title: 'Test Task',
            createdBy: testUserId
          })
          .returning();
        return newTask;
      }); // No timeout specified, should use default 30s

      const duration = Date.now() - start;
      expect(result).toBeDefined();
      expect(duration).toBeLessThan(30000); // Should complete well before 30s
    });

    it('should allow custom timeout values', async () => {
      const result = await withTransaction(async (tx) => {
        const newTaskResult = await tx
          .insert(tasks)
          .values({
            id: randomUUID(),
            workspaceId: testWorkspaceId,
            title: 'Test Task',
            createdBy: testUserId
          })
          .returning();
        return newTaskResult[0];
      }, { timeout: 60000 }); // 60 second timeout

      expect(result).toBeDefined();
      if (result) {
        expect(result.title).toBe('Test Task');
      }
    });

    it('should include timeout details in error', async () => {
      try {
        await withTransaction(async (_tx) => {
          await new Promise(resolve => setTimeout(resolve, 2000));
          return {};
        }, { timeout: 500 });
        
        expect.fail('Should have thrown timeout error');
      } catch (error) {
        expect(error).toBeInstanceOf(DatabaseError);
        if (error instanceof DatabaseError) {
          expect(error.message).toContain('timeout');
          expect(error.details).toBeDefined();
          expect(error.details?.timeout).toBe(500);
        }
      }
    }, 10000);
  });
});

