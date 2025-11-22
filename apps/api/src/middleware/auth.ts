import { createMiddleware } from 'hono/factory';
import { lucia } from '../lib/auth';

export const requireAuth = createMiddleware(async (c, next) => {
  const sessionId = c.req.header('Cookie')?.match(/session=([^;]+)/)?.[1];

  if (!sessionId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const { session, user } = await lucia.validateSession(sessionId);

  if (!session || !user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Refresh session if needed
  if (session.fresh) {
    const sessionCookie = lucia.createSessionCookie(session.id);
    c.header('Set-Cookie', sessionCookie.serialize());
  }

  // Add user to context
  // Type assertion needed because Lucia User type doesn't match Hono's expected type
  c.set('user', user as unknown as { id: string; name: string; email: string; hashedPassword: string | null; avatarUrl: string | null; emailVerified: boolean | null; createdAt: Date; updatedAt: Date });
  c.set('session', session);

  await next();
});