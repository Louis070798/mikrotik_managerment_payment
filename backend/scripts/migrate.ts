/**
 * Migration runner tối giản — đọc migrations/control/*.sql theo thứ tự tên file,
 * áp dụng trong một transaction, ghi vào schema_migrations. Forward-only.
 *
 * Dùng:
 *   npm run migrate                 -> nạp .env (hoặc .env.<NODE_ENV> nếu NODE_ENV được set)
 *   npm run migrate:test            -> nạp .env.test (môi trường integration test)
 *   npm run migrate -- --env=<file> -> chỉ định file env cụ thể
 *   DATABASE_CONTROL_URL=... npm run migrate  -> biến shell luôn thắng file env
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { loadEnv, requireEnv } from './load-env';

async function main() {
  const envFile = loadEnv();
  const url = requireEnv('DATABASE_CONTROL_URL', envFile);
  console.log(`env file: ${envFile ?? '(none — using shell environment)'}`);

  const dir = join(__dirname, '..', 'migrations', 'control');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

    const { rows: applied } = await client.query<{ name: string }>('SELECT name FROM schema_migrations');
    const appliedSet = new Set(applied.map((r) => r.name));

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`skip (already applied): ${file}`);
        continue;
      }
      const sql = readFileSync(join(dir, file), 'utf8');
      // drizzle-kit dùng "--> statement-breakpoint" để phân tách statement khi cần chạy tuần tự;
      // với node-postgres, gửi cả file 1 lần vẫn hoạt động vì đây là plain SQL, chỉ cần bỏ marker.
      const cleaned = sql.replace(/--> statement-breakpoint/g, '');
      console.log(`applying: ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(cleaned);
        await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration failed: ${file}\n${(err as Error).message}`);
      }
    }
    console.log('All migrations applied.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
