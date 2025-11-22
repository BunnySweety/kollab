/**
 * Performance Logger Middleware
 * 
 * Logs performance metrics for each request to improve observability
 * Complements Prometheus metrics with structured logging
 */

import { Context, Next } from 'hono';
import { log } from '../lib/logger';
import { normalizeRoute } from '../lib/metrics';

/**
 * Middleware to log performance metrics for each request
 * 
 * Logs:
 * - Request duration in milliseconds
 * - HTTP method and path
 * - Status code
 * - User ID (if authenticated)
 * - Request/Response sizes (if available)
 * 
 * Only logs requests that take longer than a threshold (default: 100ms)
 * or requests that result in errors (4xx, 5xx)
 */
export async function performanceLogger(c: Context, next: Next) {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;
  const route = normalizeRoute(path);
  
  // Get user from context (set by requireAuth middleware)
  const user = c.get('user');
  
  // Measure request size if available
  const requestSize = c.req.header('content-length') 
    ? parseInt(c.req.header('content-length') || '0', 10) 
    : 0;
  
  await next();
  
  // Calculate duration
  const duration = Date.now() - start;
  const statusCode = c.res.status;
  
  // Measure response size if available
  const responseSize = c.res.headers.get('content-length')
    ? parseInt(c.res.headers.get('content-length') || '0', 10)
    : 0;
  
  // Log performance metrics
  // Log all requests, but with different levels based on duration and status
  const context = {
    method,
    path,
    route,
    statusCode,
    duration: `${duration}ms`,
    durationMs: duration,
    userId: user?.id,
    ...(requestSize > 0 && { requestSize: `${requestSize} bytes` }),
    ...(responseSize > 0 && { responseSize: `${responseSize} bytes` })
  };
  
  // Log based on performance and status
  if (statusCode >= 500) {
    // Server errors - always log as error
    log.error('Request completed with server error', undefined, context);
  } else if (statusCode >= 400) {
    // Client errors - log as warning
    log.warn('Request completed with client error', context);
  } else if (duration > 1000) {
    // Slow requests (>1s) - log as warning
    log.warn('Slow request detected', context);
  } else if (duration > 500) {
    // Medium requests (>500ms) - log as info
    log.info('Request completed', context);
  } else {
    // Fast requests - log as debug (only in development)
    log.debug('Request completed', context);
  }
}

