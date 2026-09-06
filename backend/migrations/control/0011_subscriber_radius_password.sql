-- password_ref chua tung duoc dung that (ADR-05 "chi tham chieu" gia dinh Phase 2 se noi
-- PostgreSQL AAA rieng, chua bao gio thanh hien thuc -- xac nhan 0/N subscriber co gia tri).
-- Thay bang password_hash that (scrypt, xem backend/src/libs/password-hash/) vi RADIUS
-- Access-Request gio duoc backend nay tu xac thuc that, khong con uy quyen cho he thong khac.
ALTER TABLE "subscribers" DROP COLUMN IF EXISTS "password_ref";--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN IF NOT EXISTS "password_hash" text;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN IF NOT EXISTS "password_issued_at" timestamp with time zone;
