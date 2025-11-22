/**
 * Shared TypeScript Types for Kollab API
 * 
 * These types provide type safety across the application
 * and are inferred from the database schema when possible.
 */

import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type { 
  users, 
  workspaces, 
  documents, 
  projects, 
  tasks, 
  comments,
  notifications 
} from '../db/schema';

// ============================================================================
// Database Model Types (Inferred from Drizzle Schema)
// ============================================================================

export type User = InferSelectModel<typeof users>;
export type InsertUser = InferInsertModel<typeof users>;

export type Workspace = InferSelectModel<typeof workspaces>;
export type InsertWorkspace = InferInsertModel<typeof workspaces>;

export type Document = InferSelectModel<typeof documents>;
export type InsertDocument = InferInsertModel<typeof documents>;

export type Project = InferSelectModel<typeof projects>;
export type InsertProject = InferInsertModel<typeof projects>;

export type Task = InferSelectModel<typeof tasks>;
export type InsertTask = InferInsertModel<typeof tasks>;

export type Comment = InferSelectModel<typeof comments>;
export type InsertComment = InferInsertModel<typeof comments>;

export type Notification = InferSelectModel<typeof notifications>;
export type InsertNotification = InferInsertModel<typeof notifications>;

// ============================================================================
// WebSocket Event Types
// ============================================================================

export interface CursorPosition {
  from: number;
  to: number;
}

export interface Selection {
  anchor: number;
  head: number;
  ranges?: Array<{ from: number; to: number }>;
}

export interface WebSocketUser {
  id: string;
  name: string;
  email: string;
  color: string;
  cursor?: CursorPosition;
}

export interface DocumentJoinData {
  documentId: string;
  user: WebSocketUser;
}

export interface SelectionUpdateData {
  documentId: string;
  selection: Selection;
}

export interface TaskUpdateData {
  workspaceId: string;
  task: Partial<Task>;
  action: 'create' | 'update' | 'delete' | 'complete';
}

export interface NotificationData {
  userId: string;
  notification: Partial<Notification>;
}

export interface CommentData {
  documentId: string;
  comment: Partial<Comment>;
}

// ============================================================================
// Search Index Types
// ============================================================================

export interface SearchDocument {
  id: string;
  title: string;
  content?: string;
  workspaceId: string;
  parentId?: string | null;
  icon?: string | null;
  isArchived: boolean;
  isPublished: boolean;
  updatedAt: Date;
}

export interface SearchTask {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  dueDate?: Date;
  tags?: string[];
  workspaceId: string;
  updatedAt: Date;
}

export interface SearchWorkspace {
  id: string;
  name: string;
  description?: string;
  slug: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WikiComment {
  id: string;
  pageId: string;
  content: string;
  isResolved: boolean;
  createdAt: Date;
  updatedAt: Date;
  author: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiError {
  error: string;
  message?: string;
  code?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

// ============================================================================
// Cache Types
// ============================================================================

export type CacheKey = string;
export type CacheTTL = number;

export interface CacheOptions {
  ttl?: CacheTTL;
  namespace?: string;
}

// ============================================================================
// Logger Types
// ============================================================================

export interface LogContext {
  [key: string]: string | number | boolean | null | undefined;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

