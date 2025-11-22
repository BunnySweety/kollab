import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db';
import { notes, projects } from '../db/schema';
import { eq, and, or, isNull, desc, type SQL } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { checkWorkspaceMembership } from '../lib/workspace-helpers';
import { log } from '../lib/logger';
import { createRateLimiter, updateRateLimiter, deleteRateLimiter } from '../middleware/rate-limiter';
import type { User } from '../types';

const notesRoutes = new Hono();

// Create note schema
const createNoteSchema = z.object({
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(), // Personal notes
  title: z.string().min(1).max(255),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
  color: z.string().optional(),
  isPinned: z.boolean().optional(),
});

// Update note schema
const updateNoteSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
  color: z.string().optional(),
  isPinned: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

// Get all notes in a workspace
notesRoutes.get('/workspace/:workspaceId', requireAuth, async (c) => {
  const user = c.get('user') as User;
  const workspaceId = c.req.param('workspaceId');
  const projectId = c.req.query('projectId');
  const userId = c.req.query('userId'); // Filter by personal notes
  const archived = c.req.query('archived') === 'true';

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
    const conditions = [eq(notes.workspaceId, workspaceId)];

    // Filter by project if provided
    if (projectId) {
      try {
        z.string().uuid().parse(projectId);
        conditions.push(eq(notes.projectId, projectId));
      } catch {
        return c.json({ error: 'Invalid project ID format' }, 400);
      }
    }
    // If no projectId is provided, show all notes in the workspace (with or without project)

    // Filter by user (personal notes) if provided
    if (userId) {
      try {
        z.string().uuid().parse(userId);
        if (userId !== user.id && membership.role !== 'admin' && membership.role !== 'owner') {
          return c.json({ error: 'Access denied' }, 403);
        }
        conditions.push(eq(notes.userId, userId));
      } catch {
        return c.json({ error: 'Invalid user ID format' }, 400);
      }
    } else {
      // Show workspace notes (no userId) or user's personal notes
      const orCondition: SQL<unknown> = or(
        isNull(notes.userId),
        eq(notes.userId, user.id)
      ) as SQL<unknown>;
      conditions.push(orCondition);
    }

    // Filter archived
    if (archived) {
      conditions.push(eq(notes.isArchived, true));
    } else {
      conditions.push(eq(notes.isArchived, false));
    }

    const allNotes = await db
      .select()
      .from(notes)
      .where(and(...conditions))
      .orderBy(desc(notes.isPinned), desc(notes.updatedAt));

    log.info('Fetched notes', { count: allNotes.length, workspaceId, projectId, userId, conditions: conditions.length });
    return c.json({ notes: allNotes });
  } catch (error) {
    const err = error as Error;
    log.error('Failed to fetch notes', err, { workspaceId, userId: user.id, message: err.message, stack: err.stack });
    // Check if it's a table doesn't exist error
    if (err.message?.includes('does not exist') || err.message?.includes('relation') || err.message?.includes('table')) {
      return c.json({ error: 'Notes table does not exist. Please run database migration.' }, 500);
    }
    return c.json({ error: 'Failed to fetch notes' }, 500);
  }
});

// Get a single note
notesRoutes.get('/:id', requireAuth, async (c) => {
  const user = c.get('user') as User;
  const noteId = c.req.param('id');

  try {
    z.string().uuid().parse(noteId);
  } catch {
    return c.json({ error: 'Invalid note ID format' }, 400);
  }

  try {
    const [note] = await db
      .select()
      .from(notes)
      .where(eq(notes.id, noteId))
      .limit(1);

    if (!note) {
      return c.json({ error: 'Note not found' }, 404);
    }

    const membership = await checkWorkspaceMembership(note.workspaceId, user.id);
    if (!membership) {
      return c.json({ error: 'Access denied' }, 403);
    }

    // Check if personal note belongs to user
    if (note.userId && note.userId !== user.id && membership.role !== 'admin' && membership.role !== 'owner') {
      return c.json({ error: 'Access denied' }, 403);
    }

    return c.json({ note });
  } catch (error) {
    log.error('Failed to fetch note', error as Error, { noteId, userId: user.id });
    return c.json({ error: 'Failed to fetch note' }, 500);
  }
});

// Create a new note
notesRoutes.post('/', requireAuth, createRateLimiter, zValidator('json', createNoteSchema), async (c) => {
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

  // Personal notes must belong to the creator
  if (data.userId && data.userId !== user.id) {
    return c.json({ error: 'You can only create personal notes for yourself' }, 400);
  }

  try {
    const result = await db
      .insert(notes)
      .values({
        workspaceId: data.workspaceId,
        projectId: data.projectId || null,
        userId: data.userId || null,
        title: data.title,
        content: data.content || null,
        tags: data.tags || [],
        color: data.color || null,
        isPinned: data.isPinned || false,
        createdBy: user.id,
      })
      .returning();

    const note = result[0];
    if (!note) {
      return c.json({ error: 'Failed to create note' }, 500);
    }

    log.info('Note created', { noteId: note.id, workspaceId: data.workspaceId, userId: user.id });
    return c.json({ note }, 201);
  } catch (error) {
    const err = error as Error;
    log.error('Failed to create note', err, { body: data, userId: user.id, message: err.message, stack: err.stack });
    // Check if it's a table doesn't exist error
    if (err.message?.includes('does not exist') || err.message?.includes('relation') || err.message?.includes('table')) {
      return c.json({ error: 'Notes table does not exist. Please run database migration.' }, 500);
    }
    return c.json({ error: 'Failed to create note' }, 500);
  }
});

// Update a note
notesRoutes.patch('/:id', requireAuth, updateRateLimiter, zValidator('json', updateNoteSchema), async (c) => {
  const user = c.get('user') as User;
  const noteId = c.req.param('id');
  const data = c.req.valid('json');

  try {
    z.string().uuid().parse(noteId);
  } catch {
    return c.json({ error: 'Invalid note ID format' }, 400);
  }

  try {
    const [note] = await db
      .select({ id: notes.id, workspaceId: notes.workspaceId, userId: notes.userId, createdBy: notes.createdBy })
      .from(notes)
      .where(eq(notes.id, noteId))
      .limit(1);

    if (!note) {
      return c.json({ error: 'Note not found' }, 404);
    }

    const membership = await checkWorkspaceMembership(note.workspaceId, user.id, ['editor', 'admin', 'owner']);
    if (!membership) {
      return c.json({ error: 'Access denied' }, 403);
    }

    // Personal notes can only be edited by owner or workspace admins
    if (note.userId && note.userId !== user.id && membership.role !== 'admin' && membership.role !== 'owner') {
      return c.json({ error: 'Access denied' }, 403);
    }

    const [updatedNote] = await db
      .update(notes)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(notes.id, noteId))
      .returning();

    log.info('Note updated', { noteId, userId: user.id });
    return c.json({ note: updatedNote });
  } catch (error) {
    log.error('Failed to update note', error as Error, { noteId, body: data, userId: user.id });
    return c.json({ error: 'Failed to update note' }, 500);
  }
});

// Delete a note
notesRoutes.delete('/:id', requireAuth, deleteRateLimiter, async (c) => {
  const user = c.get('user') as User;
  const noteId = c.req.param('id');

  try {
    z.string().uuid().parse(noteId);
  } catch {
    return c.json({ error: 'Invalid note ID format' }, 400);
  }

  try {
    const [note] = await db
      .select({ id: notes.id, workspaceId: notes.workspaceId, userId: notes.userId, createdBy: notes.createdBy })
      .from(notes)
      .where(eq(notes.id, noteId))
      .limit(1);

    if (!note) {
      return c.json({ error: 'Note not found' }, 404);
    }

    const membership = await checkWorkspaceMembership(note.workspaceId, user.id, ['editor', 'admin', 'owner']);
    if (!membership) {
      return c.json({ error: 'Access denied' }, 403);
    }

    // Personal notes can only be deleted by owner or workspace admins
    if (note.userId && note.userId !== user.id && membership.role !== 'admin' && membership.role !== 'owner') {
      return c.json({ error: 'Access denied' }, 403);
    }

    await db.delete(notes).where(eq(notes.id, noteId));

    log.info('Note deleted', { noteId, userId: user.id });
    return c.json({ success: true });
  } catch (error) {
    log.error('Failed to delete note', error as Error, { noteId, userId: user.id });
    return c.json({ error: 'Failed to delete note' }, 500);
  }
});

export default notesRoutes;

