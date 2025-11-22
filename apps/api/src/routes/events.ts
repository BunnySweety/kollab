import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db';
import { events } from '../db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import type { InferInsertModel } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { checkWorkspaceMembership } from '../lib/workspace-helpers';
import type { User } from '../types';
import { log } from '../lib/logger';
import { createRateLimiter, updateRateLimiter, deleteRateLimiter } from '../middleware/rate-limiter';

const eventRoutes = new Hono();

// Create event schema
const createEventSchema = z.object({
  workspaceId: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  date: z.string().datetime(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  status: z.enum(['scheduled', 'completed', 'cancelled']).default('scheduled')
});

// Update event schema
const updateEventSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  date: z.string().datetime().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).nullable().optional(),
  status: z.enum(['scheduled', 'completed', 'cancelled']).optional()
});

// Get events by workspace
eventRoutes.get('/workspace/:workspaceId', requireAuth, async (c) => {
  const user = c.get('user') as User;
  const workspaceId = c.req.param('workspaceId');

  // Check workspace membership
  const membership = await checkWorkspaceMembership(workspaceId, user.id);
  if (!membership) {
    return c.json({ error: 'Access denied' }, 403);
  }

  try {
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');

    let query = db.select().from(events).where(eq(events.workspaceId, workspaceId));

    if (startDate && endDate) {
      query = db.select().from(events).where(
        and(
          eq(events.workspaceId, workspaceId),
          gte(events.date, new Date(startDate)),
          lte(events.date, new Date(endDate))
        )
      );
    }

    const allEvents = await query;

    return c.json({ events: allEvents });
  } catch (error) {
    log.error('Failed to fetch events', error as Error, { workspaceId, userId: user.id });
    return c.json({ error: 'Failed to fetch events' }, 500);
  }
});

// Create event
eventRoutes.post('/', requireAuth, createRateLimiter, zValidator('json', createEventSchema), async (c) => {
  const user = c.get('user') as User;
  const body = c.req.valid('json');

  // Check workspace membership
  const membership = await checkWorkspaceMembership(body.workspaceId, user.id);
  if (!membership) {
    return c.json({ error: 'Access denied' }, 403);
  }

  try {
    const eventData: InferInsertModel<typeof events> = {
      workspaceId: body.workspaceId,
      title: body.title,
      description: body.description || null,
      date: new Date(body.date),
      priority: body.priority || null,
      status: body.status || 'scheduled',
      createdBy: user.id,
      updatedAt: new Date()
    };

    const result = await db.insert(events).values(eventData).returning();
    const newEvent = result[0];

    if (!newEvent) {
      return c.json({ error: 'Failed to create event' }, 500);
    }

    log.info('Event created', { eventId: newEvent.id, workspaceId: body.workspaceId, userId: user.id });
    return c.json({ event: newEvent }, 201);
  } catch (error) {
    log.error('Failed to create event', error as Error, { workspaceId: body.workspaceId, userId: user.id });
    return c.json({ error: 'Failed to create event' }, 500);
  }
});

// Update event
eventRoutes.patch('/:id', requireAuth, updateRateLimiter, zValidator('json', updateEventSchema), async (c) => {
  const user = c.get('user') as User;
  const eventId = c.req.param('id');
  const body = c.req.valid('json');

  try {
    // Get event to check workspace membership
    const existingEvent = await db.select({
      id: events.id,
      workspaceId: events.workspaceId
    }).from(events).where(eq(events.id, eventId)).limit(1);
    
    if (existingEvent.length === 0) {
      return c.json({ error: 'Event not found' }, 404);
    }

    const event = existingEvent[0];
    if (!event) {
      return c.json({ error: 'Event not found' }, 404);
    }

    // Check workspace membership
    const membership = await checkWorkspaceMembership(event.workspaceId, user.id);
    if (!membership) {
      return c.json({ error: 'Access denied' }, 403);
    }

    const updates: Partial<InferInsertModel<typeof events>> & { updatedAt: Date } = {
      updatedAt: new Date()
    };

    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description || null;
    if (body.date !== undefined) updates.date = new Date(body.date);
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.status !== undefined) updates.status = body.status;

    const result = await db.update(events)
      .set(updates as Partial<InferInsertModel<typeof events>>)
      .where(eq(events.id, eventId))
      .returning();

    const updatedEvent = result[0];

    if (!updatedEvent) {
      return c.json({ error: 'Failed to update event' }, 500);
    }

    log.info('Event updated', { eventId, workspaceId: event.workspaceId, userId: user.id });
    return c.json({ event: updatedEvent });
  } catch (error) {
    log.error('Failed to update event', error as Error, { eventId, userId: user.id });
    return c.json({ error: 'Failed to update event' }, 500);
  }
});

// Delete event
eventRoutes.delete('/:id', requireAuth, deleteRateLimiter, async (c) => {
  const user = c.get('user') as User;
  const eventId = c.req.param('id');

  try {
    // Get event to check workspace membership
    const existingEvent = await db.select({
      id: events.id,
      workspaceId: events.workspaceId
    }).from(events).where(eq(events.id, eventId)).limit(1);
    
    if (existingEvent.length === 0) {
      return c.json({ error: 'Event not found' }, 404);
    }

    const event = existingEvent[0];
    if (!event) {
      return c.json({ error: 'Event not found' }, 404);
    }

    // Check workspace membership
    const membership = await checkWorkspaceMembership(event.workspaceId, user.id);
    if (!membership) {
      return c.json({ error: 'Access denied' }, 403);
    }

    await db.delete(events).where(eq(events.id, eventId));

    log.info('Event deleted', { eventId, workspaceId: event.workspaceId, userId: user.id });
    return c.json({ success: true });
  } catch (error) {
    log.error('Failed to delete event', error as Error, { eventId, userId: user.id });
    return c.json({ error: 'Failed to delete event' }, 500);
  }
});

export default eventRoutes;

