# Phase 5A backend integration runbook

This runbook is for the local PostgreSQL control database only. Docker is a prerequisite for the
reproducible integration environment. No production address, secret, RADIUS endpoint, collector,
or RouterOS device is configured by these steps.

## 1. Start PostgreSQL

From the repository root:

```powershell
docker compose -f infra/docker-compose.test.yml up -d
docker compose -f infra/docker-compose.test.yml ps
```

The test database is exposed only on `127.0.0.1:54329`. If that port is unavailable, start Compose
with another `POSTGRES_PORT` and use the same port in `DATABASE_CONTROL_URL`.

## 2. Configure, migrate, and seed

```powershell
Copy-Item backend/.env.test.example backend/.env.test
Set-Location backend
npm run migrate
npm run seed:test
```

`npm run migrate` is the project forward-only runner. It applies
`backend/migrations/control/*.sql` in filename order and records each applied filename in
`schema_migrations`. The test seed is idempotent, creates only organization/area/ship/device
inventory anchors, and never deletes rows or creates traffic measurements.

## 3. Run checks and tests

```powershell
npm run build
npx tsc --noEmit
npx jest test/unit --runInBand
npx jest test/contract --runInBand
npx jest --runInBand
```

The integration and response-contract suites require the PostgreSQL container, completed
migrations, and `DATABASE_CONTROL_URL`. Without those prerequisites they are **not PASS** and must
be reported as blocked by database availability.

## Migration metadata

The SQL migration sequence is `0001` through `0005`; the Drizzle journal entries use the same order
and tags. The SQL files are forward-only and must not be edited after application. The repository's
`scripts/migrate.ts` runner is authoritative for these hand-maintained SQL files and uses
`schema_migrations` for applied-state tracking. `drizzle-kit check` is a schema sanity check, not a
substitute for running the migrations against PostgreSQL.

## Known boundary

This phase does not provide a live RouterOS collector, NATS consumer, TimescaleDB/ClickHouse
analytics store, or production RADIUS deployment. Integration fixtures validate persistence,
normalization, and API behavior only.
