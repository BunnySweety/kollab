/**
 * Error Context Middleware Tests
 * 
 * Tests for the error context enrichment middleware
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { enrichErrorContext } from '../middleware/error-context';
import { ValidationError, NotFoundError, ForbiddenError } from '../lib/errors';

describe('Error Context Middleware', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.use('*', enrichErrorContext);
  });

  it('should enrich AppError with request context', async () => {
    app.get('/test', async (_c) => {
      throw new ValidationError('Test error');
    });

    const res = await app.request('/test');
    expect(res.status).toBe(400);
    
    const body = await res.json() as { details?: Record<string, unknown> };
    expect(body.details).toBeDefined();
    expect(body.details?.path).toBe('/test');
    expect(body.details?.method).toBe('GET');
    expect(body.details?.timestamp).toBeDefined();
  });

  it('should include userId if user is authenticated', async () => {
    const testUserId = 'test-user-123';
    
    app.get('/test', async (c) => {
      // Simulate authenticated user (minimal user object)
      c.set('user', { 
        id: testUserId,
        name: 'Test User',
        email: 'test@example.com',
        hashedPassword: null,
        avatarUrl: null,
        emailVerified: null,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      throw new NotFoundError('Resource');
    });

    const res = await app.request('/test');
    expect(res.status).toBe(404);
    
    const body = await res.json() as { details?: Record<string, unknown> };
    expect(body.details).toBeDefined();
    expect(body.details?.userId).toBe(testUserId);
  });

  it('should not include userId if user is not authenticated', async () => {
    app.get('/test', async (_c) => {
      throw new ForbiddenError('Access denied');
    });

    const res = await app.request('/test');
    expect(res.status).toBe(403);
    
    const body = await res.json() as { details?: Record<string, unknown> };
    expect(body.details).toBeDefined();
    expect(body.details?.userId).toBeUndefined();
  });

  it('should merge with existing error details', async () => {
    app.get('/test', async (_c) => {
      throw new ValidationError('Test error', {
        customField: 'customValue',
        existingContext: true
      });
    });

    const res = await app.request('/test');
    expect(res.status).toBe(400);
    
    const body = await res.json() as { details?: Record<string, unknown> };
    expect(body.details).toBeDefined();
    expect(body.details?.customField).toBe('customValue');
    expect(body.details?.existingContext).toBe(true);
    // Should merge with auto-enriched fields
    expect(body.details?.path).toBe('/test');
    expect(body.details?.method).toBe('GET');
  });

  it('should work with different HTTP methods', async () => {
    app.post('/test', async (_c) => {
      throw new ValidationError('Test error');
    });

    const res = await app.request('/test', { method: 'POST' });
    expect(res.status).toBe(400);
    
    const body = await res.json() as { details?: Record<string, unknown> };
    expect(body.details).toBeDefined();
    expect(body.details?.method).toBe('POST');
  });

  it('should include timestamp in ISO format', async () => {
    const before = new Date().toISOString();
    
    app.get('/test', async (_c) => {
      throw new ValidationError('Test error');
    });

    const res = await app.request('/test');
    const after = new Date().toISOString();
    
    const body = await res.json() as { details?: Record<string, unknown> };
    expect(body.details).toBeDefined();
    expect(body.details?.timestamp).toBeDefined();
    
    const timestamp = body.details?.timestamp as string;
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(timestamp >= before).toBe(true);
    expect(timestamp <= after).toBe(true);
  });

  it('should not affect non-AppError errors', async () => {
    app.get('/test', async (_c) => {
      throw new Error('Standard error');
    });

    // The error should still be thrown, but not enriched
    // (it will be converted to AppError by toAppError in the error handler)
    const res = await app.request('/test');
    expect(res.status).toBe(500);
  });

  it('should work with nested paths', async () => {
    app.get('/api/workspaces/:id', async (_c) => {
      throw new NotFoundError('Workspace');
    });

    const res = await app.request('/api/workspaces/123');
    expect(res.status).toBe(404);
    
    const body = await res.json() as { details?: Record<string, unknown> };
    expect(body.details).toBeDefined();
    expect(body.details?.path).toBe('/api/workspaces/123');
  });
});

