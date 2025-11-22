import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db';
import { wikiPages, wikiPageLinks, projects, wikiPageComments, users, wikiPageVersions, wikiPageViews } from '../db/schema';
import { eq, and, ne, asc, desc, sql, count, gte } from 'drizzle-orm';
const createWikiCommentSchema = z.object({
  content: z.string().min(1).max(2000)
});

const updateWikiCommentSchema = z.object({
  content: z.string().min(1).max(2000).optional(),
  isResolved: z.boolean().optional()
});

type WikiCommentResponse = {
  id: string;
  pageId: string;
  content: string;
  isResolved: boolean;
  createdAt: Date;
  updatedAt: Date;
  author: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
};

function mapWikiComment(row: typeof wikiPageComments.$inferSelect & { authorName: string | null; authorAvatar: string | null }): WikiCommentResponse {
  return {
    id: row.id,
    pageId: row.pageId,
    content: row.content,
    isResolved: row.isResolved ?? false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    author: {
      id: row.createdBy,
      name: row.authorName || 'Unknown',
      avatarUrl: row.authorAvatar
    }
  };
}

async function getWikiPageOrThrow(pageId: string) {
  const [page] = await db
    .select({
      id: wikiPages.id,
      workspaceId: wikiPages.workspaceId
    })
    .from(wikiPages)
    .where(eq(wikiPages.id, pageId))
    .limit(1);

  if (!page) {
    throw new Error('PAGE_NOT_FOUND');
  }

  return page;
}

import { requireAuth } from '../middleware/auth';
import { checkWorkspaceMembership } from '../lib/workspace-helpers';
import { log } from '../lib/logger';
import { createRateLimiter, updateRateLimiter, deleteRateLimiter } from '../middleware/rate-limiter';
import type { User } from '../types';
import { tipTapContentSchema } from '../types/content';
import { cacheGet, cacheSet, cacheDel, cacheDelPattern, CACHE_KEYS, CACHE_TTL } from '../lib/cache';
import { indexWikiPage, updateWikiPageIndex, deleteFromIndex } from '../services/search';

const wikiRoutes = new Hono();

// Helper function to generate slug from title
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Create wiki page schema
const createWikiPageSchema = z.object({
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  parentId: z.string().uuid().optional(),
  title: z.string().min(1).max(255),
  slug: z.string().max(255).optional(),
  content: tipTapContentSchema.nullable().optional(), // Allow null for folders
  excerpt: z.string().max(500).optional(),
  icon: z.string().max(50).optional(),
  coverUrl: z.string().url().optional(),
  isPublished: z.boolean().optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
});

// Update wiki page schema
const updateWikiPageSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  slug: z.string().max(255).optional(),
  content: tipTapContentSchema.nullable().optional(), // Allow null for folders
  excerpt: z.string().max(500).optional(),
  icon: z.string().max(50).optional(),
  coverUrl: z.string().url().optional(),
  isPublished: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  parentId: z.string().uuid().nullable().optional(),
  order: z.number().optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
});

// Get all wiki pages in a workspace (tree structure)
wikiRoutes.get('/workspace/:workspaceId', requireAuth, async (c) => {
  const user = c.get('user') as User;
  const workspaceId = c.req.param('workspaceId');
  const projectId = c.req.query('projectId');
  const archived = c.req.query('archived') === 'true';
  const tags = c.req.query('tags')?.split(',').filter(Boolean);

  try {
    z.string().uuid().parse(workspaceId);
  } catch {
    return c.json({ error: 'Invalid workspace ID format' }, 400);
  }

  const membership = await checkWorkspaceMembership(workspaceId, user.id);
  if (!membership) {
    return c.json({ error: 'Access denied' }, 403);
  }

  try {
    const cacheKey = `${CACHE_KEYS.WIKI_PAGES_LIST}${workspaceId}:${projectId || 'all'}:${archived}:${tags?.join(',') || 'notags'}`;
    
    const cached = await cacheGet<typeof wikiPages.$inferSelect[]>(cacheKey);
    if (cached) {
      return c.json({ pages: cached });
    }

    const conditions = [eq(wikiPages.workspaceId, workspaceId)];

    if (projectId) {
      try {
        z.string().uuid().parse(projectId);
        conditions.push(eq(wikiPages.projectId, projectId));
      } catch {
        return c.json({ error: 'Invalid project ID format' }, 400);
      }
    }
    // If no projectId is provided, show all pages in the workspace (with or without project)

    if (archived) {
      conditions.push(eq(wikiPages.isArchived, true));
    } else {
      conditions.push(eq(wikiPages.isArchived, false));
    }

    const allPages = await db
      .select()
      .from(wikiPages)
      .where(and(...conditions))
      .orderBy(asc(wikiPages.order), asc(wikiPages.title));

    await cacheSet(cacheKey, allPages, CACHE_TTL.WIKI_PAGES_LIST);

    return c.json({ pages: allPages });
  } catch (error) {
    log.error('Failed to fetch wiki pages', error as Error, { workspaceId, userId: user.id });
    return c.json({ error: 'Failed to fetch wiki pages' }, 500);
  }
});

// Get a single wiki page by ID
wikiRoutes.get('/:id', requireAuth, async (c) => {
  const user = c.get('user') as User;
  const pageId = c.req.param('id');

  try {
    z.string().uuid().parse(pageId);
  } catch {
    return c.json({ error: 'Invalid page ID format' }, 400);
  }

  try {
    const cacheKey = `${CACHE_KEYS.WIKI_PAGE}${pageId}`;
    const cached = await cacheGet<{
      page: typeof wikiPages.$inferSelect;
      linkedPages: typeof wikiPageLinks.$inferSelect[];
      breadcrumbs: Array<{ id: string; title: string; slug: string }>;
      metadata: {
        totalViews: number;
        uniqueViewers: number;
        lastViewed: string | null;
        versionCount: number;
      };
    }>(cacheKey);
    
    if (cached) {
      const membership = await checkWorkspaceMembership(cached.page.workspaceId, user.id);
      if (!membership) {
        return c.json({ error: 'Access denied' }, 403);
      }
      return c.json(cached);
    }

    const [page] = await db
      .select()
      .from(wikiPages)
      .where(eq(wikiPages.id, pageId))
      .limit(1);

    if (!page) {
      return c.json({ error: 'Wiki page not found' }, 404);
    }

    const membership = await checkWorkspaceMembership(page.workspaceId, user.id);
    if (!membership) {
      return c.json({ error: 'Access denied' }, 403);
    }

    // Get linked pages
    const linkedPages = await db
      .select()
      .from(wikiPageLinks)
      .where(eq(wikiPageLinks.fromPageId, pageId));

    // Build breadcrumb trail
    const breadcrumbs: Array<{ id: string; title: string; slug: string }> = [];
    let currentPageId: string | null = page.parentId;
    
    while (currentPageId) {
      const [parentPage] = await db
        .select({ id: wikiPages.id, title: wikiPages.title, slug: wikiPages.slug, parentId: wikiPages.parentId })
        .from(wikiPages)
        .where(eq(wikiPages.id, currentPageId))
        .limit(1);
      
      if (!parentPage) break;
      
      breadcrumbs.unshift({ id: parentPage.id, title: parentPage.title, slug: parentPage.slug });
      currentPageId = parentPage.parentId;
    }

    // Get metadata
    const [viewStats] = await db
      .select({ 
        totalViews: count(),
        uniqueViewers: sql<number>`COUNT(DISTINCT ${wikiPageViews.userId})`
      })
      .from(wikiPageViews)
      .where(eq(wikiPageViews.pageId, pageId));

    const [lastView] = await db
      .select({ viewedAt: wikiPageViews.viewedAt })
      .from(wikiPageViews)
      .where(eq(wikiPageViews.pageId, pageId))
      .orderBy(desc(wikiPageViews.viewedAt))
      .limit(1);

    const [versionCount] = await db
      .select({ count: count() })
      .from(wikiPageVersions)
      .where(eq(wikiPageVersions.pageId, pageId));

    const metadata = {
      totalViews: viewStats?.totalViews || 0,
      uniqueViewers: viewStats?.uniqueViewers || 0,
      lastViewed: lastView?.viewedAt?.toISOString() || null,
      versionCount: versionCount?.count || 0
    };

    const result = { page, linkedPages, breadcrumbs, metadata };
    await cacheSet(cacheKey, result, CACHE_TTL.WIKI_PAGE);

    return c.json(result);
  } catch (error) {
    log.error('Failed to fetch wiki page', error as Error, { pageId, userId: user.id });
    return c.json({ error: 'Failed to fetch wiki page' }, 500);
  }
});

// Get wiki page by slug
wikiRoutes.get('/workspace/:workspaceId/slug/:slug', requireAuth, async (c) => {
  const user = c.get('user') as User;
  const workspaceId = c.req.param('workspaceId');
  const slug = c.req.param('slug');

  try {
    z.string().uuid().parse(workspaceId);
  } catch {
    return c.json({ error: 'Invalid workspace ID format' }, 400);
  }

  const membership = await checkWorkspaceMembership(workspaceId, user.id);
  if (!membership) {
    return c.json({ error: 'Access denied' }, 403);
  }

  try {
    const cacheKey = `${CACHE_KEYS.WIKI_PAGE_BY_SLUG}${workspaceId}:${slug}`;
    const cached = await cacheGet<typeof wikiPages.$inferSelect>(cacheKey);
    
    if (cached) {
      return c.json({ page: cached });
    }

    const [page] = await db
      .select()
      .from(wikiPages)
      .where(and(
        eq(wikiPages.workspaceId, workspaceId),
        eq(wikiPages.slug, slug),
        eq(wikiPages.isArchived, false)
      ))
      .limit(1);

    if (!page) {
      return c.json({ error: 'Wiki page not found' }, 404);
    }

    await cacheSet(cacheKey, page, CACHE_TTL.WIKI_PAGE);

    return c.json({ page });
  } catch (error) {
    log.error('Failed to fetch wiki page by slug', error as Error, { workspaceId, slug, userId: user.id });
    return c.json({ error: 'Failed to fetch wiki page' }, 500);
  }
});

// Create a new wiki page
wikiRoutes.post('/', requireAuth, createRateLimiter, zValidator('json', createWikiPageSchema), async (c) => {
  const user = c.get('user') as User;
  const data = c.req.valid('json');

  const membership = await checkWorkspaceMembership(data.workspaceId, user.id, ['editor', 'admin', 'owner']);
  if (!membership) {
    return c.json({ error: 'Access denied' }, 403);
  }

  // Validate projectId if provided
  if (data.projectId) {
    const [project] = await db
      .select({ id: projects.id, workspaceId: projects.workspaceId })
      .from(projects)
      .where(eq(projects.id, data.projectId))
      .limit(1);

    if (!project || project.workspaceId !== data.workspaceId) {
      return c.json({ error: 'Project not found or does not belong to workspace' }, 400);
    }
  }

  // Validate parentId if provided
  if (data.parentId) {
    const [parent] = await db
      .select({ id: wikiPages.id, workspaceId: wikiPages.workspaceId })
      .from(wikiPages)
      .where(eq(wikiPages.id, data.parentId))
      .limit(1);

    if (!parent || parent.workspaceId !== data.workspaceId) {
      return c.json({ error: 'Parent page not found or does not belong to workspace' }, 400);
    }
  }

  // Generate slug if not provided, ensuring uniqueness
  let slug = data.slug || generateSlug(data.title);
  const baseSlug = slug;
  let counter = 1;

  // Check if slug already exists and generate a unique one
  while (true) {
    const [existing] = await db
      .select({ id: wikiPages.id })
      .from(wikiPages)
      .where(and(
        eq(wikiPages.workspaceId, data.workspaceId),
        eq(wikiPages.slug, slug)
      ))
      .limit(1);

    if (!existing) {
      break; // Slug is unique
    }

    // Generate a new slug with a counter suffix
    slug = `${baseSlug}-${counter}`;
    counter++;

    // Prevent infinite loop (max 1000 attempts)
    if (counter > 1000) {
      return c.json({ error: 'Unable to generate a unique slug. Please specify a custom slug.' }, 400);
    }
  }

  try {
    const result = await db
      .insert(wikiPages)
      .values({
        workspaceId: data.workspaceId,
        projectId: data.projectId || null,
        parentId: data.parentId || null,
        title: data.title,
        slug,
        content: data.content || { type: 'doc', content: [] },
        excerpt: data.excerpt || null,
        icon: data.icon || null,
        coverUrl: data.coverUrl || null,
        isPublished: data.isPublished !== false,
        createdBy: user.id,
        lastEditedBy: user.id,
      })
      .returning();

    const page = result[0];
    if (!page) {
      return c.json({ error: 'Failed to create wiki page' }, 500);
    }

    // Invalidate cache (non-blocking)
    cacheDelPattern(`${CACHE_KEYS.WIKI_PAGES_LIST}${data.workspaceId}:*`).catch(err => {
      log.error('Failed to invalidate cache', err as Error, { pageId: page.id });
    });

    // Index in search (non-blocking)
    indexWikiPage(page).catch(err => {
      log.error('Failed to index page', err as Error, { pageId: page.id });
    });

    log.info('Wiki page created', { pageId: page.id, workspaceId: data.workspaceId, userId: user.id });
    return c.json({ page }, 201);
  } catch (error) {
    log.error('Failed to create wiki page', error as Error, { body: data, userId: user.id });
    return c.json({ error: 'Failed to create wiki page' }, 500);
  }
});

// Update a wiki page
wikiRoutes.patch('/:id', requireAuth, updateRateLimiter, zValidator('json', updateWikiPageSchema), async (c) => {
  const user = c.get('user') as User;
  const pageId = c.req.param('id');
  const data = c.req.valid('json');

  try {
    z.string().uuid().parse(pageId);
  } catch {
    return c.json({ error: 'Invalid page ID format' }, 400);
  }

  try {
    const [page] = await db
      .select({ id: wikiPages.id, workspaceId: wikiPages.workspaceId })
      .from(wikiPages)
      .where(eq(wikiPages.id, pageId))
      .limit(1);

    if (!page) {
      return c.json({ error: 'Wiki page not found' }, 404);
    }

    const membership = await checkWorkspaceMembership(page.workspaceId, user.id, ['editor', 'admin', 'owner']);
    if (!membership) {
      return c.json({ error: 'Access denied' }, 403);
    }

    // Validate parentId if provided
    if (data.parentId !== undefined) {
      if (data.parentId) {
        const [parent] = await db
          .select({ id: wikiPages.id, workspaceId: wikiPages.workspaceId })
          .from(wikiPages)
          .where(eq(wikiPages.id, data.parentId))
          .limit(1);

        if (!parent || parent.workspaceId !== page.workspaceId) {
          return c.json({ error: 'Parent page not found or does not belong to workspace' }, 400);
        }

        // Prevent circular reference
        if (data.parentId === pageId) {
          return c.json({ error: 'Page cannot be its own parent' }, 400);
        }
      }
    }

    // Check slug uniqueness if slug is being updated
    if (data.slug) {
      const [existing] = await db
        .select({ id: wikiPages.id })
        .from(wikiPages)
        .where(and(
          eq(wikiPages.workspaceId, page.workspaceId),
          eq(wikiPages.slug, data.slug),
          ne(wikiPages.id, pageId)
        ))
        .limit(1);

      if (existing) {
        return c.json({ error: 'A page with this slug already exists' }, 400);
      }
    }

    // Get current page data for versioning
    const [currentPage] = await db
      .select()
      .from(wikiPages)
      .where(eq(wikiPages.id, pageId))
      .limit(1);

    if (!currentPage) {
      return c.json({ error: 'Wiki page not found' }, 404);
    }

    // Get next version number
    const [lastVersion] = await db
      .select({ versionNumber: wikiPageVersions.versionNumber })
      .from(wikiPageVersions)
      .where(eq(wikiPageVersions.pageId, pageId))
      .orderBy(desc(wikiPageVersions.versionNumber))
      .limit(1);

    const nextVersionNumber = (lastVersion?.versionNumber || 0) + 1;

    // Create version snapshot before update
    await db.insert(wikiPageVersions).values({
      pageId,
      title: currentPage.title,
      content: currentPage.content,
      excerpt: currentPage.excerpt,
      versionNumber: nextVersionNumber,
      createdBy: user.id
    });

    const updateData: Partial<typeof wikiPages.$inferInsert> & { updatedAt: Date } = {
      ...data,
      lastEditedBy: user.id,
      updatedAt: new Date(),
    };

    const [updatedPage] = await db
      .update(wikiPages)
      .set(updateData)
      .where(eq(wikiPages.id, pageId))
      .returning();

    // Invalidate cache (non-blocking)
    cacheDel(`${CACHE_KEYS.WIKI_PAGE}${pageId}`).catch(err => {
      log.error('Failed to invalidate cache', err as Error, { pageId });
    });
    cacheDelPattern(`${CACHE_KEYS.WIKI_PAGES_LIST}${page.workspaceId}:*`).catch(err => {
      log.error('Failed to invalidate cache', err as Error, { pageId });
    });
    if (data.slug) {
      cacheDelPattern(`${CACHE_KEYS.WIKI_PAGE_BY_SLUG}${page.workspaceId}:*`).catch(err => {
        log.error('Failed to invalidate cache', err as Error, { pageId });
      });
    }

    // Update search index (non-blocking)
    updateWikiPageIndex(pageId, data).catch(err => {
      log.error('Failed to update search index', err as Error, { pageId });
    });

    log.info('Wiki page updated', { pageId, version: nextVersionNumber, userId: user.id });
    return c.json({ page: updatedPage });
  } catch (error) {
    log.error('Failed to update wiki page', error as Error, { pageId, body: data, userId: user.id });
    return c.json({ error: 'Failed to update wiki page' }, 500);
  }
});

// Delete a wiki page
wikiRoutes.delete('/:id', requireAuth, deleteRateLimiter, async (c) => {
  const user = c.get('user') as User;
  const pageId = c.req.param('id');

  try {
    z.string().uuid().parse(pageId);
  } catch {
    return c.json({ error: 'Invalid page ID format' }, 400);
  }

  try {
    const [page] = await db
      .select({ id: wikiPages.id, workspaceId: wikiPages.workspaceId })
      .from(wikiPages)
      .where(eq(wikiPages.id, pageId))
      .limit(1);

    if (!page) {
      return c.json({ error: 'Wiki page not found' }, 404);
    }

    const membership = await checkWorkspaceMembership(page.workspaceId, user.id, ['editor', 'admin', 'owner']);
    if (!membership) {
      return c.json({ error: 'Access denied' }, 403);
    }

    await db.delete(wikiPages).where(eq(wikiPages.id, pageId));

    // Invalidate cache (non-blocking)
    cacheDel(`${CACHE_KEYS.WIKI_PAGE}${pageId}`).catch(err => {
      log.error('Failed to invalidate cache', err as Error, { pageId });
    });
    cacheDelPattern(`${CACHE_KEYS.WIKI_PAGES_LIST}${page.workspaceId}:*`).catch(err => {
      log.error('Failed to invalidate cache', err as Error, { pageId });
    });
    cacheDelPattern(`${CACHE_KEYS.WIKI_PAGE_BY_SLUG}${page.workspaceId}:*`).catch(err => {
      log.error('Failed to invalidate cache', err as Error, { pageId });
    });

    // Remove from search index (non-blocking)
    deleteFromIndex('wiki_pages', pageId).catch(err => {
      log.error('Failed to delete from search index', err as Error, { pageId });
    });

    log.info('Wiki page deleted', { pageId, userId: user.id });
    return c.json({ success: true });
  } catch (error) {
    log.error('Failed to delete wiki page', error as Error, { pageId, userId: user.id });
    return c.json({ error: 'Failed to delete wiki page' }, 500);
  }
});

// Get comments for a wiki page
wikiRoutes.get('/comments/:pageId', requireAuth, async (c) => {
  const user = c.get('user') as User;
  const pageId = c.req.param('pageId');

  try {
    z.string().uuid().parse(pageId);
  } catch {
    return c.json({ error: 'Invalid page ID format' }, 400);
  }

  try {
    const page = await getWikiPageOrThrow(pageId);
    const membership = await checkWorkspaceMembership(page.workspaceId, user.id);
    if (!membership) {
      return c.json({ error: 'Access denied' }, 403);
    }

    const rows = await db
      .select({
        id: wikiPageComments.id,
        pageId: wikiPageComments.pageId,
        content: wikiPageComments.content,
        isResolved: wikiPageComments.isResolved,
        createdAt: wikiPageComments.createdAt,
        updatedAt: wikiPageComments.updatedAt,
        createdBy: wikiPageComments.createdBy,
        authorName: users.name,
        authorAvatar: users.avatarUrl
      })
      .from(wikiPageComments)
      .leftJoin(users, eq(users.id, wikiPageComments.createdBy))
      .where(eq(wikiPageComments.pageId, pageId))
      .orderBy(asc(wikiPageComments.createdAt));

    return c.json({ comments: rows.map(mapWikiComment) });
  } catch (error) {
    if ((error as Error).message === 'PAGE_NOT_FOUND') {
      return c.json({ error: 'Wiki page not found' }, 404);
    }
    log.error('Failed to fetch wiki comments', error as Error, { pageId, userId: user.id });
    return c.json({ error: 'Failed to fetch wiki comments' }, 500);
  }
});

// Create a comment on a wiki page
wikiRoutes.post('/comments/:pageId', requireAuth, zValidator('json', createWikiCommentSchema), async (c) => {
  const user = c.get('user') as User;
  const pageId = c.req.param('pageId');

  try {
    z.string().uuid().parse(pageId);
  } catch {
    return c.json({ error: 'Invalid page ID format' }, 400);
  }

  try {
    const page = await getWikiPageOrThrow(pageId);
    const membership = await checkWorkspaceMembership(page.workspaceId, user.id);
    if (!membership) {
      return c.json({ error: 'Access denied' }, 403);
    }

    const data = c.req.valid('json');

    const [inserted] = await db
      .insert(wikiPageComments)
      .values({
        pageId,
        content: data.content,
        createdBy: user.id
      })
      .returning();

    const comment = mapWikiComment({
      ...inserted,
      authorName: user.name || 'Unknown',
      authorAvatar: user.avatarUrl || null
    });

    return c.json({ comment }, 201);
  } catch (error) {
    if ((error as Error).message === 'PAGE_NOT_FOUND') {
      return c.json({ error: 'Wiki page not found' }, 404);
    }
    log.error('Failed to create wiki comment', error as Error, { pageId, userId: user.id });
    return c.json({ error: 'Failed to create wiki comment' }, 500);
  }
});

// Update a comment (content or resolve state)
wikiRoutes.patch('/comments/:commentId', requireAuth, zValidator('json', updateWikiCommentSchema), async (c) => {
  const user = c.get('user') as User;
  const commentId = c.req.param('commentId');

  try {
    z.string().uuid().parse(commentId);
  } catch {
    return c.json({ error: 'Invalid comment ID format' }, 400);
  }

  const data = c.req.valid('json');

  try {
    const [record] = await db
      .select({
        id: wikiPageComments.id,
        pageId: wikiPageComments.pageId,
        content: wikiPageComments.content,
        createdBy: wikiPageComments.createdBy,
        workspaceId: wikiPages.workspaceId
      })
      .from(wikiPageComments)
      .innerJoin(wikiPages, eq(wikiPages.id, wikiPageComments.pageId))
      .where(eq(wikiPageComments.id, commentId))
      .limit(1);

    if (!record) {
      return c.json({ error: 'Comment not found' }, 404);
    }

    const membership = await checkWorkspaceMembership(record.workspaceId, user.id);
    if (!membership) {
      return c.json({ error: 'Access denied' }, 403);
    }

    const isAuthor = record.createdBy === user.id;
    const isManager = membership.role === 'owner' || membership.role === 'admin' || membership.role === 'editor';

    if (!isAuthor && !isManager) {
      return c.json({ error: 'Only comment author or workspace managers can update comments' }, 403);
    }

    if (!data.content && typeof data.isResolved === 'undefined') {
      return c.json({ error: 'Nothing to update' }, 400);
    }

    const updatePayload: Partial<typeof wikiPageComments.$inferInsert> & { updatedAt: Date } = {
      updatedAt: new Date()
    };

    if (data.content) {
      updatePayload.content = data.content;
    }

    if (typeof data.isResolved === 'boolean') {
      updatePayload.isResolved = data.isResolved;
      updatePayload.resolvedBy = data.isResolved ? user.id : null;
    }

    const [updated] = await db
      .update(wikiPageComments)
      .set(updatePayload)
      .where(eq(wikiPageComments.id, commentId))
      .returning({
        id: wikiPageComments.id,
        pageId: wikiPageComments.pageId,
        content: wikiPageComments.content,
        isResolved: wikiPageComments.isResolved,
        createdAt: wikiPageComments.createdAt,
        updatedAt: wikiPageComments.updatedAt,
        createdBy: wikiPageComments.createdBy,
        authorName: users.name,
        authorAvatar: users.avatarUrl
      })
      .leftJoin(users, eq(users.id, wikiPageComments.createdBy));

    if (!updated) {
      return c.json({ error: 'Failed to update comment' }, 500);
    }

    return c.json({ comment: mapWikiComment(updated) });
  } catch (error) {
    log.error('Failed to update wiki comment', error as Error, { commentId, userId: user.id });
    return c.json({ error: 'Failed to update wiki comment' }, 500);
  }
});

// Delete a comment
wikiRoutes.delete('/comments/:commentId', requireAuth, async (c) => {
  const user = c.get('user') as User;
  const commentId = c.req.param('commentId');

  try {
    z.string().uuid().parse(commentId);
  } catch {
    return c.json({ error: 'Invalid comment ID format' }, 400);
  }

  try {
    const [record] = await db
      .select({
        id: wikiPageComments.id,
        pageId: wikiPageComments.pageId,
        createdBy: wikiPageComments.createdBy,
        workspaceId: wikiPages.workspaceId
      })
      .from(wikiPageComments)
      .innerJoin(wikiPages, eq(wikiPages.id, wikiPageComments.pageId))
      .where(eq(wikiPageComments.id, commentId))
      .limit(1);

    if (!record) {
      return c.json({ error: 'Comment not found' }, 404);
    }

    const membership = await checkWorkspaceMembership(record.workspaceId, user.id);
    if (!membership) {
      return c.json({ error: 'Access denied' }, 403);
    }

    const isAuthor = record.createdBy === user.id;
    const isManager = membership.role === 'owner' || membership.role === 'admin';

    if (!isAuthor && !isManager) {
      return c.json({ error: 'Only comment author or workspace admins can delete comments' }, 403);
    }

    await db.delete(wikiPageComments).where(eq(wikiPageComments.id, commentId));

    return c.json({ success: true });
  } catch (error) {
    log.error('Failed to delete wiki comment', error as Error, { commentId, userId: user.id });
    return c.json({ error: 'Failed to delete wiki comment' }, 500);
  }
});

// Create a link between wiki pages
wikiRoutes.post('/:id/links', requireAuth, createRateLimiter, zValidator('json', z.object({
  toPageId: z.string().uuid(),
})), async (c) => {
  const user = c.get('user') as User;
  const fromPageId = c.req.param('id');
  const { toPageId } = c.req.valid('json');

  try {
    z.string().uuid().parse(fromPageId);
    z.string().uuid().parse(toPageId);
  } catch {
    return c.json({ error: 'Invalid page ID format' }, 400);
  }

  if (fromPageId === toPageId) {
    return c.json({ error: 'Cannot link a page to itself' }, 400);
  }

  try {
    const [fromPage] = await db
      .select({ id: wikiPages.id, workspaceId: wikiPages.workspaceId })
      .from(wikiPages)
      .where(eq(wikiPages.id, fromPageId))
      .limit(1);

    if (!fromPage) {
      return c.json({ error: 'Source page not found' }, 404);
    }

    const [toPage] = await db
      .select({ id: wikiPages.id, workspaceId: wikiPages.workspaceId })
      .from(wikiPages)
      .where(eq(wikiPages.id, toPageId))
      .limit(1);

    if (!toPage) {
      return c.json({ error: 'Target page not found' }, 404);
    }

    if (fromPage.workspaceId !== toPage.workspaceId) {
      return c.json({ error: 'Pages must be in the same workspace' }, 400);
    }

    const membership = await checkWorkspaceMembership(fromPage.workspaceId, user.id, ['editor', 'admin', 'owner']);
    if (!membership) {
      return c.json({ error: 'Access denied' }, 403);
    }

    // Check if link already exists
    const [existing] = await db
      .select({ id: wikiPageLinks.id })
      .from(wikiPageLinks)
      .where(and(
        eq(wikiPageLinks.fromPageId, fromPageId),
        eq(wikiPageLinks.toPageId, toPageId)
      ))
      .limit(1);

    if (existing) {
      return c.json({ error: 'Link already exists' }, 400);
    }

    const [link] = await db
      .insert(wikiPageLinks)
      .values({
        fromPageId,
        toPageId,
      })
      .returning();

    log.info('Wiki page link created', { fromPageId, toPageId, userId: user.id });
    return c.json({ link }, 201);
  } catch (error) {
    log.error('Failed to create wiki page link', error as Error, { fromPageId, toPageId, userId: user.id });
    return c.json({ error: 'Failed to create link' }, 500);
  }
});

// Delete a link between wiki pages
wikiRoutes.delete('/:id/links/:toPageId', requireAuth, deleteRateLimiter, async (c) => {
  const user = c.get('user') as User;
  const fromPageId = c.req.param('id');
  const toPageId = c.req.param('toPageId');

  try {
    z.string().uuid().parse(fromPageId);
    z.string().uuid().parse(toPageId);
  } catch {
    return c.json({ error: 'Invalid page ID format' }, 400);
  }

  try {
    const [fromPage] = await db
      .select({ id: wikiPages.id, workspaceId: wikiPages.workspaceId })
      .from(wikiPages)
      .where(eq(wikiPages.id, fromPageId))
      .limit(1);

    if (!fromPage) {
      return c.json({ error: 'Source page not found' }, 404);
    }

    const membership = await checkWorkspaceMembership(fromPage.workspaceId, user.id, ['editor', 'admin', 'owner']);
    if (!membership) {
      return c.json({ error: 'Access denied' }, 403);
    }

    await db
      .delete(wikiPageLinks)
      .where(and(
        eq(wikiPageLinks.fromPageId, fromPageId),
        eq(wikiPageLinks.toPageId, toPageId)
      ));

    log.info('Wiki page link deleted', { fromPageId, toPageId, userId: user.id });
    return c.json({ success: true });
  } catch (error) {
    log.error('Failed to delete wiki page link', error as Error, { fromPageId, toPageId, userId: user.id });
    return c.json({ error: 'Failed to delete link' }, 500);
  }
});

// Get version history for a wiki page
wikiRoutes.get('/:id/versions', requireAuth, async (c) => {
  const user = c.get('user') as User;
  const pageId = c.req.param('id');
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = parseInt(c.req.query('offset') || '0');

  try {
    z.string().uuid().parse(pageId);
  } catch {
    return c.json({ error: 'Invalid page ID format' }, 400);
  }

  try {
    const [page] = await db
      .select({ id: wikiPages.id, workspaceId: wikiPages.workspaceId })
      .from(wikiPages)
      .where(eq(wikiPages.id, pageId))
      .limit(1);

    if (!page) {
      return c.json({ error: 'Wiki page not found' }, 404);
    }

    const membership = await checkWorkspaceMembership(page.workspaceId, user.id);
    if (!membership) {
      return c.json({ error: 'Access denied' }, 403);
    }

    // Get versions with user info
    const versions = await db
      .select({
        id: wikiPageVersions.id,
        versionNumber: wikiPageVersions.versionNumber,
        title: wikiPageVersions.title,
        excerpt: wikiPageVersions.excerpt,
        createdAt: wikiPageVersions.createdAt,
        createdBy: wikiPageVersions.createdBy,
        authorName: users.name,
        authorAvatar: users.avatarUrl
      })
      .from(wikiPageVersions)
      .leftJoin(users, eq(users.id, wikiPageVersions.createdBy))
      .where(eq(wikiPageVersions.pageId, pageId))
      .orderBy(desc(wikiPageVersions.versionNumber))
      .limit(limit)
      .offset(offset);

    const [totalCount] = await db
      .select({ count: count() })
      .from(wikiPageVersions)
      .where(eq(wikiPageVersions.pageId, pageId));

    return c.json({ versions, total: totalCount?.count || 0 });
  } catch (error) {
    log.error('Failed to fetch wiki page versions', error as Error, { pageId, userId: user.id });
    return c.json({ error: 'Failed to fetch versions' }, 500);
  }
});

// Get a specific version of a wiki page
wikiRoutes.get('/:id/versions/:versionNumber', requireAuth, async (c) => {
  const user = c.get('user') as User;
  const pageId = c.req.param('id');
  const versionNumber = parseInt(c.req.param('versionNumber'));

  try {
    z.string().uuid().parse(pageId);
  } catch {
    return c.json({ error: 'Invalid page ID format' }, 400);
  }

  if (isNaN(versionNumber)) {
    return c.json({ error: 'Invalid version number' }, 400);
  }

  try {
    const [page] = await db
      .select({ id: wikiPages.id, workspaceId: wikiPages.workspaceId })
      .from(wikiPages)
      .where(eq(wikiPages.id, pageId))
      .limit(1);

    if (!page) {
      return c.json({ error: 'Wiki page not found' }, 404);
    }

    const membership = await checkWorkspaceMembership(page.workspaceId, user.id);
    if (!membership) {
      return c.json({ error: 'Access denied' }, 403);
    }

    const [version] = await db
      .select({
        id: wikiPageVersions.id,
        pageId: wikiPageVersions.pageId,
        versionNumber: wikiPageVersions.versionNumber,
        title: wikiPageVersions.title,
        content: wikiPageVersions.content,
        excerpt: wikiPageVersions.excerpt,
        createdAt: wikiPageVersions.createdAt,
        createdBy: wikiPageVersions.createdBy,
        authorName: users.name,
        authorAvatar: users.avatarUrl
      })
      .from(wikiPageVersions)
      .leftJoin(users, eq(users.id, wikiPageVersions.createdBy))
      .where(and(
        eq(wikiPageVersions.pageId, pageId),
        eq(wikiPageVersions.versionNumber, versionNumber)
      ))
      .limit(1);

    if (!version) {
      return c.json({ error: 'Version not found' }, 404);
    }

    return c.json({ version });
  } catch (error) {
    log.error('Failed to fetch wiki page version', error as Error, { pageId, versionNumber, userId: user.id });
    return c.json({ error: 'Failed to fetch version' }, 500);
  }
});

// Restore a wiki page to a specific version
wikiRoutes.post('/:id/versions/:versionNumber/restore', requireAuth, async (c) => {
  const user = c.get('user') as User;
  const pageId = c.req.param('id');
  const versionNumber = parseInt(c.req.param('versionNumber'));

  try {
    z.string().uuid().parse(pageId);
  } catch {
    return c.json({ error: 'Invalid page ID format' }, 400);
  }

  if (isNaN(versionNumber)) {
    return c.json({ error: 'Invalid version number' }, 400);
  }

  try {
    const [page] = await db
      .select({ id: wikiPages.id, workspaceId: wikiPages.workspaceId })
      .from(wikiPages)
      .where(eq(wikiPages.id, pageId))
      .limit(1);

    if (!page) {
      return c.json({ error: 'Wiki page not found' }, 404);
    }

    const membership = await checkWorkspaceMembership(page.workspaceId, user.id, ['editor', 'admin', 'owner']);
    if (!membership) {
      return c.json({ error: 'Access denied' }, 403);
    }

    // Get the version to restore
    const [version] = await db
      .select()
      .from(wikiPageVersions)
      .where(and(
        eq(wikiPageVersions.pageId, pageId),
        eq(wikiPageVersions.versionNumber, versionNumber)
      ))
      .limit(1);

    if (!version) {
      return c.json({ error: 'Version not found' }, 404);
    }

    // Create a new version with current state before restoring
    const [currentPage] = await db
      .select()
      .from(wikiPages)
      .where(eq(wikiPages.id, pageId))
      .limit(1);

    const [lastVersion] = await db
      .select({ versionNumber: wikiPageVersions.versionNumber })
      .from(wikiPageVersions)
      .where(eq(wikiPageVersions.pageId, pageId))
      .orderBy(desc(wikiPageVersions.versionNumber))
      .limit(1);

    const nextVersionNumber = (lastVersion?.versionNumber || 0) + 1;

    await db.insert(wikiPageVersions).values({
      pageId,
      title: currentPage.title,
      content: currentPage.content,
      excerpt: currentPage.excerpt,
      versionNumber: nextVersionNumber,
      createdBy: user.id
    });

    // Restore the page to the selected version
    const [updatedPage] = await db
      .update(wikiPages)
      .set({
        title: version.title,
        content: version.content,
        excerpt: version.excerpt,
        lastEditedBy: user.id,
        updatedAt: new Date()
      })
      .where(eq(wikiPages.id, pageId))
      .returning();

    // Invalidate cache
    await cacheDel(`${CACHE_KEYS.WIKI_PAGE}${pageId}`);
    await cacheDelPattern(`${CACHE_KEYS.WIKI_PAGES_LIST}${page.workspaceId}:*`);
    await cacheDelPattern(`${CACHE_KEYS.WIKI_PAGE_BY_SLUG}${page.workspaceId}:*`);

    // Update search index
    await updateWikiPageIndex(pageId, {
      title: version.title,
      content: version.content,
      excerpt: version.excerpt
    });

    log.info('Wiki page restored to version', { pageId, versionNumber, userId: user.id });
    return c.json({ page: updatedPage });
  } catch (error) {
    log.error('Failed to restore wiki page version', error as Error, { pageId, versionNumber, userId: user.id });
    return c.json({ error: 'Failed to restore version' }, 500);
  }
});

// Track page view
wikiRoutes.post('/:id/view', requireAuth, async (c) => {
  const user = c.get('user') as User;
  const pageId = c.req.param('id');

  try {
    z.string().uuid().parse(pageId);
  } catch {
    return c.json({ error: 'Invalid page ID format' }, 400);
  }

  try {
    const [page] = await db
      .select({ id: wikiPages.id, workspaceId: wikiPages.workspaceId })
      .from(wikiPages)
      .where(eq(wikiPages.id, pageId))
      .limit(1);

    if (!page) {
      return c.json({ error: 'Wiki page not found' }, 404);
    }

    const membership = await checkWorkspaceMembership(page.workspaceId, user.id);
    if (!membership) {
      return c.json({ error: 'Access denied' }, 403);
    }

    // Record the view
    await db.insert(wikiPageViews).values({
      pageId,
      userId: user.id,
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || null,
      userAgent: c.req.header('user-agent') || null
    });

    return c.json({ success: true });
  } catch (error) {
    log.error('Failed to record wiki page view', error as Error, { pageId, userId: user.id });
    return c.json({ error: 'Failed to record view' }, 500);
  }
});

// Get analytics for a wiki page
wikiRoutes.get('/:id/analytics', requireAuth, async (c) => {
  const user = c.get('user') as User;
  const pageId = c.req.param('id');
  const days = parseInt(c.req.query('days') || '30');

  try {
    z.string().uuid().parse(pageId);
  } catch {
    return c.json({ error: 'Invalid page ID format' }, 400);
  }

  try {
    const [page] = await db
      .select({ id: wikiPages.id, workspaceId: wikiPages.workspaceId })
      .from(wikiPages)
      .where(eq(wikiPages.id, pageId))
      .limit(1);

    if (!page) {
      return c.json({ error: 'Wiki page not found' }, 404);
    }

    const membership = await checkWorkspaceMembership(page.workspaceId, user.id);
    if (!membership) {
      return c.json({ error: 'Access denied' }, 403);
    }

    const since = new Date();
    since.setDate(since.getDate() - days);

    // Total views
    const totalViewsResult = await db
      .select({ count: count() })
      .from(wikiPageViews)
      .where(and(
        eq(wikiPageViews.pageId, pageId),
        gte(wikiPageViews.viewedAt, since)
      ));
    const totalViewsCount = totalViewsResult[0]?.count || 0;

    // Unique viewers
    const uniqueViewersResult = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${wikiPageViews.userId})` })
      .from(wikiPageViews)
      .where(and(
        eq(wikiPageViews.pageId, pageId),
        gte(wikiPageViews.viewedAt, since)
      ));
    const uniqueViewersCount = uniqueViewersResult[0]?.count || 0;

    // Views per day (last 30 days)
    const viewsByDay = await db
      .select({
        date: sql<string>`DATE(${wikiPageViews.viewedAt})`,
        views: count()
      })
      .from(wikiPageViews)
      .where(and(
        eq(wikiPageViews.pageId, pageId),
        gte(wikiPageViews.viewedAt, since)
      ))
      .groupBy(sql`DATE(${wikiPageViews.viewedAt})`)
      .orderBy(sql`DATE(${wikiPageViews.viewedAt})`);

    // Top viewers
    const topViewers = await db
      .select({
        userId: wikiPageViews.userId,
        userName: users.name,
        userAvatar: users.avatarUrl,
        viewCount: count()
      })
      .from(wikiPageViews)
      .leftJoin(users, eq(users.id, wikiPageViews.userId))
      .where(and(
        eq(wikiPageViews.pageId, pageId),
        gte(wikiPageViews.viewedAt, since)
      ))
      .groupBy(wikiPageViews.userId, users.name, users.avatarUrl)
      .orderBy(desc(count()))
      .limit(10);

    // Last viewed
    const lastViewResult = await db
      .select({ viewedAt: wikiPageViews.viewedAt })
      .from(wikiPageViews)
      .where(eq(wikiPageViews.pageId, pageId))
      .orderBy(desc(wikiPageViews.viewedAt))
      .limit(1);
    const lastViewed = lastViewResult[0]?.viewedAt || null;

    return c.json({
      totalViews: totalViewsCount,
      uniqueViewers: uniqueViewersCount,
      lastViewed,
      viewsByDay,
      topViewers
    });
  } catch (error) {
    log.error('Failed to fetch wiki page analytics', error as Error, { pageId, userId: user.id });
    return c.json({ error: 'Failed to fetch analytics' }, 500);
  }
});

// Get backlinks for a wiki page (pages that link to this page)
wikiRoutes.get('/:id/backlinks', requireAuth, async (c) => {
  const user = c.get('user') as User;
  const pageId = c.req.param('id');

  try {
    z.string().uuid().parse(pageId);
  } catch {
    return c.json({ error: 'Invalid page ID format' }, 400);
  }

  try {
    const cacheKey = `${CACHE_KEYS.WIKI_BACKLINKS}${pageId}`;
    const cached = await cacheGet<Array<{ id: string; title: string; slug: string; workspaceId: string }>>(cacheKey);
    
    if (cached) {
      return c.json({ backlinks: cached });
    }

    const [page] = await db
      .select({ id: wikiPages.id, workspaceId: wikiPages.workspaceId })
      .from(wikiPages)
      .where(eq(wikiPages.id, pageId))
      .limit(1);

    if (!page) {
      return c.json({ error: 'Wiki page not found' }, 404);
    }

    const membership = await checkWorkspaceMembership(page.workspaceId, user.id);
    if (!membership) {
      return c.json({ error: 'Access denied' }, 403);
    }

    // Get all pages that link to this page
    const backlinks = await db
      .select({
        id: wikiPages.id,
        title: wikiPages.title,
        slug: wikiPages.slug,
        workspaceId: wikiPages.workspaceId,
        icon: wikiPages.icon,
        updatedAt: wikiPages.updatedAt
      })
      .from(wikiPageLinks)
      .innerJoin(wikiPages, eq(wikiPages.id, wikiPageLinks.fromPageId))
      .where(and(
        eq(wikiPageLinks.toPageId, pageId),
        eq(wikiPages.isArchived, false)
      ))
      .orderBy(asc(wikiPages.title));

    await cacheSet(cacheKey, backlinks, CACHE_TTL.WIKI_BACKLINKS);

    return c.json({ backlinks });
  } catch (error) {
    log.error('Failed to fetch wiki page backlinks', error as Error, { pageId, userId: user.id });
    return c.json({ error: 'Failed to fetch backlinks' }, 500);
  }
});

export default wikiRoutes;

