/**
 * Prometheus Metrics
 * 
 * Metrics collection for monitoring and observability
 */

import { register, Counter, Histogram, Gauge } from 'prom-client';
import { log } from './logger';

// HTTP Request Duration Histogram
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60] // Buckets in seconds
});

// HTTP Request Counter
export const httpRequestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status']
});

// HTTP Request Size Histogram
export const httpRequestSize = new Histogram({
  name: 'http_request_size_bytes',
  help: 'Size of HTTP requests in bytes',
  labelNames: ['method', 'route'],
  buckets: [100, 500, 1000, 5000, 10000, 50000, 100000]
});

// HTTP Response Size Histogram
export const httpResponseSize = new Histogram({
  name: 'http_response_size_bytes',
  help: 'Size of HTTP responses in bytes',
  labelNames: ['method', 'route', 'status'],
  buckets: [100, 500, 1000, 5000, 10000, 50000, 100000, 500000, 1000000]
});

// Database Query Duration Histogram
export const dbQueryDuration = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'table'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});

// Cache Hit/Miss Counter
export const cacheOperations = new Counter({
  name: 'cache_operations_total',
  help: 'Total number of cache operations',
  labelNames: ['operation', 'status'] // operation: get/set/del, status: hit/miss/error
});

// Active Connections Gauge
export const activeConnections = new Gauge({
  name: 'active_connections',
  help: 'Number of active connections'
});

// WebSocket Connections Gauge
export const websocketConnections = new Gauge({
  name: 'websocket_connections',
  help: 'Number of active WebSocket connections'
});

// Redis Operations Counter
export const redisOperations = new Counter({
  name: 'redis_operations_total',
  help: 'Total number of Redis operations',
  labelNames: ['operation', 'status'] // operation: get/set/del, status: success/error
});

// Error Counter
export const errorTotal = new Counter({
  name: 'errors_total',
  help: 'Total number of errors',
  labelNames: ['type', 'code'] // type: validation/not_found/forbidden/etc, code: error code
});

/**
 * Normalize route path for metrics (remove IDs, etc.)
 */
export function normalizeRoute(path: string): string {
  // Replace UUIDs with :id
  const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  let normalized = path.replace(uuidRegex, ':id');
  
  // Remove query parameters
  const parts = normalized.split('?');
  normalized = parts[0] ?? normalized;
  
  // Limit length
  if (normalized.length > 100) {
    normalized = normalized.substring(0, 100);
  }
  
  return normalized;
}

/**
 * Get metrics in Prometheus format
 */
export async function getMetrics(): Promise<string> {
  try {
    return await register.metrics();
  } catch (error) {
    log.error('Failed to get metrics', error as Error);
    return '';
  }
}

/**
 * Reset all metrics (useful for testing)
 */
export function resetMetrics(): void {
  register.resetMetrics();
}

