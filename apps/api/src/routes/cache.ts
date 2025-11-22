import { Hono } from 'hono';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import {
  getCacheStats,
  clearAllCache,
  invalidateWorkspaceCache,
  invalidateUserCache,
  invalidateWorkspaceMemberCache,
  cacheDelPattern
} from '../lib/cache';
import { log } from '../lib/logger';
import { requireSystemAdmin } from '../middleware/system-admin';
import { checkWorkspaceMembership } from '../lib/workspace-helpers';

const cacheRoutes = new Hono();

// Get cache statistics
cacheRoutes.get('/stats', requireAuth, requireSystemAdmin, async (c) => {
  try {
    const stats = await getCacheStats();
    return c.json({
      success: true,
      stats
    });
  } catch (error) {
    log.error('Failed to get cache stats', error as Error);
    return c.json({ error: 'Failed to get cache statistics' }, 500);
  }
});

// Clear all cache (use with caution!)
cacheRoutes.delete('/', requireAuth, requireSystemAdmin, async (c) => {
  try {
    const cleared = await clearAllCache();
    if (cleared) {
      log.info('All cache cleared by user', { userId: c.get('user').id });
      return c.json({
        success: true,
        message: 'All cache cleared successfully'
      });
    } else {
      return c.json({ error: 'Failed to clear cache (Redis may be unavailable)' }, 500);
    }
  } catch (error) {
    log.error('Failed to clear cache', error as Error);
    return c.json({ error: 'Failed to clear cache' }, 500);
  }
});

// Invalidate cache for a specific workspace
cacheRoutes.delete('/workspace/:workspaceId', requireAuth, async (c) => {
  const user = c.get('user');
  const workspaceId = c.req.param('workspaceId');

  // Validate workspaceId is a UUID
  try {
    z.string().uuid().parse(workspaceId);
  } catch {
    return c.json({ error: 'Invalid workspace ID format. Expected UUID.' }, 400);
  }

  try {
    const membership = await checkWorkspaceMembership(workspaceId, user.id, ['admin', 'owner']);
    if (!membership) {
      return c.json({ error: 'Access denied' }, 403);
    }

    await invalidateWorkspaceCache(workspaceId);
    log.info('Workspace cache invalidated', { userId: user.id, workspaceId });
    return c.json({
      success: true,
      message: `Cache invalidated for workspace ${workspaceId}`
    });
  } catch (error) {
    log.error('Failed to invalidate workspace cache', error as Error, { workspaceId });
    return c.json({ error: 'Failed to invalidate workspace cache' }, 500);
  }
});

// Invalidate cache for a specific user
cacheRoutes.delete('/user/:userId', requireAuth, async (c) => {
  const currentUser = c.get('user');
  const userId = c.req.param('userId');

  // Validate userId is a UUID
  try {
    z.string().uuid().parse(userId);
  } catch {
    return c.json({ error: 'Invalid user ID format. Expected UUID.' }, 400);
  }

  // Users can only invalidate their own cache (unless admin - you can add admin check here)
  if (currentUser.id !== userId) {
    return c.json({ error: 'You can only invalidate your own cache' }, 403);
  }

  try {
    await invalidateUserCache(userId);
    log.info('User cache invalidated', { userId, invalidatedBy: currentUser.id });
    return c.json({
      success: true,
      message: `Cache invalidated for user ${userId}`
    });
  } catch (error) {
    log.error('Failed to invalidate user cache', error as Error, { userId });
    return c.json({ error: 'Failed to invalidate user cache' }, 500);
  }
});

// Invalidate cache for a specific workspace membership
cacheRoutes.delete('/workspace-member/:workspaceId/:userId', requireAuth, async (c) => {
  const currentUser = c.get('user');
  const workspaceId = c.req.param('workspaceId');
  const userId = c.req.param('userId');

  // Validate IDs are UUIDs
  try {
    z.string().uuid().parse(workspaceId);
    z.string().uuid().parse(userId);
  } catch {
    return c.json({ error: 'Invalid ID format. Expected UUID.' }, 400);
  }

  // Users can only invalidate their own membership cache (unless admin)
  if (currentUser.id !== userId) {
    return c.json({ error: 'You can only invalidate your own membership cache' }, 403);
  }

  try {
    await invalidateWorkspaceMemberCache(userId, workspaceId);
    log.info('Workspace membership cache invalidated', {
      userId,
      workspaceId,
      invalidatedBy: currentUser.id
    });
    return c.json({
      success: true,
      message: `Cache invalidated for workspace membership`
    });
  } catch (error) {
    log.error('Failed to invalidate workspace membership cache', error as Error, {
      userId,
      workspaceId
    });
    return c.json({ error: 'Failed to invalidate workspace membership cache' }, 500);
  }
});

// Invalidate all workspace member caches for a user (useful when user is added/removed from multiple workspaces)
cacheRoutes.delete('/user/:userId/workspaces', requireAuth, async (c) => {
  const currentUser = c.get('user');
  const userId = c.req.param('userId');

  // Validate userId is a UUID
  try {
    z.string().uuid().parse(userId);
  } catch {
    return c.json({ error: 'Invalid user ID format. Expected UUID.' }, 400);
  }

  // Users can only invalidate their own cache
  if (currentUser.id !== userId) {
    return c.json({ error: 'You can only invalidate your own cache' }, 403);
  }

  try {
    // Delete all workspace member cache entries for this user
    const deleted = await cacheDelPattern(`ws_member:${userId}:*`);
    log.info('All workspace member caches invalidated for user', {
      userId,
      deletedCount: deleted,
      invalidatedBy: currentUser.id
    });
    return c.json({
      success: true,
      message: `Invalidated ${deleted} workspace membership cache entries for user`,
      deletedCount: deleted
    });
  } catch (error) {
    log.error('Failed to invalidate user workspace caches', error as Error, { userId });
    return c.json({ error: 'Failed to invalidate user workspace caches' }, 500);
  }
});

export default cacheRoutes;

