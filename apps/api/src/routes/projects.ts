import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db';
import { projects, driveFolders, teams, projectTeams, teamMembers } from '../db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import type { InferInsertModel } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { checkWorkspaceMembership } from '../lib/workspace-helpers';
import { log } from '../lib/logger';
import { cacheGetOrSet, CACHE_KEYS, CACHE_TTL } from '../lib/cache';
import { projectCreateRateLimiter, updateRateLimiter, deleteRateLimiter } from '../middleware/rate-limiter';
import { withTransaction } from '../lib/db-transaction';
import { projectSettingsSchema } from '../types/content';
import { ValidationError, NotFoundError, ForbiddenError, InternalServerError } from '../lib/errors';

const projectRoutes = new Hono();

// Create project schema
const createProjectSchema = z.object({
  workspaceId: z.string().uuid('L\'ID du workspace doit être un UUID valide'),
  userId: z.string().uuid('L\'ID de l\'utilisateur doit être un UUID valide').optional().nullable(), // For personal projects
  teamIds: z.array(z.string().uuid('Chaque ID d\'équipe doit être un UUID valide')).optional(), // For team projects (can be multiple)
  name: z.string()
    .min(1, 'Le nom du projet est requis')
    .max(255, 'Le nom ne peut pas dépasser 255 caractères'),
  description: z.string().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  viewType: z.enum(['list', 'board', 'calendar', 'table', 'timeline'], {
    errorMap: () => ({ message: 'Le type de vue doit être: list, board, calendar, table ou timeline' })
  }).default('list'),
  settings: projectSettingsSchema.optional()
});

// Update project schema
const updateProjectSchema = z.object({
  name: z.string()
    .min(1, 'Le nom du projet est requis')
    .max(255, 'Le nom ne peut pas dépasser 255 caractères')
    .optional(),
  userId: z.string().uuid('L\'ID de l\'utilisateur doit être un UUID valide').optional().nullable(), // For personal projects
  teamIds: z.array(z.string().uuid('Chaque ID d\'équipe doit être un UUID valide')).optional(), // For team projects (can be multiple)
  description: z.string().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  viewType: z.enum(['list', 'board', 'calendar', 'table', 'timeline'], {
    errorMap: () => ({ message: 'Le type de vue doit être: list, board, calendar, table ou timeline' })
  }).optional(),
  settings: projectSettingsSchema.optional(),
  isArchived: z.boolean().optional()
});

// Get all projects in a workspace with pagination
projectRoutes.get('/workspace/:workspaceId', requireAuth, async (c) => {
  const user = c.get('user');
  const workspaceId = c.req.param('workspaceId');
  const page = parseInt(c.req.query('page') || '1', 10);
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100); // Max 100 per page
  const offset = (page - 1) * limit;

  // Validate workspaceId is a UUID
  try {
    z.string().uuid().parse(workspaceId);
  } catch {
    throw new ValidationError('Invalid workspace ID format. Expected UUID.');
  }

  // Check workspace membership with Redis cache
  const membership = await checkWorkspaceMembership(workspaceId, user.id);
  if (!membership) {
    throw new ForbiddenError('Access denied: User is not a member of this workspace');
  }

  // Get total count for pagination (before filtering by access)
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(projects)
    .where(eq(projects.workspaceId, workspaceId));
  const totalCount = countResult[0]?.count || 0;

  // Get all projects (including archived) with pagination
  const allProjects = await db
    .select()
    .from(projects)
    .where(eq(projects.workspaceId, workspaceId))
    .orderBy(projects.createdAt)
    .limit(limit)
    .offset(offset);

  if (allProjects.length === 0) {
    return c.json({ 
      projects: [],
      pagination: {
        page,
        limit,
        total: Number(totalCount),
        totalPages: Math.ceil(Number(totalCount) / limit),
        hasMore: false
      }
    });
  }

  // Get all project IDs
  const projectIds = allProjects.map(p => p.id);

  // Fetch all project-team relations in one query (optimized: 1 query instead of N)
  const allProjectTeams = await db
    .select({
      projectId: projectTeams.projectId,
      teamId: projectTeams.teamId
    })
    .from(projectTeams)
    .where(inArray(projectTeams.projectId, projectIds));

  // Group team IDs by project ID
  const teamIdsByProjectId = new Map<string, string[]>();
  for (const pt of allProjectTeams) {
    const existing = teamIdsByProjectId.get(pt.projectId) || [];
    existing.push(pt.teamId);
    teamIdsByProjectId.set(pt.projectId, existing);
  }

  // Enrich projects with team IDs
  const projectsWithTeams = allProjects.map(project => ({
    ...project,
    teamIds: teamIdsByProjectId.get(project.id) || []
  }));

  // Get user's team memberships for filtering personal/team projects
  const userTeamMemberships = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(eq(teamMembers.userId, user.id));
  const userTeamIds = new Set(userTeamMemberships.map(tm => tm.teamId));

  // Filter projects based on access:
  // - Workspace projects (userId = null, no teams): visible to all workspace members
  // - Personal projects (userId set): only visible to the owner
  // - Team projects (teamIds set): only visible to team members
  const accessibleProjects = projectsWithTeams.filter(project => {
    // Workspace project - accessible to all
    if (!project.userId && (!project.teamIds || project.teamIds.length === 0)) {
      return true;
    }
    
    // Personal project - only accessible to owner
    if (project.userId === user.id) {
      return true;
    }
    
    // Team project - accessible if user is member of at least one team
    if (project.teamIds && project.teamIds.length > 0) {
      return project.teamIds.some(teamId => userTeamIds.has(teamId));
    }
    
    return false;
  });

  return c.json({ 
    projects: accessibleProjects,
    pagination: {
      page,
      limit,
      total: Number(totalCount), // Note: this is total before access filtering
      totalPages: Math.ceil(Number(totalCount) / limit),
      hasMore: offset + accessibleProjects.length < Number(totalCount)
    }
  });
});

// Get a single project
projectRoutes.get('/:id', requireAuth, async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('id');

  // Try to get from cache first
  const cacheKey = `${CACHE_KEYS.PROJECT}${projectId}`;
  const cachedProject = await cacheGetOrSet(
    cacheKey,
    async () => {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
      return project || null;
    },
    CACHE_TTL.PROJECT
  );

  if (!cachedProject) {
    throw new NotFoundError('Project');
  }

  // Check workspace membership with Redis cache
  const membership = await checkWorkspaceMembership(cachedProject.workspaceId, user.id);
  if (!membership) {
    throw new ForbiddenError('Access denied: User is not a member of this workspace');
  }

  // Use cached project
  const project = cachedProject;

  // Check project-specific access (personal or team projects)
  if (project.userId) {
    // Personal project - only accessible to owner
    if (project.userId !== user.id) {
      throw new ForbiddenError('Access denied: Personal projects can only be accessed by their owner');
    }
  } else {
    // Check if project is associated with teams
    const projectTeamsList = await db
      .select({ teamId: projectTeams.teamId })
      .from(projectTeams)
      .where(eq(projectTeams.projectId, projectId));
    
    if (projectTeamsList.length > 0) {
      // Team project - check if user is member of at least one team
      const teamIds = projectTeamsList.map(pt => pt.teamId);
      const userTeamMemberships = await db
        .select({ teamId: teamMembers.teamId })
        .from(teamMembers)
        .where(and(
          eq(teamMembers.userId, user.id),
          inArray(teamMembers.teamId, teamIds)
        ));
      
      if (userTeamMemberships.length === 0) {
        throw new ForbiddenError('Access denied: User is not a member of any team associated with this project');
      }
    }
    // If no userId and no teams, it's a workspace project - accessible to all members
  }

  // Get teams for this project
  const projectTeamsList = await db
    .select({
      teamId: projectTeams.teamId
    })
    .from(projectTeams)
    .where(eq(projectTeams.projectId, projectId));

  return c.json({ 
    project: {
      ...project,
      teamIds: projectTeamsList.map(pt => pt.teamId)
    }
  });
});

// Create a new project
projectRoutes.post('/', requireAuth, projectCreateRateLimiter, zValidator('json', createProjectSchema), async (c) => {
  const user = c.get('user');
  const data = c.req.valid('json');

  // Check workspace membership with Redis cache (editors+ only)
  const membership = await checkWorkspaceMembership(data.workspaceId, user.id, ['editor', 'admin', 'owner']);
  if (!membership) {
    throw new ForbiddenError('Access denied: Editor role or higher required');
  }

  // Validate userId if provided (for personal projects)
  if (data.userId && data.userId !== user.id) {
    throw new ValidationError('You can only create personal projects for yourself');
  }

  // Validate teamIds if provided
  if (data.teamIds && data.teamIds.length > 0) {
    const validTeams = await db
      .select()
      .from(teams)
      .where(and(
        inArray(teams.id, data.teamIds),
        eq(teams.workspaceId, data.workspaceId)
      ));

    if (validTeams.length !== data.teamIds.length) {
      throw new ValidationError('One or more teams not found or do not belong to this workspace');
    }
  }

  // Cannot have both userId and teamIds
  if (data.userId && data.teamIds && data.teamIds.length > 0) {
    throw new ValidationError('Project cannot be both personal and shared with teams');
  }

  try {
    // Use transaction to ensure atomicity: project creation + team associations + Drive folders
    const result = await withTransaction(async (tx) => {
      // Create project
      const [project] = await tx
        .insert(projects)
        .values({
          workspaceId: data.workspaceId,
          userId: data.userId || null,
          name: data.name,
          description: data.description,
          icon: data.icon,
          color: data.color,
          viewType: data.viewType,
          settings: data.settings || {},
          createdBy: user.id
        })
        .returning();

      if (!project) {
        throw new Error('No project returned from insert');
      }

      // Associate teams if provided
      if (data.teamIds && data.teamIds.length > 0) {
        await tx.insert(projectTeams).values(
          data.teamIds.map(teamId => ({
            projectId: project.id,
            teamId
          }))
        );
      }

      // Create default Drive folders for the project
      const defaultFolders = [
        { name: 'Tasks', folderType: 'tasks' as const },
        { name: 'Documents', folderType: 'documents' as const },
        { name: 'Calendar', folderType: 'calendar' as const }
      ];

      await tx.insert(driveFolders).values(
        defaultFolders.map(folder => ({
          workspaceId: data.workspaceId,
          projectId: project.id,
          name: folder.name,
          folderType: folder.folderType,
          createdBy: user.id
        }))
      );

      // Get teams for the created project
      const projectTeamsList = await tx
        .select({
          teamId: projectTeams.teamId
        })
        .from(projectTeams)
        .where(eq(projectTeams.projectId, project.id));

      return {
        project: {
          ...project,
          teamIds: projectTeamsList.map(pt => pt.teamId)
        }
      };
    });

    log.info('Project created with default folders', {
      projectId: result.project.id,
      workspaceId: data.workspaceId,
      userId: user.id
    });

    return c.json(result, 201);
  } catch (error) {
    // Re-throw AppError instances
    if (error instanceof ValidationError || error instanceof ForbiddenError) {
      throw error;
    }
    log.error('Failed to create project', error as Error, { data, userId: user.id });
    throw new InternalServerError('Failed to create project', { userId: user.id });
  }
});

// Update a project
projectRoutes.patch('/:id', requireAuth, updateRateLimiter, zValidator('json', updateProjectSchema), async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('id');
  const data = c.req.valid('json');

  const [project] = await db
    .select({
      id: projects.id,
      workspaceId: projects.workspaceId,
      userId: projects.userId
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    throw new NotFoundError('Project');
  }

  // Check workspace membership with Redis cache (editors+ only)
  const membership = await checkWorkspaceMembership(project.workspaceId, user.id, ['editor', 'admin', 'owner']);
  if (!membership) {
    throw new ForbiddenError('Access denied: Editor role or higher required');
  }

  // Validate userId if provided (for personal projects)
  if (data.userId !== undefined) {
    if (data.userId && data.userId !== user.id) {
      throw new ValidationError('You can only assign personal projects to yourself');
    }
  }

  // Validate teamIds if provided
  if (data.teamIds !== undefined) {
    if (data.teamIds.length > 0) {
      const validTeams = await db
        .select({
          id: teams.id,
          workspaceId: teams.workspaceId
        })
        .from(teams)
        .where(and(
          inArray(teams.id, data.teamIds),
          eq(teams.workspaceId, project.workspaceId)
        ));

      if (validTeams.length !== data.teamIds.length) {
        return c.json({ error: 'One or more teams not found or do not belong to this workspace' }, 400);
      }
    }
  }

  // Cannot have both userId and teamIds
  if (data.userId !== undefined && data.teamIds !== undefined) {
    const finalUserId = data.userId;
    const finalTeamIds = data.teamIds;
    if (finalUserId && finalTeamIds && finalTeamIds.length > 0) {
      return c.json({ error: 'Project cannot be both personal and shared with teams' }, 400);
    }
  }

  const updateData: Partial<InferInsertModel<typeof projects>> & { updatedAt: Date } = {
    updatedAt: new Date()
  };

  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.icon !== undefined) updateData.icon = data.icon;
  if (data.color !== undefined) updateData.color = data.color;
  if (data.viewType !== undefined) updateData.viewType = data.viewType;
  if (data.settings !== undefined) updateData.settings = data.settings;
  if (data.isArchived !== undefined) updateData.isArchived = data.isArchived;

  if (data.userId !== undefined) {
    updateData.userId = data.userId;
  }

  try {
    // Use transaction to ensure atomicity: project update + team associations
    const result = await withTransaction(async (tx) => {
      // Update project
      const [updatedProject] = await tx
        .update(projects)
        .set(updateData)
        .where(eq(projects.id, projectId))
        .returning();

      if (!updatedProject) {
        throw new Error('No project returned from update');
      }

      // Update team associations if provided
      if (data.teamIds !== undefined) {
        // Delete existing associations
        await tx.delete(projectTeams).where(eq(projectTeams.projectId, projectId));
        
        // Create new associations
        if (data.teamIds.length > 0) {
          await tx.insert(projectTeams).values(
            data.teamIds.map(teamId => ({
              projectId: projectId,
              teamId
            }))
          );
        }
      }

      // Get updated teams for the project
      const projectTeamsList = await tx
        .select({
          teamId: projectTeams.teamId
        })
        .from(projectTeams)
        .where(eq(projectTeams.projectId, projectId));

      return {
        project: {
          ...updatedProject,
          teamIds: projectTeamsList.map(pt => pt.teamId)
        }
      };
    });

    return c.json(result);
  } catch (error) {
    // Re-throw AppError instances
    if (error instanceof ValidationError || error instanceof ForbiddenError || error instanceof NotFoundError) {
      throw error;
    }
    log.error('Failed to update project', error as Error, { projectId, data, userId: user.id });
    throw new InternalServerError('Failed to update project', { projectId, userId: user.id });
  }
});

// Delete a project
projectRoutes.delete('/:id', requireAuth, deleteRateLimiter, async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('id');

  const [project] = await db
    .select({
      id: projects.id,
      workspaceId: projects.workspaceId
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    throw new NotFoundError('Project');
  }

  // Check workspace membership with Redis cache (owner/admin only)
  const membership = await checkWorkspaceMembership(project.workspaceId, user.id, ['owner', 'admin']);
  if (!membership) {
    throw new ForbiddenError('Access denied: Owner or admin role required');
  }

  await db
    .delete(projects)
    .where(eq(projects.id, projectId));

  return c.json({ message: 'Project deleted successfully' });
});

export default projectRoutes;
