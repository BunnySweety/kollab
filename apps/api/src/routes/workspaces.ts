import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db';
import { workspaces, workspaceMembers, users } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { invalidateWorkspaceMemberCache } from '../lib/cache';
import { checkWorkspaceMembership } from '../lib/workspace-helpers';
import { workspaceSettingsSchema } from '../types/content';
import { ValidationError, NotFoundError, ForbiddenError, ConflictError, InternalServerError } from '../lib/errors';
import { withTransaction } from '../lib/db-transaction';
import { log } from '../lib/logger';
import { workspaceCreateRateLimiter } from '../middleware/rate-limiter';

const workspaceRoutes = new Hono();

// Create workspace schema
const createWorkspaceSchema = z.object({
  name: z.string()
    .min(1, 'Le nom du workspace est requis')
    .max(255, 'Le nom ne peut pas dépasser 255 caractères'),
  description: z.string().optional(),
  slug: z.string()
    .min(3, 'Le slug doit contenir au moins 3 caractères')
    .max(50, 'Le slug ne peut pas dépasser 50 caractères')
    .regex(/^[a-z0-9-]+$/, 'Le slug ne peut contenir que des lettres minuscules, chiffres et tirets')
});

// Get all workspaces for current user
workspaceRoutes.get('/', requireAuth, async (c) => {
  const user = c.get('user');

  const userWorkspaces = await db
    .select({
      workspace: workspaces,
      role: workspaceMembers.role
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, user.id));

  // Invalidate cache for all user's workspaces BEFORE returning the list
  // This ensures that subsequent access checks will use fresh data from the database
  // and prevents stale negative cache entries from blocking access
  await Promise.all(
    userWorkspaces.map(ws => 
      invalidateWorkspaceMemberCache(user.id, ws.workspace.id)
    )
  );

  return c.json({ workspaces: userWorkspaces });
});

// Create new workspace
workspaceRoutes.post('/', requireAuth, workspaceCreateRateLimiter, zValidator('json', createWorkspaceSchema), async (c) => {
  const user = c.get('user');
  const { name, description, slug } = c.req.valid('json');

  // Check if slug exists
  const existingWorkspace = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
    .limit(1);

  if (existingWorkspace.length > 0) {
    throw new ConflictError('Workspace slug already exists');
  }

  try {
    // Use transaction to ensure atomicity: workspace creation + member addition
    const result = await withTransaction(async (tx) => {
      // Create workspace
      const [newWorkspace] = await tx
        .insert(workspaces)
        .values({
          name,
          description,
          slug,
          createdBy: user.id
        })
        .returning();

      if (!newWorkspace) {
        throw new Error('No workspace returned from insert');
      }

      // Add creator as owner
      await tx.insert(workspaceMembers).values({
        workspaceId: newWorkspace.id,
        userId: user.id,
        role: 'owner'
      });

      return { workspace: newWorkspace };
    });

    // Invalidate and preload cache for the workspace creator
    await invalidateWorkspaceMemberCache(user.id, result.workspace.id, true, checkWorkspaceMembership);

    log.info('Workspace created', { workspaceId: result.workspace.id, userId: user.id });
    return c.json(result);
  } catch (error) {
    if (error instanceof ConflictError) {
      throw error;
    }
    log.error('Failed to create workspace', error as Error, { name, slug, userId: user.id });
    throw new InternalServerError('Failed to create workspace', { userId: user.id });
  }
});

// Get workspace by slug
workspaceRoutes.get('/:slug', requireAuth, async (c) => {
  const user = c.get('user');
  const slug = c.req.param('slug');

  // Get workspace
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
    .limit(1);

  if (!workspace) {
    throw new NotFoundError('Workspace');
  }

  // Check membership with Redis cache
  const membership = await checkWorkspaceMembership(workspace.id, user.id);
  if (!membership) {
    throw new ForbiddenError('Access denied: User is not a member of this workspace');
  }

  return c.json({ workspace, role: membership.role });
});

// Get workspace members
workspaceRoutes.get('/:workspaceId/members', requireAuth, async (c) => {
  const user = c.get('user');
  const workspaceId = c.req.param('workspaceId');

  // Check membership with Redis cache
  const membership = await checkWorkspaceMembership(workspaceId, user.id);
  if (!membership) {
    throw new ForbiddenError('Access denied: User is not a member of this workspace');
  }

  // Get all members with user details
  const members = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.joinedAt
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, workspaceId));

  return c.json({ members });
});

// Workspace update schema - SECURITY FIX: Whitelist allowed fields
const updateWorkspaceSchema = z.object({
  name: z.string()
    .min(1, 'Le nom du workspace est requis')
    .max(255, 'Le nom ne peut pas dépasser 255 caractères')
    .optional(),
  description: z.string().max(1000, 'La description ne peut pas dépasser 1000 caractères').optional(),
  logoUrl: z.string().url('L\'URL du logo doit être une URL valide').optional(),
  settings: workspaceSettingsSchema.optional()
});

// Update workspace
workspaceRoutes.patch('/:slug', requireAuth, zValidator('json', updateWorkspaceSchema), async (c) => {
  const user = c.get('user');
  const slug = c.req.param('slug');
  const body = c.req.valid('json');

  // Get workspace
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
    .limit(1);

  if (!workspace) {
    throw new NotFoundError('Workspace');
  }

  // Check workspace membership with Redis cache (owner/admin only)
  const membership = await checkWorkspaceMembership(workspace.id, user.id, ['owner', 'admin']);
  if (!membership) {
    throw new ForbiddenError('Access denied: Owner or admin role required');
  }

  // Update workspace - only allowed fields
  const [updatedWorkspace] = await db
    .update(workspaces)
    .set({
      ...body,
      updatedAt: new Date()
    })
    .where(eq(workspaces.id, workspace.id))
    .returning();

  return c.json({ workspace: updatedWorkspace });
});

// Delete workspace
workspaceRoutes.delete('/:slug', requireAuth, async (c) => {
  const user = c.get('user');
  const slug = c.req.param('slug');

  // Get workspace
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
    .limit(1);

  if (!workspace) {
    throw new NotFoundError('Workspace');
  }

  // Check workspace membership with Redis cache (owner only)
  const membership = await checkWorkspaceMembership(workspace.id, user.id, ['owner']);
  if (!membership) {
    throw new ForbiddenError('Only workspace owner can delete workspace');
  }

  // Delete workspace (cascade will handle related data)
  await db.delete(workspaces).where(eq(workspaces.id, workspace.id));

  return c.json({ success: true });
});

// Search users for invitation
workspaceRoutes.get('/:workspaceId/search-users', requireAuth, async (c) => {
  const user = c.get('user');
  const workspaceId = c.req.param('workspaceId');
  const query = c.req.query('q') || '';

  // Check workspace membership with Redis cache
  const membership = await checkWorkspaceMembership(workspaceId, user.id);
  if (!membership) {
    return c.json({ error: 'Access denied' }, 403);
  }

  // Search for users by email or name (excluding current workspace members)
  const currentMembers = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, workspaceId));

  const memberIds = currentMembers.map(m => m.userId);

  // Search all users
  const allUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl
    })
    .from(users)
    .limit(50);

  // Filter out current members and apply search query
  const searchResults = allUsers
    .filter(u => !memberIds.includes(u.id))
    .filter(u => {
      if (!query) return true;
      const searchTerm = query.toLowerCase();
      return (
        u.email.toLowerCase().includes(searchTerm) ||
        u.name.toLowerCase().includes(searchTerm)
      );
    })
    .slice(0, 10);

  return c.json({ users: searchResults });
});

// Invite member(s) to workspace
workspaceRoutes.post('/:workspaceId/invite', requireAuth, async (c) => {
  const user = c.get('user');
  const workspaceId = c.req.param('workspaceId');
  const body = await c.req.json();
  const userIds = Array.isArray(body.userIds) ? body.userIds : (body.email ? [] : []);
  const email = body.email;
  const role = body.role || 'viewer';

  // Check workspace membership with Redis cache (owner/admin only)
  const membership = await checkWorkspaceMembership(workspaceId, user.id, ['owner', 'admin']);
  if (!membership) {
    return c.json({ error: 'Access denied' }, 403);
  }

  const addedUsers = [];
  const errors = [];

  // Handle multiple user IDs
  if (userIds.length > 0) {
    for (const userId of userIds) {
      try {
        // Check if user exists
        const [userToAdd] = await db
          .select()
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        if (!userToAdd) {
          errors.push({ userId, error: 'User not found' });
          continue;
        }

        // Check if user is already a member
        const [existingMember] = await db
          .select()
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, workspaceId),
              eq(workspaceMembers.userId, userId)
            )
          )
          .limit(1);

        if (existingMember) {
          errors.push({ userId, error: 'Already a member' });
          continue;
        }

        // Add user to workspace
        await db.insert(workspaceMembers).values({
          workspaceId,
          userId,
          role
        });

        // Invalidate and preload cache for the newly added member
        await invalidateWorkspaceMemberCache(userId, workspaceId, true, checkWorkspaceMembership);

        addedUsers.push(userToAdd);
      } catch (_error) {
        errors.push({ userId, error: 'Failed to add user' });
      }
    }

    if (addedUsers.length === 0) {
      throw new ValidationError('No users were added', { errors });
    }

    return c.json({
      success: true,
      message: `${addedUsers.length} user(s) added successfully`,
      addedUsers,
      errors: errors.length > 0 ? errors : undefined
    });
  }

  // Handle single email (legacy support)
  if (email) {
    const [invitedUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!invitedUser) {
      throw new NotFoundError('User not found. They need to create an account first.');
    }

    // Check if user is already a member
    const [existingMember] = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, invitedUser.id)
        )
      )
      .limit(1);

    if (existingMember) {
      throw new ConflictError('User is already a member of this workspace');
    }

    // Add user to workspace
    await db.insert(workspaceMembers).values({
      workspaceId,
      userId: invitedUser.id,
      role
    });

    // Invalidate and preload cache for the newly invited member
    await invalidateWorkspaceMemberCache(invitedUser.id, workspaceId, true, checkWorkspaceMembership);

    return c.json({ success: true, message: 'Member added successfully' });
  }

  throw new ValidationError('No users specified');
});

// Remove member from workspace
workspaceRoutes.delete('/:workspaceId/members/:userId', requireAuth, async (c) => {
  const user = c.get('user');
  const workspaceId = c.req.param('workspaceId');
  const userIdToRemove = c.req.param('userId');

  // Check workspace membership with Redis cache (owner/admin only)
  const membership = await checkWorkspaceMembership(workspaceId, user.id, ['owner', 'admin']);
  if (!membership) {
    return c.json({ error: 'Access denied' }, 403);
  }

  // Cannot remove the owner
  const [memberToRemove] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userIdToRemove)
      )
    )
    .limit(1);

  if (memberToRemove?.role === 'owner') {
    throw new ValidationError('Cannot remove workspace owner');
  }

  // Remove member
  await db
    .delete(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userIdToRemove)
      )
    );

  // Invalidate cache for removed member
  await invalidateWorkspaceMemberCache(userIdToRemove, workspaceId);

  return c.json({ success: true });
});

export default workspaceRoutes;