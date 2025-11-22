/**
 * Pagination Tests
 * 
 * Tests for cursor-based and offset-based pagination helpers
 */

import { describe, it, expect } from 'vitest';
import {
  parseCursorPagination,
  createCursorPaginationResult
} from '../lib/pagination';

describe('Pagination Helpers', () => {
  describe('parseCursorPagination', () => {
    it('should parse default pagination', () => {
      const result = parseCursorPagination({}, 50);
      
      expect(result.limit).toBe(50);
      expect(result.cursor).toBeUndefined();
      expect(result.direction).toBe('forward');
    });

    it('should parse cursor pagination from query', () => {
      const query = {
        cursor: 'task-123',
        limit: '25',
        direction: 'backward'
      };
      
      const result = parseCursorPagination(query, 50);
      
      expect(result.cursor).toBe('task-123');
      expect(result.limit).toBe(25);
      expect(result.direction).toBe('backward');
    });

    it('should enforce maximum limit', () => {
      const query = {
        limit: '200'
      };
      
      const result = parseCursorPagination(query, 50);
      
      expect(result.limit).toBe(100); // Max limit
    });

    it('should handle invalid limit gracefully', () => {
      const query = {
        limit: 'invalid'
      };
      
      const result = parseCursorPagination(query, 50);
      
      expect(result.limit).toBe(50); // Falls back to default
    });
  });

  describe('createCursorPaginationResult', () => {
    interface TestItem {
      id: string;
      name: string;
    }

    it('should create pagination result with next cursor when has more', () => {
      const items: TestItem[] = Array.from({ length: 11 }, (_, i) => ({
        id: `item-${i}`,
        name: `Item ${i}`
      }));
      
      const result = createCursorPaginationResult(items, 10, 'forward');
      
      expect(result.items).toHaveLength(10);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('item-9');
      expect(result.prevCursor).toBe('item-0');
    });

    it('should create pagination result without next cursor when no more items', () => {
      const items: TestItem[] = Array.from({ length: 5 }, (_, i) => ({
        id: `item-${i}`,
        name: `Item ${i}`
      }));
      
      const result = createCursorPaginationResult(items, 10, 'forward');
      
      expect(result.items).toHaveLength(5);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeUndefined();
      expect(result.prevCursor).toBe('item-0');
    });

    it('should handle empty items array', () => {
      const items: TestItem[] = [];
      
      const result = createCursorPaginationResult(items, 10, 'forward');
      
      expect(result.items).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeUndefined();
      expect(result.prevCursor).toBeUndefined();
    });

    it('should handle backward pagination', () => {
      const items: TestItem[] = Array.from({ length: 11 }, (_, i) => ({
        id: `item-${i}`,
        name: `Item ${i}`
      }));
      
      const result = createCursorPaginationResult(items, 10, 'backward');
      
      expect(result.items).toHaveLength(10);
      expect(result.hasMore).toBe(true);
      expect(result.prevCursor).toBe('item-0');
      expect(result.nextCursor).toBe('item-9');
    });
  });
});

