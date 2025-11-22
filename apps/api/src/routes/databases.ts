import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { db } from '../db';
import { databaseSchemas, databaseEntries } from '../db/schema';
import { eq, and, desc, count, sql } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { checkWorkspaceMembership } from '../lib/workspace-helpers';
import { log } from '../lib/logger';

const databaseRoutes = new Hono();

// Get all databases for a workspace
databaseRoutes.get('/workspace/:workspaceId', requireAuth, async (c) => {
  const workspaceId = c.req.param('workspaceId');
  const user = c.get('user');

  // Check workspace membership
  const membership = await checkWorkspaceMembership(workspaceId, user.id);
  if (!membership) {
    return c.json({ error: 'Access denied' }, 403);
  }

  try {
    log.info('Fetching databases for workspace', { workspaceId, userId: user.id });
    
    // Get all databases for the workspace
    const databases = await db.select({
      id: databaseSchemas.id,
      workspaceId: databaseSchemas.workspaceId,
      documentId: databaseSchemas.documentId,
      name: databaseSchemas.name,
      description: databaseSchemas.description,
      properties: databaseSchemas.properties,
      views: databaseSchemas.views,
      createdBy: databaseSchemas.createdBy,
      createdAt: databaseSchemas.createdAt,
      updatedAt: databaseSchemas.updatedAt
    })
      .from(databaseSchemas)
      .where(eq(databaseSchemas.workspaceId, workspaceId))
      .orderBy(desc(databaseSchemas.updatedAt));

    log.info('Found databases', { workspaceId, count: databases.length, databaseNames: databases.map(d => d.name) });

    // Get entry counts for each database
    const databasesWithCounts = await Promise.all(
      databases.map(async (dbSchema) => {
        const [entryCountResult] = await db.select({ count: count() })
          .from(databaseEntries)
          .where(eq(databaseEntries.schemaId, dbSchema.id));

        return {
          ...dbSchema,
          entryCount: entryCountResult?.count || 0
        };
      })
    );

    log.info('Returning databases with counts', { workspaceId, count: databasesWithCounts.length });
    return c.json({ databases: databasesWithCounts });
  } catch (error) {
    log.error('Failed to fetch databases', error as Error, { workspaceId, userId: user.id });
    return c.json({ error: 'Failed to fetch databases' }, 500);
  }
});

// Get a single database with its entries
databaseRoutes.get('/:databaseId', requireAuth, async (c) => {
  const databaseId = c.req.param('databaseId');
  const user = c.get('user');

  try {
    // Get database schema
    const [database] = await db.select()
      .from(databaseSchemas)
      .where(eq(databaseSchemas.id, databaseId))
      .limit(1);

    if (!database) {
      return c.json({ error: 'Database not found' }, 404);
    }

    // Check workspace membership
    const membership = await checkWorkspaceMembership(database.workspaceId, user.id);
    if (!membership) {
      return c.json({ error: 'Access denied' }, 403);
    }

    // Get entries
    const entries = await db.select()
      .from(databaseEntries)
      .where(eq(databaseEntries.schemaId, databaseId))
      .orderBy(databaseEntries.order);

    return c.json({
      database,
      entries
    });
  } catch (error) {
    log.error('Failed to fetch database', error as Error, { databaseId, userId: user.id });
    return c.json({ error: 'Failed to fetch database' }, 500);
  }
});

// Create a new database
const createDatabaseSchema = z.object({
  workspaceId: z.string().uuid('L\'ID du workspace doit être un UUID valide'),
  documentId: z.string().uuid('L\'ID du document doit être un UUID valide').optional(),
  name: z.string()
    .min(1, 'Le nom de la base de données est requis')
    .max(255, 'Le nom ne peut pas dépasser 255 caractères'),
  description: z.string().nullable().optional(),
  properties: z.record(z.unknown()),
  views: z.array(z.unknown()).optional()
});

databaseRoutes.post('/', requireAuth, zValidator('json', createDatabaseSchema), async (c) => {
  const data = c.req.valid('json');
  const user = c.get('user');

  // Check workspace membership
  const membership = await checkWorkspaceMembership(data.workspaceId, user.id);
  if (!membership) {
    return c.json({ error: 'Access denied' }, 403);
  }

  try {
    const result = await db.insert(databaseSchemas)
      .values({
        workspaceId: data.workspaceId,
        documentId: data.documentId || null,
        name: data.name,
        description: data.description || null,
        properties: data.properties,
        views: data.views || [],
        createdBy: user.id
      })
      .returning();

    const database = result[0];
    if (!database) {
      return c.json({ error: 'Failed to create database' }, 500);
    }

    log.info('Database created', { databaseId: database.id, workspaceId: data.workspaceId, userId: user.id });

    return c.json({ database }, 201);
  } catch (error) {
    log.error('Failed to create database', error as Error, { workspaceId: data.workspaceId, userId: user.id });
    return c.json({ error: 'Failed to create database' }, 500);
  }
});

// Update a database
const updateDatabaseSchema = z.object({
  name: z.string()
    .min(1, 'Le nom de la base de données est requis')
    .max(255, 'Le nom ne peut pas dépasser 255 caractères')
    .optional(),
  description: z.string().optional(),
  properties: z.record(z.unknown()).optional(),
  views: z.array(z.unknown()).optional()
});

databaseRoutes.put('/:databaseId', requireAuth, zValidator('json', updateDatabaseSchema), async (c) => {
  const databaseId = c.req.param('databaseId');
  const data = c.req.valid('json');
  const user = c.get('user');

  try {
    // Get database to check ownership
    const [database] = await db.select()
      .from(databaseSchemas)
      .where(eq(databaseSchemas.id, databaseId))
      .limit(1);

    if (!database) {
      return c.json({ error: 'Database not found' }, 404);
    }

    // Check workspace membership
    const membership = await checkWorkspaceMembership(database.workspaceId, user.id);
    if (!membership) {
      return c.json({ error: 'Access denied' }, 403);
    }

    // Update database
    const [updated] = await db.update(databaseSchemas)
      .set({
        name: data.name,
        description: data.description,
        properties: data.properties,
        views: data.views,
        updatedAt: new Date()
      })
      .where(eq(databaseSchemas.id, databaseId))
      .returning();

    log.info('Database updated', { databaseId, userId: user.id });

    return c.json({ database: updated });
  } catch (error) {
    log.error('Failed to update database', error as Error, { databaseId, userId: user.id });
    return c.json({ error: 'Failed to update database' }, 500);
  }
});

// Delete a database
databaseRoutes.delete('/:databaseId', requireAuth, async (c) => {
  const databaseId = c.req.param('databaseId');
  const user = c.get('user');

  try {
    // Get database to check ownership
    const [database] = await db.select()
      .from(databaseSchemas)
      .where(eq(databaseSchemas.id, databaseId))
      .limit(1);

    if (!database) {
      return c.json({ error: 'Database not found' }, 404);
    }

    // Check workspace membership (only owners/admins can delete)
    const membership = await checkWorkspaceMembership(database.workspaceId, user.id, ['owner', 'admin']);
    if (!membership) {
      return c.json({ error: 'Access denied' }, 403);
    }

    // Delete database (cascade will delete entries)
    await db.delete(databaseSchemas)
      .where(eq(databaseSchemas.id, databaseId));

    log.info('Database deleted', { databaseId, userId: user.id });

    return c.json({ success: true });
  } catch (error) {
    log.error('Failed to delete database', error as Error, { databaseId, userId: user.id });
    return c.json({ error: 'Failed to delete database' }, 500);
  }
});

// Database Entries Routes
const createEntrySchema = z.object({
  data: z.record(z.unknown()),
  order: z.number().optional()
});

databaseRoutes.post('/:databaseId/entries', requireAuth, zValidator('json', createEntrySchema), async (c) => {
  const databaseId = c.req.param('databaseId');
  const { data, order } = c.req.valid('json');
  const user = c.get('user');

  try {
    // Get database to check access
    const [database] = await db.select()
      .from(databaseSchemas)
      .where(eq(databaseSchemas.id, databaseId))
      .limit(1);

    if (!database) {
      return c.json({ error: 'Database not found' }, 404);
    }

    // Check workspace membership
    const membership = await checkWorkspaceMembership(database.workspaceId, user.id);
    if (!membership) {
      return c.json({ error: 'Access denied' }, 403);
    }

    // Get max order for this database
    const maxOrderResult = await db.select({ maxOrder: sql<number>`max(${databaseEntries.order})` })
      .from(databaseEntries)
      .where(eq(databaseEntries.schemaId, databaseId));

    const nextOrder = order !== undefined ? order : ((maxOrderResult[0]?.maxOrder ?? -1) + 1);

    // Create entry
    const [entry] = await db.insert(databaseEntries)
      .values({
        schemaId: databaseId,
        data,
        order: nextOrder,
        createdBy: user.id
      })
      .returning();

    if (!entry) {
      return c.json({ error: 'Failed to create database entry' }, 500);
    }

    log.info('Database entry created', { entryId: entry.id, databaseId, userId: user.id });

    return c.json({ entry }, 201);
  } catch (error) {
    log.error('Failed to create database entry', error as Error, { databaseId, userId: user.id });
    return c.json({ error: 'Failed to create database entry' }, 500);
  }
});

const updateEntrySchema = z.object({
  data: z.record(z.unknown()).optional(),
  order: z.number().optional()
});

databaseRoutes.put('/:databaseId/entries/:entryId', requireAuth, zValidator('json', updateEntrySchema), async (c) => {
  const databaseId = c.req.param('databaseId');
  const entryId = c.req.param('entryId');
  const updateData = c.req.valid('json');
  const user = c.get('user');

  try {
    // Get database to check access
    const [database] = await db.select()
      .from(databaseSchemas)
      .where(eq(databaseSchemas.id, databaseId))
      .limit(1);

    if (!database) {
      return c.json({ error: 'Database not found' }, 404);
    }

    // Check workspace membership
    const membership = await checkWorkspaceMembership(database.workspaceId, user.id);
    if (!membership) {
      return c.json({ error: 'Access denied' }, 403);
    }

    // Get entry
    const [entry] = await db.select()
      .from(databaseEntries)
      .where(and(
        eq(databaseEntries.id, entryId),
        eq(databaseEntries.schemaId, databaseId)
      ))
      .limit(1);

    if (!entry) {
      return c.json({ error: 'Entry not found' }, 404);
    }

    // Update entry
    const [updated] = await db.update(databaseEntries)
      .set({
        data: updateData.data || entry.data,
        order: updateData.order !== undefined ? updateData.order : entry.order,
        updatedAt: new Date()
      })
      .where(eq(databaseEntries.id, entryId))
      .returning();

    log.info('Database entry updated', { entryId, databaseId, userId: user.id });

    return c.json({ entry: updated });
  } catch (error) {
    log.error('Failed to update database entry', error as Error, { entryId, databaseId, userId: user.id });
    return c.json({ error: 'Failed to update database entry' }, 500);
  }
});

databaseRoutes.delete('/:databaseId/entries/:entryId', requireAuth, async (c) => {
  const databaseId = c.req.param('databaseId');
  const entryId = c.req.param('entryId');
  const user = c.get('user');

  try {
    // Get database to check access
    const [database] = await db.select()
      .from(databaseSchemas)
      .where(eq(databaseSchemas.id, databaseId))
      .limit(1);

    if (!database) {
      return c.json({ error: 'Database not found' }, 404);
    }

    // Check workspace membership
    const membership = await checkWorkspaceMembership(database.workspaceId, user.id);
    if (!membership) {
      return c.json({ error: 'Access denied' }, 403);
    }

    // Delete entry
    await db.delete(databaseEntries)
      .where(and(
        eq(databaseEntries.id, entryId),
        eq(databaseEntries.schemaId, databaseId)
      ));

    log.info('Database entry deleted', { entryId, databaseId, userId: user.id });

    return c.json({ success: true });
  } catch (error) {
    log.error('Failed to delete database entry', error as Error, { entryId, databaseId, userId: user.id });
    return c.json({ error: 'Failed to delete database entry' }, 500);
  }
});

export default databaseRoutes;

