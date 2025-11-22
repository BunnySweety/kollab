import type { PageLoad } from './$types';
import { workspaceStore } from '$lib/stores/workspace';
import { get } from 'svelte/store';

export const load: PageLoad = async ({ url }) => {
	const workspaceState = get(workspaceStore);
	const workspace = workspaceState.currentWorkspace;
	const projectId = url.searchParams.get('projectId');
	return {
		workspaceId: workspace?.id || null,
		projectId: projectId || null
	};
};

