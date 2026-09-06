-- Tenant / gói cước / subscriber (PPPoE/Hotspot) — Phase 1, xem docs/backend/02-DATABASE_DESIGN.md §1.6.
-- Cấp phát tài khoản RADIUS thật (radcheck trong PostgreSQL AAA) là Phase 2, chưa nằm trong file này.

CREATE TYPE "public"."package_duration_unit" AS ENUM('DAY', 'MONTH');--> statement-breakpoint
CREATE TYPE "public"."subscriber_auth_type" AS ENUM('PPPOE', 'HOTSPOT');--> statement-breakpoint
CREATE TYPE "public"."subscriber_status" AS ENUM('ACTIVE', 'SUSPENDED', 'EXPIRED');--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"contact_phone" text,
	"contact_email" text,
	"address" text,
	"tax_id" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"name" text NOT NULL,
	"down_mbps" integer NOT NULL,
	"up_mbps" integer NOT NULL,
	"quota_gb" integer NOT NULL,
	"duration_unit" "package_duration_unit" NOT NULL,
	"duration_value" integer NOT NULL,
	"price_vnd" numeric NOT NULL,
	"max_concurrent_devices" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"username" text NOT NULL,
	"auth_type" "subscriber_auth_type" NOT NULL,
	"nas_device_id" uuid,
	"package_id" uuid NOT NULL,
	"status" "subscriber_status" DEFAULT 'ACTIVE' NOT NULL,
	"quota_used_bytes" bigint DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"password_ref" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "tenants_code_uq" ON "tenants" USING btree ("code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenants_parent_ix" ON "tenants" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "packages_tenant_ix" ON "packages" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subscribers_tenant_username_uq" ON "subscribers" USING btree ("tenant_id","username");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscribers_tenant_status_ix" ON "subscribers" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscribers_package_ix" ON "subscribers" USING btree ("package_id");--> statement-breakpoint

ALTER TABLE "tenants" ADD CONSTRAINT "tenants_parent_id_tenants_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_nas_device_id_devices_id_fk" FOREIGN KEY ("nas_device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE restrict ON UPDATE no action;
