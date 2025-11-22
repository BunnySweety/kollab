// CRITICAL: Import Yjs singleton FIRST to ensure single instance
// This must be imported before any module that uses y-websocket
// to prevent "Yjs was already imported" warning
import './lib/yjs-singleton';

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';
import { compress } from 'hono/compress';
import { log } from './lib/logger';
import { toAppError } from './lib/errors';

// Import routes
import authRoutes from './routes/auth';
import workspaceRoutes from './routes/workspaces';
import documentRoutes from './routes/documents';
import projectRoutes from './routes/projects';
import taskRoutes from './routes/tasks';
import taskColumnRoutes from './routes/task-columns';
import taskTemplateRoutes from './routes/task-templates';
import taskAttachmentRoutes from './routes/task-attachments';
import taskTagRoutes from './routes/task-tags';
import driveRoutes from './routes/drive';
import teamRoutes from './routes/teams';
import notesRoutes from './routes/notes';
import wikiRoutes from './routes/wiki';
// uploadRoutes imported later (fileRoutes imported early for route registration)
import eventRoutes from './routes/events';
import searchRoutes from './routes/search';
import templateRoutes from './routes/templates';
import databaseRoutes from './routes/databases';
import notificationRoutes from './routes/notifications';
import exportRoutes from './routes/export';
import cacheRoutes from './routes/cache';
import apiDocsRoutes from './routes/api-docs';

// Import WebSocket server
import { createWebSocketServer } from './websocket';

// Import CSRF protection
import { ensureCsrfToken, requireCsrfValidation } from './middleware/csrf';

// Import error context enrichment
import { enrichErrorContext } from './middleware/error-context';

// Import performance logger
import { performanceLogger } from './middleware/performance-logger';

// Import Redis
import { connectRedis, pingRedis } from './lib/redis';
import { getCacheStats } from './lib/cache';

// Import MeiliSearch
import { initializeSearchIndexes, checkMeiliSearchAvailability } from './services/search';

// Import database
import { db } from './db';
import { sql } from 'drizzle-orm';

// Import metrics
import {
  httpRequestDuration,
  httpRequestTotal,
  httpRequestSize,
  httpResponseSize,
  normalizeRoute,
  getMetrics
} from './lib/metrics';

// Export app for testing
export const app = new Hono();

// Global middleware
app.use('*', logger());

// Metrics middleware (before other middleware to measure everything)
app.use('*', async (c, next) => {
  const start = Date.now();
  const method = c.req.method;
  const route = normalizeRoute(c.req.path);
  
  // Measure request size if available
  const requestSize = c.req.header('content-length') 
    ? parseInt(c.req.header('content-length') || '0', 10) 
    : 0;
  if (requestSize > 0) {
    httpRequestSize.observe({ method, route }, requestSize);
  }
  
  await next();
  
  // Measure response
  const duration = (Date.now() - start) / 1000;
  const status = c.res.status.toString();
  
  // Record metrics
  httpRequestDuration.observe({ method, route, status }, duration);
  httpRequestTotal.inc({ method, route, status });
  
  // Measure response size if available
  const responseSize = c.res.headers.get('content-length')
    ? parseInt(c.res.headers.get('content-length') || '0', 10)
    : 0;
  if (responseSize > 0) {
    httpResponseSize.observe({ method, route, status }, responseSize);
  }
});

app.use('*', cors({
  origin: [
    'http://localhost:3000',
    process.env.FRONTEND_URL
  ].filter(Boolean) as string[],
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  exposeHeaders: ['X-CSRF-Token', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  maxAge: 86400,
}));

// Apply secure headers globally, but exclude file serving route
// File serving needs cross-origin access for images
app.use('*', async (c, next) => {
  // Skip secureHeaders for file serving route
  if (c.req.path.startsWith('/api/upload/file/')) {
    return next();
  }
  return secureHeaders()(c, next);
});

// Compression globale (Hono optimise automatiquement)
// Hono compress middleware already handles optimization internally
app.use('*', compress());

app.use('*', prettyJSON());

// CSRF Protection: Ensure token exists in cookie for all requests
app.use('*', ensureCsrfToken);

// CSRF Protection: Validate token on state-changing requests (POST, PUT, PATCH, DELETE)
// Exemptions for login/register are handled inside the middleware
app.use('/api/*', requireCsrfValidation);

// Error context enrichment: Automatically enrich errors with request context
app.use('*', enrichErrorContext);

// Performance logging: Log performance metrics for observability
app.use('*', performanceLogger);

// Health checks avancés
// Liveness probe (simple check - service is alive)
app.get('/health/live', async (c) => {
  return c.json({ status: 'alive' });
});

// Readiness probe (checks dependencies)
app.get('/health/ready', async (c) => {
  const checks: Record<string, string> = {
    api: 'ok',
    database: 'unknown',
    redis: 'unknown',
    meilisearch: 'unknown'
  };

  // Check database
  try {
    await db.execute(sql`SELECT 1`);
    checks.database = 'ok';
  } catch (error) {
    checks.database = 'error';
    log.error('Database health check failed', error as Error);
  }

  // Check Redis
  try {
    const redisHealthy = await pingRedis();
    checks.redis = redisHealthy ? 'ok' : 'error';
  } catch (error) {
    checks.redis = 'error';
    log.error('Redis health check failed', error as Error);
  }

  // Check MeiliSearch
  try {
    const meiliHealthy = await checkMeiliSearchAvailability();
    checks.meilisearch = meiliHealthy ? 'ok' : 'unavailable';
  } catch (error) {
    checks.meilisearch = 'error';
    log.error('MeiliSearch health check failed', error as Error);
  }

  const allHealthy = Object.values(checks).every(v => v === 'ok' || v === 'unavailable');
  
  return c.json({
    status: allHealthy ? 'ready' : 'degraded',
    checks,
    timestamp: new Date().toISOString()
  }, allHealthy ? 200 : 503);
});

// Comprehensive health check
app.get('/health', async (c) => {
  const checks: Record<string, unknown> = {
    api: 'ok',
    database: 'unknown',
    redis: 'unknown',
    meilisearch: 'unknown'
  };

  // Check database
  try {
    const start = Date.now();
    await db.execute(sql`SELECT 1`);
    const dbLatency = Date.now() - start;
    checks.database = {
      status: 'ok',
      latency: `${dbLatency}ms`
    };
  } catch (error) {
    checks.database = {
      status: 'error',
      error: error instanceof Error ? error.message : String(error)
    };
    log.error('Database health check failed', error as Error);
  }

  // Check Redis
  try {
    const redisHealthy = await pingRedis();
    const cacheStats = await getCacheStats();
    checks.redis = {
      status: redisHealthy ? 'ok' : 'error',
      connected: redisHealthy,
      ...cacheStats
    };
  } catch (error) {
    checks.redis = {
      status: 'error',
      error: error instanceof Error ? error.message : String(error)
    };
    log.error('Redis health check failed', error as Error);
  }

  // Check MeiliSearch
  try {
    const meiliHealthy = await checkMeiliSearchAvailability();
    checks.meilisearch = {
      status: meiliHealthy ? 'ok' : 'unavailable',
      available: meiliHealthy
    };
  } catch (error) {
    checks.meilisearch = {
      status: 'error',
      error: error instanceof Error ? error.message : String(error)
    };
    log.error('MeiliSearch health check failed', error as Error);
  }

  // Determine health status
  // Database is critical, Redis and MeiliSearch are optional
  const dbHealthy = typeof checks.database === 'object' && 
                    checks.database !== null && 
                    'status' in checks.database && 
                    checks.database.status === 'ok';
  
  const redisStatus = typeof checks.redis === 'object' && 
                     checks.redis !== null && 
                     'status' in checks.redis 
                     ? checks.redis.status 
                     : 'unknown';
  
  const meiliStatus = typeof checks.meilisearch === 'object' && 
                      checks.meilisearch !== null && 
                      'status' in checks.meilisearch 
                      ? checks.meilisearch.status 
                      : 'unknown';
  
  // Service is healthy if DB is OK and Redis/MeiliSearch are OK or unavailable (not error)
  const isHealthy = dbHealthy && 
                    (redisStatus === 'ok' || redisStatus === 'unavailable' || redisStatus === 'unknown') &&
                    (meiliStatus === 'ok' || meiliStatus === 'unavailable' || meiliStatus === 'unknown');
  
  // Service is degraded if DB is OK but Redis/MeiliSearch have errors
  const isDegraded = dbHealthy && 
                     (redisStatus === 'error' || meiliStatus === 'error');
  
  const status = isHealthy ? 'healthy' : (isDegraded ? 'degraded' : 'unhealthy');
  const statusCode = isHealthy ? 200 : (isDegraded ? 200 : 503); // Return 200 even if degraded (DB is OK)
  
  return c.json({
    status,
    checks,
    timestamp: new Date().toISOString(),
    service: 'kollab-api',
    version: process.env.npm_package_version || 'unknown'
  }, statusCode);
});

// API routes
app.route('/api/auth', authRoutes);
app.route('/api/workspaces', workspaceRoutes);
app.route('/api/documents', documentRoutes);
app.route('/api/projects', projectRoutes);
app.route('/api/tasks', taskRoutes);
app.route('/api/task-columns', taskColumnRoutes);
app.route('/api/task-templates', taskTemplateRoutes);
app.route('/api/task-attachments', taskAttachmentRoutes);
app.route('/api/task-tags', taskTagRoutes);
app.route('/api/drive', driveRoutes);
app.route('/api/teams', teamRoutes);
app.route('/api/notes', notesRoutes);
app.route('/api/wiki', wikiRoutes);
import uploadRoutes, { fileRoutes } from './routes/upload';
app.route('/api/upload', uploadRoutes);
app.route('/api/upload/file', fileRoutes);
app.route('/api/events', eventRoutes);
app.route('/api/search', searchRoutes);
app.route('/api/templates', templateRoutes);
app.route('/api/databases', databaseRoutes);
app.route('/api/notifications', notificationRoutes);
app.route('/api/export', exportRoutes);
app.route('/api/cache', cacheRoutes);
app.route('/api-docs', apiDocsRoutes);

// Prometheus metrics endpoint
app.get('/metrics', async (c) => {
  const metrics = await getMetrics();
  return c.text(metrics, 200, {
    'Content-Type': 'text/plain; version=0.0.4; charset=utf-8'
  });
});

// 404 handler
app.notFound((c) => {
  return c.json({
    error: 'Not Found',
    message: 'The requested resource was not found'
  }, 404);
});

// Error handler
app.onError((err, c) => {
  const appError = toAppError(err);
  
  log.error('Unhandled API error', err, { 
    path: c.req.path, 
    method: c.req.method,
    statusCode: appError.statusCode,
    code: appError.code
  });
  
  // Ensure statusCode is a valid HTTP status code (200-599) and cast to ContentfulStatusCode
  const statusCode = Math.max(200, Math.min(599, appError.statusCode)) as unknown as Parameters<typeof c.json>[1];
  
  return c.json(
    process.env.NODE_ENV === 'development' 
      ? appError.toJSON()
      : {
          error: appError.message,
          code: appError.code,
          status: appError.statusCode
        },
    statusCode
  );
});

const port = parseInt(process.env.PORT || '4000');
const wsPort = parseInt(process.env.WEBSOCKET_PORT || '3001');

// Initialize Redis connection
try {
  await connectRedis();
} catch (error) {
  log.error('Failed to connect to Redis', error as Error);
  log.warn('API will continue without Redis cache. Some features may be limited.');
}

// Initialize MeiliSearch indexes
try {
  await initializeSearchIndexes();
} catch (error) {
  log.error('Failed to initialize MeiliSearch', error as Error);
  log.warn('API will continue without MeiliSearch. Search features will be disabled.');
}

// Seed demo data if enabled
if (process.env.ENABLE_DEMO_MODE === 'true') {
  try {
    const { seedDemoData } = await import('./scripts/seed-demo-data.js');
    await seedDemoData();
  } catch (error) {
    log.error('Failed to seed demo data', error as Error);
    log.warn('API will continue without demo data.');
  }
}

log.info('Kollab API server starting', {
  port,
  wsPort,
  environment: process.env.NODE_ENV || 'development',
  url: `http://localhost:${port}`
});

// Start HTTP API server
try {
  const server = serve({
    fetch: app.fetch,
    port,
    hostname: process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1',
    // Note: @hono/node-server uses Node.js http server which doesn't have explicit body size limit
    // The limit is handled by the body parser middleware or at the route level
  });
  
  // Handle server errors (like EADDRINUSE)
  server.on('error', (error: Error & { code?: string }) => {
    if (error.code === 'EADDRINUSE') {
      log.error('Port already in use', error, { 
        port, 
        message: `Port ${port} is already in use. Please stop the existing process or use a different port.`,
        suggestion: 'Run: .\\scripts\\stop.ps1 (Windows) or ./scripts/stop.sh (Linux/Mac) to stop existing processes'
      });
    } else {
      log.error('HTTP API server error', error);
    }
    process.exit(1);
  });
  
  server.on('listening', () => {
    log.info('HTTP API server started', { port, url: `http://localhost:${port}` });
  });
} catch (error) {
  const err = error as Error & { code?: string };
  log.error('Failed to start HTTP API server', err);
  process.exit(1);
}

// Start WebSocket server for real-time collaboration
try {
  createWebSocketServer(wsPort);
} catch (error) {
  log.error('Failed to start WebSocket server', error as Error);
  log.warn('WebSocket features will be unavailable');
}