import { redisClient, isRedisAvailable } from './redis';
import { log } from './logger';

/**
 * Cache Helper Functions
 * 
 * Provides a simple interface for caching with Redis
 * Falls back gracefully if Redis is unavailable
 */

// Cache key prefixes for organization
export const CACHE_KEYS = {
  SESSION: 'session:',
  USER: 'user:',
  WORKSPACE_MEMBER: 'ws_member:',
  WORKSPACE_MEMBERS: 'ws_members:',
  WORKSPACE: 'workspace:',
  DOCUMENT: 'document:',
  DOCUMENTS_LIST: 'documents_list:',
  PROJECT: 'project:',
  PROJECTS_LIST: 'projects_list:',
  TASK: 'task:',
  TASKS_LIST: 'tasks_list:',
  TEAM: 'team:',
  TEAMS_LIST: 'teams_list:',
  WIKI_PAGE: 'wiki_page:',
  WIKI_PAGES_LIST: 'wiki_pages_list:',
  WIKI_PAGE_BY_SLUG: 'wiki_page_slug:',
  WIKI_BACKLINKS: 'wiki_backlinks:',
  RATE_LIMIT: 'rate_limit:',
  SEARCH_RESULTS: 'search:',
} as const;

// Cache TTL (Time To Live) in seconds
export const CACHE_TTL = {
  SESSION: 60 * 60 * 24, // 24 hours
  USER: 60 * 15, // 15 minutes
  WORKSPACE_MEMBER: 60 * 30, // 30 minutes
  WORKSPACE_MEMBERS: 60 * 10, // 10 minutes
  WORKSPACE: 60 * 30, // 30 minutes
  DOCUMENT: 60 * 5, // 5 minutes
  DOCUMENTS_LIST: 60 * 5, // 5 minutes
  PROJECT: 60 * 10, // 10 minutes
  PROJECTS_LIST: 60 * 5, // 5 minutes
  TASKS_LIST: 60 * 5, // 5 minutes
  TEAM: 60 * 10, // 10 minutes
  TEAMS_LIST: 60 * 5, // 5 minutes
  WIKI_PAGE: 60 * 10, // 10 minutes
  WIKI_PAGES_LIST: 60 * 5, // 5 minutes
  WIKI_BACKLINKS: 60 * 10, // 10 minutes
  SEARCH_RESULTS: 60 * 2, // 2 minutes (shorter TTL for search freshness)
  SHORT: 60, // 1 minute
  MEDIUM: 60 * 5, // 5 minutes
  LONG: 60 * 60, // 1 hour
} as const;

/**
 * Get data from cache
 * @param key - Cache key
 * @returns Parsed data or null if not found
 */
export async function cacheGet<T = unknown>(key: string): Promise<T | null> {
  if (!isRedisAvailable()) {
    return null;
  }

  try {
    const data = await redisClient.get(key);
    if (!data) {
      return null;
    }
    return JSON.parse(data) as T;
  } catch (error) {
    log.error(`Cache get error for key "${key}"`, error as Error);
    return null;
  }
}

/**
 * Set data in cache with TTL
 * @param key - Cache key
 * @param value - Data to cache
 * @param ttl - Time to live in seconds (optional)
 */
export async function cacheSet(
  key: string,
  value: unknown,
  ttl?: number
): Promise<boolean> {
  if (!isRedisAvailable()) {
    return false;
  }

  try {
    const serialized = JSON.stringify(value);
    if (ttl) {
      await redisClient.setEx(key, ttl, serialized);
    } else {
      await redisClient.set(key, serialized);
    }
    return true;
  } catch (error) {
    log.error(`Cache set error for key "${key}"`, error as Error);
    return false;
  }
}

/**
 * Delete data from cache
 * @param key - Cache key or pattern
 */
export async function cacheDel(key: string): Promise<boolean> {
  if (!isRedisAvailable()) {
    return false;
  }

  try {
    await redisClient.del(key);
    return true;
  } catch (error) {
    log.error(`Cache delete error for key "${key}"`, error as Error);
    return false;
  }
}

/**
 * Delete multiple keys matching a pattern
 * @param pattern - Pattern to match (e.g., "ws_member:user123:*")
 */
export async function cacheDelPattern(pattern: string): Promise<number> {
  if (!isRedisAvailable()) {
    return 0;
  }

  try {
    // Scan for keys matching pattern
    const keys: string[] = [];
    let cursor = 0;

    do {
      const result = await redisClient.scan(cursor, {
        MATCH: pattern,
        COUNT: 100,
      });
      cursor = result.cursor;
      keys.push(...result.keys);
    } while (cursor !== 0);

    // Delete all found keys
    if (keys.length > 0) {
      await redisClient.del(keys);
    }

    return keys.length;
  } catch (error) {
    log.error(`Cache delete pattern error for "${pattern}"`, error as Error);
    return 0;
  }
}

/**
 * Check if a key exists in cache
 * @param key - Cache key
 */
export async function cacheExists(key: string): Promise<boolean> {
  if (!isRedisAvailable()) {
    return false;
  }

  try {
    const exists = await redisClient.exists(key);
    return exists === 1;
  } catch (error) {
    log.error(`Cache exists error for key "${key}"`, error as Error);
    return false;
  }
}

/**
 * Get or set pattern - fetch from cache or compute and cache
 * Includes cache stampede protection using Redis mutex
 * @param key - Cache key
 * @param fetcher - Function to fetch data if not in cache
 * @param ttl - Time to live in seconds
 */
export async function cacheGetOrSet<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl?: number
): Promise<T> {
  // Try to get from cache first
  const cached = await cacheGet<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Cache stampede protection: use Redis mutex to prevent multiple simultaneous fetches
  const lockKey = `${key}:lock`;
  const LOCK_TTL = 5; // Lock expires after 5 seconds to prevent deadlocks
  const RETRY_DELAY = 50; // Wait 50ms before retrying
  const MAX_RETRIES = 10; // Maximum number of retries (500ms total wait time)

  // Try to acquire lock
  let lockAcquired = false;
  if (isRedisAvailable()) {
    try {
      // Use SET with NX (only set if not exists) and EX (expire) to create a mutex
      const result = await redisClient.set(lockKey, '1', {
        NX: true,
        EX: LOCK_TTL,
      });
      lockAcquired = result === 'OK';
    } catch (error) {
      // If Redis fails, log and continue without lock (fail open)
      log.error(`Failed to acquire cache lock for "${key}"`, error as Error, { key, lockKey });
      lockAcquired = false;
    }
  }

  if (!lockAcquired) {
    // Another request is fetching, wait and retry
    let retries = 0;
    while (retries < MAX_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      
      // Check cache again (another request might have populated it)
      const retryCached = await cacheGet<T>(key);
      if (retryCached !== null) {
        return retryCached;
      }
      
      retries++;
    }
    
    // If still not cached after retries, fetch anyway (fallback)
    log.warn(`Cache lock timeout for "${key}", fetching anyway`);
  }

  try {
    // Fetch data (only one request should reach here if lock worked)
    const data = await fetcher();

    // Cache the result
    await cacheSet(key, data, ttl);

    return data;
  } catch (error) {
    // If fetch fails, log and rethrow
    log.error(`Failed to fetch data for cache key "${key}"`, error as Error);
    throw error;
  } finally {
    // Release lock if we acquired it
    if (lockAcquired && isRedisAvailable()) {
      try {
        await redisClient.del(lockKey);
      } catch (error) {
        // Ignore lock release errors (lock will expire anyway)
        log.debug(`Failed to release cache lock for "${key}"`, { key, lockKey, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
}

/**
 * Increment a counter in cache (useful for rate limiting)
 * @param key - Cache key
 * @param ttl - Time to live in seconds (only set on first increment)
 */
export async function cacheIncr(key: string, ttl?: number): Promise<number> {
  if (!isRedisAvailable()) {
    return 0;
  }

  try {
    const value = await redisClient.incr(key);
    
    // Set TTL on first increment
    if (value === 1 && ttl) {
      await redisClient.expire(key, ttl);
    }

    return value;
  } catch (error) {
    log.error(`Cache increment error for key "${key}"`, error as Error);
    return 0;
  }
}

/**
 * Get TTL (time to live) for a key
 * @param key - Cache key
 * @returns TTL in seconds, -1 if no expiry, -2 if key doesn't exist
 */
export async function cacheTTL(key: string): Promise<number> {
  if (!isRedisAvailable()) {
    return -2;
  }

  try {
    return await redisClient.ttl(key);
  } catch (error) {
    log.error(`Cache TTL error for key "${key}"`, error as Error);
    return -2;
  }
}

/**
 * Invalidate all cache entries for a user
 * Useful when user data changes
 */
export async function invalidateUserCache(userId: string): Promise<void> {
  await Promise.all([
    cacheDel(`${CACHE_KEYS.USER}${userId}`),
    cacheDelPattern(`${CACHE_KEYS.WORKSPACE_MEMBER}${userId}:*`),
  ]);
}

/**
 * Invalidate all cache entries for a workspace
 * Useful when workspace data or memberships change
 */
export async function invalidateWorkspaceCache(
  workspaceId: string
): Promise<void> {
  await Promise.all([
    cacheDel(`${CACHE_KEYS.WORKSPACE}${workspaceId}`),
    cacheDel(`${CACHE_KEYS.WORKSPACE_MEMBERS}${workspaceId}`),
    cacheDelPattern(`${CACHE_KEYS.WORKSPACE_MEMBER}*:${workspaceId}`),
  ]);
}

/**
 * Invalidate cache for a specific workspace membership
 * @param userId - User ID
 * @param workspaceId - Workspace ID
 * @param preload - If true, preload the cache in background after invalidation
 * @param preloadFn - Optional function to call for preloading (to avoid circular dependencies)
 */
export async function invalidateWorkspaceMemberCache(
  userId: string,
  workspaceId: string,
  preload = false,
  preloadFn?: (workspaceId: string, userId: string) => Promise<unknown>
): Promise<void> {
  await cacheDel(
    `${CACHE_KEYS.WORKSPACE_MEMBER}${userId}:${workspaceId}`
  );

  // Preload cache in background if requested
  if (preload && preloadFn) {
    setImmediate(async () => {
      try {
        await preloadFn(workspaceId, userId);
        log.debug('Preloaded workspace membership cache', { userId, workspaceId });
      } catch (error) {
        // Ignore preload errors (non-critical)
        log.debug('Failed to preload workspace membership cache', { 
          userId, 
          workspaceId, 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    });
  }
}

/**
 * Clear all cache (use with caution!)
 */
export async function clearAllCache(): Promise<boolean> {
  if (!isRedisAvailable()) {
    return false;
  }

  try {
    await redisClient.flushDb();
    log.info('All cache cleared');
    return true;
  } catch (error) {
    log.error('Error clearing cache', error as Error);
    return false;
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  dbSize: number;
  memory: string;
  hitRate: number | null;
}> {
  if (!isRedisAvailable()) {
    return {
      dbSize: 0,
      memory: '0 KB',
      hitRate: null,
    };
  }

  try {
    const info = await redisClient.info('stats');
    const dbSize = await redisClient.dbSize();

    // Parse memory usage
    const memoryMatch = info.match(/used_memory_human:(.+)/);
    const memory = memoryMatch && memoryMatch[1] ? memoryMatch[1].trim() : 'unknown';

    // Parse hit rate
    const hitsMatch = info.match(/keyspace_hits:(\d+)/);
    const missesMatch = info.match(/keyspace_misses:(\d+)/);
    let hitRate = null;

    if (hitsMatch && missesMatch && hitsMatch[1] && missesMatch[1]) {
      const hits = parseInt(hitsMatch[1], 10);
      const misses = parseInt(missesMatch[1], 10);
      const total = hits + misses;
      if (total > 0) {
        hitRate = (hits / total) * 100;
      }
    }

    return {
      dbSize,
      memory,
      hitRate,
    };
  } catch (error) {
    log.error('Error getting cache stats', error as Error);
    return {
      dbSize: 0,
      memory: 'error',
      hitRate: null,
    };
  }
}

