import { appendFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Log debug "khong bao gio mat" -- ghi ra FILE (khong chi console) de con lai bang chung khi tien
 * trinh crash truoc luc Nest Logger kip khoi tao, hoac khi chay nhu 1 background task ma phan
 * capture stdout/stderr cua harness khong bat duoc gi ca (da xay ra that: 1 lan restart backend
 * that bai voi exit code 4, khong co dong output nao duoc ghi lai o dau ca -- xem
 * backend/logs/debug.log tu bay gio ve sau de tu dieu tra thay vi bo tay).
 *
 * Cố tinh KHONG dung thu vien log/rotation ngoai -- day chi la luoi an toan cho crash/startup,
 * khong phai he thong log san xuat day du. File duoc APPEND (khong ghi de) qua nhieu lan chay,
 * tu xoa bot khi qua ~5MB de khong phinh vo han tren may dev.
 */
const LOG_DIR = join(process.cwd(), 'logs');
const LOG_FILE = join(LOG_DIR, 'debug.log');
const MAX_BYTES = 5 * 1024 * 1024;

function ensureDir(): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
  } catch {
    // Khong co quyen tao thu muc -- van tiep tuc, chi mat phan ghi file, console.* van chay.
  }
}

function trimIfHuge(): void {
  try {
    const stat = statSync(LOG_FILE);
    if (stat.size > MAX_BYTES) {
      const content = readFileSync(LOG_FILE, 'utf8');
      writeFileSync(LOG_FILE, content.slice(-Math.floor(MAX_BYTES / 2)));
    }
  } catch {
    // Chua co file lan dau, hoac loi doc/ghi -- bo qua, khong lam gian doan luong chinh.
  }
}

/**
 * Ghi 1 dong debug that vao backend/logs/debug.log + phan chieu ra console. Dung cho: crash luc
 * khoi dong (truoc khi Nest Logger san sang), uncaughtException/unhandledRejection, va bat ky noi
 * nao can "chac chan con lai dau vet" hon la console binh thuong (co the bi mat neu tien trinh bi
 * kill dot ngot hoac chay nen khong ai xem).
 */
export function logDebugEvent(scope: string, message: string, extra?: unknown): void {
  const line = `[${new Date().toISOString()}] [pid ${process.pid}] [${scope}] ${message}`;
  const extraText = extra instanceof Error ? `\n${extra.stack ?? extra.message}` : extra !== undefined ? `\n${JSON.stringify(extra, null, 2)}` : '';
  // eslint-disable-next-line no-console
  console.error(line + extraText);
  try {
    ensureDir();
    trimIfHuge();
    appendFileSync(LOG_FILE, line + extraText + '\n');
  } catch {
    // File he thong khong ghi duoc (vd disk day, quyen truy cap) -- console.error o tren van la
    // luoi an toan cuoi cung, khong nem loi tiep de tranh vong lap crash-khi-dang-log-crash.
  }
}

export function debugLogPath(): string {
  return LOG_FILE;
}
