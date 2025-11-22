/**
 * Validation Middleware
 * 
 * Centralized validation utilities for common patterns
 */

import { Context, Next } from 'hono';
import { z } from 'zod';
import { ValidationError } from '../lib/errors';

/**
 * Validate UUID parameter
 * @param paramName - Name of the parameter to validate (default: 'id')
 * @returns Middleware function
 */
export function validateUUID(paramName: string = 'id') {
  return async (c: Context, next: Next) => {
    const id = c.req.param(paramName);
    
    if (!id) {
      throw new ValidationError(`${paramName} parameter is required`);
    }
    
    try {
      z.string().uuid().parse(id);
      await next();
    } catch {
      throw new ValidationError(`Invalid ${paramName} format. Expected UUID.`);
    }
  };
}

/**
 * Validate multiple UUID parameters
 * @param paramNames - Array of parameter names to validate
 * @returns Middleware function
 */
export function validateUUIDs(paramNames: string[]) {
  return async (c: Context, next: Next) => {
    const errors: string[] = [];
    
    for (const paramName of paramNames) {
      const id = c.req.param(paramName);
      
      if (id) {
        try {
          z.string().uuid().parse(id);
        } catch {
          errors.push(`Invalid ${paramName} format. Expected UUID.`);
        }
      }
    }
    
    if (errors.length > 0) {
      throw new ValidationError(errors.join(' '));
    }
    
    await next();
  };
}
