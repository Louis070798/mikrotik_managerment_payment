-- Luu nguyen van RouterOS config (vd /export hide-sensitive) de tham khao/doi chieu tren giao
-- dien -- KHONG bao gio duoc server tu thuc thi hay day xuong router (server khong bao gio ket
-- noi nguoc vao router, xem 0007_device_push_api_key.sql). Parse hien thi chi lam o frontend,
-- best-effort, khong bao gio suy dien so lieu telemetry tu day.

ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "router_config_text" text;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "router_config_updated_at" timestamp with time zone;
