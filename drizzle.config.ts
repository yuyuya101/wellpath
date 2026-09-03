import { defineConfig } from 'drizzle-kit';

// generate 只需 schema 即可产出 SQL（不连库）；push/migrate 才需要 DATABASE_URL
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/infrastructure/db/schema.ts',
  out: './drizzle',
  strict: true,
  verbose: true,
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://placeholder',
  },
});
