import { pgTable, text, timestamp, uuid, boolean, jsonb, integer, index, primaryKey, varchar, numeric } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Users table
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').unique().notNull(),
  hashedPassword: text('hashed_password'),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  emailVerified: boolean('email_verified').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  emailIdx: index('users_email_idx').on(table.email),
}));

// Sessions table for authentication
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
}, (table) => ({
  userIdx: index('sessions_user_idx').on(table.userId),
}));

// Workspaces table
export const workspaces = pgTable('workspaces', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').unique().notNull(),
  description: text('description'),
  logoUrl: text('logo_url'),
  settings: jsonb('settings').default({}),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  slugIdx: index('workspaces_slug_idx').on(table.slug),
  createdByIdx: index('workspaces_created_by_idx').on(table.createdBy),
}));

// Workspace members
export const workspaceMembers = pgTable('workspace_members', {
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  role: text('role', { enum: ['owner', 'admin', 'editor', 'viewer'] }).notNull(),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.workspaceId, table.userId] }),
  userIdx: index('workspace_members_user_idx').on(table.userId),
  workspaceIdx: index('workspace_members_workspace_idx').on(table.workspaceId),
  // PERFORMANCE: Composite index for frequent lookups
  workspaceUserIdx: index('workspace_members_workspace_user_idx').on(table.workspaceId, table.userId),
}));

// Documents table
export const documents = pgTable('documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }).notNull(),
  parentId: uuid('parent_id').references(() => documents.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  icon: text('icon'),
  coverUrl: text('cover_url'),
  content: jsonb('content'), // TipTap JSON content
  isArchived: boolean('is_archived').default(false),
  isPublished: boolean('is_published').default(false),
  publishedSlug: text('published_slug').unique(),
  order: integer('order').default(0),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  lastEditedBy: uuid('last_edited_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  workspaceIdx: index('documents_workspace_idx').on(table.workspaceId),
  parentIdx: index('documents_parent_idx').on(table.parentId),
  publishedSlugIdx: index('documents_published_slug_idx').on(table.publishedSlug),
  archivedIdx: index('documents_archived_idx').on(table.isArchived),
}));

// Document versions for history
export const documentVersions = pgTable('document_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'cascade' }).notNull(),
  content: jsonb('content').notNull(),
  versionNumber: integer('version_number').notNull(),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  documentIdx: index('document_versions_document_idx').on(table.documentId),
  versionIdx: index('document_versions_version_idx').on(table.documentId, table.versionNumber),
}));

// Tasks table
export const tasks = pgTable('tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }).notNull(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status', { enum: ['todo', 'in_progress', 'done', 'cancelled'] }).default('todo'),
  priority: text('priority', { enum: ['low', 'medium', 'high', 'urgent'] }).default('medium'),
  assigneeId: uuid('assignee_id').references(() => users.id),
  dueDate: timestamp('due_date'),
  tags: jsonb('tags').default([]), // Legacy: simple string array, use taskTags table for colored tags
  coverUrl: text('cover_url'), // Cover image URL
  checklists: jsonb('checklists').default([]), // Array of { id: string, title: string, items: Array<{ id: string, text: string, completed: boolean }> }
  order: integer('order').default(0),
  parentTaskId: uuid('parent_task_id').references(() => tasks.id, { onDelete: 'cascade' }),
  templateId: uuid('template_id').references(() => taskTemplates.id, { onDelete: 'set null' }), // Template used to create this task
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  workspaceIdx: index('tasks_workspace_idx').on(table.workspaceId),
  projectIdx: index('tasks_project_idx').on(table.projectId),
  assigneeIdx: index('tasks_assignee_idx').on(table.assigneeId),
  statusIdx: index('tasks_status_idx').on(table.status),
  parentIdx: index('tasks_parent_idx').on(table.parentTaskId),
  templateIdx: index('tasks_template_idx').on(table.templateId),
  // PERFORMANCE: Composite indexes for common queries
  workspaceStatusIdx: index('tasks_workspace_status_idx').on(table.workspaceId, table.status),
  projectStatusIdx: index('tasks_project_status_idx').on(table.projectId, table.status),
}));

// Task templates table
export const taskTemplates = pgTable('task_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  title: text('title'), // Default title for tasks created from this template
  descriptionTemplate: text('description_template'), // Default description template
  priority: text('priority', { enum: ['low', 'medium', 'high', 'urgent'] }).default('medium'),
  status: text('status', { enum: ['todo', 'in_progress', 'done', 'cancelled'] }).default('todo'),
  checklists: jsonb('checklists').default([]), // Default checklists structure
  coverUrl: text('cover_url'), // Default cover image
  icon: text('icon'), // Template icon
  isPublic: boolean('is_public').default(false),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  workspaceIdx: index('task_templates_workspace_idx').on(table.workspaceId),
  createdByIdx: index('task_templates_created_by_idx').on(table.createdBy),
}));

// Task attachments table
export const taskAttachments = pgTable('task_attachments', {
  id: uuid('id').defaultRandom().primaryKey(),
  taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }).notNull(),
  fileName: text('file_name').notNull(),
  fileUrl: text('file_url').notNull(),
  fileSize: integer('file_size'), // Size in bytes
  mimeType: text('mime_type'),
  uploadedBy: uuid('uploaded_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  taskIdx: index('task_attachments_task_idx').on(table.taskId),
  uploadedByIdx: index('task_attachments_uploaded_by_idx').on(table.uploadedBy),
}));

// Task tags table (with custom colors)
export const taskTags = pgTable('task_tags', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  color: text('color').notNull(), // Hex color code or Tailwind color class
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  workspaceIdx: index('task_tags_workspace_idx').on(table.workspaceId),
  nameIdx: index('task_tags_name_idx').on(table.name),
  workspaceNameIdx: index('task_tags_workspace_name_idx').on(table.workspaceId, table.name), // Unique name per workspace
}));

// Task-Tag junction table (many-to-many relationship)
export const taskTagRelations = pgTable('task_tag_relations', {
  taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }).notNull(),
  tagId: uuid('tag_id').references(() => taskTags.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.taskId, table.tagId] }),
  taskIdx: index('task_tag_relations_task_idx').on(table.taskId),
  tagIdx: index('task_tag_relations_tag_idx').on(table.tagId),
}));

// Events table
export const events = pgTable('events', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  date: timestamp('date').notNull(),
  priority: text('priority', { enum: ['low', 'medium', 'high', 'urgent'] }),
  status: text('status', { enum: ['scheduled', 'completed', 'cancelled'] }).default('scheduled'),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  workspaceIdx: index('events_workspace_idx').on(table.workspaceId),
  dateIdx: index('events_date_idx').on(table.date),
  statusIdx: index('events_status_idx').on(table.status),
  workspaceDateIdx: index('events_workspace_date_idx').on(table.workspaceId, table.date),
}));

// Task columns table for custom Kanban columns
export const taskColumns = pgTable('task_columns', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }).notNull(),
  title: text('title').notNull(),
  color: text('color').notNull(),
  order: integer('order').default(0),
  statusId: text('status_id'), // For default columns: 'todo', 'in_progress', 'done'. null for custom columns
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  workspaceIdx: index('task_columns_workspace_idx').on(table.workspaceId),
  orderIdx: index('task_columns_order_idx').on(table.workspaceId, table.order),
  statusIdIdx: index('task_columns_status_id_idx').on(table.statusId),
  workspaceStatusIdIdx: index('task_columns_workspace_status_id_idx').on(table.workspaceId, table.statusId),
}));

// Teams table
export const teams = pgTable('teams', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  color: text('color'),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  workspaceIdx: index('teams_workspace_idx').on(table.workspaceId),
  createdByIdx: index('teams_created_by_idx').on(table.createdBy),
}));

// Team members table
export const teamMembers = pgTable('team_members', {
  teamId: uuid('team_id').references(() => teams.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  role: text('role', { enum: ['leader', 'member'] }).default('member').notNull(),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.teamId, table.userId] }),
  teamIdx: index('team_members_team_idx').on(table.teamId),
  userIdx: index('team_members_user_idx').on(table.userId),
  teamUserIdx: index('team_members_team_user_idx').on(table.teamId, table.userId),
}));

// Projects table
export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }), // For personal projects
  name: text('name').notNull(),
  description: text('description'),
  icon: text('icon'),
  color: text('color'),
  viewType: text('view_type', { enum: ['list', 'board', 'calendar', 'table', 'timeline'] }).default('list'),
  settings: jsonb('settings').default({}),
  isArchived: boolean('is_archived').default(false),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  workspaceIdx: index('projects_workspace_idx').on(table.workspaceId),
  userIdx: index('projects_user_idx').on(table.userId),
  createdByIdx: index('projects_created_by_idx').on(table.createdBy),
  archivedIdx: index('projects_archived_idx').on(table.isArchived),
}));

// Project teams (many-to-many relationship)
export const projectTeams = pgTable('project_teams', {
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  teamId: uuid('team_id').references(() => teams.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.projectId, table.teamId] }),
  projectIdx: index('project_teams_project_idx').on(table.projectId),
  teamIdx: index('project_teams_team_idx').on(table.teamId),
}));

// Drive folders table
export const driveFolders = pgTable('drive_folders', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }).notNull(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id').references(() => driveFolders.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  folderType: text('folder_type', { enum: ['general', 'tasks', 'documents', 'calendar', 'custom'] }).default('general'),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  workspaceIdx: index('drive_folders_workspace_idx').on(table.workspaceId),
  projectIdx: index('drive_folders_project_idx').on(table.projectId),
  parentIdx: index('drive_folders_parent_idx').on(table.parentId),
  folderTypeIdx: index('drive_folders_type_idx').on(table.folderType),
}));

// Drive files table
export const driveFiles = pgTable('drive_files', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }).notNull(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  folderId: uuid('folder_id').references(() => driveFolders.id, { onDelete: 'set null' }),
  fileName: text('file_name').notNull(),
  fileUrl: text('file_url').notNull(),
  fileKey: text('file_key').notNull(), // Garage key
  fileSize: integer('file_size'), // Size in bytes
  mimeType: text('mime_type'),
  fileType: text('file_type', { enum: ['document', 'task-attachment', 'calendar', 'general'] }).default('general'),
  // References to link files to their source
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
  taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
  uploadedBy: uuid('uploaded_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  workspaceIdx: index('drive_files_workspace_idx').on(table.workspaceId),
  projectIdx: index('drive_files_project_idx').on(table.projectId),
  folderIdx: index('drive_files_folder_idx').on(table.folderId),
  documentIdx: index('drive_files_document_idx').on(table.documentId),
  taskIdx: index('drive_files_task_idx').on(table.taskId),
  fileTypeIdx: index('drive_files_type_idx').on(table.fileType),
}));

// Comments table
export const comments = pgTable('comments', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'cascade' }),
  taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
  parentCommentId: uuid('parent_comment_id').references(() => comments.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  isResolved: boolean('is_resolved').default(false),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  documentIdx: index('comments_document_idx').on(table.documentId),
  taskIdx: index('comments_task_idx').on(table.taskId),
  parentIdx: index('comments_parent_idx').on(table.parentCommentId),
  createdByIdx: index('comments_created_by_idx').on(table.createdBy),
}));

// Database schemas (Notion-like databases)
export const databaseSchemas = pgTable('database_schemas', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }).notNull(),
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  properties: jsonb('properties').notNull(), // Schema definition
  views: jsonb('views').default([]), // Different view configurations
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  workspaceIdx: index('database_schemas_workspace_idx').on(table.workspaceId),
  documentIdx: index('database_schemas_document_idx').on(table.documentId),
}));

// Database entries
export const databaseEntries = pgTable('database_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  schemaId: uuid('schema_id').references(() => databaseSchemas.id, { onDelete: 'cascade' }).notNull(),
  data: jsonb('data').notNull(), // Actual data based on schema
  order: integer('order').default(0),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  schemaIdx: index('database_entries_schema_idx').on(table.schemaId),
}));

// Templates table
export const templates = pgTable('templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id),
  createdBy: uuid('created_by').references(() => users.id).notNull(),

  // Template info
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  category: varchar('category', { length: 50 }).notNull(), // document, project, task-list, wiki, etc.
  icon: varchar('icon', { length: 50 }),
  coverImage: text('cover_image'),

  // Template content
  content: jsonb('content'), // TipTap JSON for documents
  structure: jsonb('structure'), // Project structure (folders, default pages)
  properties: jsonb('properties'), // Custom properties/fields
  settings: jsonb('settings'), // Template-specific settings

  // Template metadata
  tags: text('tags').array(),
  isPublic: boolean('is_public').default(false),
  isOfficial: boolean('is_official').default(false), // Official templates provided by the app
  usageCount: integer('usage_count').default(0),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

// Template gallery for sharing
export const templateGallery = pgTable('template_gallery', {
  id: uuid('id').primaryKey().defaultRandom(),
  templateId: uuid('template_id').references(() => templates.id).notNull(),

  // Gallery info
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  thumbnail: text('thumbnail'),
  screenshots: text('screenshots').array(),

  // Stats
  downloads: integer('downloads').default(0),
  likes: integer('likes').default(0),
  rating: numeric('rating', { precision: 3, scale: 2 }),

  // Publishing info
  publishedBy: uuid('published_by').references(() => users.id).notNull(),
  publishedAt: timestamp('published_at').defaultNow().notNull(),
  lastUpdated: timestamp('last_updated').defaultNow().notNull(),

  // Categorization
  category: varchar('category', { length: 50 }).notNull(),
  tags: text('tags').array(),
  featured: boolean('featured').default(false)
});

// User's favorite templates
export const favoriteTemplates = pgTable('favorite_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  templateId: uuid('template_id').references(() => templates.id).notNull(),
  addedAt: timestamp('added_at').defaultNow().notNull()
});

// Notifications table
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  recipientId: uuid('recipient_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  senderId: uuid('sender_id').references(() => users.id),

  // Notification content
  type: varchar('type', { length: 50 }).notNull(), // mention, comment, task-assigned, document-shared, etc.
  title: varchar('title', { length: 255 }).notNull(),
  message: text('message'),
  actionUrl: text('action_url'), // URL to navigate when clicked

  // Related entities
  workspaceId: uuid('workspace_id').references(() => workspaces.id),
  documentId: uuid('document_id').references(() => documents.id),
  taskId: uuid('task_id').references(() => tasks.id),
  commentId: uuid('comment_id').references(() => comments.id),

  // Status
  isRead: boolean('is_read').default(false),
  isArchived: boolean('is_archived').default(false),

  // Metadata
  metadata: jsonb('metadata'), // Additional data specific to notification type

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  readAt: timestamp('read_at'),
}, (table) => ({
  recipientIdx: index('notifications_recipient_idx').on(table.recipientId),
  typeIdx: index('notifications_type_idx').on(table.type),
  isReadIdx: index('notifications_is_read_idx').on(table.isRead),
  createdAtIdx: index('notifications_created_at_idx').on(table.createdAt),
  // PERFORMANCE: Composite index for listing user notifications
  recipientReadIdx: index('notifications_recipient_read_idx').on(table.recipientId, table.isRead, table.isArchived),
}));

// Notification preferences
export const notificationPreferences = pgTable('notification_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),

  // Email notifications
  emailEnabled: boolean('email_enabled').default(true),
  emailMentions: boolean('email_mentions').default(true),
  emailComments: boolean('email_comments').default(true),
  emailTasks: boolean('email_tasks').default(true),
  emailDigest: varchar('email_digest', { length: 20 }).default('daily'), // none, daily, weekly

  // In-app notifications
  inAppMentions: boolean('in_app_mentions').default(true),
  inAppComments: boolean('in_app_comments').default(true),
  inAppTasks: boolean('in_app_tasks').default(true),
  inAppDocuments: boolean('in_app_documents').default(true),

  // Push notifications (for future PWA)
  pushEnabled: boolean('push_enabled').default(false),
  pushSubscription: jsonb('push_subscription'),

  // Sound
  soundEnabled: boolean('sound_enabled').default(true),

  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  workspaceMembers: many(workspaceMembers),
  teamMembers: many(teamMembers),
  createdWorkspaces: many(workspaces),
  createdTeams: many(teams),
  documents: many(documents),
  tasks: many(tasks),
  comments: many(comments),
  notes: many(notes),
  wikiPages: many(wikiPages),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [workspaces.createdBy],
    references: [users.id],
  }),
  members: many(workspaceMembers),
  teams: many(teams),
  documents: many(documents),
  tasks: many(tasks),
  projects: many(projects),
  databaseSchemas: many(databaseSchemas),
  notes: many(notes),
  wikiPages: many(wikiPages),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [documents.workspaceId],
    references: [workspaces.id],
  }),
  parent: one(documents, {
    fields: [documents.parentId],
    references: [documents.id],
  }),
  children: many(documents),
  createdBy: one(users, {
    fields: [documents.createdBy],
    references: [users.id],
  }),
  versions: many(documentVersions),
  comments: many(comments),
} as const));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [tasks.workspaceId],
    references: [workspaces.id],
  }),
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  assignee: one(users, {
    fields: [tasks.assigneeId],
    references: [users.id],
  }),
  parentTask: one(tasks, {
    fields: [tasks.parentTaskId],
    references: [tasks.id],
  }),
  subtasks: many(tasks),
  comments: many(comments),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  document: one(documents, {
    fields: [comments.documentId],
    references: [documents.id],
  }),
  task: one(tasks, {
    fields: [comments.taskId],
    references: [tasks.id],
  }),
  parentComment: one(comments, {
    fields: [comments.parentCommentId],
    references: [comments.id],
  }),
  createdBy: one(users, {
    fields: [comments.createdBy],
    references: [users.id],
  }),
  replies: many(comments),
}));

export const driveFoldersRelations = relations(driveFolders, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [driveFolders.workspaceId],
    references: [workspaces.id],
  }),
  project: one(projects, {
    fields: [driveFolders.projectId],
    references: [projects.id],
  }),
  parent: one(driveFolders, {
    fields: [driveFolders.parentId],
    references: [driveFolders.id],
  }),
  children: many(driveFolders),
  files: many(driveFiles),
  createdBy: one(users, {
    fields: [driveFolders.createdBy],
    references: [users.id],
  }),
}));

export const driveFilesRelations = relations(driveFiles, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [driveFiles.workspaceId],
    references: [workspaces.id],
  }),
  project: one(projects, {
    fields: [driveFiles.projectId],
    references: [projects.id],
  }),
  folder: one(driveFolders, {
    fields: [driveFiles.folderId],
    references: [driveFolders.id],
  }),
  document: one(documents, {
    fields: [driveFiles.documentId],
    references: [documents.id],
  }),
  task: one(tasks, {
    fields: [driveFiles.taskId],
    references: [tasks.id],
  }),
  uploadedBy: one(users, {
    fields: [driveFiles.uploadedBy],
    references: [users.id],
  }),
}));

// Teams relations
export const teamsRelations = relations(teams, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [teams.workspaceId],
    references: [workspaces.id],
  }),
  createdBy: one(users, {
    fields: [teams.createdBy],
    references: [users.id],
  }),
  members: many(teamMembers),
  projectTeams: many(projectTeams),
}));

// Team members relations
export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id],
  }),
}));

// Projects relations
export const projectsRelations = relations(projects, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [projects.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [projects.userId],
    references: [users.id],
  }),
  createdByUser: one(users, {
    fields: [projects.createdBy],
    references: [users.id],
  }),
  projectTeams: many(projectTeams),
  notes: many(notes),
  wikiPages: many(wikiPages),
}));

// Project teams relations
export const projectTeamsRelations = relations(projectTeams, ({ one }) => ({
  project: one(projects, {
    fields: [projectTeams.projectId],
    references: [projects.id],
  }),
  team: one(teams, {
    fields: [projectTeams.teamId],
    references: [teams.id],
  }),
}));

// Notes table - Quick notes for personal or workspace use
export const notes = pgTable('notes', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }).notNull(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }), // Personal notes if set
  title: text('title').notNull(),
  content: text('content'), // Plain text or markdown
  tags: text('tags').array(), // Array of tags
  color: text('color'), // Optional color for organization
  isPinned: boolean('is_pinned').default(false),
  isArchived: boolean('is_archived').default(false),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  workspaceIdx: index('notes_workspace_idx').on(table.workspaceId),
  projectIdx: index('notes_project_idx').on(table.projectId),
  userIdx: index('notes_user_idx').on(table.userId),
  createdByIdx: index('notes_created_by_idx').on(table.createdBy),
  archivedIdx: index('notes_archived_idx').on(table.isArchived),
  pinnedIdx: index('notes_pinned_idx').on(table.isPinned),
}));

// Wiki pages table - Collaborative documentation
export const wikiPages = pgTable('wiki_pages', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }).notNull(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id').references(() => wikiPages.id, { onDelete: 'cascade' }), // Hierarchical structure
  title: text('title').notNull(),
  slug: text('slug').notNull(), // URL-friendly identifier
  content: jsonb('content'), // TipTap JSON content
  excerpt: text('excerpt'), // Short description
  icon: text('icon'),
  coverUrl: text('cover_url'),
  isPublished: boolean('is_published').default(true),
  isArchived: boolean('is_archived').default(false),
  tags: text('tags').array(), // Tags for categorization
  order: integer('order').default(0),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  lastEditedBy: uuid('last_edited_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  workspaceIdx: index('wiki_pages_workspace_idx').on(table.workspaceId),
  projectIdx: index('wiki_pages_project_idx').on(table.projectId),
  parentIdx: index('wiki_pages_parent_idx').on(table.parentId),
  slugIdx: index('wiki_pages_slug_idx').on(table.slug),
  workspaceSlugIdx: index('wiki_pages_workspace_slug_idx').on(table.workspaceId, table.slug),
  archivedIdx: index('wiki_pages_archived_idx').on(table.isArchived),
  workspaceArchivedIdx: index('wiki_pages_workspace_archived_idx').on(table.workspaceId, table.isArchived),
  workspaceProjectIdx: index('wiki_pages_workspace_project_idx').on(table.workspaceId, table.projectId),
  updatedAtIdx: index('wiki_pages_updated_at_idx').on(table.updatedAt),
}));

export const wikiPageComments = pgTable('wiki_page_comments', {
  id: uuid('id').defaultRandom().primaryKey(),
  pageId: uuid('page_id').references(() => wikiPages.id, { onDelete: 'cascade' }).notNull(),
  content: text('content').notNull(),
  isResolved: boolean('is_resolved').default(false),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  pageIdx: index('wiki_page_comments_page_idx').on(table.pageId),
  creatorIdx: index('wiki_page_comments_created_by_idx').on(table.createdBy),
  resolverIdx: index('wiki_page_comments_resolved_by_idx').on(table.resolvedBy),
}));

// Wiki page links - For linking between pages
export const wikiPageLinks = pgTable('wiki_page_links', {
  id: uuid('id').defaultRandom().primaryKey(),
  fromPageId: uuid('from_page_id').references(() => wikiPages.id, { onDelete: 'cascade' }).notNull(),
  toPageId: uuid('to_page_id').references(() => wikiPages.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  fromPageIdx: index('wiki_page_links_from_idx').on(table.fromPageId),
  toPageIdx: index('wiki_page_links_to_idx').on(table.toPageId),
  uniqueLinkIdx: index('wiki_page_links_unique_idx').on(table.fromPageId, table.toPageId),
}));

// Wiki page versions - For version history
export const wikiPageVersions = pgTable('wiki_page_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  pageId: uuid('page_id').references(() => wikiPages.id, { onDelete: 'cascade' }).notNull(),
  title: text('title').notNull(),
  content: jsonb('content'),
  excerpt: text('excerpt'),
  versionNumber: integer('version_number').notNull(),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  pageIdx: index('wiki_page_versions_page_idx').on(table.pageId),
  versionIdx: index('wiki_page_versions_version_idx').on(table.pageId, table.versionNumber),
}));

// Wiki page views - For analytics
export const wikiPageViews = pgTable('wiki_page_views', {
  id: uuid('id').defaultRandom().primaryKey(),
  pageId: uuid('page_id').references(() => wikiPages.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  viewedAt: timestamp('viewed_at').defaultNow().notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
}, (table) => ({
  pageIdx: index('wiki_page_views_page_idx').on(table.pageId),
  userIdx: index('wiki_page_views_user_idx').on(table.userId),
  viewedAtIdx: index('wiki_page_views_viewed_at_idx').on(table.viewedAt),
}));