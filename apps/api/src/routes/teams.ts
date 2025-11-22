import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db';
import { teams, teamMembers, users, workspaceMembers } from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { checkWorkspaceMembership } from '../lib/workspace-helpers';
import type { User } from '../types';
import { log } from '../lib/logger';
import { cacheGetOrSet, cacheDel, CACHE_KEYS, CACHE_TTL } from '../lib/cache';
import { teamCreateRateLimiter, updateRateLimiter, deleteRateLimiter } from '../middleware/rate-limiter';
import { ValidationError, NotFoundError, ForbiddenError, ConflictError, InternalServerError } from '../lib/errors';
import { withTransaction } from '../lib/db-transaction';

const teamRoutes = new Hono();

// Create team schema
const createTeamSchema = z.object({
  workspaceId: z.string().uuid('L\'ID du workspace doit être un UUID valide'),
  name: z.string()
    .min(1, 'Le nom de l\'équipe est requis')
    .max(255, 'Le nom ne peut pas dépasser 255 caractères'),
  description: z.string().optional(),
  color: z.string().optional(),
});

// Update team schema
const updateTeamSchema = z.object({
  name: z.string()
    .min(1, 'Le nom de l\'équipe est requis')
    .max(255, 'Le nom ne peut pas dépasser 255 caractères')
    .optional(),
  description: z.string().optional(),
  color: z.string().optional(),
});

// Add member schema
const addMemberSchema = z.object({
  userId: z.string().uuid('L\'ID de l\'utilisateur doit être un UUID valide'),
  role: z.enum(['leader', 'member'], {
    errorMap: () => ({ message: 'Le rôle doit être: leader ou member' })
  }).default('member'),
});

// Get all teams in a workspace
teamRoutes.get('/workspace/:workspaceId', requireAuth, async (c) => {
  const user = c.get('user') as User;
  const workspaceId = c.req.param('workspaceId');

  try {
    z.string().uuid().parse(workspaceId);
  } catch {
    throw new ValidationError('Invalid workspace ID format. Expected UUID.');
  }

  const membership = await checkWorkspaceMembership(workspaceId, user.id);
  if (!membership) {
    throw new ForbiddenError('Access denied: User is not a member of this workspace');
  }

  // Cache key for teams list
  const cacheKey = `${CACHE_KEYS.TEAMS_LIST}${workspaceId}`;

  try {
    const teamsWithMembers = await cacheGetOrSet(
      cacheKey,
      async () => {
        const allTeams = await db
          .select()
          .from(teams)
          .where(eq(teams.workspaceId, workspaceId))
          .orderBy(teams.createdAt);

        if (allTeams.length === 0) {
          return [];
        }

        // Get all team IDs
        const teamIds = allTeams.map(t => t.id);

        // Fetch all team members in one query (optimized: 1 query instead of N)
        const allTeamMembers = await db
          .select({
            teamId: teamMembers.teamId,
            userId: users.id,
            name: users.name,
            email: users.email,
            avatarUrl: users.avatarUrl,
            role: teamMembers.role,
            joinedAt: teamMembers.joinedAt,
          })
          .from(teamMembers)
          .innerJoin(users, eq(teamMembers.userId, users.id))
          .where(inArray(teamMembers.teamId, teamIds));

        // Group members by team ID
        const membersByTeamId = new Map<string, typeof allTeamMembers>();
        for (const member of allTeamMembers) {
          const existing = membersByTeamId.get(member.teamId) || [];
          existing.push(member);
          membersByTeamId.set(member.teamId, existing);
        }

        // Enrich teams with members
        return allTeams.map(team => ({
          ...team,
          members: membersByTeamId.get(team.id) || []
        }));
      },
      CACHE_TTL.TEAMS_LIST
    );

    return c.json({ teams: teamsWithMembers });
  } catch (error) {
    if (error instanceof ValidationError || error instanceof ForbiddenError) {
      throw error;
    }
    log.error('Failed to fetch teams', error as Error, { workspaceId, userId: user.id });
    throw new InternalServerError('Failed to fetch teams', { workspaceId, userId: user.id });
  }
});

// Get a single team
teamRoutes.get('/:teamId', requireAuth, async (c) => {
  const user = c.get('user') as User;
  const teamId = c.req.param('teamId');

  try {
    z.string().uuid().parse(teamId);
  } catch {
    return c.json({ error: 'Invalid team ID format' }, 400);
  }

  try {
    // Try to get from cache first
    const cacheKey = `${CACHE_KEYS.TEAM}${teamId}`;
    const cachedTeam = await cacheGetOrSet(
      cacheKey,
      async () => {
        const [team] = await db
          .select()
          .from(teams)
          .where(eq(teams.id, teamId))
          .limit(1);
        return team || null;
      },
      CACHE_TTL.TEAM
    );

    if (!cachedTeam) {
      throw new NotFoundError('Team');
    }

    const team = cachedTeam;

    // Check workspace membership
    const membership = await checkWorkspaceMembership(team.workspaceId, user.id);
    if (!membership) {
      throw new ForbiddenError('Access denied: User is not a member of this workspace');
    }

    // Get members (not cached as they change frequently)
    const members = await db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
        role: teamMembers.role,
        joinedAt: teamMembers.joinedAt,
      })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.userId, users.id))
      .where(eq(teamMembers.teamId, teamId));

    return c.json({ team: { ...team, members } });
  } catch (error) {
    if (error instanceof ValidationError || error instanceof ForbiddenError || error instanceof NotFoundError) {
      throw error;
    }
    log.error('Failed to fetch team', error as Error, { teamId, userId: user.id });
    throw new InternalServerError('Failed to fetch team', { teamId, userId: user.id });
  }
});

// Create a new team
teamRoutes.post('/', requireAuth, teamCreateRateLimiter, zValidator('json', createTeamSchema), async (c) => {
  const user = c.get('user') as User;
  const data = c.req.valid('json');

  const membership = await checkWorkspaceMembership(data.workspaceId, user.id, ['editor', 'admin', 'owner']);
  if (!membership) {
    throw new ForbiddenError('Access denied: Editor role or higher required');
  }

  try {
    // Use transaction to ensure atomicity: team creation + member addition
    const result = await withTransaction(async (tx) => {
      const [team] = await tx
        .insert(teams)
        .values({
          workspaceId: data.workspaceId,
          name: data.name,
          description: data.description,
          color: data.color,
          createdBy: user.id,
        })
        .returning();

      if (!team) {
        throw new Error('No team returned from insert');
      }

      // Add creator as team leader
      await tx.insert(teamMembers).values({
        teamId: team.id,
        userId: user.id,
        role: 'leader',
      });

      // Get team with members
      const members = await tx
        .select({
          userId: users.id,
          name: users.name,
          email: users.email,
          avatarUrl: users.avatarUrl,
          role: teamMembers.role,
          joinedAt: teamMembers.joinedAt,
        })
        .from(teamMembers)
        .innerJoin(users, eq(teamMembers.userId, users.id))
        .where(eq(teamMembers.teamId, team.id));

      return {
        team: {
          ...team,
          members
        }
      };
    });

    log.info('Team created', { teamId: result.team.id, workspaceId: data.workspaceId, userId: user.id });

    // Invalidate cache
    await cacheDel(`${CACHE_KEYS.TEAMS_LIST}${data.workspaceId}`);

    return c.json(result, 201);
  } catch (error) {
    if (error instanceof ValidationError || error instanceof ForbiddenError) {
      throw error;
    }
    log.error('Failed to create team', error as Error, { body: data, userId: user.id });
    throw new InternalServerError('Failed to create team', { userId: user.id });
  }
});

// Update a team
teamRoutes.patch('/:teamId', requireAuth, updateRateLimiter, zValidator('json', updateTeamSchema), async (c) => {
  const user = c.get('user') as User;
  const teamId = c.req.param('teamId');
  const data = c.req.valid('json');

  try {
    z.string().uuid().parse(teamId);
  } catch {
    throw new ValidationError('Invalid team ID format. Expected UUID.');
  }

  try {
    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    if (!team) {
      throw new NotFoundError('Team');
    }

    // Check workspace membership
    const membership = await checkWorkspaceMembership(team.workspaceId, user.id, ['editor', 'admin', 'owner']);
    if (!membership) {
      throw new ForbiddenError('Access denied: Editor role or higher required');
    }

    // Check if user is team leader
    const [teamMember] = await db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, user.id)))
      .limit(1);

    if (!teamMember || teamMember.role !== 'leader') {
      // Allow workspace admins/owners to update
      if (membership.role !== 'admin' && membership.role !== 'owner') {
        throw new ForbiddenError('Only team leaders or workspace admins can update teams');
      }
    }

    const [updatedTeam] = await db
      .update(teams)
      .set({
        name: data.name,
        description: data.description,
        color: data.color,
        updatedAt: new Date(),
      })
      .where(eq(teams.id, teamId))
      .returning();

    if (!updatedTeam) {
      throw new InternalServerError('Failed to update team', { teamId, userId: user.id });
    }

    log.info('Team updated', { teamId, userId: user.id });

    // Invalidate cache
    await cacheDel(`${CACHE_KEYS.TEAM}${teamId}`);
    await cacheDel(`${CACHE_KEYS.TEAMS_LIST}${team.workspaceId}`);

    // Get team with members
    const members = await db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
        role: teamMembers.role,
        joinedAt: teamMembers.joinedAt,
      })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.userId, users.id))
      .where(eq(teamMembers.teamId, teamId));

    return c.json({ team: { ...updatedTeam, members } });
  } catch (error) {
    if (error instanceof ValidationError || error instanceof ForbiddenError || error instanceof NotFoundError || error instanceof InternalServerError) {
      throw error;
    }
    log.error('Failed to update team', error as Error, { teamId, body: data, userId: user.id });
    throw new InternalServerError('Failed to update team', { teamId, userId: user.id });
  }
});

// Delete a team
teamRoutes.delete('/:teamId', requireAuth, deleteRateLimiter, async (c) => {
  const user = c.get('user') as User;
  const teamId = c.req.param('teamId');

  try {
    z.string().uuid().parse(teamId);
  } catch {
    throw new ValidationError('Invalid team ID format. Expected UUID.');
  }

  try {
    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    if (!team) {
      throw new NotFoundError('Team');
    }

    // Check workspace membership
    const membership = await checkWorkspaceMembership(team.workspaceId, user.id, ['admin', 'owner']);
    if (!membership) {
      throw new ForbiddenError('Access denied: Admin or owner role required');
    }

    await db.delete(teams).where(eq(teams.id, teamId));

    // Invalidate cache
    await cacheDel(`${CACHE_KEYS.TEAM}${teamId}`);
    await cacheDel(`${CACHE_KEYS.TEAMS_LIST}${team.workspaceId}`);

    log.info('Team deleted', { teamId, userId: user.id });
    return c.json({ success: true });
  } catch (error) {
    if (error instanceof ValidationError || error instanceof ForbiddenError || error instanceof NotFoundError) {
      throw error;
    }
    log.error('Failed to delete team', error as Error, { teamId, userId: user.id });
    throw new InternalServerError('Failed to delete team', { teamId, userId: user.id });
  }
});

// Add member to team
teamRoutes.post('/:teamId/members', requireAuth, zValidator('json', addMemberSchema), async (c) => {
  const user = c.get('user') as User;
  const teamId = c.req.param('teamId');
  const data = c.req.valid('json');

  try {
    z.string().uuid().parse(teamId);
    z.string().uuid().parse(data.userId);
  } catch {
    throw new ValidationError('Invalid ID format. Expected UUID.');
  }

  try {
    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    if (!team) {
      throw new NotFoundError('Team');
    }

    // Check workspace membership
    const membership = await checkWorkspaceMembership(team.workspaceId, user.id, ['editor', 'admin', 'owner']);
    if (!membership) {
      throw new ForbiddenError('Access denied: Editor role or higher required');
    }

    // Check if user to add is a workspace member
    const [workspaceMember] = await db
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, team.workspaceId), eq(workspaceMembers.userId, data.userId)))
      .limit(1);

    if (!workspaceMember) {
      throw new ValidationError('User must be a workspace member first');
    }

    // Check if user is already a team member
    const [existingMember] = await db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, data.userId)))
      .limit(1);

    if (existingMember) {
      throw new ConflictError('User is already a team member');
    }

    // Check if user is team leader or workspace admin
    const [teamMember] = await db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, user.id)))
      .limit(1);

    if (!teamMember || teamMember.role !== 'leader') {
      if (membership.role !== 'admin' && membership.role !== 'owner') {
        throw new ForbiddenError('Only team leaders or workspace admins can add members');
      }
    }

    await db.insert(teamMembers).values({
      teamId,
      userId: data.userId,
      role: data.role,
    });

    log.info('Member added to team', { teamId, userId: data.userId, addedBy: user.id });

    // Invalidate cache
    await cacheDel(`${CACHE_KEYS.TEAM}${teamId}`);
    await cacheDel(`${CACHE_KEYS.TEAMS_LIST}${team.workspaceId}`);

    // Get updated member list
    const members = await db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
        role: teamMembers.role,
        joinedAt: teamMembers.joinedAt,
      })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.userId, users.id))
      .where(eq(teamMembers.teamId, teamId));

    return c.json({ members }, 201);
  } catch (error) {
    if (error instanceof ValidationError || error instanceof ForbiddenError || error instanceof NotFoundError || error instanceof ConflictError) {
      throw error;
    }
    log.error('Failed to add team member', error as Error, { teamId, body: data, userId: user.id });
    throw new InternalServerError('Failed to add team member', { teamId, userId: user.id });
  }
});

// Remove member from team
teamRoutes.delete('/:teamId/members/:userId', requireAuth, async (c) => {
  const user = c.get('user') as User;
  const teamId = c.req.param('teamId');
  const userId = c.req.param('userId');

  try {
    z.string().uuid().parse(teamId);
    z.string().uuid().parse(userId);
  } catch {
    throw new ValidationError('Invalid ID format. Expected UUID.');
  }

  try {
    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    if (!team) {
      throw new NotFoundError('Team');
    }

    // Check workspace membership
    const membership = await checkWorkspaceMembership(team.workspaceId, user.id, ['editor', 'admin', 'owner']);
    if (!membership) {
      throw new ForbiddenError('Access denied: Editor role or higher required');
    }

    // Check if user is team leader or workspace admin
    const [teamMember] = await db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, user.id)))
      .limit(1);

    if (!teamMember || teamMember.role !== 'leader') {
      if (membership.role !== 'admin' && membership.role !== 'owner') {
        throw new ForbiddenError('Only team leaders or workspace admins can remove members');
      }
    }

    // Prevent removing the last leader
    const [memberToRemove] = await db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
      .limit(1);

    if (!memberToRemove) {
      throw new NotFoundError('Team member');
    }

    if (memberToRemove.role === 'leader') {
      const leaders = await db
        .select()
        .from(teamMembers)
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, 'leader')));

      if (leaders.length === 1) {
        throw new ValidationError('Cannot remove the last team leader');
      }
    }

    await db
      .delete(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));

    // Invalidate cache
    await cacheDel(`${CACHE_KEYS.TEAM}${teamId}`);
    await cacheDel(`${CACHE_KEYS.TEAMS_LIST}${team.workspaceId}`);

    log.info('Member removed from team', { teamId, userId, removedBy: user.id });
    return c.json({ success: true });
  } catch (error) {
    if (error instanceof ValidationError || error instanceof ForbiddenError || error instanceof NotFoundError) {
      throw error;
    }
    log.error('Failed to remove team member', error as Error, { teamId, userId, removedBy: user.id });
    throw new InternalServerError('Failed to remove team member', { teamId, userId, removedBy: user.id });
  }
});

// Update member role
teamRoutes.patch('/:teamId/members/:userId', requireAuth, zValidator('json', z.object({ role: z.enum(['leader', 'member']) })), async (c) => {
  const user = c.get('user') as User;
  const teamId = c.req.param('teamId');
  const userId = c.req.param('userId');
  const data = c.req.valid('json');

  try {
    z.string().uuid().parse(teamId);
    z.string().uuid().parse(userId);
  } catch {
    throw new ValidationError('Invalid ID format. Expected UUID.');
  }

  try {
    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    if (!team) {
      throw new NotFoundError('Team');
    }

    // Check workspace membership
    const membership = await checkWorkspaceMembership(team.workspaceId, user.id, ['editor', 'admin', 'owner']);
    if (!membership) {
      throw new ForbiddenError('Access denied: Editor role or higher required');
    }

    // Check if user is team leader or workspace admin
    const [teamMember] = await db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, user.id)))
      .limit(1);

    if (!teamMember || teamMember.role !== 'leader') {
      if (membership.role !== 'admin' && membership.role !== 'owner') {
        throw new ForbiddenError('Only team leaders or workspace admins can update member roles');
      }
    }

    // If changing to member, ensure there's at least one leader left
    if (data.role === 'member') {
      const [memberToUpdate] = await db
        .select()
        .from(teamMembers)
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
        .limit(1);

      if (memberToUpdate?.role === 'leader') {
        const leaders = await db
          .select()
          .from(teamMembers)
          .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, 'leader')));

        if (leaders.length === 1) {
          throw new ValidationError('Cannot remove the last team leader');
        }
      }
    }

    await db
      .update(teamMembers)
      .set({ role: data.role })
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));

    log.info('Team member role updated', { teamId, userId, newRole: data.role, updatedBy: user.id });

    // Invalidate cache
    await cacheDel(`${CACHE_KEYS.TEAM}${teamId}`);
    await cacheDel(`${CACHE_KEYS.TEAMS_LIST}${team.workspaceId}`);

    // Get updated member list
    const members = await db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
        role: teamMembers.role,
        joinedAt: teamMembers.joinedAt,
      })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.userId, users.id))
      .where(eq(teamMembers.teamId, teamId));

    return c.json({ members });
  } catch (error) {
    if (error instanceof ValidationError || error instanceof ForbiddenError || error instanceof NotFoundError) {
      throw error;
    }
    log.error('Failed to update team member role', error as Error, { teamId, userId, body: data, updatedBy: user.id });
    throw new InternalServerError('Failed to update team member role', { teamId, userId, updatedBy: user.id });
  }
});

export default teamRoutes;

