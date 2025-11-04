import Database from 'better-sqlite3';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzlePostgres } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { logger } from './logger';

/**
 * Database Connection
 *
 * Supports both SQLite (development) and PostgreSQL (production)
 * Automatically selects based on DATABASE_URL environment variable
 */

export const useSQLite = !process.env.DATABASE_URL;

let db;

if (useSQLite) {
  // SQLite for development
  const sqlite = new Database('data/linkedin.db');

  // Enable WAL mode for better concurrency
  sqlite.exec('PRAGMA journal_mode = WAL;');

  db = drizzleSqlite(sqlite, { schema });
  logger.info('🗄️  Using SQLite database for development');
} else {
  // PostgreSQL for production
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  db = drizzlePostgres(pool, { schema });
  logger.info('🗄️  Using PostgreSQL database for production');
}

export { db };
