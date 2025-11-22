/**
 * Comments API Tests
 *
 * Verifies wiki comment routes using an in-memory pg-mem database.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { Hono } from 'hono';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { newDb } from 'pg-mem';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { User } from '../src/types';
import * as schema from '../src/db/schema';
import * as relations from '../src/db/relations';
import { users, workspaces, workspaceMembers, wikiPages, wikiPageComments } from '../src/db/schema';

type CombinedSchema = typeof schema & typeof relations;

let db: PostgresJsDatabase<CombinedSchema>;
let wikiRoutes: typeof import('../src/routes/wiki').default;
let closeDb: (() => Promise<void>) | undefined;

const cacheStore = new Map<string, unknown>();
const authState: { user: User | null } = { user: null };

vi.mock('../src/middleware/auth', async () => {
  const { createMiddleware } = await import('hono/factory');
  return {
    requireAuth: createMiddleware(async (c, next) => {
      if (!authState.user) {
        return c.json({ error: 'Unauthorized' }, 401);
      }
      c.set('user', authState.user);
      await next();
    })
  };
});

vi.mock('../src/middleware/rate-limiter', async () => {
  const actual = await import('../src/middleware/rate-limiter');
  const passthrough = () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  };
  return {
    ...actual,
    createRateLimiter: passthrough,
    updateRateLimiter: passthrough,
    deleteRateLimiter: passthrough
  };
});

vi.mock('../src/lib/cache', () => ({
  CACHE_KEYS: { WORKSPACE_MEMBER: 'ws_member:' },
  CACHE_TTL: { WORKSPACE_MEMBER: 60 },
  cacheGet: async (key: string) => (cacheStore.has(key) ? (cacheStore.get(key) as unknown) ?? null : null),
  cacheSet: async (key: string, value: unknown) => {
    cacheStore.set(key, value ?? null);
  },
  cacheExists: async (key: string) => cacheStore.has(key),
  cacheDel: async (key: string) => cacheStore.delete(key),
  cacheDelPattern: async () => 0
}));

beforeAll(async () => {
  const setup = await createTestDatabase();
  db = setup.db;
  closeDb = setup.close;
  vi.doMock('../src/db', () => ({ db }));
  const module = await import('../src/routes/wiki');
  wikiRoutes = module.default;
});

afterAll(async () => {
  await closeDb?.();
});

describe('Comments Routes', () => {
  let app: Hono;
  let workspaceId: string;
  let pageId: string;
  let primaryUserId: string;
  let secondaryUserId: string;
  let primaryUser: User;
  let secondaryUser: User;

  beforeEach(async () => {
    app = new Hono();
    app.route('/api/wiki', wikiRoutes);

    workspaceId = randomUUID();
    pageId = randomUUID();
    primaryUserId = randomUUID();
    secondaryUserId = randomUUID();

    await db.insert(users).values({
      id: primaryUserId,
      email: `primary-${Date.now()}@example.com`,
      name: 'Primary User',
      hashedPassword: 'hashed',
      emailVerified: true
    });

    await db.insert(users).values({
      id: secondaryUserId,
      email: `secondary-${Date.now()}@example.com`,
      name: 'Secondary User',
      hashedPassword: 'hashed',
      emailVerified: true
    });

    await db.insert(workspaces).values({
      id: workspaceId,
      name: 'Test Workspace',
      slug: `workspace-${workspaceId}`,
      createdBy: primaryUserId
    });

    await db.insert(workspaceMembers).values({
      workspaceId,
      userId: primaryUserId,
      role: 'admin'
    });

    await db.insert(wikiPages).values({
      id: pageId,
      workspaceId,
      title: 'Test Page',
      slug: `test-page-${Date.now()}`,
      content: null,
      createdBy: primaryUserId
    });

    const [dbPrimaryUser] = await db.select().from(users).where(eq(users.id, primaryUserId)).limit(1);
    const [dbSecondaryUser] = await db.select().from(users).where(eq(users.id, secondaryUserId)).limit(1);

    if (!dbPrimaryUser || !dbSecondaryUser) {
      throw new Error('Failed to create test users');
    }

    primaryUser = dbPrimaryUser as User;
    secondaryUser = dbSecondaryUser as User;
    authState.user = primaryUser;
  });

  afterEach(async () => {
    authState.user = null;
    cacheStore.clear();
    await db.delete(wikiPageComments).where(eq(wikiPageComments.pageId, pageId));
    await db.delete(wikiPages).where(eq(wikiPages.id, pageId));
    await db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, primaryUserId));
    await db.delete(users).where(eq(users.id, secondaryUserId));
  });

  it('should list document comments for workspace members', async () => {
    const commentId = randomUUID();
    await db.insert(wikiPageComments).values({
      id: commentId,
      pageId,
      content: 'Existing comment',
      createdBy: primaryUserId
    });

    const res = await app.request(`/api/wiki/comments/${pageId}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { comments: Array<{ id: string; content: string }> };
    expect(Array.isArray(body.comments)).toBe(true);
    expect(body.comments[0]?.id).toBe(commentId);
    expect(body.comments[0]?.content).toBe('Existing comment');
  });

  it('should prevent access to comments for non-members', async () => {
    authState.user = secondaryUser;

    const res = await app.request(`/api/wiki/comments/${pageId}`);
    expect(res.status).toBe(403);
  });

  it('should create comment for authenticated member', async () => {
    const res = await app.request(`/api/wiki/comments/${pageId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Created via API' })
    });

    expect(res.status).toBe(201);
    const body = await res.json() as { comment: { id: string; content: string; pageId: string } };
    expect(body.comment.content).toBe('Created via API');
    expect(body.comment.pageId).toBe(pageId);

    const [stored] = await db.select().from(wikiPageComments).where(eq(wikiPageComments.id, body.comment.id)).limit(1);
    expect(stored).toBeDefined();
  });

  it('should reject comment creation if user is not a member', async () => {
    authState.user = secondaryUser;

    const res = await app.request(`/api/wiki/comments/${pageId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Invalid' })
    });

    expect(res.status).toBe(403);
  });

  it('should allow creator to resolve comment', async () => {
    const commentId = randomUUID();
    await db.insert(wikiPageComments).values({
      id: commentId,
      pageId,
      content: 'Needs resolution',
      createdBy: primaryUserId,
      isResolved: false
    });

    const res = await app.request(`/api/wiki/comments/${commentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isResolved: true })
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { comment: { isResolved: boolean } };
    expect(body.comment.isResolved).toBe(true);
  });

  it('should reject updates from non-creator without elevated role', async () => {
    await db.insert(workspaceMembers).values({
      workspaceId,
      userId: secondaryUserId,
      role: 'viewer'
    });

    const commentId = randomUUID();
    await db.insert(wikiPageComments).values({
      id: commentId,
      pageId,
      content: 'Owner only',
      createdBy: primaryUserId
    });

    authState.user = secondaryUser;

    const res = await app.request(`/api/wiki/comments/${commentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isResolved: true })
    });

    expect(res.status).toBe(403);
  });
});

async function createTestDatabase() {
  const mem = newDb({ autoCreateForeignKeyIndices: true });
  mem.public.registerFunction({
    name: 'current_timestamp',
    returns: 'timestamp',
    implementation: () => new Date()
  });

  mem.public.none(`
    CREATE TABLE users (
      id uuid PRIMARY KEY,
      email text NOT NULL,
      hashed_password text,
      name text NOT NULL,
      avatar_url text,
      email_verified boolean,
      created_at timestamp DEFAULT now(),
      updated_at timestamp DEFAULT now()
    );

    CREATE TABLE workspaces (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      slug text NOT NULL,
      description text,
      logo_url text,
      created_by uuid REFERENCES users(id),
      created_at timestamp DEFAULT now(),
      updated_at timestamp DEFAULT now()
    );

    CREATE TABLE workspace_members (
      workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id uuid REFERENCES users(id) ON DELETE CASCADE,
      role text NOT NULL,
      joined_at timestamp DEFAULT now(),
      PRIMARY KEY (workspace_id, user_id)
    );

    CREATE TABLE wiki_pages (
      id uuid PRIMARY KEY,
      workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
      parent_id uuid,
      project_id uuid,
      title text NOT NULL,
      slug text NOT NULL,
      content jsonb,
      excerpt text,
      icon text,
      cover_url text,
      is_published boolean DEFAULT true,
      is_archived boolean DEFAULT false,
      "order" integer DEFAULT 0,
      created_by uuid REFERENCES users(id),
      last_edited_by uuid,
      created_at timestamp DEFAULT now(),
      updated_at timestamp DEFAULT now()
    );

    CREATE TABLE wiki_page_comments (
      id uuid PRIMARY KEY,
      page_id uuid REFERENCES wiki_pages(id) ON DELETE CASCADE,
      content text NOT NULL,
      is_resolved boolean DEFAULT false,
      created_by uuid REFERENCES users(id),
      resolved_by uuid,
      created_at timestamp DEFAULT now(),
      updated_at timestamp DEFAULT now()
    );
  `);

  const queryClient = mem.adapters.createPostgresJsTag();
  const db = drizzle(queryClient, { schema: { ...schema, ...relations } });

  return {
    db,
    close: async () => {
      await queryClient.end?.({ timeout: 0 });
    }
  };
}

