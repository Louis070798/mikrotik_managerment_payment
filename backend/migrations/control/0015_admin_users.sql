-- Tai khoan quan tri THAT, luu trong database.
--
-- Truoc day "admin" chi ton tai duoi dang 2 bien moi truong (SUPERADMIN_USERNAME +
-- SUPERADMIN_PASSWORD_HASH). Cach do co 3 diem yeu:
--   1. Chi duoc DUNG MOT tai khoan cho ca he thong, khong the cap rieng cho tung nguoi.
--   2. Doi mat khau phai sua file tren server roi restart tien trinh.
--   3. Khong truy duoc ai lam gi, vi moi thao tac deu mang cung mot danh tinh.
--
-- Bang nay giai quyet ca ba. Bien moi truong duoc GIU LAI lam duong vao du phong cho lan cai dat
-- dau tien (khi bang con rong thi chua the dang nhap de tao tai khoan dau tien).
--
-- password_hash dung scrypt, dinh dang "<salt_hex>:<hash_hex>" -- cung ham hashPassword() da dung
-- cho subscribers (0011) va tenants (0013), khong them thuat toan moi.
CREATE TABLE IF NOT EXISTS "admin_users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "username" text NOT NULL,
  "name" text NOT NULL,
  "password_hash" text NOT NULL,
  "password_issued_at" timestamp with time zone NOT NULL DEFAULT now(),
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "last_login_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint

-- Unique co dieu kien: cho phep tao lai cung username sau khi da xoa mem, giong cach
-- tenants_username_uq lam o 0013.
CREATE UNIQUE INDEX IF NOT EXISTS "admin_users_username_uq"
  ON "admin_users" ("username") WHERE "deleted_at" IS NULL;
