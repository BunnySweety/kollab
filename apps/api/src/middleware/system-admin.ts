import { createMiddleware } from 'hono/factory';
import { log } from '../lib/logger';

interface AuthenticatedUser {
  id: string;
  email: string;
}

const parseList = (value?: string): string[] => {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const systemAdminIds = parseList(process.env.SYSTEM_ADMIN_IDS);
const systemAdminEmails = parseList(process.env.SYSTEM_ADMIN_EMAILS);

export const requireSystemAdmin = createMiddleware(async (c, next) => {
  const user = c.get('user') as AuthenticatedUser | undefined;

  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const isAdmin =
    (systemAdminIds.length > 0 && systemAdminIds.includes(user.id)) ||
    (systemAdminEmails.length > 0 && systemAdminEmails.includes(user.email));

  if (!isAdmin) {
    log.warn('System admin access denied', {
      userId: user.id,
      path: c.req.path
    });
    return c.json({ error: 'Forbidden' }, 403);
  }

  await next();
});

