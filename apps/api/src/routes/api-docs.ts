/**
 * API Documentation Routes
 * 
 * OpenAPI/Swagger documentation for the Kollab API
 */

import { Hono } from 'hono';
import { swaggerUI } from '@hono/swagger-ui';

const apiDocsRoutes = new Hono();

// OpenAPI 3.0 specification
const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Kollab API',
    version: '2.0.11',
    description: 'API documentation for Kollab - Modern Collaboration Platform',
    contact: {
      name: 'Kollab Team'
    },
    license: {
      name: 'MIT'
    }
  },
  servers: [
    {
      url: 'http://localhost:4000',
      description: 'Development server'
    },
    {
      url: 'https://api.kollab.com',
      description: 'Production server'
    }
  ],
  tags: [
    { name: 'Authentication', description: 'User authentication endpoints' },
    { name: 'Workspaces', description: 'Workspace management' },
    { name: 'Documents', description: 'Document management' },
    { name: 'Projects', description: 'Project management' },
    { name: 'Tasks', description: 'Task management' },
    { name: 'Teams', description: 'Team management' },
    { name: 'Search', description: 'Search functionality' },
    { name: 'Health', description: 'Health check endpoints' },
    { name: 'Notes', description: 'Notes management' },
    { name: 'Wiki', description: 'Wiki pages management' },
    { name: 'Events', description: 'Calendar events management' },
    { name: 'Templates', description: 'Template management' },
    { name: 'Notifications', description: 'Notification management' },
    { name: 'Export', description: 'Export functionality' }
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        description: 'Comprehensive health check with dependency status',
        responses: {
          '200': {
            description: 'Service is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'healthy' },
                    checks: {
                      type: 'object',
                      properties: {
                        api: { type: 'string' },
                        database: { type: 'object' },
                        redis: { type: 'object' },
                        meilisearch: { type: 'object' }
                      }
                    },
                    timestamp: { type: 'string', format: 'date-time' }
                  }
                }
              }
            }
          },
          '503': {
            description: 'Service is degraded'
          }
        }
      }
    },
    '/health/live': {
      get: {
        tags: ['Health'],
        summary: 'Liveness probe',
        description: 'Simple liveness check for orchestration',
        responses: {
          '200': {
            description: 'Service is alive',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'alive' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/health/ready': {
      get: {
        tags: ['Health'],
        summary: 'Readiness probe',
        description: 'Readiness check with dependency verification',
        responses: {
          '200': {
            description: 'Service is ready',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ready' },
                    checks: { type: 'object' },
                    timestamp: { type: 'string', format: 'date-time' }
                  }
                }
              }
            }
          },
          '503': {
            description: 'Service is not ready'
          }
        }
      }
    },
    '/api/auth/register': {
      post: {
        tags: ['Authentication'],
        summary: 'Register new user',
        description: 'Create a new user account',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password', 'name'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'user@example.com' },
                  password: { 
                    type: 'string', 
                    minLength: 8,
                    example: 'SecurePass123!',
                    description: 'Password must contain uppercase, lowercase, number, and special character'
                  },
                  name: { type: 'string', example: 'John Doe' }
                }
              }
            }
          }
        },
        responses: {
          '201': {
            description: 'User created successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    user: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        email: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          },
          '400': {
            description: 'Validation error or user already exists'
          },
          '429': {
            description: 'Rate limit exceeded'
          }
        }
      }
    },
    '/api/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Login user',
        description: 'Authenticate user and create session',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Login successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    user: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        email: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          },
          '401': {
            description: 'Invalid credentials'
          },
          '429': {
            description: 'Rate limit exceeded'
          }
        }
      }
    },
    '/api/workspaces': {
      get: {
        tags: ['Workspaces'],
        summary: 'List user workspaces',
        description: 'Get all workspaces the authenticated user is a member of',
        security: [{ cookieAuth: [] }],
        responses: {
          '200': {
            description: 'List of workspaces',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    workspaces: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          name: { type: 'string' },
                          slug: { type: 'string' },
                          description: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          '401': {
            description: 'Unauthorized'
          }
        }
      },
      post: {
        tags: ['Workspaces'],
        summary: 'Create workspace',
        description: 'Create a new workspace',
        security: [{ cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', example: 'My Workspace' },
                  description: { type: 'string' },
                  slug: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          '201': {
            description: 'Workspace created'
          },
          '400': {
            description: 'Validation error'
          },
          '429': {
            description: 'Rate limit exceeded'
          }
        }
      }
    },
    '/api/documents': {
      get: {
        tags: ['Documents'],
        summary: 'List documents',
        description: 'Get documents in a workspace',
        security: [{ cookieAuth: [] }],
        parameters: [
          {
            name: 'workspaceId',
            in: 'query',
            required: true,
            schema: { type: 'string', format: 'uuid' }
          }
        ],
        responses: {
          '200': {
            description: 'List of documents'
          }
        }
      },
      post: {
        tags: ['Documents'],
        summary: 'Create document',
        description: 'Create a new document',
        security: [{ cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['workspaceId', 'title'],
                properties: {
                  workspaceId: { type: 'string', format: 'uuid' },
                  parentId: { type: 'string', format: 'uuid' },
                  title: { type: 'string', minLength: 1, maxLength: 255 },
                  icon: { type: 'string' },
                  content: { type: 'object', description: 'TipTap JSON content' }
                }
              }
            }
          }
        },
        responses: {
          '201': {
            description: 'Document created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    document: { $ref: '#/components/schemas/Document' }
                  }
                }
              }
            }
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '429': { $ref: '#/components/responses/RateLimitExceeded' }
        }
      }
    },
    '/api/tasks': {
      get: {
        tags: ['Tasks'],
        summary: 'List tasks',
        description: 'Get tasks with optional filtering',
        security: [{ cookieAuth: [] }],
        parameters: [
          {
            name: 'projectId',
            in: 'query',
            schema: { type: 'string', format: 'uuid' }
          },
          {
            name: 'workspaceId',
            in: 'query',
            schema: { type: 'string', format: 'uuid' }
          },
          {
            name: 'page',
            in: 'query',
            schema: { type: 'integer', default: 1, minimum: 1 }
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', default: 50, minimum: 1, maximum: 100 }
          }
        ],
        responses: {
          '200': {
            description: 'List of tasks with pagination'
          }
        }
      },
      post: {
        tags: ['Tasks'],
        summary: 'Create task',
        description: 'Create a new task',
        security: [{ cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['workspaceId', 'title'],
                properties: {
                  workspaceId: { type: 'string', format: 'uuid' },
                  projectId: { type: 'string', format: 'uuid' },
                  title: { type: 'string', minLength: 1, maxLength: 255 },
                  description: { type: 'string' },
                  status: { 
                    type: 'string', 
                    enum: ['todo', 'in_progress', 'done', 'cancelled'],
                    default: 'todo'
                  },
                  priority: {
                    type: 'string',
                    enum: ['low', 'medium', 'high', 'urgent'],
                    default: 'medium'
                  },
                  assigneeId: { type: 'string', format: 'uuid' },
                  dueDate: { type: 'string', format: 'date-time' },
                  tagIds: {
                    type: 'array',
                    items: { type: 'string', format: 'uuid' }
                  }
                }
              }
            }
          }
        },
        responses: {
          '201': {
            description: 'Task created'
          },
          '400': {
            description: 'Validation error'
          },
          '429': {
            description: 'Rate limit exceeded'
          }
        }
      }
    },
    '/api/search': {
      get: {
        tags: ['Search'],
        summary: 'Global search',
        description: 'Search across documents, tasks, and workspaces',
        security: [{ cookieAuth: [] }],
        parameters: [
          {
            name: 'q',
            in: 'query',
            required: true,
            schema: { type: 'string', minLength: 2 },
            description: 'Search query (minimum 2 characters)'
          },
          {
            name: 'workspace',
            in: 'query',
            schema: { type: 'string', format: 'uuid' },
            description: 'Filter by workspace ID'
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 }
          }
        ],
        responses: {
          '200': {
            description: 'Search results',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    results: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          title: { type: 'string' },
                          resultType: { type: 'string', enum: ['document', 'task', 'workspace'] },
                          score: { type: 'number' }
                        }
                      }
                    },
                    query: { type: 'string' },
                    total: { type: 'integer' },
                    processingTimeMs: { type: 'number' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/documents/workspace/:workspaceId': {
      get: {
        tags: ['Documents'],
        summary: 'List documents in workspace',
        description: 'Get all documents in a workspace',
        security: [{ cookieAuth: [] }],
        parameters: [
          {
            name: 'workspaceId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' }
          }
        ],
        responses: {
          '200': {
            description: 'List of documents',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    documents: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Document' }
                    }
                  }
                }
              }
            }
          },
          '403': { $ref: '#/components/responses/Forbidden' }
        }
      }
    },
    '/api/projects': {
      get: {
        tags: ['Projects'],
        summary: 'List projects',
        description: 'Get all projects in a workspace',
        security: [{ cookieAuth: [] }],
        parameters: [
          {
            name: 'workspaceId',
            in: 'query',
            required: true,
            schema: { type: 'string', format: 'uuid' }
          },
          {
            name: 'page',
            in: 'query',
            schema: { type: 'integer', default: 1, minimum: 1 }
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', default: 50, minimum: 1, maximum: 100 }
          }
        ],
        responses: {
          '200': {
            description: 'List of projects with pagination'
          }
        }
      },
      post: {
        tags: ['Projects'],
        summary: 'Create project',
        description: 'Create a new project',
        security: [{ cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['workspaceId', 'name'],
                properties: {
                  workspaceId: { type: 'string', format: 'uuid' },
                  name: { type: 'string', minLength: 1, maxLength: 255 },
                  description: { type: 'string' },
                  viewType: {
                    type: 'string',
                    enum: ['list', 'board', 'calendar', 'table', 'timeline'],
                    default: 'list'
                  }
                }
              }
            }
          }
        },
        responses: {
          '201': { description: 'Project created' },
          '400': { $ref: '#/components/responses/ValidationError' },
          '429': { $ref: '#/components/responses/RateLimitExceeded' }
        }
      }
    },
    '/api/teams': {
      get: {
        tags: ['Teams'],
        summary: 'List teams',
        description: 'Get all teams in a workspace',
        security: [{ cookieAuth: [] }],
        parameters: [
          {
            name: 'workspaceId',
            in: 'query',
            required: true,
            schema: { type: 'string', format: 'uuid' }
          }
        ],
        responses: {
          '200': {
            description: 'List of teams'
          }
        }
      },
      post: {
        tags: ['Teams'],
        summary: 'Create team',
        description: 'Create a new team',
        security: [{ cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['workspaceId', 'name'],
                properties: {
                  workspaceId: { type: 'string', format: 'uuid' },
                  name: { type: 'string', minLength: 1, maxLength: 255 },
                  description: { type: 'string' },
                  color: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          '201': { description: 'Team created' },
          '429': { $ref: '#/components/responses/RateLimitExceeded' }
        }
      }
    },
    '/api/notes': {
      get: {
        tags: ['Notes'],
        summary: 'List notes',
        description: 'Get all notes in a workspace',
        security: [{ cookieAuth: [] }],
        parameters: [
          {
            name: 'workspaceId',
            in: 'query',
            required: true,
            schema: { type: 'string', format: 'uuid' }
          }
        ],
        responses: {
          '200': {
            description: 'List of notes'
          }
        }
      }
    },
    '/api/wiki': {
      get: {
        tags: ['Wiki'],
        summary: 'List wiki pages',
        description: 'Get all wiki pages in a workspace',
        security: [{ cookieAuth: [] }],
        parameters: [
          {
            name: 'workspaceId',
            in: 'query',
            required: true,
            schema: { type: 'string', format: 'uuid' }
          }
        ],
        responses: {
          '200': {
            description: 'List of wiki pages'
          }
        }
      }
    },
    '/api/events': {
      get: {
        tags: ['Events'],
        summary: 'List events',
        description: 'Get all events in a workspace',
        security: [{ cookieAuth: [] }],
        parameters: [
          {
            name: 'workspaceId',
            in: 'query',
            required: true,
            schema: { type: 'string', format: 'uuid' }
          },
          {
            name: 'startDate',
            in: 'query',
            schema: { type: 'string', format: 'date-time' }
          },
          {
            name: 'endDate',
            in: 'query',
            schema: { type: 'string', format: 'date-time' }
          }
        ],
        responses: {
          '200': {
            description: 'List of events'
          }
        }
      }
    },
    '/api/templates': {
      get: {
        tags: ['Templates'],
        summary: 'List templates',
        description: 'Get all templates for a workspace',
        security: [{ cookieAuth: [] }],
        parameters: [
          {
            name: 'workspaceId',
            in: 'query',
            schema: { type: 'string', format: 'uuid' }
          }
        ],
        responses: {
          '200': {
            description: 'List of templates'
          }
        }
      }
    },
    '/api/notifications': {
      get: {
        tags: ['Notifications'],
        summary: 'List notifications',
        description: 'Get all notifications for the authenticated user',
        security: [{ cookieAuth: [] }],
        parameters: [
          {
            name: 'unreadOnly',
            in: 'query',
            schema: { type: 'boolean', default: false }
          }
        ],
        responses: {
          '200': {
            description: 'List of notifications'
          }
        }
      }
    },
    '/api/export': {
      post: {
        tags: ['Export'],
        summary: 'Export document',
        description: 'Export a document to various formats (PDF, Markdown, HTML)',
        security: [{ cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['documentId', 'format'],
                properties: {
                  documentId: { type: 'string', format: 'uuid' },
                  format: {
                    type: 'string',
                    enum: ['pdf', 'markdown', 'html']
                  }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Export file',
            content: {
              'application/pdf': { schema: { type: 'string', format: 'binary' } },
              'text/markdown': { schema: { type: 'string' } },
              'text/html': { schema: { type: 'string' } }
            }
          },
          '429': { $ref: '#/components/responses/RateLimitExceeded' }
        }
      }
    },
    '/metrics': {
      get: {
        tags: ['Health'],
        summary: 'Prometheus metrics',
        description: 'Prometheus metrics endpoint for monitoring',
        responses: {
          '200': {
            description: 'Metrics in Prometheus format',
            content: {
              'text/plain': {
                schema: { type: 'string' }
              }
            }
          }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'session'
      }
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          code: { type: 'string' },
          status: { type: 'number' },
          details: { type: 'object' }
        }
      },
      Document: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          workspaceId: { type: 'string', format: 'uuid' },
          parentId: { type: 'string', format: 'uuid', nullable: true },
          title: { type: 'string' },
          icon: { type: 'string', nullable: true },
          coverUrl: { type: 'string', nullable: true },
          content: { type: 'object' },
          isArchived: { type: 'boolean' },
          isPublished: { type: 'boolean' },
          publishedSlug: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      Task: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          workspaceId: { type: 'string', format: 'uuid' },
          projectId: { type: 'string', format: 'uuid', nullable: true },
          title: { type: 'string' },
          description: { type: 'string', nullable: true },
          status: {
            type: 'string',
            enum: ['todo', 'in_progress', 'done', 'cancelled']
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'urgent']
          },
          assigneeId: { type: 'string', format: 'uuid', nullable: true },
          dueDate: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      Workspace: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          slug: { type: 'string' },
          description: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      }
    },
    responses: {
      Unauthorized: {
        description: 'Authentication required',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' }
          }
        }
      },
      Forbidden: {
        description: 'Access denied',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' }
          }
        }
      },
      NotFound: {
        description: 'Resource not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' }
          }
        }
      },
      ValidationError: {
        description: 'Validation error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' }
          }
        }
      },
      RateLimitExceeded: {
        description: 'Rate limit exceeded',
        headers: {
          'Retry-After': {
            schema: { type: 'string' },
            description: 'Seconds to wait before retrying'
          },
          'X-RateLimit-Limit': {
            schema: { type: 'string' }
          },
          'X-RateLimit-Remaining': {
            schema: { type: 'string' }
          }
        },
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' }
          }
        }
      }
    }
  }
};

// Swagger UI endpoint
apiDocsRoutes.get('/ui', swaggerUI({ 
  url: '/api-docs/spec'
}));

// OpenAPI spec endpoint
apiDocsRoutes.get('/spec', (c) => {
  return c.json(openApiSpec);
});

export default apiDocsRoutes;

