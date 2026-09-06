-- Cần cho gen_random_uuid() dùng làm default cho các cột uuid primary key.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "public"."accounting_group" AS ENUM('WAN_INPUT', 'CREW_ACCESS', 'BUSINESS_ACCESS', 'MANAGEMENT', 'NONE');--> statement-breakpoint
CREATE TYPE "public"."actor_type" AS ENUM('USER', 'SYSTEM', 'JOB', 'API_TOKEN');--> statement-breakpoint
CREATE TYPE "public"."alert_kind" AS ENUM('DEVICE_DOWN', 'WAN_DOWN', 'VPN_DOWN', 'RADIUS_FAILURE', 'DATABASE_FAILURE', 'COLLECTOR_DELAYED', 'BACKUP_OVERDUE', 'BACKUP_SIZE_ANOMALY', 'ENDPOINT_UNHEALTHY');--> statement-breakpoint
CREATE TYPE "public"."alert_status" AS ENUM('FIRING', 'ACKED', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "public"."audit_result" AS ENUM('SUCCESS', 'FAILURE', 'DENIED');--> statement-breakpoint
CREATE TYPE "public"."backup_kind" AS ENUM('BINARY', 'EXPORT', 'UMB', 'CERTIFICATE');--> statement-breakpoint
CREATE TYPE "public"."breaker_state" AS ENUM('CLOSED', 'OPEN', 'HALF_OPEN');--> statement-breakpoint
CREATE TYPE "public"."counter_source" AS ENUM('HC64', 'LEGACY32', 'API', 'UNRELIABLE', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."device_role" AS ENUM('EDGE', 'CORE', 'SWITCH', 'AP', 'CPE');--> statement-breakpoint
CREATE TYPE "public"."device_status" AS ENUM('UNKNOWN', 'ONLINE', 'DEGRADED', 'OFFLINE', 'MAINTENANCE');--> statement-breakpoint
CREATE TYPE "public"."health_status" AS ENUM('HEALTHY', 'DEGRADED', 'UNHEALTHY', 'UNKNOWN', 'MAINTENANCE');--> statement-breakpoint
CREATE TYPE "public"."healthcheck_type" AS ENUM('RADIUS_ACCESS_REQUEST', 'RADIUS_ACCT_PROBE', 'SQL_RW', 'CLICKHOUSE_PING', 'FLOW_RECENCY', 'POLL_RECENCY', 'S3_RW', 'HTTP_FUNCTIONAL', 'NATS_RTT', 'BACKUP_FRESHNESS');--> statement-breakpoint
CREATE TYPE "public"."interface_type" AS ENUM('ETHER', 'VLAN', 'BRIDGE', 'WIREGUARD', 'ZEROTIER', 'LTE', 'SFP', 'PPPOE');--> statement-breakpoint
CREATE TYPE "public"."link_state" AS ENUM('UP', 'DOWN', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."restore_result" AS ENUM('PASSED', 'FAILED', 'NOT_TESTED');--> statement-breakpoint
CREATE TYPE "public"."service_type" AS ENUM('RADIUS', 'RADIUS_ACCT', 'DATABASE', 'COLLECTOR', 'STORAGE', 'USER_MANAGER', 'CONTROLLER', 'BUS', 'CACHE', 'ZEROTIER');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('INFO', 'WARNING', 'MAJOR', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."ship_status" AS ENUM('PLANNED', 'COMMISSIONING', 'ACTIVE', 'MAINTENANCE', 'DECOMMISSIONED');--> statement-breakpoint
CREATE TYPE "public"."transport" AS ENUM('REST', 'API_SSL', 'API');--> statement-breakpoint
CREATE TYPE "public"."zone_kind" AS ENUM('CREW', 'BUSINESS', 'MANAGEMENT');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "alert_kind" NOT NULL,
	"fingerprint" text NOT NULL,
	"status" "alert_status" DEFAULT 'FIRING' NOT NULL,
	"severity" "severity" NOT NULL,
	"scope" jsonb NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acked_by" text,
	"acked_at" timestamp with time zone,
	"ack_note" text,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"resolve_reason" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"geo" jsonb,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" text,
	"actor_label" text NOT NULL,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid,
	"scope" jsonb,
	"before" jsonb,
	"after" jsonb,
	"diff" jsonb,
	"request_id" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"result" "audit_result" NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "device_backups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"kind" "backup_kind" NOT NULL,
	"size_bytes" bigint,
	"checksum_sha256" text NOT NULL,
	"encrypted" boolean DEFAULT true NOT NULL,
	"storage_targets" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"restore_tested_at" timestamp with time zone,
	"restore_test_result" "restore_result" DEFAULT 'NOT_TESTED' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ship_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"role" "device_role" NOT NULL,
	"model" text,
	"serial" text,
	"architecture" text,
	"routeros_version" text,
	"device_mode" text,
	"api_transport" "transport" DEFAULT 'REST' NOT NULL,
	"credential_ref" text,
	"mgmt_endpoint_ref" text,
	"status" "device_status" DEFAULT 'UNKNOWN' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"poll_interval_s" integer DEFAULT 60 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "interfaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "interface_type" NOT NULL,
	"mac" text,
	"parent_interface_id" uuid,
	"zone_id" uuid,
	"snmp_index" integer,
	"speed_bps" bigint,
	"mtu" integer,
	"admin_state" "link_state" DEFAULT 'UNKNOWN' NOT NULL,
	"oper_state" "link_state" DEFAULT 'UNKNOWN' NOT NULL,
	"accounting_group" "accounting_group" DEFAULT 'NONE' NOT NULL,
	"counted_in_reconciliation" boolean DEFAULT false NOT NULL,
	"counter_source" "counter_source" DEFAULT 'UNKNOWN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "network_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ship_id" uuid NOT NULL,
	"kind" "zone_kind" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "schema_migrations" (
	"name" text PRIMARY KEY NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_endpoint_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"change_reason" text NOT NULL,
	"changed_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_name" text NOT NULL,
	"service_type" "service_type" NOT NULL,
	"environment" text DEFAULT 'development' NOT NULL,
	"host" text NOT NULL,
	"port" integer NOT NULL,
	"protocol" text NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"region" text,
	"ship_scope" jsonb DEFAULT '{"type":"ALL"}'::jsonb NOT NULL,
	"healthcheck_type" "healthcheck_type" NOT NULL,
	"healthcheck_interval_s" integer DEFAULT 30 NOT NULL,
	"timeout_ms" integer DEFAULT 5000 NOT NULL,
	"secret_ref" text,
	"tls" jsonb,
	"in_maintenance" boolean DEFAULT false NOT NULL,
	"config_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_health_state" (
	"endpoint_id" uuid PRIMARY KEY NOT NULL,
	"status" "health_status" DEFAULT 'UNKNOWN' NOT NULL,
	"since" timestamp with time zone DEFAULT now() NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"breaker_state" "breaker_state" DEFAULT 'CLOSED' NOT NULL,
	"breaker_opened_at" timestamp with time zone,
	"is_active" boolean DEFAULT false NOT NULL,
	"last_error" jsonb,
	"last_rtt_ms" integer,
	"last_check_at" timestamp with time zone,
	"last_success_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"area_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"imo" text,
	"mmsi" text,
	"status" "ship_status" DEFAULT 'PLANNED' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"crew_capacity" integer,
	"commissioned_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "areas" ADD CONSTRAINT "areas_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "device_backups" ADD CONSTRAINT "device_backups_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "devices" ADD CONSTRAINT "devices_ship_id_ships_id_fk" FOREIGN KEY ("ship_id") REFERENCES "public"."ships"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interfaces" ADD CONSTRAINT "interfaces_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interfaces" ADD CONSTRAINT "interfaces_zone_id_network_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."network_zones"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "network_zones" ADD CONSTRAINT "network_zones_ship_id_ships_id_fk" FOREIGN KEY ("ship_id") REFERENCES "public"."ships"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_endpoint_revisions" ADD CONSTRAINT "service_endpoint_revisions_endpoint_id_service_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."service_endpoints"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_health_state" ADD CONSTRAINT "service_health_state_endpoint_id_service_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."service_endpoints"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ships" ADD CONSTRAINT "ships_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "alerts_active_fingerprint_uq" ON "alerts" USING btree ("fingerprint") WHERE "alerts"."status" in ('FIRING','ACKED');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alerts_status_severity_ix" ON "alerts" USING btree ("status","severity","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "areas_org_code_uq" ON "areas" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_resource_ix" ON "audit_logs" USING btree ("resource_type","resource_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_actor_ix" ON "audit_logs" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_request_id_ix" ON "audit_logs" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "devices_ship_code_uq" ON "devices" USING btree ("ship_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "devices_ship_role_ix" ON "devices" USING btree ("ship_id","role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "devices_status_last_seen_ix" ON "devices" USING btree ("status","last_seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "interfaces_device_name_uq" ON "interfaces" USING btree ("device_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interfaces_accounting_group_ix" ON "interfaces" USING btree ("accounting_group","counted_in_reconciliation");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "network_zones_ship_kind_name_uq" ON "network_zones" USING btree ("ship_id","kind","name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "service_endpoints_uq" ON "service_endpoints" USING btree ("service_name","environment","host","port","protocol");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_endpoints_service_name_ix" ON "service_endpoints" USING btree ("service_name","enabled","priority");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ships_area_code_uq" ON "ships" USING btree ("area_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ships_area_status_ix" ON "ships" USING btree ("area_id","status");
--> statement-breakpoint
-- Self-referencing FK: interfaces.parent_interface_id → interfaces.id (VLAN → ether cha,
-- bridge member → bridge). Drizzle schema không khai báo trực tiếp vì self-reference trong
-- pgTable cần AnyPgColumn workaround; thêm bằng ALTER cho rõ ràng (docs/backend/02-DATABASE_DESIGN.md §1.2).
ALTER TABLE "interfaces" ADD CONSTRAINT "interfaces_parent_interface_id_fk"
  FOREIGN KEY ("parent_interface_id") REFERENCES "public"."interfaces"("id") ON DELETE SET NULL;
