/**
 * Drizzle Relations
 * 
 * Define relations between tables for optimized queries with .with()
 * This allows Drizzle to automatically handle JOINs and avoid N+1 queries
 */

import { relations } from 'drizzle-orm';
import {
  users,
  workspaces,
  workspaceMembers,
  documents,
  documentVersions,
  tasks,
  taskAttachments,
  taskTags,
  taskTagRelations,
  projects,
  teams,
  teamMembers,
  projectTeams,
  comments
} from './schema';

// User relations
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(workspaceMembers), // User's workspace memberships
  createdWorkspaces: many(workspaces), // Workspaces created by user
  createdDocuments: many(documents), // Documents created by user
  assignedTasks: many(tasks), // Tasks assigned to user
  createdTasks: many(tasks), // Tasks created by user
  comments: many(comments) // Comments created by user
}));

// Workspace relations
export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  creator: one(users, {
    fields: [workspaces.createdBy],
    references: [users.id]
  }),
  members: many(workspaceMembers),
  documents: many(documents),
  tasks: many(tasks),
  projects: many(projects),
  teams: many(teams)
}));

// Workspace member relations
export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceMembers.workspaceId],
    references: [workspaces.id]
  }),
  user: one(users, {
    fields: [workspaceMembers.userId],
    references: [users.id]
  })
}));

// Document relations
export const documentsRelations = relations(documents, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [documents.workspaceId],
    references: [workspaces.id]
  }),
  parent: one(documents, {
    fields: [documents.parentId],
    references: [documents.id],
    relationName: 'documentParent'
  }),
  children: many(documents, {
    relationName: 'documentParent'
  }),
  creator: one(users, {
    fields: [documents.createdBy],
    references: [users.id],
    relationName: 'documentCreator'
  }),
  lastEditor: one(users, {
    fields: [documents.lastEditedBy],
    references: [users.id],
    relationName: 'documentEditor'
  }),
  versions: many(documentVersions),
  comments: many(comments)
}));

// Document version relations
export const documentVersionsRelations = relations(documentVersions, ({ one }) => ({
  document: one(documents, {
    fields: [documentVersions.documentId],
    references: [documents.id]
  }),
  creator: one(users, {
    fields: [documentVersions.createdBy],
    references: [users.id]
  })
}));

// Task relations
export const tasksRelations = relations(tasks, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [tasks.workspaceId],
    references: [workspaces.id]
  }),
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id]
  }),
  assignee: one(users, {
    fields: [tasks.assigneeId],
    references: [users.id],
    relationName: 'taskAssignee'
  }),
  creator: one(users, {
    fields: [tasks.createdBy],
    references: [users.id],
    relationName: 'taskCreator'
  }),
  parent: one(tasks, {
    fields: [tasks.parentTaskId],
    references: [tasks.id],
    relationName: 'taskParent'
  }),
  children: many(tasks, {
    relationName: 'taskParent'
  }),
  attachments: many(taskAttachments),
  tagRelations: many(taskTagRelations),
  comments: many(comments)
}));

// Task attachment relations
export const taskAttachmentsRelations = relations(taskAttachments, ({ one }) => ({
  task: one(tasks, {
    fields: [taskAttachments.taskId],
    references: [tasks.id]
  }),
  uploader: one(users, {
    fields: [taskAttachments.uploadedBy],
    references: [users.id]
  })
}));

// Task tag relations
export const taskTagRelationsRelations = relations(taskTagRelations, ({ one }) => ({
  task: one(tasks, {
    fields: [taskTagRelations.taskId],
    references: [tasks.id]
  }),
  tag: one(taskTags, {
    fields: [taskTagRelations.tagId],
    references: [taskTags.id]
  })
}));

// Task tags relations
export const taskTagsRelations = relations(taskTags, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [taskTags.workspaceId],
    references: [workspaces.id]
  }),
  creator: one(users, {
    fields: [taskTags.createdBy],
    references: [users.id]
  }),
  taskRelations: many(taskTagRelations)
}));

// Project relations
export const projectsRelations = relations(projects, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [projects.workspaceId],
    references: [workspaces.id]
  }),
  owner: one(users, {
    fields: [projects.userId],
    references: [users.id],
    relationName: 'projectOwner'
  }),
  creator: one(users, {
    fields: [projects.createdBy],
    references: [users.id],
    relationName: 'projectCreator'
  }),
  tasks: many(tasks),
  projectTeams: many(projectTeams)
}));

// Team relations
export const teamsRelations = relations(teams, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [teams.workspaceId],
    references: [workspaces.id]
  }),
  creator: one(users, {
    fields: [teams.createdBy],
    references: [users.id]
  }),
  members: many(teamMembers),
  projectTeams: many(projectTeams)
}));

// Team member relations
export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id]
  }),
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id]
  })
}));

// Project team relations
export const projectTeamsRelations = relations(projectTeams, ({ one }) => ({
  project: one(projects, {
    fields: [projectTeams.projectId],
    references: [projects.id]
  }),
  team: one(teams, {
    fields: [projectTeams.teamId],
    references: [teams.id]
  })
}));

// Comment relations
export const commentsRelations = relations(comments, ({ one, many }) => ({
  document: one(documents, {
    fields: [comments.documentId],
    references: [documents.id]
  }),
  task: one(tasks, {
    fields: [comments.taskId],
    references: [tasks.id]
  }),
  creator: one(users, {
    fields: [comments.createdBy],
    references: [users.id]
  }),
  parent: one(comments, {
    fields: [comments.parentCommentId],
    references: [comments.id],
    relationName: 'commentParent'
  }),
  replies: many(comments, {
    relationName: 'commentParent'
  })
}));

