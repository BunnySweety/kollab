import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { db } from '../db';
import { templates, templateGallery, favoriteTemplates, documents } from '../db/schema';
import { eq, and, or, desc, ilike, sql } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { checkWorkspaceMembership } from '../lib/workspace-helpers';
import { tipTapContentSchema, templateContentSchema, templateSettingsSchema } from '../types/content';

const templateRoutes = new Hono();

// Template schemas
const createTemplateSchema = z.object({
  name: z.string()
    .min(1, 'Le nom du template est requis')
    .max(255, 'Le nom ne peut pas dépasser 255 caractères'),
  description: z.string().optional(),
  category: z.enum(['document', 'project', 'task-list', 'wiki', 'meeting-notes', 'roadmap', 'knowledge-base'], {
    errorMap: () => ({ message: 'La catégorie doit être: document, project, task-list, wiki, meeting-notes, roadmap ou knowledge-base' })
  }),
  icon: z.string().optional(),
  coverImage: z.string().optional(),
  content: tipTapContentSchema.optional(),
  structure: templateContentSchema.optional(),
  properties: templateContentSchema.optional(),
  settings: templateSettingsSchema.optional(),
  tags: z.array(z.string()).optional(),
  isPublic: z.boolean().default(false)
});

// Get all templates for a workspace
templateRoutes.get('/workspace/:workspaceId', requireAuth, async (c) => {
  const workspaceId = c.req.param('workspaceId');
  const user = c.get('user');

  // Check workspace membership with Redis cache
  const membership = await checkWorkspaceMembership(workspaceId, user.id);
  if (!membership) {
    return c.json({ error: 'Access denied' }, 403);
  }

  // Get templates
  const workspaceTemplates = await db.select()
    .from(templates)
    .where(
      or(
        eq(templates.workspaceId, workspaceId),
        eq(templates.isOfficial, true),
        and(
          eq(templates.isPublic, true),
          eq(templates.createdBy, user.id)
        )
      )
    )
    .orderBy(desc(templates.createdAt));

  return c.json({ templates: workspaceTemplates });
});

// Get template gallery (public templates)
templateRoutes.get('/gallery', async (c) => {
  const category = c.req.query('category');
  const search = c.req.query('search');
  const sort = c.req.query('sort') || 'popular';
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = parseInt(c.req.query('offset') || '0');

  const baseQuery = db.select({
    template: templates,
    gallery: templateGallery
  })
    .from(templateGallery)
    .leftJoin(templates, eq(templateGallery.templateId, templates.id))
    .where(
      and(
        or(
          eq(templates.isPublic, true),
          eq(templates.isOfficial, true)
        ),
        category ? eq(templateGallery.category, category) : undefined,
        search ? ilike(templateGallery.title, `%${search}%`) : undefined
      )
    )
    .limit(limit)
    .offset(offset);

  // Apply sorting
  let query;
  switch (sort) {
    case 'popular':
      query = baseQuery.orderBy(desc(templateGallery.downloads));
      break;
    case 'recent':
      query = baseQuery.orderBy(desc(templateGallery.publishedAt));
      break;
    case 'rating':
      query = baseQuery.orderBy(desc(templateGallery.rating));
      break;
    case 'featured':
      query = baseQuery.orderBy(desc(templateGallery.featured), desc(templateGallery.downloads));
      break;
    default:
      query = baseQuery;
  }

  const galleryItems = await query;

  return c.json({
    templates: galleryItems,
    pagination: {
      limit,
      offset,
      hasMore: galleryItems.length === limit
    }
  });
});

// Create a new template
templateRoutes.post('/', requireAuth, zValidator('json', createTemplateSchema), async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');

  // Create template
  const templateResult = await db.insert(templates)
    .values({
      ...body,
      createdBy: user.id
    })
    .returning();

  const template = templateResult[0];
  if (!template) {
    return c.json({ error: 'Failed to create template' }, 500);
  }

  // If public, add to gallery
  if (body.isPublic) {
    await db.insert(templateGallery)
      .values({
        templateId: template.id,
        title: body.name,
        description: body.description,
        category: body.category,
        tags: body.tags,
        publishedBy: user.id
      });
  }

  return c.json({ template }, 201);
});

// Use a template (create document/project from template)
templateRoutes.post('/:templateId/use', requireAuth, async (c) => {
  const templateId = c.req.param('templateId');
  const user = c.get('user');
  const { workspaceId, name, parentId } = await c.req.json();

  // Get template
  const [template] = await db.select()
    .from(templates)
    .where(eq(templates.id, templateId))
    .limit(1);

  if (!template) {
    return c.json({ error: 'Template not found' }, 404);
  }

  // Increment usage count
  await db.update(templates)
    .set({
      usageCount: sql`${templates.usageCount} + 1`,
      updatedAt: new Date()
    })
    .where(eq(templates.id, templateId));

  // Create document or project based on template
  if (template.category === 'document') {
    const documentResult = await db.insert(documents)
      .values({
        workspaceId,
        title: name || template.name,
        content: template.content || null,
        icon: template.icon || null,
        coverUrl: template.coverImage || null,
        parentId: parentId || null,
        createdBy: user.id
      })
      .returning();

    const document = documentResult[0];
    if (!document) {
      return c.json({ error: 'Failed to create document' }, 500);
    }

    return c.json({
      type: 'document',
      document,
      message: 'Document created from template'
    }, 201);
  } else if (template.category === 'project' && template.structure) {
    // Create project structure
    const createdDocuments = [];
    const templateContent = template.content;
    const templateIcon = template.icon;

    // Recursively create document structure
    type StructureItem = { title: string; content?: unknown; icon?: string; children?: StructureItem[] };
    async function createStructure(items: StructureItem[], parentId?: string) {
      for (const item of items) {
        const docResult = await db.insert(documents)
          .values({
            workspaceId,
            title: item.title,
            content: item.content || templateContent || null,
            icon: item.icon || templateIcon || null,
            parentId: parentId || null,
            createdBy: user.id
          })
          .returning();

        const doc = docResult[0];
        if (!doc) {
          continue;
        }

        createdDocuments.push(doc);

        // Create children
        if (item.children && item.children.length > 0) {
          await createStructure(item.children, doc.id);
        }
      }
    }

    // Create root document
    const rootDocResult = await db.insert(documents)
      .values({
        workspaceId,
        title: name || template.name,
        content: template.content || null,
        icon: template.icon || null,
        coverUrl: template.coverImage || null,
        parentId: parentId || null,
        createdBy: user.id
      })
      .returning();

    const rootDoc = rootDocResult[0];
    if (!rootDoc) {
      return c.json({ error: 'Failed to create root document' }, 500);
    }

    createdDocuments.push(rootDoc);

    // Create structure under root
    if (template.structure && Array.isArray(template.structure)) {
      await createStructure(template.structure as StructureItem[], rootDoc.id);
    }

    return c.json({
      type: 'project',
      rootDocument: rootDoc,
      documents: createdDocuments,
      message: 'Project created from template'
    }, 201);
  }

  return c.json({ error: 'Invalid template category' }, 400);
});

// Update a template
templateRoutes.put('/:templateId', requireAuth, zValidator('json', createTemplateSchema.partial()), async (c) => {
  const templateId = c.req.param('templateId');
  const user = c.get('user');
  const body = c.req.valid('json');

  // Check ownership
  const templateResult = await db.select()
    .from(templates)
    .where(and(
      eq(templates.id, templateId),
      eq(templates.createdBy, user.id)
    ))
    .limit(1);

  const template = templateResult[0];
  if (!template) {
    return c.json({ error: 'Template not found or access denied' }, 404);
  }

  // Update template
  const updatedResult = await db.update(templates)
    .set({
      ...body,
      updatedAt: new Date()
    })
    .where(eq(templates.id, templateId))
    .returning();

  const updated = updatedResult[0];
  if (!updated) {
    return c.json({ error: 'Failed to update template' }, 500);
  }

  // Update gallery if public
  if (updated.isPublic) {
    await db.update(templateGallery)
      .set({
        title: updated.name,
        description: updated.description,
        category: updated.category,
        tags: updated.tags,
        lastUpdated: new Date()
      })
      .where(eq(templateGallery.templateId, templateId));
  }

  return c.json({ template: updated });
});

// Delete a template
templateRoutes.delete('/:templateId', requireAuth, async (c) => {
  const templateId = c.req.param('templateId');
  const user = c.get('user');

  // Check ownership
  const [template] = await db.select()
    .from(templates)
    .where(and(
      eq(templates.id, templateId),
      eq(templates.createdBy, user.id)
    ))
    .limit(1);

  if (!template) {
    return c.json({ error: 'Template not found or access denied' }, 404);
  }

  // Delete from gallery first if exists
  await db.delete(templateGallery)
    .where(eq(templateGallery.templateId, templateId));

  // Delete favorites
  await db.delete(favoriteTemplates)
    .where(eq(favoriteTemplates.templateId, templateId));

  // Delete template
  await db.delete(templates)
    .where(eq(templates.id, templateId));

  return c.json({ message: 'Template deleted successfully' });
});

// Add template to favorites
templateRoutes.post('/:templateId/favorite', requireAuth, async (c) => {
  const templateId = c.req.param('templateId');
  const user = c.get('user');

  // Check if already favorited
  const existing = await db.select()
    .from(favoriteTemplates)
    .where(and(
      eq(favoriteTemplates.userId, user.id),
      eq(favoriteTemplates.templateId, templateId)
    ))
    .limit(1);

  if (existing.length > 0) {
    return c.json({ error: 'Template already in favorites' }, 400);
  }

  // Add to favorites
  await db.insert(favoriteTemplates)
    .values({
      userId: user.id,
      templateId
    });

  return c.json({ message: 'Template added to favorites' });
});

// Remove template from favorites
templateRoutes.delete('/:templateId/favorite', requireAuth, async (c) => {
  const templateId = c.req.param('templateId');
  const user = c.get('user');

  await db.delete(favoriteTemplates)
    .where(and(
      eq(favoriteTemplates.userId, user.id),
      eq(favoriteTemplates.templateId, templateId)
    ));

  return c.json({ message: 'Template removed from favorites' });
});

// Get user's favorite templates
templateRoutes.get('/favorites', requireAuth, async (c) => {
  const user = c.get('user');

  const favorites = await db.select({
    template: templates,
    addedAt: favoriteTemplates.addedAt
  })
    .from(favoriteTemplates)
    .leftJoin(templates, eq(favoriteTemplates.templateId, templates.id))
    .where(eq(favoriteTemplates.userId, user.id))
    .orderBy(desc(favoriteTemplates.addedAt));

  return c.json({ favorites });
});

export default templateRoutes;