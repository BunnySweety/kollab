import { createMiddleware } from 'hono/factory';
import { getCookie, setCookie } from 'hono/cookie';
import crypto from 'crypto';
import { log } from '../lib/logger';

/**
 * CSRF Protection Middleware
 * 
 * Uses Double Submit Cookie pattern:
 * - Stores CSRF token in httpOnly cookie
 * - Requires token in X-CSRF-Token header for state-changing requests
 * - Validates token match on POST, PUT, PATCH, DELETE
 * 
 * Security: Prevents CSRF attacks by requiring a token that attackers cannot access
 */

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const TOKEN_LENGTH = 32;

// Paths that don't require CSRF validation (e.g., login where no session exists yet)
const EXEMPT_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/health',
];

/**
 * Generate a cryptographically secure random token
 */
function generateToken(): string {
  return crypto.randomBytes(TOKEN_LENGTH).toString('hex');
}

/**
 * Check if the request path is exempt from CSRF validation
 */
function isExemptPath(path: string): boolean {
  return EXEMPT_PATHS.some(exempt => path.startsWith(exempt));
}

/**
 * Check if the request method requires CSRF validation
 */
function requiresCsrfValidation(method: string): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
}

/**
 * CSRF Token Generation Middleware
 * 
 * Ensures every request has a valid CSRF token in cookie
 * Call this BEFORE requireCsrfValidation
 */
export const ensureCsrfToken = createMiddleware(async (c, next) => {
  // Check if CSRF token exists in cookie
  let csrfToken = getCookie(c, CSRF_COOKIE_NAME);

  // Generate new token if missing or invalid
  if (!csrfToken || csrfToken.length !== TOKEN_LENGTH * 2) {
    csrfToken = generateToken();

    // Set CSRF token in httpOnly cookie
    setCookie(c, CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
  }

  // Store token in context for access in routes
  c.set('csrfToken', csrfToken);

  await next();
});

/**
 * CSRF Token Validation Middleware
 * 
 * Validates CSRF token on state-changing requests (POST, PUT, PATCH, DELETE)
 * Blocks request if token is missing or doesn't match
 */
export const requireCsrfValidation = createMiddleware(async (c, next) => {
  const method = c.req.method;
  const path = c.req.path;

  // Skip validation for exempt paths (login, register, health check)
  if (isExemptPath(path)) {
    await next();
    return;
  }

  // Only validate state-changing requests
  if (!requiresCsrfValidation(method)) {
    await next();
    return;
  }

  // Get CSRF token from cookie
  const cookieToken = getCookie(c, CSRF_COOKIE_NAME);

  // Get CSRF token from header
  const headerToken = c.req.header(CSRF_HEADER_NAME);

  // SECURITY: Reject if no token in cookie (should have been set by ensureCsrfToken)
  if (!cookieToken) {
    log.warn('CSRF: Missing cookie token', { method, path });
    return c.json(
      {
        error: 'CSRF token missing',
        message: 'CSRF protection: token not found in cookie',
      },
      403
    );
  }

  // SECURITY: Reject if no token in header (client must send it)
  if (!headerToken) {
    log.warn('CSRF: Missing header token', { method, path });
    return c.json(
      {
        error: 'CSRF token required',
        message: 'CSRF protection: X-CSRF-Token header is required for this request',
      },
      403
    );
  }

  // SECURITY: Reject if tokens don't match
  // Use timing-safe comparison to prevent timing attacks
  if (!crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))) {
    log.warn('CSRF: Token mismatch', { method, path });
    return c.json(
      {
        error: 'CSRF token invalid',
        message: 'CSRF protection: token mismatch',
      },
      403
    );
  }

  // Token is valid, proceed
  await next();
});

/**
 * Combined CSRF middleware for easy application
 * Apply this to all routes that need CSRF protection
 */
export const csrfProtection = [ensureCsrfToken, requireCsrfValidation];

