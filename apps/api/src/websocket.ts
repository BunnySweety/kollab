import { createServer, STATUS_CODES } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
// Import Yjs from singleton to ensure single instance
// This must be imported before y-websocket to prevent double import warning
import * as Y from './lib/yjs-singleton';
import { setupWSConnection } from 'y-websocket/bin/utils';
import { lucia } from './lib/auth';
import { db } from './db';
import { documents, users } from './db/schema';
import { eq } from 'drizzle-orm';
import { checkWorkspaceMembership } from './lib/workspace-helpers';
import { log } from './lib/logger';
import type {
  SelectionUpdateData,
  TaskUpdateData,
  NotificationData,
  CommentData
} from './types';

interface CollaborationRoom {
  doc: Y.Doc;
  users: Map<string, UserInfo>;
  awareness: Map<string, unknown>;
  lastActivity: number;
}

interface UserInfo {
  id: string;
  name: string;
  color: string;
  cursor?: { from: number; to: number };
}

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userName?: string;
  userAvatar?: string | null;
  presenceWorkspaces?: Set<string>;
}

interface WorkspacePresenceMember {
  socketId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  lastSeen: number;
}

interface WorkspacePresenceRoom {
  members: Map<string, WorkspacePresenceMember>;
  updatedAt: number;
}

const rooms = new Map<string, CollaborationRoom>();
const workspacePresenceRooms = new Map<string, WorkspacePresenceRoom>();
let io: SocketIOServer | null = null;

function getWorkspacePresenceMembers(workspaceId: string) {
  const room = workspacePresenceRooms.get(workspaceId);
  if (!room) {
    return [];
  }

  return Array.from(room.members.values()).map((member) => ({
    userId: member.userId,
    name: member.name,
    avatarUrl: member.avatarUrl,
    role: member.role,
    lastActivity: new Date(member.lastSeen).toISOString()
  }));
}

function broadcastWorkspacePresence(workspaceId: string) {
  if (!io) {
    return;
  }

  const members = getWorkspacePresenceMembers(workspaceId);
  io.to(`workspace:${workspaceId}:presence`).emit('workspace-presence-update', {
    workspaceId,
    members
  });
}

function removeSocketFromWorkspacePresence(socketId: string, workspaceId: string) {
  const room = workspacePresenceRooms.get(workspaceId);
  if (!room) {
    return;
  }

  room.members.delete(socketId);
  room.updatedAt = Date.now();

  if (room.members.size === 0) {
    workspacePresenceRooms.delete(workspaceId);
  }

  broadcastWorkspacePresence(workspaceId);
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(';').reduce<Record<string, string>>((acc, part) => {
    const [key, ...valueParts] = part.trim().split('=');
    if (key) {
      acc[key] = decodeURIComponent(valueParts.join('='));
    }
    return acc;
  }, {});
}

function rejectUpgrade(socket: import('net').Socket, statusCode: number, message: string) {
  const reason = STATUS_CODES[statusCode] || 'Error';
  const body = JSON.stringify({ error: message });
  socket.write(
    `HTTP/1.1 ${statusCode} ${reason}\r\n` +
    'Connection: close\r\n' +
    'Content-Type: application/json\r\n' +
    `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n` +
    body
  );
  socket.destroy();
}

export function getIO() {
  return io;
}

export function createWebSocketServer(port: number = 3001) {
  const server = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end('WebSocket server is running');
  });

  io = new SocketIOServer(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true
    }
  });

  // Yjs WebSocket handling
  server.on('upgrade', async (request, socket) => {
    const docName = request.url?.slice(1);

    if (!docName || !docName.startsWith('document-')) {
      socket.destroy();
      return;
    }

    try {
      const documentId = docName.replace('document-', '');
      const cookies = parseCookies(request.headers.cookie);
      const sessionId = cookies.session;

      if (!sessionId) {
        rejectUpgrade(socket, 401, 'Unauthorized');
        return;
      }

      const { session, user } = await lucia.validateSession(sessionId);
      if (!session || !user) {
        rejectUpgrade(socket, 401, 'Invalid session');
        return;
      }

      const [document] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
      if (!document) {
        rejectUpgrade(socket, 404, 'Document not found');
        return;
      }

      const membership = await checkWorkspaceMembership(document.workspaceId, user.id);
      if (!membership) {
        rejectUpgrade(socket, 403, 'Access denied');
        return;
      }

      // Attach user context for downstream auditing (optional)
      (request as Record<string, unknown>).userId = user.id;
      (request as Record<string, unknown>).workspaceId = document.workspaceId;

      setupWSConnection(socket, request, docName);
      log.info('Authorized Yjs connection established', { userId: user.id, documentId });
    } catch (error) {
      log.error('Failed to authorize Yjs connection', error as Error);
      rejectUpgrade(socket, 500, 'Internal Server Error');
    }
  });

  // Socket.io for general real-time features
  io.on('connection', async (socket: AuthenticatedSocket) => {
    log.info('New WebSocket client connected', { socketId: socket.id });

    // SECURITY: Authenticate user via session cookie
    socket.on('authenticate', async (data?: { sessionId?: string; userId?: string }) => {
      try {
        // Extract session ID from cookie if not provided
        let sessionId = data?.sessionId;

        if (!sessionId) {
          // Try to get session from cookie
          const cookies = socket.handshake.headers.cookie;
          if (cookies) {
            const sessionCookie = cookies.split(';')
              .find(c => c.trim().startsWith('session='));

            if (sessionCookie) {
              sessionId = sessionCookie.split('=')[1];
            }
          }
        }

        if (!sessionId) {
          socket.emit('auth-error', { error: 'No session found' });
          socket.disconnect();
          return;
        }

        // Validate session
        const { session, user } = await lucia.validateSession(sessionId);

        if (!session || !user) {
          socket.emit('auth-error', { error: 'Invalid session' });
          socket.disconnect();
          return;
        }

        // Get full user data from database to access name
        const [userData] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
        const userName = userData?.name || user.email || 'Unknown';
        const userAvatar = userData?.avatarUrl || null;

        // Store authenticated user info in socket
        socket.userId = user.id;
        socket.userName = userName;
        socket.userAvatar = userAvatar;
        socket.presenceWorkspaces = socket.presenceWorkspaces || new Set<string>();

        // Join user-specific room for notifications
        socket.join(`user:${user.id}`);

        socket.emit('authenticated', { userId: user.id, userName });
        log.info('User authenticated for WebSocket notifications', { userId: user.id, userName });
      } catch (error) {
        log.error('WebSocket authentication error', error as Error, { socketId: socket.id });
        socket.emit('auth-error', { error: 'Authentication failed' });
        socket.disconnect();
      }
    });

    // Join a document room
    socket.on('join-document', async (data: { documentId: string; user: UserInfo }) => {
      // SECURITY: Verify user is authenticated
      if (!socket.userId) {
        socket.emit('error', { error: 'Not authenticated. Please authenticate first.' });
        return;
      }

      // SECURITY: Verify user matches authenticated user
      if (data.user.id !== socket.userId) {
        socket.emit('error', { error: 'User ID mismatch. Authentication required.' });
        socket.disconnect();
        return;
      }

      try {
        // SECURITY: Verify document exists and get workspace ID
        const [document] = await db.select()
          .from(documents)
          .where(eq(documents.id, data.documentId))
          .limit(1);

        if (!document) {
          socket.emit('error', { error: 'Document not found' });
          return;
        }

        // SECURITY: Verify user has access to workspace
        const membership = await checkWorkspaceMembership(document.workspaceId, socket.userId);
        if (!membership) {
          socket.emit('error', { error: 'Access denied: You do not have access to this document' });
          return;
        }

        const roomId = `document-${data.documentId}`;
        socket.join(roomId);

        // Initialize room if it doesn't exist
        if (!rooms.has(roomId)) {
          rooms.set(roomId, {
            doc: new Y.Doc(),
            users: new Map(),
            awareness: new Map(),
            lastActivity: Date.now()
          });
        }

        const room = rooms.get(roomId)!;
        room.users.set(socket.id, data.user);
        room.lastActivity = Date.now();

        // Notify others in the room
        socket.to(roomId).emit('user-joined', {
          user: data.user,
          users: Array.from(room.users.values())
        });

        // Send current users to the new user
        socket.emit('room-users', {
          users: Array.from(room.users.values())
        });

        log.info('User joined document room', { userName: data.user.name, documentId: data.documentId });
      } catch (error) {
        log.error('Error joining document room', error as Error, { documentId: data.documentId });
        socket.emit('error', { error: 'Failed to join document' });
      }
    });

    // Leave a document room
    socket.on('leave-document', (data: { documentId: string }) => {
      const roomId = `document-${data.documentId}`;
      socket.leave(roomId);

      const room = rooms.get(roomId);
      if (room) {
        const user = room.users.get(socket.id);
        room.users.delete(socket.id);

        // Notify others
        socket.to(roomId).emit('user-left', {
          userId: socket.id,
          user,
          users: Array.from(room.users.values())
        });

        // Clean up empty rooms and destroy Y.Doc to prevent memory leak
        if (room.users.size === 0) {
          room.doc.destroy();
          rooms.delete(roomId);
          log.debug('Cleaned up empty WebSocket room', { roomId });
        }
      }
    });

    // Cursor position updates
    socket.on('cursor-update', (data: { documentId: string; cursor: { from: number; to: number } }) => {
      const roomId = `document-${data.documentId}`;
      const room = rooms.get(roomId);

      if (room) {
        const user = room.users.get(socket.id);
        if (user) {
          user.cursor = data.cursor;

          // Broadcast to others in the room
          socket.to(roomId).emit('cursor-updated', {
            userId: socket.id,
            user,
            cursor: data.cursor
          });
        }
      }
    });

    // Selection updates
    socket.on('selection-update', (data: SelectionUpdateData) => {
      const roomId = `document-${data.documentId}`;

      socket.to(roomId).emit('selection-updated', {
        userId: socket.id,
        selection: data.selection
      });
    });

    // Task updates
    socket.on('task-update', (data: TaskUpdateData) => {
      const roomId = `workspace-${data.workspaceId}`;

      // Broadcast to all users in the workspace
      socket.to(roomId).emit('task-updated', {
        task: data.task,
        action: data.action,
        userId: socket.id
      });
    });

    // Notifications
    socket.on('send-notification', (data: NotificationData) => {
      // Send to specific user
      if (io) {
        io.to(data.userId).emit('notification', data.notification);
      }
    });

    // Comments
    socket.on('comment-add', (data: CommentData) => {
      const roomId = `document-${data.documentId}`;

      // Broadcast to all users in the document
      socket.to(roomId).emit('comment-added', {
        comment: data.comment,
        userId: socket.id
      });
    });

    // Workspace presence tracking
    socket.on('join-workspace-presence', async (data: { workspaceId: string }) => {
      if (!socket.userId) {
        socket.emit('workspace-presence-error', { error: 'Authentication required' });
        return;
      }

      try {
        const membership = await checkWorkspaceMembership(data.workspaceId, socket.userId);
        if (!membership) {
          socket.emit('workspace-presence-error', { error: 'Access denied' });
          return;
        }

        const roomKey = `workspace:${data.workspaceId}:presence`;
        socket.join(roomKey);

        if (!socket.presenceWorkspaces) {
          socket.presenceWorkspaces = new Set<string>();
        }
        socket.presenceWorkspaces.add(data.workspaceId);

        const presenceRoom = workspacePresenceRooms.get(data.workspaceId) || {
          members: new Map<string, WorkspacePresenceMember>(),
          updatedAt: Date.now()
        };

        presenceRoom.members.set(socket.id, {
          socketId: socket.id,
          userId: socket.userId,
          name: socket.userName || 'Unknown',
          avatarUrl: socket.userAvatar || null,
          role: membership.role,
          lastSeen: Date.now()
        });
        presenceRoom.updatedAt = Date.now();

        workspacePresenceRooms.set(data.workspaceId, presenceRoom);

        // Emit snapshot to the joining user first
        socket.emit('workspace-presence-update', {
          workspaceId: data.workspaceId,
          members: getWorkspacePresenceMembers(data.workspaceId)
        });

        // Broadcast update to others
        broadcastWorkspacePresence(data.workspaceId);
        log.info('User joined workspace presence', { userId: socket.userId, workspaceId: data.workspaceId });
      } catch (error) {
        log.error('Failed to join workspace presence', error as Error, { workspaceId: data.workspaceId, userId: socket.userId });
        socket.emit('workspace-presence-error', { error: 'Unable to join workspace presence' });
      }
    });

    socket.on('leave-workspace-presence', (data: { workspaceId: string }) => {
      if (!socket.userId) {
        return;
      }

      socket.leave(`workspace:${data.workspaceId}:presence`);
      socket.presenceWorkspaces?.delete(data.workspaceId);
      removeSocketFromWorkspacePresence(socket.id, data.workspaceId);
      log.debug('User left workspace presence', { userId: socket.userId, workspaceId: data.workspaceId });
    });

    // Typing indicators
    socket.on('typing-start', (data: { documentId: string }) => {
      const roomId = `document-${data.documentId}`;
      const room = rooms.get(roomId);

      if (room) {
        const user = room.users.get(socket.id);
        if (user) {
          socket.to(roomId).emit('user-typing', {
            userId: socket.id,
            user,
            isTyping: true
          });
        }
      }
    });

    socket.on('typing-stop', (data: { documentId: string }) => {
      const roomId = `document-${data.documentId}`;
      const room = rooms.get(roomId);

      if (room) {
        const user = room.users.get(socket.id);
        if (user) {
          socket.to(roomId).emit('user-typing', {
            userId: socket.id,
            user,
            isTyping: false
          });
        }
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      log.info('WebSocket client disconnected', { socketId: socket.id });

      if (socket.presenceWorkspaces && socket.presenceWorkspaces.size > 0) {
        socket.presenceWorkspaces.forEach((workspaceId) => {
          removeSocketFromWorkspacePresence(socket.id, workspaceId);
        });
        socket.presenceWorkspaces.clear();
      }

      // Clean up user from all rooms
      rooms.forEach((room, roomId) => {
        if (room.users.has(socket.id)) {
          const user = room.users.get(socket.id);
          room.users.delete(socket.id);

          // Notify others
          if (io) {
            io.to(roomId).emit('user-left', {
              userId: socket.id,
              user,
              users: Array.from(room.users.values())
            });
          }

          // Clean up empty rooms and destroy Y.Doc to prevent memory leak
          if (room.users.size === 0) {
            room.doc.destroy();
            rooms.delete(roomId);
            log.debug('Cleaned up empty WebSocket room after disconnect', { roomId });
          }
        }
      });
    });
  });

  // MEMORY LEAK FIX: Clean up inactive rooms periodically
  const roomCleanupInterval = setInterval(() => {
    const now = Date.now();
    const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes

    rooms.forEach((room, roomId) => {
      // Clean up rooms that are empty and have been inactive for 5 minutes
      if (room.users.size === 0 && now - room.lastActivity > INACTIVITY_TIMEOUT) {
        room.doc.destroy();
        rooms.delete(roomId);
        log.info('Cleaned up inactive WebSocket room', { roomId, inactiveMinutes: INACTIVITY_TIMEOUT / (1000 * 60) });
      }
    });
  }, 60 * 1000); // Check every minute

  // Clean up interval on server close
  server.on('close', () => {
    clearInterval(roomCleanupInterval);
    // Clean up all rooms
    rooms.forEach((room, roomId) => {
      room.doc.destroy();
      rooms.delete(roomId);
    });
  });

  server.listen(port, () => {
    log.info('WebSocket server started', { port, url: `ws://localhost:${port}` });
    log.debug(`
Listening on port ${port}
WebSocket: ws://localhost:${port}
Socket.IO: http://localhost:${port}
    `);
  });

  return { server, io };
}