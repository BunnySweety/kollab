/**
 * Shared Types
 * 
 * Types partagés entre l'API et le frontend pour garantir la cohérence
 */

/**
 * Base entity with common fields
 */
export interface BaseEntity {
  id: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/**
 * User type
 */
export interface User extends BaseEntity {
  email: string;
  name: string;
  avatarUrl?: string | null;
  emailVerified: boolean;
}

/**
 * Workspace type
 */
export interface Workspace extends BaseEntity {
  name: string;
  slug: string;
  description?: string | null;
  logoUrl?: string | null;
  settings?: Record<string, unknown>;
  createdBy: string;
}

/**
 * Workspace member role
 */
export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer';

/**
 * Workspace member
 */
export interface WorkspaceMember {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  joinedAt: Date | string;
}

/**
 * Document type
 */
export interface Document extends BaseEntity {
  workspaceId: string;
  parentId?: string | null;
  title: string;
  icon?: string | null;
  coverUrl?: string | null;
  content?: unknown;
  isArchived: boolean;
  isPublished: boolean;
  publishedSlug?: string | null;
  order: number;
  createdBy: string;
  lastEditedBy?: string | null;
}

/**
 * Task status
 */
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled';

/**
 * Task priority
 */
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

/**
 * Task type
 */
export interface Task extends BaseEntity {
  workspaceId: string;
  projectId?: string | null;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId?: string | null;
  dueDate?: Date | string | null;
  tags?: unknown;
  coverUrl?: string | null;
  checklists?: unknown;
  order: number;
  parentTaskId?: string | null;
  templateId?: string | null;
  createdBy: string;
  completedAt?: Date | string | null;
}

/**
 * Project type
 */
export interface Project extends BaseEntity {
  workspaceId: string;
  userId?: string | null;
  name: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  viewType: 'list' | 'board' | 'calendar' | 'table' | 'timeline';
  settings?: Record<string, unknown>;
  isArchived: boolean;
  createdBy: string;
}

/**
 * Team type
 */
export interface Team extends BaseEntity {
  workspaceId: string;
  name: string;
  description?: string | null;
  color?: string | null;
  createdBy: string;
}

/**
 * Team member role
 */
export type TeamRole = 'leader' | 'member';

/**
 * Team member
 */
export interface TeamMember {
  teamId: string;
  userId: string;
  role: TeamRole;
  joinedAt: Date | string;
}

/**
 * Pagination response
 */
export interface PaginationResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

/**
 * Cursor pagination response
 */
export interface CursorPaginationResponse<T> {
  items: T[];
  nextCursor?: string;
  prevCursor?: string;
  hasMore: boolean;
}

/**
 * API Error response
 */
export interface ApiError {
  error: string;
  code: string;
  status: number;
  details?: Record<string, unknown>;
}

