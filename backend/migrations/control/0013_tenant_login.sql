-- Tenant tro thanh 1 tai khoan dang nhap that (nang cap tu placeholder "Auth/RBAC that chua co"
-- o Tenants.tsx) -- cung mau scrypt password_hash da dung cho subscribers (0011), khong them
-- dependency moi. username rieng voi code (code la ma to chuc, username la ten dang nhap, co the
-- trung ten voi ma neu tu sinh nhung khong bat buoc).
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "username" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "password_hash" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "password_issued_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_username_uq" ON "tenants" ("username") WHERE "username" IS NOT NULL AND "deleted_at" IS NULL;
