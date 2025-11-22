import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { api, endpoints } from '$lib/api-client';
import { toast } from 'svelte-sonner';
import { log } from '$lib/logger';

interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface WorkspaceMember {
  workspace: Workspace;
  role: 'owner' | 'admin' | 'member' | 'viewer';
}

interface WorkspaceStore {
  workspaces: WorkspaceMember[];
  currentWorkspace: Workspace | null;
  loading: boolean;
  error: string | null;
}

function createWorkspaceStore() {
  const { subscribe, set, update } = writable<WorkspaceStore>({
    workspaces: [],
    currentWorkspace: null,
    loading: false,
    error: null
  });

  // Flag to prevent infinite loops
  let isSelectingWorkspace = false;
  const failedWorkspaceIds = new Set<string>();

  return {
    subscribe,

    // Load all workspaces for the current user
    async loadWorkspaces(): Promise<void> {
      update(state => ({ ...state, loading: true, error: null }));

      try {
        const data = await api.get<{ workspaces: WorkspaceMember[] }>(endpoints.workspaces.list);
        const workspaces = data.workspaces || [];

        // Check if current workspace is still accessible
        const currentState = get({ subscribe });
        const currentWorkspaceId = currentState.currentWorkspace?.id;
        const isCurrentWorkspaceAccessible = currentWorkspaceId
          ? workspaces.some((ws) => ws.workspace.id === currentWorkspaceId)
          : false;

        update(state => ({
          ...state,
          workspaces,
          loading: false,
          // Clear current workspace if it's no longer accessible
          currentWorkspace: isCurrentWorkspaceAccessible ? state.currentWorkspace : null,
          error: isCurrentWorkspaceAccessible ? null : state.error
        }));

        // Auto-select workspace if none is selected
        // But only if we're not already in the process of selecting a workspace
        const newState = get({ subscribe });
        if (workspaces.length > 0 && !newState.currentWorkspace && !isSelectingWorkspace) {
          // Try to restore from localStorage first
          let workspaceToSelect: string | null = null;
          if (browser) {
            try {
              const savedWorkspaceId = localStorage.getItem('currentWorkspaceId');
              // Only use saved workspace if it exists in the list of available workspaces
              if (savedWorkspaceId && workspaces.some((ws) => ws.workspace.id === savedWorkspaceId)) {
                workspaceToSelect = savedWorkspaceId;
              } else if (savedWorkspaceId) {
                // Saved workspace doesn't exist, clear it from localStorage
                localStorage.removeItem('currentWorkspaceId');
                log.info('Removed invalid workspace from localStorage', { workspaceId: savedWorkspaceId });
              }
            } catch (_e) {
              // Ignore localStorage errors
            }
          }

          // If no saved workspace or saved workspace not in list, find first available
          if (!workspaceToSelect) {
            const availableWorkspace = workspaces.find(
              (ws) => !failedWorkspaceIds.has(ws.workspace.id)
            );
            workspaceToSelect = availableWorkspace?.workspace.id || null;
          }

          // If all workspaces have failed, clear the failed set and try the first one
          if (!workspaceToSelect && failedWorkspaceIds.size > 0) {
            failedWorkspaceIds.clear();
            workspaceToSelect = workspaces[0]?.workspace.id || null;
          }

          if (workspaceToSelect) {
            await this.selectWorkspace(workspaceToSelect);
          }
        } else if (workspaces.length === 0) {
          update(state => ({
            ...state,
            currentWorkspace: null,
            loading: false
          }));
          toast.info('No workspace found. Please create a workspace or log out and log back in to get a default workspace.');
        } else if (!isCurrentWorkspaceAccessible && currentWorkspaceId) {
          // Current workspace was removed, notify user
          toast.warning('You no longer have access to the previously selected workspace.');
        }
      } catch (error) {
        log.error('Load workspaces error', error instanceof Error ? error : new Error(String(error)));
        const errorMessage = error instanceof Error ? error.message : 'Failed to load workspaces';
        update(state => ({
          ...state,
          error: errorMessage,
          loading: false,
          workspaces: [],
          currentWorkspace: null
        }));
        toast.error('Failed to load workspaces');
      }
    },

    // Select a workspace by ID
    async selectWorkspace(workspaceId: string, skipVerification = false): Promise<void> {
      // Prevent infinite loops
      if (isSelectingWorkspace && !skipVerification) {
        return;
      }

      isSelectingWorkspace = true;

      try {
        const currentState = get({ subscribe });
        const workspaceMember = currentState.workspaces.find(
          (ws: WorkspaceMember) => ws.workspace.id === workspaceId
        );

        if (!workspaceMember) {
          // Workspace not in list, reload workspaces first
          isSelectingWorkspace = false;
          await this.loadWorkspaces();
          const newState = get({ subscribe });
          const foundWorkspace = newState.workspaces.find(
            (ws: WorkspaceMember) => ws.workspace.id === workspaceId
          );

          if (!foundWorkspace) {
            toast.error('Workspace not found or access denied');
            return;
          }

          // Retry with the found workspace
          isSelectingWorkspace = true;
          await this.selectWorkspace(workspaceId, true);
          return;
        }

        // Verify access by trying to load documents (lightweight check)
        if (!skipVerification) {
          try {
            await api.get(endpoints.documents.listByWorkspace(workspaceId));
            // Success - clear from failed set
            failedWorkspaceIds.delete(workspaceId);
          } catch (error) {
            log.error('Workspace access verification error', error instanceof Error ? error : new Error(String(error)), { workspaceId });
            if (error instanceof Error && (error.message.includes('Access denied') || error.message.includes('403'))) {
              // Access denied - mark as failed
              failedWorkspaceIds.add(workspaceId);
              update(state => ({
                ...state,
                currentWorkspace: null,
                error: 'Access denied'
              }));
              toast.error('You do not have access to this workspace. Please select a different workspace.');
              isSelectingWorkspace = false;
              return;
            } else {
              // Other error (network, etc.)
              update(state => ({
                ...state,
                error: error instanceof Error ? error.message : 'Unknown error'
              }));
              toast.error('Failed to verify workspace access. Please try again.');
              isSelectingWorkspace = false;
              return;
            }
          }
        }

        // Set workspace if verification passed or was skipped
        update(state => ({
          ...state,
          currentWorkspace: workspaceMember.workspace,
          error: null
        }));

        // Store in localStorage for persistence
        if (browser) {
          try {
            localStorage.setItem('currentWorkspaceId', workspaceId);
          } catch (e) {
            // Ignore localStorage errors
          }
        }
      } finally {
        isSelectingWorkspace = false;
      }
    },

    // Get current workspace ID (helper)
    getCurrentWorkspaceId(): string | null {
      const state = get({ subscribe });
      return state.currentWorkspace?.id || null;
    },

    // Clear current workspace
    clearWorkspace(): void {
      update(state => ({
        ...state,
        currentWorkspace: null
      }));
      if (browser) {
        try {
          localStorage.removeItem('currentWorkspaceId');
        } catch (e) {
          // Ignore localStorage errors
        }
      }
      failedWorkspaceIds.clear();
    },

    // Reset store
    reset(): void {
      set({
        workspaces: [],
        currentWorkspace: null,
        loading: false,
        error: null
      });
      isSelectingWorkspace = false;
      failedWorkspaceIds.clear();
      if (browser) {
        try {
          localStorage.removeItem('currentWorkspaceId');
        } catch (e) {
          // Ignore localStorage errors
        }
      }
    }
  };
}

export const workspaceStore = createWorkspaceStore();

// Derived store for current workspace ID (for convenience)
export const currentWorkspaceId = derived(workspaceStore, $store => $store.currentWorkspace?.id || null);

