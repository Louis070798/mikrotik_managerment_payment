-- Phase 4 — HA/health reporting (goal #5: min-2-RADIUS, min-2-database, replication lag,
-- primary/secondary, failover state, all sourced from the service registry, never hard-coded).

ALTER TABLE "service_health_state" ADD COLUMN IF NOT EXISTS "details" jsonb;--> statement-breakpoint

COMMENT ON COLUMN "service_health_state"."details" IS
  'Structured detail from the last health check attempt (e.g. {is_primary, replica_count, replication_lag_seconds} for DATABASE, {age_hours, restore_test_result} for STORAGE). Populated on both success and failure, unlike last_error which is failure-only.';
