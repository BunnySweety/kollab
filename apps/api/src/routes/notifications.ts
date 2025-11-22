import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { requireAuth } from '../middleware/auth';
import { log } from '../lib/logger';
import {
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  archiveNotification,
  getUnreadNotificationCount,
  updateNotificationPreferences
} from '../services/notifications';

const notificationRoutes = new Hono();

// Get user notifications
notificationRoutes.get('/', requireAuth, async (c) => {
  try {
    const user = c.get('user');
    const unreadOnly = c.req.query('unread') === 'true';
    const limit = parseInt(c.req.query('limit') || '50');

    const notifications = await getUserNotifications(user.id, limit, unreadOnly);

    return c.json({ notifications });
  } catch (error) {
    log.error('Failed to get notifications', error as Error, { 
      userId: c.get('user')?.id 
    });
    return c.json({ error: 'Failed to load notifications' }, 500);
  }
});

// Get unread count
notificationRoutes.get('/unread-count', requireAuth, async (c) => {
  const user = c.get('user');
  const count = await getUnreadNotificationCount(user.id);

  return c.json({ count });
});

// Mark notification as read
notificationRoutes.put('/:id/read', requireAuth, async (c) => {
  const user = c.get('user');
  const notificationId = c.req.param('id');

  const updated = await markNotificationRead(notificationId, user.id);

  if (!updated) {
    return c.json({ error: 'Notification not found' }, 404);
  }

  return c.json({ notification: updated });
});

// Mark all notifications as read
notificationRoutes.put('/read-all', requireAuth, async (c) => {
  const user = c.get('user');

  await markAllNotificationsRead(user.id);

  return c.json({ success: true });
});

// Archive notification
notificationRoutes.delete('/:id', requireAuth, async (c) => {
  const user = c.get('user');
  const notificationId = c.req.param('id');

  const archived = await archiveNotification(notificationId, user.id);

  if (!archived) {
    return c.json({ error: 'Notification not found' }, 404);
  }

  return c.json({ success: true });
});

// Get notification preferences
notificationRoutes.get('/preferences', requireAuth, async (c) => {
  const user = c.get('user');
  const { db } = await import('../db');
  const { notificationPreferences } = await import('../db/schema');
  const { eq } = await import('drizzle-orm');

  const [preferences] = await db.select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, user.id))
    .limit(1);

  // Return default preferences if none exist
  if (!preferences) {
    return c.json({
      preferences: {
        emailEnabled: true,
        emailMentions: true,
        emailComments: true,
        emailTasks: true,
        emailDigest: 'daily',
        inAppMentions: true,
        inAppComments: true,
        inAppTasks: true,
        inAppDocuments: true,
        pushEnabled: false,
        soundEnabled: true
      }
    });
  }

  return c.json({ preferences });
});

// Update notification preferences
const updatePreferencesSchema = z.object({
  emailEnabled: z.boolean().optional(),
  emailMentions: z.boolean().optional(),
  emailComments: z.boolean().optional(),
  emailTasks: z.boolean().optional(),
  emailDigest: z.enum(['none', 'daily', 'weekly']).optional(),
  inAppMentions: z.boolean().optional(),
  inAppComments: z.boolean().optional(),
  inAppTasks: z.boolean().optional(),
  inAppDocuments: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  soundEnabled: z.boolean().optional()
});

notificationRoutes.put('/preferences', requireAuth, zValidator('json', updatePreferencesSchema), async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');

  const updated = await updateNotificationPreferences(user.id, body);

  return c.json({ preferences: updated });
});

// Subscribe to push notifications (for PWA)
notificationRoutes.post('/push-subscribe', requireAuth, async (c) => {
  const user = c.get('user');
  const { subscription } = await c.req.json();

  await updateNotificationPreferences(user.id, {
    pushEnabled: true,
    pushSubscription: subscription
  });

  return c.json({ success: true });
});

// Unsubscribe from push notifications
notificationRoutes.post('/push-unsubscribe', requireAuth, async (c) => {
  const user = c.get('user');

  await updateNotificationPreferences(user.id, {
    pushEnabled: false,
    pushSubscription: null
  });

  return c.json({ success: true });
});

export default notificationRoutes;