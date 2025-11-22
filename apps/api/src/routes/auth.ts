import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { hash, verify } from '@node-rs/argon2';
import { lucia, SESSION_EXPIRY_DAYS } from '../lib/auth';
import { db } from '../db';
import { users, workspaces, workspaceMembers } from '../db/schema';
import { eq } from 'drizzle-orm';
import { authRateLimiter } from '../middleware/rate-limiter';
import { getCookie } from 'hono/cookie';
import { log } from '../lib/logger';
import { invalidateWorkspaceMemberCache } from '../lib/cache';

const authRoutes = new Hono();

// Register schema with strong password requirements
const registerSchema = z.object({
  email: z.string().email('L\'adresse email doit être valide'),
  password: z.string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
    .max(255, 'Le mot de passe est trop long (maximum 255 caractères)')
    .regex(/[a-z]/, 'Le mot de passe doit contenir au moins une lettre minuscule')
    .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une lettre majuscule')
    .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre')
    .regex(/[^a-zA-Z0-9]/, 'Le mot de passe doit contenir au moins un caractère spécial'),
  name: z.string()
    .min(1, 'Le nom est requis')
    .max(255, 'Le nom ne peut pas dépasser 255 caractères')
});

// Login schema
const loginSchema = z.object({
  email: z.string().email('L\'adresse email doit être valide'),
  password: z.string().min(1, 'Le mot de passe est requis')
});

// Register endpoint (with rate limiting)
authRoutes.post('/register', authRateLimiter, zValidator('json', registerSchema), async (c) => {
  try {
    const { email, password, name } = c.req.valid('json');

    // Check if user exists
    const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (existingUser.length > 0) {
      return c.json({ error: 'User already exists' }, 400);
    }

    // SECURITY: Hash password with strengthened Argon2 parameters (OWASP recommendations)
    const hashedPassword = await hash(password, {
      memoryCost: 65536,  // 64 MB (OWASP recommended)
      timeCost: 3,        // Increased from 2
      outputLen: 32,      // 256 bits
      parallelism: 4      // Increased from 1 (OWASP recommended)
    });

    // Create user
    const newUser = await db.insert(users).values({
      email,
      hashedPassword,
      name
    }).returning();

    if (!newUser[0]) {
      return c.json({ error: 'Failed to create user' }, 500);
    }

    // Create default workspace for the new user
    const defaultWorkspace = await db.insert(workspaces).values({
      name: `${name}'s Workspace`,
      slug: `${email.split('@')[0]}-workspace-${Date.now()}`,
      description: 'Your personal workspace',
      createdBy: newUser[0].id
    }).returning();

    if (!defaultWorkspace[0]) {
      return c.json({ error: 'Failed to create workspace' }, 500);
    }

    // Add user as owner of the default workspace
    await db.insert(workspaceMembers).values({
      workspaceId: defaultWorkspace[0].id,
      userId: newUser[0].id,
      role: 'owner'
    });

    // Invalidate cache to ensure fresh data
    await invalidateWorkspaceMemberCache(newUser[0].id, defaultWorkspace[0].id);

    // Create session with expiration
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    const session = await lucia.createSession(newUser[0].id, {
      expiresAt
    });
    const sessionCookie = lucia.createSessionCookie(session.id);

    // Set cookie
    c.header('Set-Cookie', sessionCookie.serialize());

    return c.json({
      user: {
        id: newUser[0]?.id,
        email: newUser[0]?.email,
        name: newUser[0]?.name
      }
    });
  } catch (error) {
    log.error('Registration error', error as Error);
    return c.json({ error: 'Registration failed' }, 500);
  }
});

// Login endpoint (with rate limiting)
authRoutes.post('/login', authRateLimiter, zValidator('json', loginSchema), async (c) => {
  try {
    const { email, password } = c.req.valid('json');

    // Find user
    const user = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (!user[0]) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    // Verify password
    const validPassword = await verify(user[0].hashedPassword!, password);

    if (!validPassword) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    // Check if user has any workspaces, if not create a default one
    const userWorkspaces = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, user[0].id))
      .limit(1);

    if (userWorkspaces.length === 0) {
      // Create default workspace for existing user
      const defaultWorkspace = await db.insert(workspaces).values({
        name: `${user[0].name}'s Workspace`,
        slug: `${email.split('@')[0]}-workspace-${Date.now()}`,
        description: 'Your personal workspace',
        createdBy: user[0].id
      }).returning();

      if (defaultWorkspace[0]) {
        // Add user as owner of the default workspace
        await db.insert(workspaceMembers).values({
          workspaceId: defaultWorkspace[0].id,
          userId: user[0].id,
          role: 'owner'
        });

        // Invalidate cache to ensure fresh data
        await invalidateWorkspaceMemberCache(user[0].id, defaultWorkspace[0].id);
      }
    }

    // Create session with expiration
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    const session = await lucia.createSession(user[0].id, {
      expiresAt
    });
    const sessionCookie = lucia.createSessionCookie(session.id);

    // Set cookie
    c.header('Set-Cookie', sessionCookie.serialize());

    return c.json({
      user: {
        id: user[0].id,
        email: user[0].email,
        name: user[0].name
      }
    });
  } catch (error) {
    log.error('Login error', error as Error);
    return c.json({ error: 'Login failed' }, 500);
  }
});

// Logout endpoint
authRoutes.post('/logout', async (c) => {
  const sessionId = c.req.header('Cookie')?.match(/session=([^;]+)/)?.[1];

  if (sessionId) {
    await lucia.invalidateSession(sessionId);
    const sessionCookie = lucia.createBlankSessionCookie();
    c.header('Set-Cookie', sessionCookie.serialize());
  }

  return c.json({ success: true });
});

// Get current user
authRoutes.get('/me', async (c) => {
  const sessionId = c.req.header('Cookie')?.match(/session=([^;]+)/)?.[1];

  if (!sessionId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const { session, user } = await lucia.validateSession(sessionId);

  if (!session || !user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  return c.json({ user });
});

// Get CSRF token for authenticated requests
// This endpoint returns the CSRF token that the frontend needs to include in state-changing requests
authRoutes.get('/csrf-token', async (c) => {
  // CSRF token should have been set by ensureCsrfToken middleware
  const csrfToken = c.get('csrfToken') || getCookie(c, 'csrf_token');

  if (!csrfToken) {
    return c.json({ error: 'CSRF token not available' }, 500);
  }

  return c.json({ csrfToken });
});

export default authRoutes;