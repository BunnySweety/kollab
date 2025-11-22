/**
 * Pagination Helpers
 * 
 * Utilities for cursor-based and offset-based pagination
 */

import { gt, lt, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

/**
 * Cursor-based pagination parameters
 */
export interface CursorPagination {
  cursor?: string; // ID of the last item from previous page
  limit: number;
  direction?: 'forward' | 'backward';
}

/**
 * Cursor-based pagination result
 */
export interface CursorPaginationResult<T> {
  items: T[];
  nextCursor?: string;
  prevCursor?: string;
  hasMore: boolean;
}

/**
 * Create cursor pagination conditions
 * @param cursorColumn - Column to use for cursor (typically 'id' or 'createdAt')
 * @param baseConditions - Base WHERE conditions
 * @param pagination - Pagination parameters
 * @returns Additional conditions for cursor pagination
 */
export function createCursorConditions<T extends PgColumn>(
  cursorColumn: T,
  baseConditions: SQL[],
  pagination: CursorPagination
): SQL[] {
  const conditions: SQL[] = [];
  const { cursor, direction = 'forward' } = pagination;

  if (cursor) {
    if (direction === 'forward') {
      // Get items after cursor
      conditions.push(gt(cursorColumn, cursor));
    } else {
      // Get items before cursor
      conditions.push(lt(cursorColumn, cursor));
    }
  }

  return conditions;
}

/**
 * Create cursor pagination response
 * @param items - Items from query
 * @param limit - Requested limit
 * @param cursorColumn - Column used for cursor
 * @param direction - Pagination direction
 * @returns Pagination result with cursors
 */
export function createCursorPaginationResult<T extends { id: string }>(
  items: T[],
  limit: number,
  direction: 'forward' | 'backward' = 'forward'
): CursorPaginationResult<T> {
  const hasMore = items.length > limit;
  const resultItems = hasMore ? items.slice(0, limit) : items;

  let nextCursor: string | undefined;
  let prevCursor: string | undefined;

  if (resultItems.length > 0) {
    const firstItem = resultItems[0];
    const lastItem = resultItems[resultItems.length - 1];
    
    if (direction === 'forward') {
      nextCursor = hasMore && lastItem ? lastItem.id : undefined;
      prevCursor = firstItem ? firstItem.id : undefined;
    } else {
      prevCursor = hasMore && firstItem ? firstItem.id : undefined;
      nextCursor = lastItem ? lastItem.id : undefined;
    }
  }

  return {
    items: resultItems,
    nextCursor,
    prevCursor,
    hasMore
  };
}

/**
 * Parse cursor pagination from query parameters
 * @param query - Request query object
 * @param defaultLimit - Default limit if not provided
 * @returns Parsed cursor pagination
 */
export function parseCursorPagination(
  query: Record<string, string | undefined>,
  defaultLimit = 50
): CursorPagination {
  const parsedLimit = parseInt(query.limit || String(defaultLimit), 10);
  // Handle invalid limit values (NaN or <= 0)
  const limit = isNaN(parsedLimit) || parsedLimit <= 0
    ? defaultLimit
    : Math.min(parsedLimit, 100); // Max 100 per page
  const cursor = query.cursor;
  const direction = query.direction === 'backward' ? 'backward' : 'forward';

  return {
    cursor,
    limit,
    direction
  };
}

/**
 * Offset-based pagination result
 */
export interface OffsetPaginationResult<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

