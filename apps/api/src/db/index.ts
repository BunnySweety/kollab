import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import * as relations from './relations';

// SECURITY: Fail fast if DATABASE_URL is not provided
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const connectionString = process.env.DATABASE_URL;

// For migrations
export const migrationClient = postgres(connectionString, { max: 1 });

// PERFORMANCE: Configure connection pooling with optimal settings
const queryClient = postgres(connectionString, {
  max: 20,                    // Maximum pool size (connections)
  idle_timeout: 20,           // Close idle connections after 20 seconds
  connect_timeout: 10,        // Connection timeout in seconds
  max_lifetime: 60 * 30,      // Max connection lifetime (30 minutes)
  prepare: false,             // Disable prepared statements (can cause issues with PgBouncer)

  // Connection retry settings
  connection: {
    application_name: 'kollab-api'
  },

  // Error handling
  onnotice: () => {}, // Suppress notices
  debug: process.env.NODE_ENV === 'development' ? console.log : undefined
});

export const db = drizzle(queryClient, { schema: { ...schema, ...relations } });

export type Database = typeof db;

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing database connections...');
  await queryClient.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing database connections...');
  await queryClient.end();
  process.exit(0);
});