import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, endpoints, ApiError } from './api-client';

describe('API Client', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('endpoints', () => {
		it('should have correct auth endpoints', () => {
			expect(endpoints.auth.register).toBe('/api/auth/register');
			expect(endpoints.auth.login).toBe('/api/auth/login');
			expect(endpoints.auth.logout).toBe('/api/auth/logout');
			expect(endpoints.auth.me).toBe('/api/auth/me');
		});

		it('should generate correct workspace endpoints', () => {
			expect(endpoints.workspaces.list).toBe('/api/workspaces');
			expect(endpoints.workspaces.get('workspace-123')).toBe('/api/workspaces/workspace-123');
			expect(endpoints.workspaces.members('workspace-123')).toBe('/api/workspaces/workspace-123/members');
		});

		it('should generate correct document endpoints', () => {
			expect(endpoints.documents.listByWorkspace('workspace-123')).toBe('/api/documents/workspace/workspace-123');
			expect(endpoints.documents.get('doc-123')).toBe('/api/documents/doc-123');
		});

		it('should generate correct project endpoints', () => {
			expect(endpoints.projects.listByWorkspace('workspace-123')).toBe('/api/projects/workspace/workspace-123');
			expect(endpoints.projects.get('project-123')).toBe('/api/projects/project-123');
		});

		it('should generate correct export endpoints', () => {
			expect(endpoints.export.markdown('doc-123')).toBe('/api/export/document/doc-123/markdown');
			expect(endpoints.export.pdf('doc-123')).toBe('/api/export/document/doc-123/pdf');
		});
	});

	describe('api methods', () => {
		beforeEach(() => {
			global.fetch = vi.fn();
		});

		it('should call GET request correctly', async () => {
			const mockResponse = { data: 'test' };
			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				headers: new Headers({ 'content-type': 'application/json' }),
				json: async () => mockResponse
			});

			const result = await api.get('/test');

			expect(global.fetch).toHaveBeenCalledWith(
				'http://localhost:4000/test',
				expect.objectContaining({
					method: 'GET',
					credentials: 'include'
				})
			);
			expect(result).toEqual(mockResponse);
		});

		it('should call POST request correctly', async () => {
			const mockData = { name: 'test' };
			const mockResponse = { id: '123', ...mockData };
			
			// Mock CSRF token fetch first
			(global.fetch as any)
				.mockResolvedValueOnce({
					ok: true,
					headers: new Headers({ 'content-type': 'application/json' }),
					json: async () => ({ csrfToken: 'test-csrf-token' })
				})
				.mockResolvedValueOnce({
					ok: true,
					headers: new Headers({ 'content-type': 'application/json' }),
					json: async () => mockResponse
				});

			const result = await api.post('/test', mockData);

			expect(result).toEqual(mockResponse);
			expect(global.fetch).toHaveBeenCalledWith(
				'http://localhost:4000/test',
				expect.objectContaining({
					method: 'POST',
					credentials: 'include',
					body: JSON.stringify(mockData)
				})
			);
		});

		it('should handle API errors', async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: false,
				status: 404,
				statusText: 'Not Found',
				headers: new Headers({ 'content-type': 'application/json' }),
				json: async () => ({ error: 'Resource not found' })
			});

			await expect(api.get('/not-found')).rejects.toThrow(ApiError);
		});

		it('should handle 204 No Content responses', async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				status: 204,
				headers: new Headers()
			});

			const result = await api.delete('/test');
			expect(result).toBeNull();
		});

		it('should include CSRF token in POST requests', async () => {
			const mockToken = 'csrf-token-123';
			
			// Reset fetch mock to start fresh
			(global.fetch as any).mockClear();
			
			// Mock CSRF token fetch
			(global.fetch as any)
				.mockResolvedValueOnce({
					ok: true,
					headers: new Headers({ 'content-type': 'application/json' }),
					json: async () => ({ csrfToken: mockToken })
				})
				.mockResolvedValueOnce({
					ok: true,
					headers: new Headers({ 'content-type': 'application/json' }),
					json: async () => ({ success: true })
				});

			await api.post('/test', { data: 'test' });

			// Verify fetch was called (at least once for actual request, possibly twice if CSRF token wasn't cached)
			expect(global.fetch).toHaveBeenCalled();
			
			// Find the POST request call
			const postCall = (global.fetch as any).mock.calls.find((call: any[]) => 
				call[0].includes('/test') && !call[0].includes('csrf-token')
			);
			
			expect(postCall).toBeDefined();
			
			// Check that the POST call includes the CSRF token in headers
			const postCallHeaders = postCall[1].headers;
			expect(postCallHeaders['X-CSRF-Token']).toBeDefined();
		});
	});
});

