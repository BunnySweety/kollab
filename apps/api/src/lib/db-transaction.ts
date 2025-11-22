import { db } from '../db';
import { log } from './logger';
import { DatabaseError } from './errors';
import type { Database } from '../db';

/**
 * Database Transaction Helper
 * 
 * Provides a safe way to execute multiple database operations atomically.
 * If any operation fails, all changes are rolled back automatically.
 * 
 * @example
 * await withTransaction(async (tx) => {
 *   const task = await tx.insert(tasks).values(...).returning();
 *   await tx.insert(taskTagRelations).values(...);
 *   return task;
 * });
 * 
 * @example
 * // With custom timeout (60 seconds)
 * await withTransaction(async (tx) => {
 *   // ... operations
 * }, { timeout: 60000 });
 */
export async function withTransaction<T>(
  callback: (tx: Database) => Promise<T>,
  options?: {
    isolationLevel?: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable';
    timeout?: number; // Timeout in milliseconds (default: 30000 = 30 seconds)
  }
): Promise<T> {
  const isolationLevel = options?.isolationLevel || 'read committed';
  const timeout = options?.timeout || 30000; // Default 30 seconds

  try {
    // Create a timeout promise that rejects after the specified time
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        const timeoutError = new DatabaseError(
          `Transaction timeout after ${timeout}ms`,
          { timeout, isolationLevel }
        );
        log.error('Transaction timeout', timeoutError, { timeout, isolationLevel });
        reject(timeoutError);
      }, timeout);
    });

    // Race between the transaction and the timeout
    return await Promise.race([
      db.transaction(async (tx) => {
        // Execute the callback with the transaction context
        // The transaction object has the same interface as Database
        const result = await callback(tx as unknown as Database);
        return result;
      }, {
        isolationLevel: isolationLevel as 'read committed' | 'read uncommitted' | 'repeatable read' | 'serializable',
      }),
      timeoutPromise
    ]);
  } catch (error) {
    // Check if it's a timeout error (already logged)
    if (error instanceof DatabaseError && error.message.includes('timeout')) {
      throw error;
    }
    
    // Log other transaction errors
    log.error('Transaction failed, rolling back', error as Error, { isolationLevel, timeout });
    throw error;
  }
}

/**
 * Execute multiple database operations in a transaction
 * Shorthand for withTransaction
 */
export async function transaction<T>(
  callback: (tx: Database) => Promise<T>
): Promise<T> {
  return withTransaction(callback);
}

