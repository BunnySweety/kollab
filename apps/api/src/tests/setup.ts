/**
 * Vitest Setup File
 * 
 * This file runs before all tests to set up the test environment
 */

import { beforeAll, afterAll, vi } from 'vitest';

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://test:test@localhost:5432/kollab_test';
process.env.REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6379';
process.env.PORT = '4001';
process.env.FRONTEND_URL = 'http://localhost:3000';

// Global test setup
beforeAll(async () => {
  // Add any global setup here (e.g., test database initialization)
  console.log('🧪 Test environment initialized');
});

// Global test teardown
afterAll(async () => {
  // Add any global cleanup here
  console.log('✅ Tests completed');
});

// Mock timers utility
export const mockDate = (date: Date | string) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(date));
};

export const restoreDate = () => {
  vi.useRealTimers();
};

