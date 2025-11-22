import { db } from '../db';
import { notifications, notificationPreferences, users } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { getIO } from '../websocket';
import { log } from '../lib/logger';

// Notification types
export enum NotificationType {
  MENTION = 'mention',
  COMMENT = 'comment',
  TASK_ASSIGNED = 'task-assigned',
  TASK_DUE = 'task-due',
  DOCUMENT_SHARED = 'document-shared',
  WORKSPACE_INVITE = 'workspace-invite',
  SYSTEM = 'system'
}

// Create a notification
export async function createNotification(data: {
  recipientId: string;
  senderId?: string;
  type: NotificationType;
  title: string;
  message?: string;
  actionUrl?: string;
  workspaceId?: string;
  documentId?: string;
  taskId?: string;
  commentId?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    // Check user preferences
    const preferences = await getUserNotificationPreferences(data.recipientId);

    // Check if user wants this type of notification
    if (!shouldSendNotification(data.type, preferences)) {
      return null;
    }

    // Create notification in database
    const [notification] = await db.insert(notifications)
      .values(data)
      .returning();

    if (!notification) {
      return null;
    }

    // Send real-time notification via WebSocket
    sendRealtimeNotification(notification, preferences?.soundEnabled ?? false);

    return notification;
  } catch (error) {
    log.error('Failed to create notification', error as Error, { recipientId: data.recipientId, type: data.type });
    return null;
  }
}

// Send real-time notification via WebSocket
function sendRealtimeNotification(notification: typeof notifications.$inferSelect, playSound: boolean) {
  const io = getIO();
  if (io) {
    // Send to specific user room
    io.to(`user:${notification.recipientId}`).emit('notification', {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      actionUrl: notification.actionUrl,
      createdAt: notification.createdAt,
      playSound
    });
  }
}

// Get user's notification preferences
async function getUserNotificationPreferences(userId: string) {
  const [preferences] = await db.select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);

  // Return default preferences if none exist
  if (!preferences) {
    return null;
  }

  return preferences;
}

// Check if notification should be sent based on preferences
function shouldSendNotification(type: NotificationType, preferences: typeof notificationPreferences.$inferSelect | null): boolean {
  // If no preferences, default to sending notifications
  if (!preferences) {
    return true;
  }

  switch (type) {
    case NotificationType.MENTION:
      return preferences.inAppMentions ?? true;
    case NotificationType.COMMENT:
      return preferences.inAppComments ?? true;
    case NotificationType.TASK_ASSIGNED:
    case NotificationType.TASK_DUE:
      return preferences.inAppTasks ?? true;
    case NotificationType.DOCUMENT_SHARED:
      return preferences.inAppDocuments ?? true;
    default:
      return true;
  }
}

// Get notifications for a user
export async function getUserNotifications(userId: string, limit = 50, onlyUnread = false) {
  try {
    // Build where conditions
    const conditions = [
      eq(notifications.recipientId, userId),
      eq(notifications.isArchived, false)
    ];
    
    if (onlyUnread) {
      conditions.push(eq(notifications.isRead, false));
    }

    const query = db.select({
      notification: notifications,
      sender: users
    })
      .from(notifications)
      .leftJoin(users, eq(notifications.senderId, users.id))
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);

    const results = await query;

    return results.map(r => ({
      ...r.notification,
      sender: r.sender ? {
        id: r.sender.id,
        name: r.sender.name,
        avatarUrl: r.sender.avatarUrl
      } : null
    }));
  } catch (error) {
    log.error('Failed to get user notifications', error as Error, { userId, limit, onlyUnread });
    throw error;
  }
}

// Mark notification as read
export async function markNotificationRead(notificationId: string, userId: string) {
  const [updated] = await db.update(notifications)
    .set({
      isRead: true,
      readAt: new Date()
    })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.recipientId, userId)
      )
    )
    .returning();

  // Send update via WebSocket
  const io = getIO();
  if (io && updated) {
    io.to(`user:${userId}`).emit('notification-read', {
      notificationId: notificationId
    });
  }

  return updated;
}

// Mark all notifications as read
export async function markAllNotificationsRead(userId: string) {
  await db.update(notifications)
    .set({
      isRead: true,
      readAt: new Date()
    })
    .where(
      and(
        eq(notifications.recipientId, userId),
        eq(notifications.isRead, false)
      )
    );

  // Send update via WebSocket
  const io = getIO();
  if (io) {
    io.to(`user:${userId}`).emit('all-notifications-read');
  }
}

// Archive notification
export async function archiveNotification(notificationId: string, userId: string) {
  const [updated] = await db.update(notifications)
    .set({
      isArchived: true
    })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.recipientId, userId)
      )
    )
    .returning();

  return updated;
}

// Get unread notification count
export async function getUnreadNotificationCount(userId: string) {
  const result = await db.select({ count: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.recipientId, userId),
        eq(notifications.isRead, false),
        eq(notifications.isArchived, false)
      )
    );

  return result.length;
}

// Update user notification preferences
export async function updateNotificationPreferences(userId: string, preferences: Partial<typeof notificationPreferences.$inferInsert>) {
  // Check if preferences exist
  const existing = await db.select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    // Update existing preferences
    const [updated] = await db.update(notificationPreferences)
      .set({
        ...preferences,
        updatedAt: new Date()
      })
      .where(eq(notificationPreferences.userId, userId))
      .returning();

    return updated;
  } else {
    // Create new preferences
    const [created] = await db.insert(notificationPreferences)
      .values({
        userId,
        ...preferences
      })
      .returning();

    return created;
  }
}

// Helper function to create mention notifications
export async function createMentionNotification(
  mentionedUserId: string,
  mentionerId: string,
  documentId: string,
  documentTitle: string,
  workspaceId: string
) {
  const [mentioner] = await db.select()
    .from(users)
    .where(eq(users.id, mentionerId))
    .limit(1);

  if (!mentioner) {
    return;
  }

  await createNotification({
    recipientId: mentionedUserId,
    senderId: mentionerId,
    type: NotificationType.MENTION,
    title: `${mentioner.name} mentioned you`,
    message: `You were mentioned in "${documentTitle}"`,
    actionUrl: `/workspace/document/${documentId}`,
    workspaceId,
    documentId
  });
}

// Helper function to create task assignment notification
export async function createTaskAssignmentNotification(
  assigneeId: string,
  assignerId: string,
  taskId: string,
  taskTitle: string,
  workspaceId: string
) {
  const [assigner] = await db.select()
    .from(users)
    .where(eq(users.id, assignerId))
    .limit(1);

  if (!assigner) {
    return;
  }

  await createNotification({
    recipientId: assigneeId,
    senderId: assignerId,
    type: NotificationType.TASK_ASSIGNED,
    title: `Task assigned to you`,
    message: `${assigner.name} assigned you "${taskTitle}"`,
    actionUrl: `/workspace/task/${taskId}`,
    workspaceId,
    taskId
  });
}

// Helper function to create comment notification
export async function createCommentNotification(
  documentOwnerId: string,
  commenterId: string,
  documentId: string,
  documentTitle: string,
  commentSnippet: string,
  workspaceId: string
) {
  const [commenter] = await db.select()
    .from(users)
    .where(eq(users.id, commenterId))
    .limit(1);

  if (!commenter) {
    return;
  }

  await createNotification({
    recipientId: documentOwnerId,
    senderId: commenterId,
    type: NotificationType.COMMENT,
    title: `New comment on "${documentTitle}"`,
    message: `${commenter.name}: ${commentSnippet.substring(0, 100)}...`,
    actionUrl: `/workspace/document/${documentId}`,
    workspaceId,
    documentId
  });
}