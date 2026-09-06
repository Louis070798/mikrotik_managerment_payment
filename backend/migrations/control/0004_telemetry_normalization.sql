-- Phase 4 — telemetry normalization layer.
--
-- Pragmatic note (see docs/backend/02-DATABASE_DESIGN.md §0/§8 and 01-BACKEND_DESIGN.md ADR-02):
-- the target architecture puts this data in TimescaleDB (`database.analytics`). This sandbox has
-- only PostgreSQL 16 available (no Timescale/ClickHouse/NATS), so these tables live in
-- `database.control` as a pragmatic stand-in with the SAME column shape the Timescale tables in
-- 02-DATABASE_DESIGN.md §3 describe. They are NOT hypertables, have no compression/retention
-- policy, and aggregation is done at query time (date_trunc bucketing) rather than via continuous
-- aggregates. This is intentionally documented as incomplete versus the target design — see the
-- final phase report for the full list of what remains.

CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint

ALTER TABLE "raw_telemetry_events" ADD COLUMN IF NOT EXISTS "processed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "raw_telemetry_events" ADD COLUMN IF NOT EXISTS "processing_error" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "raw_telemetry_pending_ix" ON "raw_telemetry_events" USING btree ("source", "received_at") WHERE "processed_at" IS NULL;--> statement-breakpoint

CREATE TYPE "public"."delta_quality" AS ENUM('GOOD', 'DEGRADED', 'MISSING');--> statement-breakpoint
CREATE TYPE "public"."radius_session_status" AS ENUM('ACTIVE', 'CLOSED', 'STALE', 'ORPHANED');--> statement-breakpoint
CREATE TYPE "public"."binding_source" AS ENUM('RADIUS', 'HOTSPOT', 'DHCP', 'ARP', 'STATIC');--> statement-breakpoint

-- interface_counter_samples — normalized cumulative counter, one row per (interface, observed_at).
-- Analogue of 02-DATABASE_DESIGN.md §3.1 interface_counters.
CREATE TABLE IF NOT EXISTS "interface_counter_samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ship_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"interface_id" uuid NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"rx_bytes" bigint NOT NULL,
	"tx_bytes" bigint NOT NULL,
	"rx_packets" bigint,
	"tx_packets" bigint,
	"rx_errors" bigint,
	"tx_errors" bigint,
	"rx_drops" bigint,
	"tx_drops" bigint,
	"counter_source" "counter_source" NOT NULL,
	"raw_event_id" uuid NOT NULL,
	"parser_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interface_counter_samples_interface_observed_uq" UNIQUE ("interface_id", "observed_at")
);--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "interface_counter_samples" ADD CONSTRAINT "ics_ship_id_ships_id_fk" FOREIGN KEY ("ship_id") REFERENCES "public"."ships"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interface_counter_samples" ADD CONSTRAINT "ics_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interface_counter_samples" ADD CONSTRAINT "ics_interface_id_interfaces_id_fk" FOREIGN KEY ("interface_id") REFERENCES "public"."interfaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interface_counter_samples" ADD CONSTRAINT "ics_raw_event_id_fk" FOREIGN KEY ("raw_event_id") REFERENCES "public"."raw_telemetry_events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ics_interface_observed_ix" ON "interface_counter_samples" USING btree ("interface_id", "observed_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ics_ship_observed_ix" ON "interface_counter_samples" USING btree ("ship_id", "observed_at" DESC);--> statement-breakpoint

-- interface_counter_deltas — ADR-10 delta engine output. accounting_group denormalized per
-- 02-DATABASE_DESIGN.md §3.1 rationale (historical fidelity: reflects the group at ingest time).
CREATE TABLE IF NOT EXISTS "interface_counter_deltas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bucket" timestamp with time zone NOT NULL,
	"ship_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"interface_id" uuid NOT NULL,
	"accounting_group" "accounting_group" NOT NULL,
	"d_rx_bytes" bigint NOT NULL,
	"d_tx_bytes" bigint NOT NULL,
	"d_rx_packets" bigint,
	"d_tx_packets" bigint,
	"elapsed_s" integer NOT NULL,
	"counter_reset" boolean NOT NULL DEFAULT false,
	"quality" "delta_quality" NOT NULL,
	"previous_sample_id" uuid,
	"current_sample_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "icd_interface_bucket_uq" UNIQUE ("interface_id", "bucket")
);--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "interface_counter_deltas" ADD CONSTRAINT "icd_ship_id_ships_id_fk" FOREIGN KEY ("ship_id") REFERENCES "public"."ships"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interface_counter_deltas" ADD CONSTRAINT "icd_interface_id_interfaces_id_fk" FOREIGN KEY ("interface_id") REFERENCES "public"."interfaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "icd_ship_group_bucket_ix" ON "interface_counter_deltas" USING btree ("ship_id", "accounting_group", "bucket" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "icd_interface_bucket_ix" ON "interface_counter_deltas" USING btree ("interface_id", "bucket" DESC);--> statement-breakpoint

-- radius_accounting_events — normalized, append-only view of ingested RADIUS accounting.
-- Analogue of aaa.radacct (§2.1) restricted to what actually arrives via /telemetry/ingest.
CREATE TABLE IF NOT EXISTS "radius_accounting_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ship_id" uuid,
	"device_id" uuid,
	"acct_session_id" text NOT NULL,
	"acct_status_type" text NOT NULL,
	"username" text,
	"framed_ip" text,
	"calling_station_mac" text,
	"acct_input_octets" bigint,
	"acct_input_gigawords" integer,
	"acct_output_octets" bigint,
	"acct_output_gigawords" integer,
	"upload_bytes" bigint,
	"download_bytes" bigint,
	"session_time_s" bigint,
	"terminate_cause" text,
	"observed_at" timestamp with time zone NOT NULL,
	"raw_event_id" uuid NOT NULL,
	"parser_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "radius_accounting_events" ADD CONSTRAINT "rae_ship_id_ships_id_fk" FOREIGN KEY ("ship_id") REFERENCES "public"."ships"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "radius_accounting_events" ADD CONSTRAINT "rae_raw_event_id_fk" FOREIGN KEY ("raw_event_id") REFERENCES "public"."raw_telemetry_events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rae_ship_observed_ix" ON "radius_accounting_events" USING btree ("ship_id", "observed_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rae_session_ix" ON "radius_accounting_events" USING btree ("acct_session_id", "observed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rae_username_ix" ON "radius_accounting_events" USING btree ("username", "observed_at" DESC);--> statement-breakpoint

-- radius_sessions — session state machine built from radius_accounting_events.
-- Analogue of 02-DATABASE_DESIGN.md §3.3 radius_sessions. STALE is computed at query time
-- (no background sweep job in this phase — documented gap), not stored.
CREATE TABLE IF NOT EXISTS "radius_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ship_id" uuid NOT NULL,
	"device_id" uuid,
	"username" text NOT NULL,
	"acct_session_id" text NOT NULL,
	"framed_ip" text,
	"calling_station_mac" text,
	"start_time" timestamp with time zone NOT NULL,
	"stop_time" timestamp with time zone,
	"last_interim_at" timestamp with time zone,
	"upload_bytes" bigint,
	"download_bytes" bigint,
	"session_time_s" bigint,
	"terminate_cause" text,
	"status" "radius_session_status" NOT NULL DEFAULT 'ACTIVE',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "radius_sessions_ship_session_uq" UNIQUE ("ship_id", "acct_session_id")
);--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "radius_sessions" ADD CONSTRAINT "rs_ship_id_ships_id_fk" FOREIGN KEY ("ship_id") REFERENCES "public"."ships"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rs_ship_start_ix" ON "radius_sessions" USING btree ("ship_id", "start_time" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rs_username_start_ix" ON "radius_sessions" USING btree ("ship_id", "username", "start_time" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rs_active_ix" ON "radius_sessions" USING btree ("ship_id", "status") WHERE "status" = 'ACTIVE';--> statement-breakpoint

-- ipfix_flow_records — normalized IPFIX flow. classification fields (domain/category/asn) are
-- intentionally absent: no classifier/dictionary exists yet (see final phase report).
CREATE TABLE IF NOT EXISTS "ipfix_flow_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ship_id" uuid,
	"device_id" uuid,
	"observed_at" timestamp with time zone NOT NULL,
	"src_ip" text NOT NULL,
	"dst_ip" text NOT NULL,
	"src_port" integer,
	"dst_port" integer,
	"protocol" integer,
	"bytes" bigint NOT NULL,
	"packets" bigint,
	"in_interface_id" uuid,
	"out_interface_id" uuid,
	"vlan_id" integer,
	"src_mac" text,
	"direction" text,
	"identity_username" text,
	"identity_source" "binding_source",
	"identity_confidence" numeric(3, 2),
	"classification_method" text NOT NULL DEFAULT 'UNKNOWN',
	"classification_confidence" numeric(3, 2),
	"unknown_reason" text,
	"raw_event_id" uuid NOT NULL,
	"parser_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "ipfix_flow_records" ADD CONSTRAINT "ifr_ship_id_ships_id_fk" FOREIGN KEY ("ship_id") REFERENCES "public"."ships"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ipfix_flow_records" ADD CONSTRAINT "ifr_in_interface_id_fk" FOREIGN KEY ("in_interface_id") REFERENCES "public"."interfaces"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ipfix_flow_records" ADD CONSTRAINT "ifr_out_interface_id_fk" FOREIGN KEY ("out_interface_id") REFERENCES "public"."interfaces"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ipfix_flow_records" ADD CONSTRAINT "ifr_raw_event_id_fk" FOREIGN KEY ("raw_event_id") REFERENCES "public"."raw_telemetry_events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ifr_ship_observed_ix" ON "ipfix_flow_records" USING btree ("ship_id", "observed_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ifr_src_ip_observed_ix" ON "ipfix_flow_records" USING btree ("ship_id", "src_ip", "observed_at" DESC);--> statement-breakpoint

-- identity_bindings — ADR-12 temporal identity correlation. Only the RADIUS source is populated
-- in this phase (HotSpot-active/DHCP/ARP collectors do not exist yet — documented gap).
CREATE TABLE IF NOT EXISTS "identity_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ship_id" uuid NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone,
	"client_ip" text NOT NULL,
	"client_mac" text,
	"zone" "zone_kind" NOT NULL,
	"username" text,
	"device_id" uuid,
	"interface_id" uuid,
	"vlan_id" integer,
	"acct_session_id" text,
	"source" "binding_source" NOT NULL,
	"confidence" numeric(3, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "identity_bindings" ADD CONSTRAINT "ib_ship_id_ships_id_fk" FOREIGN KEY ("ship_id") REFERENCES "public"."ships"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ib_ship_ip_from_ix" ON "identity_bindings" USING btree ("ship_id", "client_ip", "valid_from" DESC);--> statement-breakpoint

-- Core ADR-12 invariant: no two bindings from the SAME source can overlap in time for the same
-- (ship_id, client_ip). Requires btree_gist for the uuid/text equality terms in the GiST index.
DO $$ BEGIN
  ALTER TABLE "identity_bindings" ADD CONSTRAINT "ib_no_overlap_per_source_excl"
    EXCLUDE USING gist (
      "ship_id" WITH =,
      "client_ip" WITH =,
      "source" WITH =,
      tstzrange("valid_from", "valid_to") WITH &&
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;
