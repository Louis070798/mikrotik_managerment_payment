CREATE TYPE "public"."telemetry_source" AS ENUM('INTERFACE_COUNTER', 'RADIUS_ACCOUNTING', 'IPFIX_FLOW');--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "raw_telemetry_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "telemetry_source" NOT NULL,
	"idempotency_key" text NOT NULL,
	"source_event_id" text,
	"ship_id" uuid,
	"device_id" uuid,
	"interface_id" uuid,
	"user_identity" text,
	"user_identity_type" text,
	"source_device_ref" text,
	"source_interface_ref" text,
	"observed_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb,
	"raw_reference" text,
	"payload_hash_sha256" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "raw_telemetry_payload_or_reference_chk" CHECK ("payload" IS NOT NULL OR "raw_reference" IS NOT NULL)
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "raw_telemetry_events" ADD CONSTRAINT "raw_telemetry_events_ship_id_ships_id_fk" FOREIGN KEY ("ship_id") REFERENCES "public"."ships"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "raw_telemetry_events" ADD CONSTRAINT "raw_telemetry_events_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "raw_telemetry_events" ADD CONSTRAINT "raw_telemetry_events_interface_id_interfaces_id_fk" FOREIGN KEY ("interface_id") REFERENCES "public"."interfaces"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "raw_telemetry_source_idempotency_uq" ON "raw_telemetry_events" USING btree ("source", "idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "raw_telemetry_source_observed_ix" ON "raw_telemetry_events" USING btree ("source", "observed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "raw_telemetry_ship_observed_ix" ON "raw_telemetry_events" USING btree ("ship_id", "observed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "raw_telemetry_received_ix" ON "raw_telemetry_events" USING btree ("received_at");
