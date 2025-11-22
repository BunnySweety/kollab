import { Context, Next } from 'hono';
import { cacheIncr, cacheTTL, CACHE_KEYS } from '../lib/cache';
import { log } from '../lib/logger';

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max number of requests per window
  message?: string;
  keyGenerator?: (c: Context) => string;
}

/**
 * Redis-based rate limiting middleware
 * Supports multi-instance deployments by using Redis as shared storage
 * @param config - Rate limit configuration
 * @returns Middleware function
 */
export function rateLimiter(config: RateLimitConfig) {
  const {
    windowMs,
    maxRequests,
    message = 'Too many requests, please try again later',
    keyGenerator = (c: Context) => {
      // Default: use user ID if authenticated, otherwise IP
      const user = c.get('user');
      return user?.id || c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'anonymous';
    }
  } = config;

  const windowSeconds = Math.ceil(windowMs / 1000);

  return async (c: Context, next: Next) => {
    const identifier = keyGenerator(c);
    const rateLimitKey = `${CACHE_KEYS.RATE_LIMIT}${identifier}`;

    try {
      // Increment request count in Redis (with automatic expiry)
      const currentCount = await cacheIncr(rateLimitKey, windowSeconds);

      // Check if limit exceeded
      if (currentCount > maxRequests) {
        // Get TTL to calculate retry-after
        const ttl = await cacheTTL(rateLimitKey);
        const retryAfter = ttl > 0 ? ttl : windowSeconds;

        log.warn('Rate limit exceeded', {
          identifier,
          currentCount,
          maxRequests,
          retryAfter
        });

        return c.json(
          {
            error: message,
            retryAfter: `${retryAfter} seconds`
          },
          429,
          {
            'Retry-After': retryAfter.toString(),
            'X-RateLimit-Limit': maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(Date.now() + retryAfter * 1000).toISOString()
          }
        );
      }

      // Add rate limit headers
      const remaining = Math.max(0, maxRequests - currentCount);
      const ttl = await cacheTTL(rateLimitKey);
      const resetTime = ttl > 0 ? Date.now() + (ttl * 1000) : Date.now() + windowMs;

      c.header('X-RateLimit-Limit', maxRequests.toString());
      c.header('X-RateLimit-Remaining', remaining.toString());
      c.header('X-RateLimit-Reset', new Date(resetTime).toISOString());

      await next();
    } catch (error) {
      // If Redis is unavailable, log error and allow request (fail open)
      log.error('Rate limiter error', error as Error, { identifier });
      
      // Set warning header
      c.header('X-RateLimit-Warning', 'Rate limiting temporarily unavailable');
      
      await next();
    }
  };
}

// Pre-configured rate limiters for common use cases

/**
 * Strict rate limiter for authentication endpoints
 * 5 requests per 15 minutes
 */
export const authRateLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5,
  message: 'Too many authentication attempts, please try again later'
});

/**
 * Rate limiter for export endpoints
 * 10 requests per minute
 */
export const exportRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,
  message: 'Too many export requests, please slow down'
});

/**
 * Rate limiter for search endpoints
 * 100 requests per minute
 */
export const searchRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
  message: 'Too many search requests, please slow down'
});

/**
 * General API rate limiter
 * 1000 requests per hour
 */
export const apiRateLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 1000,
  message: 'API rate limit exceeded'
});

/**
 * Rate limiter for file uploads
 * 20 uploads per minute (to prevent abuse)
 */
export const uploadRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 20,
  message: 'Too many file uploads, please slow down'
});

/**
 * Rate limiter for resource creation (projects, tasks, documents, teams)
 * 30 creations per minute
 */
export const createRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30,
  message: 'Too many creation requests, please slow down'
});

/**
 * Rate limiter for resource updates
 * 60 updates per minute
 */
export const updateRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60,
  message: 'Too many update requests, please slow down'
});

/**
 * Rate limiter for resource deletions
 * 10 deletions per minute (more restrictive for safety)
 */
export const deleteRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,
  message: 'Too many deletion requests, please slow down'
});

/**
 * Rate limiter for document creation
 * 10 document creations per minute (more restrictive due to content processing)
 */
export const documentCreateRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,
  message: 'Too many document creations, please slow down'
});

/**
 * Rate limiter for task creation
 * 20 task creations per minute
 */
export const taskCreateRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 20,
  message: 'Too many task creations, please slow down'
});

/**
 * Rate limiter for project creation
 * 5 project creations per minute (projects are complex resources)
 */
export const projectCreateRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 5,
  message: 'Too many project creations, please slow down'
});

/**
 * Rate limiter for team creation
 * 10 team creations per minute
 */
export const teamCreateRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,
  message: 'Too many team creations, please slow down'
});

/**
 * Rate limiter for workspace creation
 * 3 workspace creations per minute (workspaces are expensive resources)
 */
export const workspaceCreateRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 3,
  message: 'Too many workspace creations, please slow down'
});

/**
 * Rate limiter for file uploads (more restrictive)
 * 10 uploads per minute
 */
export const fileUploadRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,
  message: 'Too many file uploads, please slow down'
});

/**
 * Rate limiter for notification operations
 * 100 notification reads per minute
 */
export const notificationRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
  message: 'Too many notification requests, please slow down'
});
