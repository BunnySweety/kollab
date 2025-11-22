import { api, endpoints } from '$lib/api-client';
import { log } from '$lib/logger';
import { handleError } from '$lib/error-handler';

export interface TeamMember {
	userId: string;
	name: string;
	email: string;
	avatarUrl: string | null;
	role: 'leader' | 'member';
	joinedAt: string;
}

export interface Team {
	id: string;
	workspaceId: string;
	name: string;
	description: string | null;
	color: string | null;
	createdBy: string;
	createdAt: string;
	updatedAt: string;
	members?: TeamMember[];
}

export type CreateTeamData = {
	workspaceId: string;
	name: string;
	description?: string;
	color?: string;
};

export type UpdateTeamData = {
	name?: string;
	description?: string;
	color?: string;
};

export type AddMemberData = {
	userId: string;
	role?: 'leader' | 'member';
};

export class TeamService {
	static async listByWorkspace(workspaceId: string): Promise<Team[]> {
		try {
			const result = await api.get<{ teams: Team[] }>(endpoints.teams.listByWorkspace(workspaceId));
			return result.teams || [];
		} catch (error) {
			log.error('Failed to load teams', error, { workspaceId });
			throw error;
		}
	}

	static async get(teamId: string): Promise<Team> {
		try {
			const result = await api.get<{ team: Team }>(endpoints.teams.get(teamId));
			return result.team;
		} catch (error) {
			log.error('Failed to load team', error, { teamId });
			throw error;
		}
	}

	static async create(data: CreateTeamData): Promise<Team> {
		try {
			const result = await api.post<{ team: Team }>(endpoints.teams.create, data);
			return result.team;
		} catch (error) {
			handleError(error, { action: 'create', resource: 'team' }, { logContext: { data } });
			throw error;
		}
	}

	static async update(teamId: string, data: UpdateTeamData): Promise<Team> {
		try {
			const result = await api.patch<{ team: Team }>(endpoints.teams.update(teamId), data);
			return result.team;
		} catch (error) {
			handleError(error, { action: 'update', resource: 'team' }, { logContext: { teamId, data } });
			throw error;
		}
	}

	static async delete(teamId: string): Promise<void> {
		try {
			await api.delete(endpoints.teams.delete(teamId));
		} catch (error) {
			handleError(error, { action: 'delete', resource: 'team' }, { logContext: { teamId } });
			throw error;
		}
	}

	static async addMember(teamId: string, data: AddMemberData): Promise<TeamMember[]> {
		try {
			const result = await api.post<{ members: TeamMember[] }>(endpoints.teams.members.add(teamId), data);
			return result.members || [];
		} catch (error) {
			handleError(error, { action: 'create', resource: 'team member' }, { logContext: { teamId, data } });
			throw error;
		}
	}

	static async removeMember(teamId: string, userId: string): Promise<void> {
		try {
			await api.delete(endpoints.teams.members.remove(teamId, userId));
		} catch (error) {
			handleError(error, { action: 'delete', resource: 'team member' }, { logContext: { teamId, userId } });
			throw error;
		}
	}

	static async updateMemberRole(teamId: string, userId: string, role: 'leader' | 'member'): Promise<TeamMember[]> {
		try {
			const result = await api.patch<{ members: TeamMember[] }>(endpoints.teams.members.updateRole(teamId, userId), { role });
			return result.members || [];
		} catch (error) {
			handleError(error, { action: 'update', resource: 'team member role' }, { logContext: { teamId, userId, role } });
			throw error;
		}
	}
}

