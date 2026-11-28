import { Pool } from 'pg';

import { applyMigrations, DEFAULT_DATABASE_URL } from '../tests/harness';

/** Apply the shim and every migration to DATABASE_URL (local docker Postgres by default). */
const url = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
const pool = new Pool({ connectionString: url });
try {
  await applyMigrations(pool);
  console.warn(`Migrations applied to ${url.replace(/\/\/.*@/, '//***@')}`);
} finally {
  await pool.end();
}
