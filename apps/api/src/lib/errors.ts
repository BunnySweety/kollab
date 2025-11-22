/**
 * Custom Error Classes
 * 
 * Standardized error classes for consistent error handling across the application.
 * Based on RFC 7807 (Problem Details for HTTP APIs)
 */

/**
 * Base application error class
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number = 500,
    code?: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code || this.constructor.name;
    this.details = details;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to JSON format (RFC 7807)
   */
  toJSON() {
    return {
      type: `https://api.kollab.com/errors/${this.code.toLowerCase()}`,
      title: this.message,
      status: this.statusCode,
      code: this.code,
      detail: this.message,
      ...(this.details && { details: this.details }),
    };
  }
}

/**
 * Validation Error (400)
 * Used when request data is invalid
 */
export class ValidationError extends AppError {
  constructor(
    message: string = 'Validation failed',
    details?: Record<string, unknown>
  ) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

/**
 * Unauthorized Error (401)
 * Used when authentication is required or failed
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

/**
 * Forbidden Error (403)
 * Used when user is authenticated but doesn't have permission
 */
export class ForbiddenError extends AppError {
  constructor(
    message: string = 'Access denied',
    details?: Record<string, unknown>
  ) {
    super(message, 403, 'FORBIDDEN', details);
  }
}

/**
 * Not Found Error (404)
 * Used when a resource is not found
 */
export class NotFoundError extends AppError {
  constructor(
    resource: string = 'Resource',
    details?: Record<string, unknown>
  ) {
    super(`${resource} not found`, 404, 'NOT_FOUND', details);
  }
}

/**
 * Conflict Error (409)
 * Used when there's a conflict with the current state
 */
export class ConflictError extends AppError {
  constructor(
    message: string = 'Resource conflict',
    details?: Record<string, unknown>
  ) {
    super(message, 409, 'CONFLICT', details);
  }
}

/**
 * Too Many Requests Error (429)
 * Used when rate limit is exceeded
 */
export class RateLimitError extends AppError {
  constructor(
    message: string = 'Too many requests',
    retryAfter?: number,
    details?: Record<string, unknown>
  ) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', {
      ...details,
      ...(retryAfter && { retryAfter }),
    });
  }
}

/**
 * Internal Server Error (500)
 * Used for unexpected server errors
 */
export class InternalServerError extends AppError {
  constructor(
    message: string = 'Internal server error',
    details?: Record<string, unknown>
  ) {
    super(message, 500, 'INTERNAL_SERVER_ERROR', details);
  }
}

/**
 * Database Error (500)
 * Used for database-related errors
 */
export class DatabaseError extends AppError {
  constructor(
    message: string = 'Database error',
    details?: Record<string, unknown>
  ) {
    super(message, 500, 'DATABASE_ERROR', details);
  }
}

/**
 * Service Unavailable Error (503)
 * Used when a service is temporarily unavailable
 */
export class ServiceUnavailableError extends AppError {
  constructor(
    message: string = 'Service temporarily unavailable',
    details?: Record<string, unknown>
  ) {
    super(message, 503, 'SERVICE_UNAVAILABLE', details);
  }
}

/**
 * Check if error is an instance of AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Convert any error to AppError
 */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new InternalServerError(error.message, {
      originalError: error.name,
      stack: error.stack,
    });
  }

  return new InternalServerError('An unknown error occurred', {
    originalError: String(error),
  });
}

