import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://land_intel:land_intel_dev_2024@localhost:5433/land_intelligence',
  },
  verbose: true,
  strict: true,
});
