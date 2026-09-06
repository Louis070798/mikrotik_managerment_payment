/**
 * Idempotent local/test seed.
 *
 * This script creates only stable inventory anchors. It never creates telemetry, RADIUS,
 * IPFIX, credentials, or production service endpoints, and it never deletes existing rows.
 * Run migrations first:
 *   npm run migrate:test
 *   npm run seed:test
 *
 * Env resolution is identical to scripts/migrate.ts (see scripts/load-env.ts): --env=<file>
 * beats ENV_FILE beats .env.<NODE_ENV> beats .env, and shell variables always win.
 */
import { Client } from 'pg';
import { loadEnv, requireEnv } from './load-env';

const TEST_ORG_CODE = 'TEST-ORG';
const TEST_AREA_CODE = 'TEST-AREA';
const TEST_SHIP_CODE = 'TEST-SHIP';
const TEST_DEVICE_CODE = 'TEST-EDGE';

async function main() {
  const envFile = loadEnv();
  const connectionString = requireEnv('DATABASE_CONTROL_URL', envFile);
  console.log(`env file: ${envFile ?? '(none — using shell environment)'}`);

  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('BEGIN');

    const organization = await client.query<{ id: string }>(
      `INSERT INTO organizations (code, name)
       VALUES ($1, 'Local integration test organization')
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [TEST_ORG_CODE],
    );

    const area = await client.query<{ id: string }>(
      `INSERT INTO areas (org_id, code, name, timezone)
       VALUES ($1, $2, 'Local integration test area', 'UTC')
       ON CONFLICT (org_id, code) DO UPDATE SET name = EXCLUDED.name, timezone = EXCLUDED.timezone
       RETURNING id`,
      [organization.rows[0].id, TEST_AREA_CODE],
    );

    const ship = await client.query<{ id: string }>(
      `INSERT INTO ships (area_id, code, name, status, timezone)
       VALUES ($1, $2, 'Local integration test ship', 'ACTIVE', 'UTC')
       ON CONFLICT (area_id, code) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status
       RETURNING id`,
      [area.rows[0].id, TEST_SHIP_CODE],
    );

    await client.query(
      `INSERT INTO devices (ship_id, code, name, role, status)
       VALUES ($1, $2, 'Local integration test edge', 'EDGE', 'UNKNOWN')
       ON CONFLICT (ship_id, code) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status`,
      [ship.rows[0].id, TEST_DEVICE_CODE],
    );

    await client.query('COMMIT');
    console.log(`Seeded test inventory: ${TEST_ORG_CODE}/${TEST_AREA_CODE}/${TEST_SHIP_CODE}/${TEST_DEVICE_CODE}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
