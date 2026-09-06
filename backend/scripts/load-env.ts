/**
 * Env-file loader dùng chung cho scripts/migrate.ts và scripts/seed-test.ts.
 *
 * Vì sao không dùng thẳng `dotenv/config`:
 *   1. `dotenv/config` chỉ nạp `.env`. Chạy migrate/seed cho môi trường test phải trỏ vào
 *      `.env.test`, nếu không lệnh sẽ chạy nhầm vào DB dev — đúng loại tai nạn mà
 *      test/jest.setup.ts đã cố tình phòng.
 *   2. Trên Windows, file `.env` do PowerShell (`Set-Content`, `>`) tạo ra thường là UTF-16LE
 *      kèm BOM. dotenv đọc như UTF-8 nên mọi key biến thành rác và biến môi trường im lặng
 *      biến mất — triệu chứng là "DATABASE_CONTROL_URL is required" dù file rõ ràng có dòng đó.
 *      Loader này nhận diện BOM UTF-16LE/BE + UTF-8 và decode đúng.
 *
 * Thứ tự ưu tiên khi chọn file (dừng ở cái đầu tiên tồn tại):
 *   --env=<path> (hoặc --env <path>)  ->  process.env.ENV_FILE  ->  .env.<NODE_ENV>  ->  .env
 *
 * Biến đã có sẵn trong process.env luôn thắng file — CI/shell override được mà không phải sửa file.
 */
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

const BACKEND_ROOT = join(__dirname, '..');

function readTextFile(path: string): string {
  const buf = readFileSync(path);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return buf.subarray(2).swap16().toString('utf16le');
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString('utf8');
  return buf.toString('utf8');
}

function stripQuotes(value: string): string {
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1);
  }
  return value;
}

export function parseEnvContent(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^﻿/, '');
    if (!line || line.startsWith('#')) continue;
    const withoutExport = line.startsWith('export ') ? line.slice(7).trim() : line;
    const eq = withoutExport.indexOf('=');
    if (eq === -1) continue;
    const key = withoutExport.slice(0, eq).trim();
    if (!key) continue;
    out[key] = stripQuotes(withoutExport.slice(eq + 1).trim());
  }
  return out;
}

function envFileFromArgv(argv: string[]): string | null {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--env=')) return arg.slice('--env='.length);
    if (arg === '--env' && argv[i + 1]) return argv[i + 1];
  }
  return null;
}

export function resolveEnvFile(argv: string[] = process.argv.slice(2)): string | null {
  const explicit = envFileFromArgv(argv) ?? process.env.ENV_FILE ?? null;
  const candidates = explicit
    ? [explicit]
    : [...(process.env.NODE_ENV ? [`.env.${process.env.NODE_ENV}`] : []), '.env'];

  for (const candidate of candidates) {
    const path = isAbsolute(candidate) ? candidate : join(BACKEND_ROOT, candidate);
    if (existsSync(path)) return path;
  }
  // --env/ENV_FILE trỏ vào file không tồn tại là lỗi cấu hình, không được im lặng bỏ qua.
  if (explicit) throw new Error(`Env file not found: ${explicit}`);
  return null;
}

/** Nạp file env đã chọn vào process.env (không ghi đè biến đã có). Trả về đường dẫn đã dùng. */
export function loadEnv(argv: string[] = process.argv.slice(2)): string | null {
  const path = resolveEnvFile(argv);
  if (!path) return null;
  for (const [key, value] of Object.entries(parseEnvContent(readTextFile(path)))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return path;
}

/** Đọc biến bắt buộc, báo lỗi kèm hướng dẫn cụ thể thay vì chỉ "is required". */
export function requireEnv(key: string, envFile: string | null): string {
  const value = process.env[key];
  if (value && value.trim().length > 0) return value;
  throw new Error(
    [
      `${key} is required but was not set.`,
      envFile ? `Loaded env file: ${envFile}` : 'No env file was loaded (.env / .env.<NODE_ENV> not found).',
      'Fix one of:',
      '  - copy backend/.env.test.example to backend/.env.test, then run with --env=.env.test',
      `  - or export ${key} in the shell before running this script`,
    ].join('\n'),
  );
}
