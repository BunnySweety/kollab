/**
 * Error Context Middleware
 * 
 * Automatically enriches errors with request context (path, method, userId, timestamp)
 * This improves observability and debugging by providing context for all errors
 */

import { Context, Next } from 'hono';
import { isAppError } from '../lib/errors';

/**
 * Middleware to enrich errors with request context
 * 
 * This middleware catches errors and enriches AppError instances with:
 * - path: Request path
 * - method: HTTP method
 * - userId: Authenticated user ID (if available)
 * - timestamp: ISO timestamp when error occurred
 * 
 * The context is merged with existing error details if present,
 * ensuring that both custom details and request context are preserved.
 */
export async function enrichErrorContext(c: Context, next: Next) {
  try {
    await next();
  } catch (error) {
    // Only enrich AppError instances
    if (isAppError(error)) {
      // Get user from context (set by requireAuth middleware)
      const user = c.get('user');
      
      // Create enriched details (merge with existing if present)
      const enrichedDetails = {
        ...error.details,
        path: c.req.path,
        method: c.req.method,
        userId: user?.id,
        timestamp: new Date().toISOString(),
      };
      
      // Create a new error instance with enriched details
      // We need to preserve the error type and create a new instance
      const enrichedError = Object.create(Object.getPrototypeOf(error));
      Object.assign(enrichedError, error);
      // Use Object.defineProperty to set readonly property
      Object.defineProperty(enrichedError, 'details', {
        value: enrichedDetails,
        writable: false,
        enumerable: true,
        configurable: true,
      });
      
      // Re-throw the enriched error
      throw enrichedError;
    }
    
    // Re-throw the error so it can be handled by the error handler
    throw error;
  }
}

