import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db';
import { taskColumns } from '../db/schema';
import { eq, and, asc } from 'drizzle-orm';
import type { InferInsertModel } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { checkWorkspaceMembership } from '../lib/workspace-helpers';
import type { User } from '../types';
import { log } from '../lib/logger';

// Default columns configuration
const DEFAULT_COLUMNS = [
	{ statusId: 'todo', title: 'To Do', color: 'bg-gray-500', order: 0 },
	{ statusId: 'in_progress', title: 'In Progress', color: 'bg-blue-500', order: 1 },
	{ statusId: 'done', title: 'Done', color: 'bg-green-500', order: 2 }
];

/**
 * Initialize default columns for a workspace if they don't exist
 */
async function ensureDefaultColumns(workspaceId: string, userId: string) {
	// Get all existing columns for this workspace
	const allColumns = await db.select()
		.from(taskColumns)
		.where(eq(taskColumns.workspaceId, workspaceId));

	// Get existing statusIds (for default columns)
	const existingStatusIdsSet = new Set(
		allColumns
			.filter(col => col.statusId !== null)
			.map(col => col.statusId as string)
	);

	// Find missing default columns
	const missingColumns = DEFAULT_COLUMNS.filter(
		col => !existingStatusIdsSet.has(col.statusId)
	);

	if (missingColumns.length > 0) {
		const columnsToInsert = missingColumns.map(col => ({
			workspaceId,
			title: col.title,
			color: col.color,
			order: col.order,
			statusId: col.statusId,
			createdBy: userId
		}));

		await db.insert(taskColumns).values(columnsToInsert);
		log.info('Default task columns initialized', { workspaceId, count: missingColumns.length });
	}
}

const taskColumnRoutes = new Hono();

// Create column schema
const createColumnSchema = z.object({
	workspaceId: z.string().uuid(),
	title: z.string().min(1).max(255),
	color: z.string().min(1),
	order: z.number().int().default(0)
});

// Update column schema - SECURITY: Whitelist allowed fields
const updateColumnSchema = z.object({
	title: z.string().min(1).max(255).optional(),
	color: z.string().min(1).optional(),
	order: z.number().int().optional()
});

// Get columns by workspace
taskColumnRoutes.get('/workspace/:workspaceId', requireAuth, async (c) => {
	const user = c.get('user') as User;
	const workspaceId = c.req.param('workspaceId');

	const membership = await checkWorkspaceMembership(workspaceId, user.id);
	if (!membership) {
		return c.json({ error: 'Access denied' }, 403);
	}

	try {
		// Ensure default columns exist
		await ensureDefaultColumns(workspaceId, user.id);

		// Get all columns (default and custom)
		const allColumns = await db.select()
			.from(taskColumns)
			.where(eq(taskColumns.workspaceId, workspaceId))
			.orderBy(asc(taskColumns.order));

		return c.json({ columns: allColumns });
	} catch (error) {
		log.error('Failed to fetch task columns', error as Error, { workspaceId, userId: user.id });
		return c.json({ error: 'Failed to fetch task columns' }, 500);
	}
});

// Create column
taskColumnRoutes.post('/', requireAuth, zValidator('json', createColumnSchema), async (c) => {
	const user = c.get('user') as User;
	const body = c.req.valid('json');

	// Check workspace membership
	const membership = await checkWorkspaceMembership(body.workspaceId, user.id);
	if (!membership) {
		return c.json({ error: 'Access denied' }, 403);
	}

	try {
		const columnData: InferInsertModel<typeof taskColumns> = {
			workspaceId: body.workspaceId,
			title: body.title,
			color: body.color,
			order: body.order || 0,
			createdBy: user.id,
			updatedAt: new Date()
		};

		const result = await db.insert(taskColumns).values(columnData).returning();
		const newColumn = result[0];

		if (!newColumn) {
			log.error('Failed to create task column: no column returned', new Error('No column returned from insert'), { body, userId: user.id });
			return c.json({ error: 'Failed to create task column' }, 500);
		}

		log.info('Task column created', { columnId: newColumn.id, workspaceId: newColumn.workspaceId, userId: user.id });
		return c.json({ column: newColumn }, 201);
	} catch (error) {
		log.error('Failed to create task column', error as Error, { body, userId: user.id });
		return c.json({ error: 'Failed to create task column' }, 500);
	}
});

// Update column
taskColumnRoutes.patch('/:id', requireAuth, zValidator('json', updateColumnSchema), async (c) => {
	const user = c.get('user') as User;
	const columnId = c.req.param('id');
	const body = c.req.valid('json');

	// Check if user has access to the column's workspace
	const existingColumnResult = await db.select()
		.from(taskColumns)
		.where(eq(taskColumns.id, columnId))
		.limit(1);
	const existingColumn = existingColumnResult[0];

	if (!existingColumn) {
		return c.json({ error: 'Column not found' }, 404);
	}

	const membership = await checkWorkspaceMembership(existingColumn.workspaceId, user.id);
	if (!membership) {
		return c.json({ error: 'Access denied' }, 403);
	}

	try {
		const updates: Partial<InferInsertModel<typeof taskColumns>> & { updatedAt: Date } = {
			...body,
			updatedAt: new Date()
		};

		const updatedColumn = await db.update(taskColumns)
			.set(updates)
			.where(eq(taskColumns.id, columnId))
			.returning();

		if (!updatedColumn[0]) {
			log.error('Failed to update task column: no column returned', new Error('No column returned from update'), { columnId, body, userId: user.id });
			return c.json({ error: 'Failed to update task column' }, 500);
		}
		log.info('Task column updated', { columnId: updatedColumn[0].id, workspaceId: updatedColumn[0].workspaceId, userId: user.id });
		return c.json({ column: updatedColumn[0] });
	} catch (error) {
		log.error('Failed to update task column', error as Error, { columnId, body, userId: user.id });
		return c.json({ error: 'Failed to update task column' }, 500);
	}
});

// Delete column
taskColumnRoutes.delete('/:id', requireAuth, async (c) => {
	const user = c.get('user') as User;
	const columnId = c.req.param('id');

	// Check if user has access to the column's workspace
	const existingColumnResult = await db.select()
		.from(taskColumns)
		.where(eq(taskColumns.id, columnId))
		.limit(1);
	const existingColumn = existingColumnResult[0];

	if (!existingColumn) {
		return c.json({ error: 'Column not found' }, 404);
	}

	// Prevent deletion of default columns
	if (existingColumn.statusId) {
		return c.json({ error: 'Default columns cannot be deleted' }, 400);
	}

	const membership = await checkWorkspaceMembership(existingColumn.workspaceId, user.id);
	if (!membership) {
		return c.json({ error: 'Access denied' }, 403);
	}

	try {
		await db.delete(taskColumns).where(eq(taskColumns.id, columnId));
		log.info('Task column deleted', { columnId, workspaceId: existingColumn.workspaceId, userId: user.id });
		return c.json({ success: true, message: 'Column deleted' });
	} catch (error) {
		log.error('Failed to delete task column', error as Error, { columnId, userId: user.id });
		return c.json({ error: 'Failed to delete task column' }, 500);
	}
});

// Reorder columns (bulk update) - now includes default columns
taskColumnRoutes.post('/reorder', requireAuth, zValidator('json', z.object({
	workspaceId: z.string().uuid(),
	columnOrders: z.array(z.object({
		id: z.string().uuid(),
		order: z.number().int()
	}))
})), async (c) => {
	const user = c.get('user') as User;
	const { workspaceId, columnOrders } = c.req.valid('json');

	const membership = await checkWorkspaceMembership(workspaceId, user.id);
	if (!membership) {
		return c.json({ error: 'Access denied' }, 403);
	}

	try {
		// Update all columns in a transaction (including default columns)
		for (const { id, order } of columnOrders) {
			await db.update(taskColumns)
				.set({ order, updatedAt: new Date() })
				.where(and(
					eq(taskColumns.id, id),
					eq(taskColumns.workspaceId, workspaceId)
				));
		}

		log.info('Task columns reordered', { workspaceId, userId: user.id, count: columnOrders.length });
		return c.json({ success: true, message: 'Columns reordered' });
	} catch (error) {
		log.error('Failed to reorder task columns', error as Error, { workspaceId, userId: user.id });
		return c.json({ error: 'Failed to reorder task columns' }, 500);
	}
});

export default taskColumnRoutes;

