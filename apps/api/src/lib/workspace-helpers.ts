import { db } from '../db';
import { workspaceMembers } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';
import { cacheGet, cacheSet, cacheExists, CACHE_KEYS, CACHE_TTL } from './cache';
import { log } from './logger';

type WorkspaceMember = InferSelectModel<typeof workspaceMembers>;

/**
 * Check if a user is a member of a workspace
 * WITH CACHING for performance optimization
 * 
 * @param workspaceId - The workspace ID to check
 * @param userId - The user ID to check
 * @param requiredRoles - Optional array of required roles (e.g., ['owner', 'admin'])
 * @param skipCache - If true, skip cache and always query database (useful when we know user should have access)
 * @returns The membership record if user has access, null otherwise
 */
export async function checkWorkspaceMembership(
  workspaceId: string,
  userId: string,
  requiredRoles?: Array<'owner' | 'admin' | 'editor' | 'viewer'>,
  skipCache = false
): Promise<WorkspaceMember | null> {
  // Build cache key: ws_member:userId:workspaceId
  const cacheKey = `${CACHE_KEYS.WORKSPACE_MEMBER}${userId}:${workspaceId}`;

  // Try to get from cache first (unless skipCache is true)
  if (!skipCache) {
    const cached = await cacheGet<WorkspaceMember | null>(cacheKey);
    // Note: cacheGet returns null if key doesn't exist, so we need to check if key exists
    // If cached is not null, it means we have a cached value (could be null or a membership object)
    // If cached is null, it could mean either "no cache" or "cached null value"
    // We use cacheExists to distinguish
    const keyExists = await cacheExists(cacheKey);
    if (keyExists) {
      // Cache hit - return cached result
      if (!cached) {
        // Cached null means user is not a member
        return null;
      }

      // Check required roles if specified
      if (requiredRoles && !requiredRoles.includes(cached.role)) {
        return null;
      }

      return cached;
    }
  }

  // Cache miss or skipCache - query database
  const [membership] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    )
    .limit(1);

  // Cache the result (even if null, to avoid repeated DB queries for non-members)
  // Don't await - fire and forget to not block the request
  cacheSet(cacheKey, membership || null, CACHE_TTL.WORKSPACE_MEMBER).catch((err) => {
    log.error('Failed to cache workspace membership', err as Error, { userId, workspaceId });
  });

  if (!membership) {
    return null;
  }

  // If specific roles are required, check if user has one of them
  if (requiredRoles && !requiredRoles.includes(membership.role)) {
    return null;
  }

  return membership;
}

/**
 * Verify user has access to a workspace or throw error
 * @param workspaceId - The workspace ID to check
 * @param userId - The user ID to check
 * @param requiredRoles - Optional array of required roles
 * @throws Error if user doesn't have access
 * @returns The membership record
 */
export async function requireWorkspaceMembership(
  workspaceId: string,
  userId: string,
  requiredRoles?: Array<'owner' | 'admin' | 'editor' | 'viewer'>
) {
  const membership = await checkWorkspaceMembership(workspaceId, userId, requiredRoles);

  if (!membership) {
    throw new Error('Access denied: User is not a member of this workspace');
  }

  return membership;
}
