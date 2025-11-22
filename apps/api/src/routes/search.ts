import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import {
  searchAll,
  searchIndex,
  syncAllToSearch,
  getSearchStats
} from '../services/search';
import { log } from '../lib/logger';
import type { Document, Task, Workspace } from '../types';
import { searchRateLimiter } from '../middleware/rate-limiter';
import { cacheGetOrSet, CACHE_KEYS, CACHE_TTL } from '../lib/cache';
import { createHash } from 'crypto';
import { requireSystemAdmin } from '../middleware/system-admin';

const searchRoutes = new Hono();

// Global search across all indexes
searchRoutes.get('/', requireAuth, searchRateLimiter, async (c) => {
  const query = c.req.query('q') || '';
  const workspaceId = c.req.query('workspace');
  const limit = parseInt(c.req.query('limit') || '20');

  if (!query || query.length < 2) {
    return c.json({
      results: [],
      query,
      message: 'Query must be at least 2 characters'
    });
  }

  // Create cache key from query hash and parameters
  const queryHash = createHash('md5').update(`${query}:${workspaceId || ''}:${limit}`).digest('hex');
  const cacheKey = `${CACHE_KEYS.SEARCH_RESULTS}${queryHash}`;

  // Get results with cache
  const results = await cacheGetOrSet(
    cacheKey,
    async () => {
      return await searchAll(query, workspaceId || undefined, limit);
    },
    CACHE_TTL.SEARCH_RESULTS
  );

  // Format results for frontend
  const formattedResults = [
    ...(results.documents || []).map((doc: unknown) => {
      const docData = doc as Document & { _score?: number };
      return {
        id: docData.id,
        title: docData.title,
        resultType: 'document',
        icon: docData.icon || null,
        workspace: docData.workspaceId,
        score: docData._score
      };
    }),
    ...(results.tasks || []).map((task: unknown) => {
      const taskData = task as Task & { _score?: number };
      return {
        id: taskData.id,
        title: taskData.title,
        resultType: 'task',
        description: taskData.description,
        status: taskData.status,
        priority: taskData.priority,
        workspace: taskData.workspaceId,
        score: taskData._score
      };
    }),
    ...(results.workspaces || []).map((ws: unknown) => {
      const workspace = ws as Workspace & { _score?: number };
      return {
        id: workspace.id,
        title: workspace.name,
        resultType: 'workspace',
        description: workspace.description,
        slug: workspace.slug,
        score: workspace._score
      };
    })
  ];

  // Sort by relevance score
  formattedResults.sort((a, b) => (b.score || 0) - (a.score || 0));

  return c.json({
    results: formattedResults.slice(0, limit),
    query,
    processingTimeMs: results.processingTimeMs,
    total: formattedResults.length
  });
});

// Search specific index
searchRoutes.get('/:index', requireAuth, searchRateLimiter, async (c) => {
  const index = c.req.param('index');
  const query = c.req.query('q') || '';
  const workspaceId = c.req.query('workspace');
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = parseInt(c.req.query('offset') || '0');
  const sort = c.req.query('sort');
  const filter = c.req.query('filter');

  if (!['documents', 'tasks', 'workspaces'].includes(index)) {
    return c.json({ error: 'Invalid index' }, 400);
  }

  const options: Record<string, unknown> = {
    limit,
    offset
  };

  // Add filters
  if (workspaceId) {
    options.filter = `workspaceId = "${workspaceId}"`;
  }

  if (filter) {
    options.filter = options.filter ? `${options.filter} AND ${filter}` : filter;
  }

  // Add sorting
  if (sort) {
    options.sort = [sort];
  }

  const results = await searchIndex(index, query, options);

  return c.json({
    results: results.hits,
    query,
    total: 'estimatedTotalHits' in results ? results.estimatedTotalHits : results.hits.length,
    processingTimeMs: results.processingTimeMs,
    limit,
    offset
  });
});

// Get search suggestions (autocomplete)
searchRoutes.get('/suggest/:index', requireAuth, searchRateLimiter, async (c) => {
  const index = c.req.param('index');
  const query = c.req.query('q') || '';
  const workspaceId = c.req.query('workspace');

  if (!['documents', 'tasks', 'workspaces'].includes(index)) {
    return c.json({ error: 'Invalid index' }, 400);
  }

  const options: Record<string, unknown> = {
    limit: 5,
    attributesToRetrieve: ['id', 'title'],
    attributesToHighlight: ['title']
  };

  if (workspaceId) {
    options.filter = `workspaceId = "${workspaceId}"`;
  }

  const results = await searchIndex(index, query, options);

  return c.json({
    suggestions: results.hits.map((hit: unknown) => {
      const hitData = hit as { id: string; title: string; _formatted?: { title: string } };
      return {
        id: hitData.id,
        title: hitData.title,
        highlight: hitData._formatted?.title || hitData.title
      };
    })
  });
});

// Admin: Sync all data to search indexes
searchRoutes.post('/admin/sync', requireAuth, requireSystemAdmin, async (c) => {
  try {
    await syncAllToSearch();
    return c.json({
      success: true,
      message: 'Search indexes synced successfully'
    });
  } catch (error) {
    log.error('Sync error', error as Error);
    return c.json({
      error: 'Failed to sync search indexes'
    }, 500);
  }
});

// Get search statistics
searchRoutes.get('/admin/stats', requireAuth, requireSystemAdmin, async (c) => {
  const stats = await getSearchStats();

  if (!stats) {
    return c.json({ error: 'Failed to get search stats' }, 500);
  }

  return c.json(stats);
});

export default searchRoutes;