import { Pool } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

export type DbClient = NodePgDatabase<typeof schema>;

export function createDbClient(connectionString: string): { db: DbClient; pool: Pool } {
  const pool = new Pool({
    connectionString,
    // max=10 bao hoa that khi co router that day NetFlow/DNS lien tuc (vd Hai Nam 81 ~27 flow/s) --
    // request khac (API doc thuong, wizard tao thiet bi...) phai xep hang cho 1 connection ranh roi
    // het connectionTimeoutMillis ma van chua co, gay loi "timeout exceeded when trying to connect"
    // du server Postgres van khoe (ket noi moi rieng le van nhanh). Tang len de chiu duoc tai that.
    max: 30,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
  // pg's Pool emits 'error' when an IDLE client's connection drops (vd remote DB qua firewall/NAT
  // reset ket noi ranh). Khong bat thi Node coi day la unhandled 'error' event va CRASH ca process
  // (da xay ra that trong session nay) -- log lai la du, pool tu tao client moi cho lan query ke tiep.
  pool.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[db-control] Idle Postgres client error (pool stays up):', err);
  });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export * as dbSchema from './schema';
