-- Gan tau vao "dai ly" (Cong ty/Chi nhanh trong bang tenants co san, xem 02-DATABASE_DESIGN.md
-- Sec.1.6) -- SET NULL khi xoa tenant, khong bao gio xoa tau theo.
ALTER TABLE "ships" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ships" ADD CONSTRAINT "ships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ships_tenant_ix" ON "ships" ("tenant_id");--> statement-breakpoint

-- Thoi diem cap RADIUS secret gan nhat cho thiet bi -- hien thi tren UI, khong luu secret that
-- (secret that di qua EnvSecretStore, xem backend/src/libs/secrets/). Doi xung voi
-- api_key_issued_at (push key) da co san.
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "radius_secret_issued_at" timestamp with time zone;
