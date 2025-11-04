import type { Config } from 'drizzle-kit';

const useSQLite = !process.env.DATABASE_URL;

export default {
  schema: './src/lib/schema.ts',
  out: './drizzle/migrations',
  dialect: useSQLite ? 'sqlite' : 'postgresql',
  dbCredentials: useSQLite
    ? {
        url: 'data/linkedin.db',
      }
    : {
        url: process.env.DATABASE_URL!,
      },
} satisfies Config;
