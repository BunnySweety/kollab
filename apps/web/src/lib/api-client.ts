/**
 * Centralized API Client
 * Eliminates 52 hardcoded localhost URLs across the frontend
 * Includes automatic CSRF protection
 */

// Get API URL from environment variable with fallback
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// CSRF token cache (stored in memory)
let csrfToken: string | null = null;

interface ApiClientOptions extends RequestInit {
  params?: Record<string, string | number | boolean>;
}

/**
 * Fetch CSRF token from the server
 * Caches the token in memory for subsequent requests
 */
async function getCsrfToken(): Promise<string> {
  // Return cached token if available
  if (csrfToken) {
    return csrfToken;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/csrf-token`, {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to fetch CSRF token');
    }

    const data = await response.json();
    csrfToken = data.csrfToken || null;
    return csrfToken || '';
  } catch (_error) {
    // Silently fail - CSRF token fetch errors are handled by the request itself
    return '';
  }
}

/**
 * Check if the HTTP method requires CSRF protection
 */
function requiresCsrfToken(method: string): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
}

/**
 * Centralized API client with automatic error handling
 * @param endpoint - API endpoint (e.g., '/api/projects')
 * @param options - Fetch options with optional query params
 * @returns Response data
 */
export async function apiClient<T = unknown>(
  endpoint: string,
  options: ApiClientOptions = {}
): Promise<T> {
  const { params, ...fetchOptions } = options;

  // Build URL with query parameters
  let url = `${API_BASE_URL}${endpoint}`;
  if (params) {
    const queryString = new URLSearchParams(
      Object.entries(params).map(([key, value]) => [key, String(value)])
    ).toString();
    url += `?${queryString}`;
  }

  // Prepare headers
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...fetchOptions.headers
  };

  // Add CSRF token for state-changing requests
  const method = fetchOptions.method || 'GET';
  if (requiresCsrfToken(method)) {
    const token = await getCsrfToken();
    if (token) {
      (headers as Record<string, string>)['X-CSRF-Token'] = token;
    }
  }

  // Default options
  const defaultOptions: RequestInit = {
    credentials: 'include', // Include cookies for auth
    headers
  };

  try {
    const response = await fetch(url, {
      ...defaultOptions,
      ...fetchOptions
    });

    // Handle non-OK responses
    if (!response.ok) {
      const error = await response.json().catch(() => ({
        error: `HTTP ${response.status}: ${response.statusText}`
      }));
      throw new ApiError(error.error || 'Request failed', response.status, error);
    }

    // Handle empty responses (204 No Content, etc.)
    const contentType = response.headers.get('content-type');
    if (!contentType || response.status === 204) {
      return null as T;
    }

    // Parse JSON response
    if (contentType.includes('application/json')) {
      return await response.json();
    }

    // Return text for non-JSON responses
    return (await response.text()) as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      error instanceof Error ? error.message : 'Network error',
      0,
      { originalError: error }
    );
  }
}

/**
 * Custom API Error class
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Convenience methods for common HTTP verbs
 */
export const api = {
  get: <T = unknown>(endpoint: string, options?: ApiClientOptions) =>
    apiClient<T>(endpoint, { ...options, method: 'GET' }),

  post: <T = unknown>(endpoint: string, data?: unknown, options?: ApiClientOptions) =>
    apiClient<T>(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data)
    }),

  patch: <T = unknown>(endpoint: string, data?: unknown, options?: ApiClientOptions) =>
    apiClient<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(data)
    }),

  put: <T = unknown>(endpoint: string, data?: unknown, options?: ApiClientOptions) =>
    apiClient<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data)
    }),

  delete: <T = unknown>(endpoint: string, options?: ApiClientOptions) =>
    apiClient<T>(endpoint, { ...options, method: 'DELETE' })
};

/**
 * Typed API endpoints
 * Usage examples in other files
 */
export const endpoints = {
  // Auth
  auth: {
    register: '/api/auth/register',
    login: '/api/auth/login',
    logout: '/api/auth/logout',
    me: '/api/auth/me',
    csrfToken: '/api/auth/csrf-token'
  },

  // Workspaces
  workspaces: {
    list: '/api/workspaces',
    create: '/api/workspaces',
    get: (slug: string) => `/api/workspaces/${slug}`,
    update: (slug: string) => `/api/workspaces/${slug}`,
    delete: (slug: string) => `/api/workspaces/${slug}`,
    members: (id: string) => `/api/workspaces/${id}/members`,
    invite: (id: string) => `/api/workspaces/${id}/invite`
  },

  // Documents
  documents: {
    listByWorkspace: (workspaceId: string) => `/api/documents/workspace/${workspaceId}`,
    create: '/api/documents',
    get: (id: string) => `/api/documents/${id}`,
    update: (id: string) => `/api/documents/${id}`,
    archive: (id: string) => `/api/documents/${id}/archive`,
    delete: (id: string) => `/api/documents/${id}`
  },

  // Tasks
  events: {
    listByWorkspace: (workspaceId: string) => `/api/events/workspace/${workspaceId}`,
    create: '/api/events',
    update: (id: string) => `/api/events/${id}`,
    delete: (id: string) => `/api/events/${id}`
  },
  taskColumns: {
    listByWorkspace: (workspaceId: string) => `/api/task-columns/workspace/${workspaceId}`,
    create: '/api/task-columns',
    update: (id: string) => `/api/task-columns/${id}`,
    delete: (id: string) => `/api/task-columns/${id}`,
    reorder: '/api/task-columns/reorder'
  },

  tasks: {
    list: '/api/tasks',
    listByWorkspace: (workspaceId: string) => `/api/tasks/workspace/${workspaceId}`,
    create: '/api/tasks',
    get: (id: string) => `/api/tasks/${id}`,
    update: (id: string) => `/api/tasks/${id}`,
    delete: (id: string) => `/api/tasks/${id}`
  },
  taskTemplates: {
    listByWorkspace: (workspaceId: string) => `/api/task-templates/workspace/${workspaceId}`,
    create: '/api/task-templates',
    get: (id: string) => `/api/task-templates/${id}`,
    update: (id: string) => `/api/task-templates/${id}`,
    delete: (id: string) => `/api/task-templates/${id}`
  },
  taskAttachments: {
    listByTask: (taskId: string) => `/api/task-attachments/task/${taskId}`,
    create: '/api/task-attachments',
    delete: (id: string) => `/api/task-attachments/${id}`
  },
  taskTags: {
    listByWorkspace: (workspaceId: string) => `/api/task-tags/workspace/${workspaceId}`,
    create: '/api/task-tags',
    update: (id: string) => `/api/task-tags/${id}`,
    delete: (id: string) => `/api/task-tags/${id}`
  },
  upload: {
    upload: '/api/upload',
    delete: (key: string) => `/api/upload/${encodeURIComponent(key)}`
  },

  // Projects
  projects: {
    listByWorkspace: (workspaceId: string) => `/api/projects/workspace/${workspaceId}`,
    create: '/api/projects',
    get: (id: string) => `/api/projects/${id}`,
    update: (id: string) => `/api/projects/${id}`,
    delete: (id: string) => `/api/projects/${id}`
  },

  // Drive
  drive: {
    folders: {
      list: '/api/drive/folders',
      get: (id: string) => `/api/drive/folders/${id}`,
      create: '/api/drive/folders',
      update: (id: string) => `/api/drive/folders/${id}`,
      delete: (id: string) => `/api/drive/folders/${id}`
    },
    files: {
      list: '/api/drive/files',
      upload: '/api/drive/files',
      delete: (id: string) => `/api/drive/files/${id}`
    }
  },

  // Teams
  teams: {
    listByWorkspace: (workspaceId: string) => `/api/teams/workspace/${workspaceId}`,
    get: (id: string) => `/api/teams/${id}`,
    create: '/api/teams',
    update: (id: string) => `/api/teams/${id}`,
    delete: (id: string) => `/api/teams/${id}`,
    members: {
      add: (teamId: string) => `/api/teams/${teamId}/members`,
      remove: (teamId: string, userId: string) => `/api/teams/${teamId}/members/${userId}`,
      updateRole: (teamId: string, userId: string) => `/api/teams/${teamId}/members/${userId}`
    }
  },

  // Search
  search: {
    all: '/api/search',
    byIndex: (index: string) => `/api/search/${index}`,
    suggest: (index: string) => `/api/search/suggest/${index}`
  },

  // Templates
  templates: {
    list: '/api/templates',
    gallery: '/api/templates/gallery',
    create: '/api/templates',
    get: (id: string) => `/api/templates/${id}`,
    use: (id: string) => `/api/templates/${id}/use`,
    delete: (id: string) => `/api/templates/${id}`
  },

  // Notifications
  notifications: {
    list: '/api/notifications',
    markRead: '/api/notifications/mark-read',
    markAllRead: '/api/notifications/mark-all-read',
    preferences: '/api/notifications/preferences',
    delete: (id: string) => `/api/notifications/${id}`
  },

  // Export
  export: {
    markdown: (id: string) => `/api/export/document/${id}/markdown`,
    pdf: (id: string) => `/api/export/document/${id}/pdf`,
    formats: '/api/export/formats'
  },

  // Notes
  notes: {
    listByWorkspace: (workspaceId: string) => `/api/notes/workspace/${workspaceId}`,
    get: (id: string) => `/api/notes/${id}`,
    create: '/api/notes',
    update: (id: string) => `/api/notes/${id}`,
    delete: (id: string) => `/api/notes/${id}`
  },

  // Wiki
  wiki: {
    listByWorkspace: (workspaceId: string) => `/api/wiki/workspace/${workspaceId}`,
    get: (id: string) => `/api/wiki/${id}`,
    getBySlug: (workspaceId: string, slug: string) => `/api/wiki/workspace/${workspaceId}/slug/${slug}`,
    create: '/api/wiki',
    update: (id: string) => `/api/wiki/${id}`,
    delete: (id: string) => `/api/wiki/${id}`,
    backlinks: (id: string) => `/api/wiki/${id}/backlinks`,
    analytics: (id: string) => `/api/wiki/${id}/analytics`,
    recordView: (id: string) => `/api/wiki/${id}/view`,
    links: {
      create: (pageId: string) => `/api/wiki/${pageId}/links`,
      delete: (pageId: string, toPageId: string) => `/api/wiki/${pageId}/links/${toPageId}`
    },
    comments: {
      list: (pageId: string) => `/api/wiki/comments/${pageId}`,
      create: (pageId: string) => `/api/wiki/comments/${pageId}`,
      update: (commentId: string) => `/api/wiki/comments/${commentId}`,
      delete: (commentId: string) => `/api/wiki/comments/${commentId}`
    }
  },

  // Databases
  databases: {
    listByWorkspace: (workspaceId: string) => `/api/databases/workspace/${workspaceId}`,
    get: (id: string) => `/api/databases/${id}`,
    create: '/api/databases',
    update: (id: string) => `/api/databases/${id}`,
    delete: (id: string) => `/api/databases/${id}`,
    entries: {
      create: (databaseId: string) => `/api/databases/${databaseId}/entries`,
      update: (databaseId: string, entryId: string) => `/api/databases/${databaseId}/entries/${entryId}`,
      delete: (databaseId: string, entryId: string) => `/api/databases/${databaseId}/entries/${entryId}`
    }
  }
};

/**
 * Usage examples:
 *
 * // Simple GET request
 * const projects = await api.get(endpoints.projects.listByWorkspace('workspace-id'));
 *
 * // POST with data
 * const newTask = await api.post(endpoints.tasks.create, {
 *   title: 'New task',
 *   workspaceId: 'workspace-id'
 * });
 *
 * // PATCH with validation error handling
 * try {
 *   await api.patch(endpoints.documents.update('doc-id'), { title: 'Updated' });
 * } catch (error) {
 *   if (error instanceof ApiError) {
 *     console.error(`Error ${error.status}: ${error.message}`);
 *   }
 * }
 *
 * // GET with query parameters
 * const tasks = await api.get(endpoints.tasks.list, {
 *   params: { workspaceId: 'workspace-id', status: 'todo' }
 * });
 */
