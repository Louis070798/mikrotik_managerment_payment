import type { Config } from 'drizzle-kit';
import 'dotenv/config';

export default {
  schema: './src/libs/db-control/schema.ts',
  out: './migrations/control',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_CONTROL_URL || 'postgres://fleet_app:fleet_dev_local_only@127.0.0.1:5432/fleet_control_dev',
  },
} satisfies Config;
