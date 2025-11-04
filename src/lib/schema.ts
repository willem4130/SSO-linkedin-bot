import { sql } from 'drizzle-orm';
import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';
import { pgTable, serial, text as pgText, timestamp, integer as pgInteger, real as pgReal, index as pgIndex } from 'drizzle-orm/pg-core';
import { index as sqliteIndex } from 'drizzle-orm/sqlite-core';

/**
 * Database Schema
 *
 * Dual support for SQLite (development) and PostgreSQL (production)
 * Uses environment variable DATABASE_URL to determine which to use
 */

const useSQLite = !process.env.DATABASE_URL;

// ============================================================================
// SQLITE TABLES (Development)
// ============================================================================

// OAuth accounts table
export const accountsTableSQLite = sqliteTable('accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().unique(),
  provider: text('provider').notNull(), // 'linkedin'
  providerAccountId: text('provider_account_id'), // LinkedIn sub/person ID
  accessToken: text('access_token'), // Encrypted
  refreshToken: text('refresh_token'), // Encrypted
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
}, (table) => ({
  providerIdx: sqliteIndex('accounts_provider_idx').on(table.provider),
  userIdIdx: sqliteIndex('accounts_user_id_idx').on(table.userId),
}));

// LinkedIn posts table
export const linkedInPostsTableSQLite = sqliteTable('linkedin_posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  postUrn: text('post_urn').unique(),
  content: text('content').notNull(),
  status: text('status').notNull().default('draft'), // draft, posted, failed
  likes: integer('likes').default(0),
  comments: integer('comments').default(0),
  shares: integer('shares').default(0),
  impressions: integer('impressions').default(0),
  clicks: integer('clicks').default(0),
  engagementRate: real('engagement_rate').default(0),
  postedAt: integer('posted_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
}, (table) => ({
  userIdIdx: sqliteIndex('linkedin_posts_user_id_idx').on(table.userId),
  statusIdx: sqliteIndex('linkedin_posts_status_idx').on(table.status),
  postedAtIdx: sqliteIndex('linkedin_posts_posted_at_idx').on(table.postedAt),
}));

// LinkedIn followers table (CSV imported)
export const linkedInFollowersTableSQLite = sqliteTable('linkedin_followers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  profileUrl: text('profile_url'),
  email: text('email'),
  company: text('company'),
  jobTitle: text('job_title'),
  connectionDate: integer('connection_date', { mode: 'timestamp' }),
  tags: text('tags'), // JSON array of tag IDs
  notes: text('notes'),
  lastEngagedAt: integer('last_engaged_at', { mode: 'timestamp' }),
  importedAt: integer('imported_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  source: text('source').default('csv'), // csv, manual
}, (table) => ({
  userIdIdx: sqliteIndex('linkedin_followers_user_id_idx').on(table.userId),
  emailIdx: sqliteIndex('linkedin_followers_email_idx').on(table.email),
}));

// LinkedIn follower tags
export const linkedInFollowerTagsTableSQLite = sqliteTable('linkedin_follower_tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  tagName: text('tag_name').notNull(),
  color: text('color').default('#3b82f6'), // Tailwind blue-500
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
}, (table) => ({
  userIdIdx: sqliteIndex('linkedin_follower_tags_user_id_idx').on(table.userId),
}));

// LinkedIn usage tracking (rate limits)
export const linkedInUsageTableSQLite = sqliteTable('linkedin_usage', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  windowType: text('window_type').notNull(), // daily, hourly
  callsCount: integer('calls_count').notNull().default(0),
  windowStart: integer('window_start', { mode: 'timestamp' }).notNull(),
  windowEnd: integer('window_end', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  userIdWindowIdx: sqliteIndex('linkedin_usage_user_id_window_idx').on(
    table.userId,
    table.windowType,
    table.windowStart
  ),
}));

// ============================================================================
// POSTGRESQL TABLES (Production)
// ============================================================================

export const accountsTablePostgres = pgTable('accounts', {
  id: serial('id').primaryKey(),
  userId: pgText('user_id').notNull().unique(),
  provider: pgText('provider').notNull(),
  providerAccountId: pgText('provider_account_id'),
  accessToken: pgText('access_token'),
  refreshToken: pgText('refresh_token'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  providerIdx: pgIndex('accounts_provider_idx').on(table.provider),
  userIdIdx: pgIndex('accounts_user_id_idx').on(table.userId),
}));

export const linkedInPostsTablePostgres = pgTable('linkedin_posts', {
  id: serial('id').primaryKey(),
  userId: pgText('user_id').notNull(),
  postUrn: pgText('post_urn').unique(),
  content: pgText('content').notNull(),
  status: pgText('status').notNull().default('draft'),
  likes: pgInteger('likes').default(0),
  comments: pgInteger('comments').default(0),
  shares: pgInteger('shares').default(0),
  impressions: pgInteger('impressions').default(0),
  clicks: pgInteger('clicks').default(0),
  engagementRate: pgReal('engagement_rate').default(0),
  postedAt: timestamp('posted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  userIdIdx: pgIndex('linkedin_posts_user_id_idx').on(table.userId),
  statusIdx: pgIndex('linkedin_posts_status_idx').on(table.status),
  postedAtIdx: pgIndex('linkedin_posts_posted_at_idx').on(table.postedAt),
}));

export const linkedInFollowersTablePostgres = pgTable('linkedin_followers', {
  id: serial('id').primaryKey(),
  userId: pgText('user_id').notNull(),
  name: pgText('name').notNull(),
  profileUrl: pgText('profile_url'),
  email: pgText('email'),
  company: pgText('company'),
  jobTitle: pgText('job_title'),
  connectionDate: timestamp('connection_date'),
  tags: pgText('tags'),
  notes: pgText('notes'),
  lastEngagedAt: timestamp('last_engaged_at'),
  importedAt: timestamp('imported_at').notNull().defaultNow(),
  source: pgText('source').default('csv'),
}, (table) => ({
  userIdIdx: pgIndex('linkedin_followers_user_id_idx').on(table.userId),
  emailIdx: pgIndex('linkedin_followers_email_idx').on(table.email),
}));

export const linkedInFollowerTagsTablePostgres = pgTable('linkedin_follower_tags', {
  id: serial('id').primaryKey(),
  userId: pgText('user_id').notNull(),
  tagName: pgText('tag_name').notNull(),
  color: pgText('color').default('#3b82f6'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  userIdIdx: pgIndex('linkedin_follower_tags_user_id_idx').on(table.userId),
}));

export const linkedInUsageTablePostgres = pgTable('linkedin_usage', {
  id: serial('id').primaryKey(),
  userId: pgText('user_id').notNull(),
  windowType: pgText('window_type').notNull(),
  callsCount: pgInteger('calls_count').notNull().default(0),
  windowStart: timestamp('window_start').notNull(),
  windowEnd: timestamp('window_end').notNull(),
}, (table) => ({
  userIdWindowIdx: pgIndex('linkedin_usage_user_id_window_idx').on(
    table.userId,
    table.windowType,
    table.windowStart
  ),
}));

// ============================================================================
// EXPORT APPROPRIATE TABLES BASED ON DATABASE TYPE
// ============================================================================

export const accountsTable = useSQLite ? accountsTableSQLite : accountsTablePostgres;
export const linkedInPostsTable = useSQLite ? linkedInPostsTableSQLite : linkedInPostsTablePostgres;
export const linkedInFollowersTable = useSQLite ? linkedInFollowersTableSQLite : linkedInFollowersTablePostgres;
export const linkedInFollowerTagsTable = useSQLite ? linkedInFollowerTagsTableSQLite : linkedInFollowerTagsTablePostgres;
export const linkedInUsageTable = useSQLite ? linkedInUsageTableSQLite : linkedInUsageTablePostgres;
