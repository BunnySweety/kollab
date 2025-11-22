/**
 * Shared TypeScript Types for Kollab Frontend
 * 
 * These types provide type safety across the frontend application
 */

// ============================================================================
// SvelteKit Page Props
// ============================================================================

/**
 * Standard SvelteKit page data prop
 * Can be extended per route if needed
 */
export interface PageData {
  [key: string]: unknown;
}

/**
 * Standard SvelteKit page params prop
 */
export interface PageParams {
  [key: string]: string | undefined;
}

// ============================================================================
// User Types
// ============================================================================

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Task Types
// ============================================================================

export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface TaskTag {
  id: string;
  name: string;
  color: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface Checklist {
  id: string;
  title: string;
  items: ChecklistItem[];
}

export interface Task {
  id: string;
  workspaceId: string;
  projectId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  assignee?: User | null;
  dueDate: string | null;
  tags: TaskTag[] | string[]; // Support both formats
  coverUrl: string | null;
  checklists: Checklist[];
  order: number;
  parentTaskId: string | null;
  templateId: string | null;
  createdBy: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Document Types
// ============================================================================

export interface Document {
  id: string;
  workspaceId: string;
  projectId: string | null;
  title: string;
  content: unknown; // TipTap/ProseMirror JSON
  coverUrl: string | null;
  isArchived: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Workspace Types
// ============================================================================

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMember {
  workspace: Workspace;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  userId: string;
  user?: User;
}

// ============================================================================
// Calendar Event Types
// ============================================================================

export interface CalendarEvent {
  id: string;
  title: string;
  date: Date | string;
  priority?: string;
  status?: string;
  type?: 'task' | 'event';
  description?: string | null;
  projectId?: string | null;
  [key: string]: unknown;
}

// ============================================================================
// Notification Types
// ============================================================================

export interface Notification {
  id: string;
  type: string;
  title: string;
  message?: string;
  actionUrl?: string;
  isRead: boolean;
  createdAt: Date | string;
  sender?: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
}

// ============================================================================
// Template Types
// ============================================================================

export interface Template {
  id: string;
  name: string;
  description: string | null;
  category: string;
  content: unknown;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Search Result Types
// ============================================================================

export interface SearchResult {
  id: string;
  type: 'document' | 'task' | 'project' | 'workspace';
  title: string;
  description?: string;
  url: string;
  highlight?: string;
}

