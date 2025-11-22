import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import io, { Socket } from 'socket.io-client';
import { api, endpoints } from '$lib/api-client';
import { log } from '$lib/logger';

export interface Notification {
  id: string;
  type: string;
  title: string;
  message?: string;
  actionUrl?: string;
  isRead: boolean;
  createdAt: Date;
  sender?: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
}

interface NotificationStore {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  connected: boolean;
}

function createNotificationStore() {
  const { subscribe, set, update } = writable<NotificationStore>({
    notifications: [],
    unreadCount: 0,
    loading: false,
    connected: false
  });

  let socket: Socket | null = null;

  return {
    subscribe,

    // Initialize WebSocket connection
    connect: (userId: string) => {
      if (!browser || socket?.connected) return;

      socket = io('http://localhost:3001', {
        withCredentials: true
      });

      socket.on('connect', () => {
        console.log('Connected to notification server');
        update(s => ({ ...s, connected: true }));

        // Authenticate user for notifications
        socket?.emit('authenticate', { userId });
      });

      socket.on('disconnect', () => {
        console.log('Disconnected from notification server');
        update(s => ({ ...s, connected: false }));
      });

      // Handle new notifications
      socket.on('notification', (notification: Notification) => {
        update(s => {
          // Add to notifications list
          const notifications = [notification, ...s.notifications];

          // Play sound if enabled
          if ((notification as { playSound?: boolean }).playSound && browser) {
            playNotificationSound();
          }

          // Show browser notification if permitted
          if (browser && Notification.permission === 'granted') {
            showBrowserNotification(notification);
          }

          return {
            ...s,
            notifications,
            unreadCount: s.unreadCount + 1
          };
        });
      });

      // Handle notification read
      socket.on('notification-read', (data: { notificationId: string }) => {
        update(s => ({
          ...s,
          notifications: s.notifications.map(n =>
            n.id === data.notificationId ? { ...n, isRead: true } : n
          ),
          unreadCount: Math.max(0, s.unreadCount - 1)
        }));
      });

      // Handle all notifications read
      socket.on('all-notifications-read', () => {
        update(s => ({
          ...s,
          notifications: s.notifications.map(n => ({ ...n, isRead: true })),
          unreadCount: 0
        }));
      });
    },

    // Disconnect from WebSocket
    disconnect: () => {
      socket?.disconnect();
      socket = null;
      update(s => ({ ...s, connected: false }));
    },

    // Load notifications from API
    loadNotifications: async () => {
      update(s => ({ ...s, loading: true }));

      try {
        const data = await api.get<{ notifications: Notification[] }>(endpoints.notifications.list);
        update(s => ({
          ...s,
          notifications: data.notifications,
          loading: false
        }));

        // Load unread count
        const countData = await api.get<{ count: number }>('/api/notifications/unread-count');
        update(s => ({ ...s, unreadCount: countData.count }));
      } catch (error) {
        log.error('Failed to load notifications', error instanceof Error ? error : new Error(String(error)));
        update(s => ({ ...s, loading: false }));
      }
    },

    // Mark notification as read
    markAsRead: async (notificationId: string) => {
      try {
        await api.put(`/api/notifications/${notificationId}/read`);

        update(s => ({
          ...s,
          notifications: s.notifications.map(n =>
            n.id === notificationId ? { ...n, isRead: true } : n
          ),
          unreadCount: Math.max(0, s.unreadCount - 1)
        }));
      } catch (error) {
        log.error('Failed to mark notification as read', error instanceof Error ? error : new Error(String(error)), { notificationId });
      }
    },

    // Mark all as read
    markAllAsRead: async () => {
      try {
        await api.put(endpoints.notifications.markAllRead);

        update(s => ({
          ...s,
          notifications: s.notifications.map(n => ({ ...n, isRead: true })),
          unreadCount: 0
        }));
      } catch (error) {
        log.error('Failed to mark all as read', error instanceof Error ? error : new Error(String(error)));
      }
    },

    // Archive notification
    archive: async (notificationId: string) => {
      try {
        await api.delete(endpoints.notifications.delete(notificationId));

        update(s => ({
          ...s,
          notifications: s.notifications.filter(n => n.id !== notificationId),
          unreadCount: s.notifications.find(n => n.id === notificationId && !n.isRead)
            ? Math.max(0, s.unreadCount - 1)
            : s.unreadCount
        }));
      } catch (error) {
        log.error('Failed to archive notification', error instanceof Error ? error : new Error(String(error)), { notificationId });
      }
    },

    // Request browser notification permission
    requestPermission: async () => {
      if (!browser || !('Notification' in window)) return false;

      // Check current permission status
      if (Notification.permission === 'granted') {
        return true;
      }

      // If permission was denied, don't request again (to avoid the warning)
      if (Notification.permission === 'denied') {
        return false;
      }

      // Only request if permission is 'default' (not yet asked)
      try {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
      } catch (error) {
        console.warn('Failed to request notification permission:', error);
        return false;
      }
    },

    // Get current notification permission status
    getPermissionStatus: () => {
      if (!browser || !('Notification' in window)) return 'unsupported';
      return Notification.permission;
    }
  };
}

// Play notification sound
function playNotificationSound() {
  const audio = new Audio('/notification.mp3');
  audio.volume = 0.5;
  audio.play().catch((error) => {
    log.error('Failed to play notification sound', error instanceof Error ? error : new Error(String(error)));
  });
}

// Show browser notification
function showBrowserNotification(notification: Notification) {
  if (!browser || Notification.permission !== 'granted') return;

  const browserNotification = new Notification(notification.title, {
    body: notification.message || '',
    icon: '/favicon.png',
    tag: notification.id,
    requireInteraction: false
  });

  browserNotification.onclick = () => {
    window.focus();
    if (notification.actionUrl) {
      window.location.href = notification.actionUrl;
    }
    browserNotification.close();
  };

  // Auto close after 5 seconds
  setTimeout(() => browserNotification.close(), 5000);
}

export const notificationStore = createNotificationStore();

// Derived store for unread notifications
export const unreadNotifications = derived(
  notificationStore,
  $store => $store.notifications.filter(n => !n.isRead)
);