/**
 * Redis Mock for Testing
 * 
 * Provides an in-memory mock implementation of Redis client
 */

import { vi } from 'vitest';

// In-memory storage for mock Redis
const storage = new Map<string, { value: string; expiresAt?: number }>();

export const mockRedisClient = {
  isOpen: true,
  
  connect: vi.fn(async () => {
    console.log('Mock Redis: Connected');
  }),
  
  disconnect: vi.fn(async () => {
    storage.clear();
    console.log('Mock Redis: Disconnected');
  }),
  
  get: vi.fn(async (key: string) => {
    const item = storage.get(key);
    if (!item) return null;
    
    // Check expiration
    if (item.expiresAt && Date.now() > item.expiresAt) {
      storage.delete(key);
      return null;
    }
    
    return item.value;
  }),
  
  set: vi.fn(async (key: string, value: string) => {
    storage.set(key, { value });
    return 'OK';
  }),
  
  setEx: vi.fn(async (key: string, seconds: number, value: string) => {
    const expiresAt = Date.now() + seconds * 1000;
    storage.set(key, { value, expiresAt });
    return 'OK';
  }),
  
  del: vi.fn(async (key: string) => {
    const existed = storage.has(key);
    storage.delete(key);
    return existed ? 1 : 0;
  }),
  
  exists: vi.fn(async (key: string) => {
    return storage.has(key) ? 1 : 0;
  }),
  
  expire: vi.fn(async (key: string, seconds: number) => {
    const item = storage.get(key);
    if (!item) return 0;
    
    const expiresAt = Date.now() + seconds * 1000;
    storage.set(key, { ...item, expiresAt });
    return 1;
  }),
  
  ttl: vi.fn(async (key: string) => {
    const item = storage.get(key);
    if (!item || !item.expiresAt) return -1;
    
    const remaining = Math.floor((item.expiresAt - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }),
  
  ping: vi.fn(async () => 'PONG'),
  
  info: vi.fn(async () => 'used_memory:1024\nused_memory_human:1.00KB'),
  
  dbSize: vi.fn(async () => storage.size),
  
  flushAll: vi.fn(async () => {
    storage.clear();
    return 'OK';
  }),
  
  // Event emitter methods (for compatibility)
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn()
};

// Helper to clear mock storage between tests
export const clearMockRedis = () => {
  storage.clear();
  vi.clearAllMocks();
};

// Helper to set mock data
export const setMockRedisData = (key: string, value: string, ttl?: number) => {
  const expiresAt = ttl ? Date.now() + ttl * 1000 : undefined;
  storage.set(key, { value, expiresAt });
};

// Helper to get mock data (for assertions)
export const getMockRedisData = (key: string) => {
  return storage.get(key);
};

