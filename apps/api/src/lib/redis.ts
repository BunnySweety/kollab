import { createClient } from 'redis';
import { log } from './logger';

/**
 * Redis Client Configuration
 * 
 * Used for caching frequently accessed data:
 * - User sessions
 * - Workspace memberships
 * - Search results
 * - Rate limiting counters
 */

// Get Redis URL from environment variable
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Create Redis client
export const redisClient = createClient({
  url: REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => {
      // Exponential backoff: 50ms, 100ms, 200ms, 400ms, ... up to 3s
      const delay = Math.min(retries * 50, 3000);
      log.warn('Redis reconnecting', { delay: `${delay}ms`, attempt: retries });
      return delay;
    },
    connectTimeout: 10000, // 10 seconds
  },
});

// Error handling
redisClient.on('error', (err) => {
  log.error('Redis client error', err);
});

redisClient.on('connect', () => {
  log.info('Redis connected');
});

redisClient.on('reconnecting', () => {
  log.warn('Redis reconnecting...');
});

redisClient.on('ready', () => {
  log.info('Redis ready');
});

// Connect to Redis on startup
export async function connectRedis() {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
    log.info('Redis connection established');
  } catch (error) {
    log.error('Failed to connect to Redis', error as Error);
    log.warn('Application will continue without Redis caching');
    // Don't throw - allow app to run without Redis in development
  }
}

// Graceful shutdown
export async function disconnectRedis() {
  try {
    if (redisClient.isOpen) {
      await redisClient.quit();
      log.info('Redis disconnected gracefully');
    }
  } catch (error) {
    log.error('Error disconnecting Redis', error as Error);
  }
}

/**
 * Check if Redis is available and connected
 */
export function isRedisAvailable(): boolean {
  try {
    return redisClient.isOpen && redisClient.isReady;
  } catch {
    return false;
  }
}

/**
 * Ping Redis to check health
 */
export async function pingRedis(): Promise<boolean> {
  try {
    // Try to connect if not connected
    if (!redisClient.isOpen) {
      try {
        await redisClient.connect();
      } catch (connectError) {
        log.warn('Redis not connected, attempting connection...', { error: (connectError as Error).message });
        // If connection fails, return false but don't throw
        return false;
      }
    }
    
    // Check if ready
    if (!redisClient.isReady) {
      // Wait a bit for connection to be ready
      await new Promise(resolve => setTimeout(resolve, 100));
      if (!redisClient.isReady) {
        return false;
      }
    }
    
    const result = await redisClient.ping();
    return result === 'PONG';
  } catch (error) {
    log.warn('Redis ping failed', { error: (error as Error).message });
    return false;
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  await disconnectRedis();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await disconnectRedis();
  process.exit(0);
});

