-- Model push 1 chieu: MikroTik tu day telemetry len server (POST /devices/{id}/telemetry-push),
-- server khong bao gio chu dong ket noi vao router. Xem docs/backend/02-DATABASE_DESIGN.md.
-- api_key_hash = sha256(key that) -- key that CHI tra 1 lan luc issuePushApiKey(), khong luu lai.

ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "ip_address" text;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "api_key_hash" text;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "api_key_issued_at" timestamp with time zone;
