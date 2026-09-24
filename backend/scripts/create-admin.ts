/**
 * Tao / cap nhat mot tai khoan quan tri THAT trong bang admin_users.
 *
 * Dung:
 *   npm run admin:create -- --username=admin --name="Quan tri" --password='...'
 *   npm run admin:create -- --username=admin --password='...'        (doi mat khau tai khoan da co)
 *   npm run admin:create -- --list                                   (xem danh sach, khong sua gi)
 *
 * Mat khau chi duoc bam (scrypt) roi ghi vao DB — khong bao gio luu plaintext. Neu khong truyen
 * --password, script se HOI tren terminal va khong hien ky tu, de mat khau khong nam lai trong
 * lich su shell.
 */
import { createInterface } from 'node:readline';
import { randomBytes, scryptSync } from 'node:crypto';
import { Client } from 'pg';
import { loadEnv, requireEnv } from './load-env';

const KEY_LEN = 64;
const SALT_LEN = 16;

/** Cung thuat toan voi src/libs/password-hash/password-hash.ts — khong duoc lech. */
function hashPassword(plaintext: string): string {
  const salt = randomBytes(SALT_LEN);
  return `${salt.toString('hex')}:${scryptSync(plaintext, salt, KEY_LEN).toString('hex')}`;
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = process.stdout as NodeJS.WriteStream & { muted?: boolean };
    out.muted = false;
    const origWrite = out.write.bind(out);
    (out as any).write = (chunk: any, ...rest: any[]) => (out.muted ? true : origWrite(chunk, ...rest));
    rl.question(question, (answer) => {
      out.muted = false;
      (out as any).write = origWrite;
      origWrite('\n');
      rl.close();
      resolve(answer);
    });
    out.muted = true;
    origWrite(question);
  });
}

async function main() {
  const envFile = loadEnv();
  const url = requireEnv('DATABASE_CONTROL_URL', envFile);
  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    if (process.argv.includes('--list')) {
      const { rows } = await client.query(
        `SELECT username, name, status, last_login_at, created_at
           FROM admin_users WHERE deleted_at IS NULL ORDER BY username`,
      );
      if (rows.length === 0) console.log('Chưa có tài khoản quản trị nào trong database.');
      else console.table(rows);
      return;
    }

    const username = arg('username');
    if (!username) {
      console.error('Thiếu --username. Ví dụ: npm run admin:create -- --username=admin --name="Quan tri"');
      process.exitCode = 1;
      return;
    }

    let password = arg('password');
    if (!password) password = await askHidden(`Mật khẩu cho "${username}": `);
    if (!password || password.length < 8) {
      console.error('Mật khẩu phải từ 8 ký tự trở lên.');
      process.exitCode = 1;
      return;
    }

    const existing = await client.query(
      `SELECT id, name FROM admin_users WHERE username = $1 AND deleted_at IS NULL`,
      [username],
    );
    const hash = hashPassword(password);

    if (existing.rowCount && existing.rowCount > 0) {
      await client.query(
        `UPDATE admin_users
            SET password_hash = $2, password_issued_at = now(), status = 'ACTIVE',
                name = COALESCE($3, name), updated_at = now()
          WHERE username = $1 AND deleted_at IS NULL`,
        [username, hash, arg('name') ?? null],
      );
      console.log(`Đã đổi mật khẩu cho tài khoản quản trị "${username}".`);
    } else {
      await client.query(
        `INSERT INTO admin_users (username, name, password_hash) VALUES ($1, $2, $3)`,
        [username, arg('name') ?? username, hash],
      );
      console.log(`Đã tạo tài khoản quản trị "${username}".`);
    }

    console.log('Đăng nhập được ngay, KHÔNG cần khởi động lại backend (đọc thẳng từ database).');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
