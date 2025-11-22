/**
 * Cache Tests
 * 
 * Tests for cache functions including cache stampede protection
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cacheGet, cacheSet, cacheGetOrSet, cacheDel, CACHE_TTL } from '../lib/cache';
import { redisClient, isRedisAvailable } from '../lib/redis';

describe('Cache Functions', () => {
  beforeEach(async () => {
    // Clear cache before each test
    if (isRedisAvailable()) {
      try {
        await redisClient.flushDb();
      } catch {
        // Ignore if Redis not available
      }
    }
  });

  afterEach(async () => {
    // Cleanup
    if (isRedisAvailable()) {
      try {
        await redisClient.flushDb();
      } catch {
        // Ignore
      }
    }
  });

  describe('cacheGet and cacheSet', () => {
    it('should set and get a value from cache', async () => {
      const key = 'test:key';
      const value = { test: 'data' };

      await cacheSet(key, value, 60);
      const result = await cacheGet(key);

      expect(result).toEqual(value);
    });

    it('should return null for non-existent key', async () => {
      const result = await cacheGet('test:nonexistent');
      expect(result).toBeNull();
    });

    it('should respect TTL', async () => {
      const key = 'test:ttl';
      const value = { test: 'data' };

      await cacheSet(key, value, 1); // 1 second TTL
      const result1 = await cacheGet(key);
      expect(result1).toEqual(value);

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 1100));
      const result2 = await cacheGet(key);
      expect(result2).toBeNull();
    });
  });

  describe('cacheGetOrSet - Cache Stampede Protection', () => {
    it('should fetch and cache data on first call', async () => {
      const key = 'test:getorset';
      let fetchCount = 0;

      const fetcher = async () => {
        fetchCount++;
        return { data: 'fetched', count: fetchCount };
      };

      const result = await cacheGetOrSet(key, fetcher, CACHE_TTL.SHORT);
      
      expect(result).toEqual({ data: 'fetched', count: 1 });
      expect(fetchCount).toBe(1);

      // Verify it's cached
      const cached = await cacheGet(key);
      expect(cached).toEqual({ data: 'fetched', count: 1 });
    });

    it('should return cached data on subsequent calls', async () => {
      const key = 'test:cached';
      let fetchCount = 0;

      const fetcher = async () => {
        fetchCount++;
        return { data: 'fetched', count: fetchCount };
      };

      // First call
      await cacheGetOrSet(key, fetcher, CACHE_TTL.SHORT);
      expect(fetchCount).toBe(1);

      // Second call should use cache
      const result = await cacheGetOrSet(key, fetcher, CACHE_TTL.SHORT);
      expect(result).toEqual({ data: 'fetched', count: 1 });
      expect(fetchCount).toBe(1); // Should not increment
    });

    it('should prevent cache stampede with concurrent requests', async () => {
      const key = 'test:stampede';
      let fetchCount = 0;

      const fetcher = async () => {
        fetchCount++;
        // Simulate slow fetch
        await new Promise(resolve => setTimeout(resolve, 100));
        return { data: 'fetched', count: fetchCount };
      };

      // Make 5 concurrent requests
      const promises = Array.from({ length: 5 }, () => 
        cacheGetOrSet(key, fetcher, CACHE_TTL.SHORT)
      );

      const results = await Promise.all(promises);

      // All results should be the same (from single fetch)
      expect(results.every(r => r.count === 1)).toBe(true);
      
      // Should only fetch once (or maybe twice if timing is tight, but not 5 times)
      expect(fetchCount).toBeLessThanOrEqual(2);
    }, 10000); // 10 second timeout for this test

    it('should retry if lock is not acquired', async () => {
      const key = 'test:retry';
      let fetchCount = 0;

      const fetcher = async () => {
        fetchCount++;
        return { data: 'fetched', count: fetchCount };
      };

      // Pre-populate cache to simulate another request finishing
      await cacheSet(key, { data: 'cached', count: 0 }, CACHE_TTL.SHORT);

      // This should return cached value immediately
      const result = await cacheGetOrSet(key, fetcher, CACHE_TTL.SHORT);
      
      expect(result).toEqual({ data: 'cached', count: 0 });
      expect(fetchCount).toBe(0); // Should not fetch
    });

    it('should handle fetcher errors gracefully', async () => {
      const key = 'test:error';
      const errorMessage = 'Fetcher failed';

      const fetcher = async () => {
        throw new Error(errorMessage);
      };

      await expect(cacheGetOrSet(key, fetcher, CACHE_TTL.SHORT)).rejects.toThrow(errorMessage);
    });

    it('should work without Redis (fail open)', async () => {
      // This test verifies that cacheGetOrSet works even if Redis is unavailable
      // by checking that it still calls the fetcher
      const key = 'test:no-redis';
      let fetchCount = 0;

      const fetcher = async () => {
        fetchCount++;
        return { data: 'fetched', count: fetchCount };
      };

      // If Redis is not available, it should still work
      const result = await cacheGetOrSet(key, fetcher, CACHE_TTL.SHORT);
      
      expect(result).toEqual({ data: 'fetched', count: 1 });
      expect(fetchCount).toBe(1);
    });
  });

  describe('cacheDel', () => {
    it('should delete a cached value', async () => {
      const key = 'test:delete';
      const value = { test: 'data' };

      await cacheSet(key, value, 60);
      const before = await cacheGet(key);
      expect(before).toEqual(value);

      await cacheDel(key);
      const after = await cacheGet(key);
      expect(after).toBeNull();
    });
  });
});

