/**
 * Content Types
 * 
 * Type definitions for document content (TipTap JSON format)
 * and other content structures used throughout the application
 */

import { z } from 'zod';

/**
 * TipTap JSON Content Structure
 * Based on TipTap's JSON format for rich text documents
 */
export interface TipTapContent {
  type: string;
  content?: TipTapContent[];
  attrs?: Record<string, unknown>;
  marks?: Array<{
    type: string;
    attrs?: Record<string, unknown>;
  }>;
  text?: string;
}

/**
 * Document Content Schema (TipTap JSON)
 */
export const tipTapContentSchema: z.ZodType<TipTapContent> = z.lazy(() =>
  z.object({
    type: z.string(),
    content: z.array(tipTapContentSchema).optional(),
    attrs: z.record(z.unknown()).optional(),
    marks: z
      .array(
        z.object({
          type: z.string(),
          attrs: z.record(z.unknown()).optional(),
        })
      )
      .optional(),
    text: z.string().optional(),
  })
);

/**
 * Project Settings
 * Configuration and settings for a project
 */
export interface ProjectSettings {
  viewType?: 'list' | 'board' | 'calendar' | 'table' | 'timeline';
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filters?: Record<string, unknown>;
  columns?: Array<{
    id: string;
    name: string;
    visible: boolean;
    width?: number;
  }>;
  [key: string]: unknown; // Allow additional settings
}

export const projectSettingsSchema: z.ZodType<ProjectSettings> = z.object({
  viewType: z.enum(['list', 'board', 'calendar', 'table', 'timeline']).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  filters: z.record(z.unknown()).optional(),
  columns: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        visible: z.boolean(),
        width: z.number().optional(),
      })
    )
    .optional(),
}).passthrough(); // Allow additional properties

/**
 * Workspace Settings
 * Configuration and settings for a workspace
 */
export interface WorkspaceSettings {
  theme?: string;
  notifications?: {
    email?: boolean;
    inApp?: boolean;
    [key: string]: unknown;
  };
  features?: Record<string, boolean>;
  [key: string]: unknown; // Allow additional settings
}

export const workspaceSettingsSchema: z.ZodType<WorkspaceSettings> = z.object({
  theme: z.string().optional(),
  notifications: z
    .object({
      email: z.boolean().optional(),
      inApp: z.boolean().optional(),
    })
    .passthrough()
    .optional(),
  features: z.record(z.boolean()).optional(),
}).passthrough(); // Allow additional properties

/**
 * Template Content Structure
 * Structure for template content and properties
 */
export interface TemplateContent {
  structure?: unknown;
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

export const templateContentSchema: z.ZodType<TemplateContent> = z.object({
  structure: z.unknown().optional(),
  properties: z.record(z.unknown()).optional(),
}).passthrough();

/**
 * Template Settings
 * Settings specific to templates
 */
export interface TemplateSettings {
  category?: string;
  tags?: string[];
  [key: string]: unknown;
}

export const templateSettingsSchema: z.ZodType<TemplateSettings> = z.object({
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
}).passthrough();

