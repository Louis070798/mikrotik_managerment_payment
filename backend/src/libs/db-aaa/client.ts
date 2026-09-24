import { Pool } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

export type AaaDbClient = NodePgDatabase<typeof schema>;

/**
 * Ket noi toi PostgreSQL cua FreeRADIUS. Pool nho hon db-control nhieu: o day chi co 1 job dong bo
 * chay theo chu ky va vai lenh ghi radcheck khi admin cap tai khoan -- khong co dong ingest nong nao.
 */
export function createAaaDbClient(connectionString: string): { db: AaaDbClient; pool: Pool } {
  const pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
  // Giong db-control: khong bat 'error' thi mot ket noi idle bi firewall/NAT reset se lam CRASH ca
  // tien trinh Node (unhandled 'error' event), du Postgres van khoe.
  pool.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[db-aaa] Idle Postgres client error (pool stays up):', err);
  });
  return { db: drizzle(pool, { schema }), pool };
}

export * as aaaSchema from './schema';
