import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Pool } from 'pg';
import { buildTestApp, resetTestDb, authHeader, newPool } from '../support/app';
import { validateAgainstContract } from '../support/contract';

const FORBIDDEN_KEYS = ['password', 'password_hash', 'shared_secret', 'nt_hash', 'secret'];

function scanForForbiddenKeys(value: unknown, path = '$'): string[] {
  const hits: string[] = [];
  if (value === null || typeof value !== 'object') return hits;
  if (Array.isArray(value)) {
    value.forEach((item, i) => hits.push(...scanForForbiddenKeys(item, `${path}[${i}]`)));
    return hits;
  }
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.includes(key.toLowerCase())) hits.push(`${path}.${key}`);
    hits.push(...scanForForbiddenKeys(val, `${path}.${key}`));
  }
  return hits;
}

/**
 * v1.4.0 contract test — every new endpoint built this phase (Goals #2/#3/#5/#6) validated against
 * the response schemas just added to contracts/openapi.yaml, on REAL responses (real Postgres, no
 * mocks), matching the pattern in openapi-contract.spec.ts. Also enforces the hard constraint that
 * no CREW/BUSINESS/health response ever leaks a credential-shaped field.
 */
describe('OpenAPI v1.4.0 contract — CREW/BUSINESS/health.ha/telemetry.normalize', () => {
  let app: NestFastifyApplication;
  let pool: Pool;
  let shipId: string;
  let deviceId: string;
  let crewIfaceId: string;
  let businessIfaceId: string;
  const ifaceNameById: Record<string, string> = {};

  beforeAll(async () => {
    app = await buildTestApp();
    pool = newPool();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  beforeEach(async () => {
    await resetTestDb(pool);
    const area = (
      await app.inject({ method: 'POST', url: '/api/v1/areas', headers: authHeader('inventory:write'), payload: { code: 'AREA-V14', name: 'Area v14' } })
    ).json().data;
    const ship = (
      await app.inject({ method: 'POST', url: '/api/v1/ships', headers: authHeader('inventory:write'), payload: { area_id: area.id, code: 'SHIP-V14', name: 'Ship v14' } })
    ).json().data;
    shipId = ship.id;
    const device = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/devices',
        headers: authHeader('inventory:write'),
        payload: { ship_id: shipId, code: 'DEV-V14', name: 'Device v14', role: 'CORE' },
      })
    ).json().data;
    deviceId = device.id;

    const crewZone = (
      await app.inject({ method: 'POST', url: `/api/v1/ships/${shipId}/zones`, headers: authHeader('inventory:write'), payload: { kind: 'CREW', name: 'crew-v14' } })
    ).json().data;
    const businessZone = (
      await app.inject({ method: 'POST', url: `/api/v1/ships/${shipId}/zones`, headers: authHeader('inventory:write'), payload: { kind: 'BUSINESS', name: 'biz-v14' } })
    ).json().data;

    const crewIf = (
      await app.inject({ method: 'POST', url: `/api/v1/devices/${deviceId}/interfaces`, headers: authHeader('inventory:write'), payload: { name: 'ether1-crew', type: 'ETHER' } })
    ).json().data;
    crewIfaceId = crewIf.id;
    ifaceNameById[crewIfaceId] = crewIf.name;
    await app.inject({
      method: 'POST',
      url: `/api/v1/interfaces/${crewIfaceId}/assign-zone`,
      headers: authHeader('inventory:write'),
      payload: { accounting_group: 'CREW_ACCESS', zone_id: crewZone.id, counted_in_reconciliation: true },
    });

    const bizIf = (
      await app.inject({ method: 'POST', url: `/api/v1/devices/${deviceId}/interfaces`, headers: authHeader('inventory:write'), payload: { name: 'ether2-biz', type: 'ETHER' } })
    ).json().data;
    businessIfaceId = bizIf.id;
    ifaceNameById[businessIfaceId] = bizIf.name;
    await app.inject({
      method: 'POST',
      url: `/api/v1/interfaces/${businessIfaceId}/assign-zone`,
      headers: authHeader('inventory:write'),
      payload: { accounting_group: 'BUSINESS_ACCESS', zone_id: businessZone.id, counted_in_reconciliation: true },
    });
  });

  describe('empty ship (no telemetry ingested yet) — honest INSUFFICIENT_DATA, still schema-valid', () => {
    it('GET crew/users, crew/radius-health, crew/raw-accounting', async () => {
      const users = await app.inject({ method: 'GET', url: `/api/v1/ships/${shipId}/crew/users`, headers: authHeader('crew:read') });
      validateAgainstContract('/ships/{shipId}/crew/users', 'get', users.statusCode, users.json());
      expect(users.json().data.users).toEqual([]);

      const health = await app.inject({ method: 'GET', url: `/api/v1/ships/${shipId}/crew/radius-health`, headers: authHeader('crew:read') });
      validateAgainstContract('/ships/{shipId}/crew/radius-health', 'get', health.statusCode, health.json());

      const raw = await app.inject({ method: 'GET', url: `/api/v1/ships/${shipId}/crew/raw-accounting`, headers: authHeader('raw:read') });
      validateAgainstContract('/ships/{shipId}/crew/raw-accounting', 'get', raw.statusCode, raw.json());
    });

    it('GET business/devices, business/usage, business/flows, business/raw-records', async () => {
      const devices = await app.inject({ method: 'GET', url: `/api/v1/ships/${shipId}/business/devices`, headers: authHeader('business:read') });
      validateAgainstContract('/ships/{shipId}/business/devices', 'get', devices.statusCode, devices.json());
      expect(devices.json().data.top_device).toBeNull();

      const usage = await app.inject({ method: 'GET', url: `/api/v1/ships/${shipId}/business/usage`, headers: authHeader('business:read') });
      validateAgainstContract('/ships/{shipId}/business/usage', 'get', usage.statusCode, usage.json());

      const flows = await app.inject({ method: 'GET', url: `/api/v1/ships/${shipId}/business/flows`, headers: authHeader('business:read') });
      validateAgainstContract('/ships/{shipId}/business/flows', 'get', flows.statusCode, flows.json());
      expect(flows.json().data.total_bytes).toBeNull(); // never fabricated to 0

      const rawRecords = await app.inject({ method: 'GET', url: `/api/v1/ships/${shipId}/business/raw-records`, headers: authHeader('raw:read') });
      validateAgainstContract('/ships/{shipId}/business/raw-records', 'get', rawRecords.statusCode, rawRecords.json());

      const unknown = await app.inject({ method: 'GET', url: `/api/v1/ships/${shipId}/business/flows/unknown`, headers: authHeader('raw:read') });
      validateAgainstContract('/ships/{shipId}/business/flows/unknown', 'get', unknown.statusCode, unknown.json());
    });

    it('GET /health/ha and POST /telemetry/normalize', async () => {
      const ha = await app.inject({ method: 'GET', url: '/api/v1/health/ha', headers: authHeader('health:read') });
      validateAgainstContract('/health/ha', 'get', ha.statusCode, ha.json());

      const normalize = await app.inject({ method: 'POST', url: '/api/v1/telemetry/normalize', headers: authHeader('telemetry:process') });
      validateAgainstContract('/telemetry/normalize', 'post', normalize.statusCode, normalize.json());
    });

    it('404 SHIP_NOT_FOUND on an unknown ship still matches the declared error schema', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/ships/00000000-0000-0000-0000-000000000000/crew/users',
        headers: authHeader('crew:read'),
      });
      validateAgainstContract('/ships/{shipId}/crew/users', 'get', res.statusCode, res.json());
      expect(res.statusCode).toBe(404);
    });
  });

  describe('populated ship (full ingest) — schema still valid with real data + no leaked secrets', () => {
    beforeEach(async () => {
      const t0 = new Date('2026-08-25T01:00:00.000Z');
      async function ingestCounter(interfaceId: string, key: string, rxBytes: number, txBytes: number) {
        await app.inject({
          method: 'POST',
          url: '/api/v1/telemetry/ingest',
          headers: authHeader('telemetry:ingest'),
          payload: {
            events: [
              {
                source: 'INTERFACE_COUNTER',
                idempotency_key: key,
                observed_at: t0.toISOString(),
                identity: { ship_id: shipId, interface_id: interfaceId },
                payload: { interface_name: ifaceNameById[interfaceId], rx_bytes: rxBytes, tx_bytes: txBytes },
              },
            ],
          },
        });
      }
      await ingestCounter(crewIfaceId, 'v14-crew-1', 100_000, 50_000);
      await ingestCounter(crewIfaceId, 'v14-crew-2', 102_000, 51_000);
      await ingestCounter(businessIfaceId, 'v14-biz-1', 20_000, 10_000);
      await ingestCounter(businessIfaceId, 'v14-biz-2', 20_500, 10_200);

      await app.inject({
        method: 'POST',
        url: '/api/v1/telemetry/ingest',
        headers: authHeader('telemetry:ingest'),
        payload: {
          events: [
            {
              source: 'RADIUS_ACCOUNTING',
              idempotency_key: 'v14-radius-start',
              observed_at: t0.toISOString(),
              identity: { ship_id: shipId, interface_id: crewIfaceId },
              payload: { acct_status_type: 'START', acct_session_id: 'v14-sess-1', username: 'crew.bob', framed_ip: '10.30.30.7' },
            },
            {
              source: 'RADIUS_ACCOUNTING',
              idempotency_key: 'v14-radius-stop',
              observed_at: new Date(t0.getTime() + 120_000).toISOString(),
              identity: { ship_id: shipId, interface_id: crewIfaceId },
              payload: {
                acct_status_type: 'STOP',
                acct_session_id: 'v14-sess-1',
                username: 'crew.bob',
                framed_ip: '10.30.30.7',
                acct_input_octets: 1_000_000,
                acct_output_octets: 2_000_000,
                acct_terminate_cause: 'User-Request',
              },
            },
          ],
        },
      });

      await app.inject({
        method: 'POST',
        url: '/api/v1/telemetry/ingest',
        headers: authHeader('telemetry:ingest'),
        payload: {
          events: [
            {
              source: 'IPFIX_FLOW',
              idempotency_key: 'v14-flow-1',
              observed_at: t0.toISOString(),
              identity: { ship_id: shipId, interface_id: businessIfaceId },
              payload: { src_ip: '10.40.40.9', dst_ip: '8.8.8.8', dst_port: 443, protocol: 6, bytes: 9999 },
            },
          ],
        },
      });
    });

    it('every CREW response matches contract and carries no credential-shaped field', async () => {
      const users = await app.inject({ method: 'GET', url: `/api/v1/ships/${shipId}/crew/users`, headers: authHeader('crew:read') });
      validateAgainstContract('/ships/{shipId}/crew/users', 'get', users.statusCode, users.json());
      expect(users.json().data.users.length).toBeGreaterThan(0);
      expect(scanForForbiddenKeys(users.json())).toEqual([]);

      const sessions = await app.inject({ method: 'GET', url: `/api/v1/ships/${shipId}/crew/users/crew.bob/sessions`, headers: authHeader('crew:read') });
      validateAgainstContract('/ships/{shipId}/crew/users/{username}/sessions', 'get', sessions.statusCode, sessions.json());
      expect(scanForForbiddenKeys(sessions.json())).toEqual([]);

      const health = await app.inject({ method: 'GET', url: `/api/v1/ships/${shipId}/crew/radius-health`, headers: authHeader('crew:read') });
      validateAgainstContract('/ships/{shipId}/crew/radius-health', 'get', health.statusCode, health.json());
      expect(scanForForbiddenKeys(health.json())).toEqual([]);

      const raw = await app.inject({ method: 'GET', url: `/api/v1/ships/${shipId}/crew/raw-accounting`, headers: authHeader('raw:read') });
      validateAgainstContract('/ships/{shipId}/crew/raw-accounting', 'get', raw.statusCode, raw.json());
      expect(raw.json().data.records.length).toBeGreaterThan(0);
      expect(scanForForbiddenKeys(raw.json())).toEqual([]);
    });

    it('every BUSINESS response matches contract and carries no credential-shaped field', async () => {
      const devices = await app.inject({ method: 'GET', url: `/api/v1/ships/${shipId}/business/devices`, headers: authHeader('business:read') });
      validateAgainstContract('/ships/{shipId}/business/devices', 'get', devices.statusCode, devices.json());
      expect(devices.json().data.devices.length).toBeGreaterThan(0);
      expect(scanForForbiddenKeys(devices.json())).toEqual([]);

      const usage = await app.inject({
        method: 'GET',
        url: `/api/v1/ships/${shipId}/business/usage?from=2026-08-25T00:00:00Z&to=2026-08-25T02:00:00Z`,
        headers: authHeader('business:read'),
      });
      validateAgainstContract('/ships/{shipId}/business/usage', 'get', usage.statusCode, usage.json());
      expect(scanForForbiddenKeys(usage.json())).toEqual([]);

      const flows = await app.inject({ method: 'GET', url: `/api/v1/ships/${shipId}/business/flows`, headers: authHeader('business:read') });
      validateAgainstContract('/ships/{shipId}/business/flows', 'get', flows.statusCode, flows.json());
      expect(flows.json().data.total_bytes).toBeGreaterThan(0);
      expect(scanForForbiddenKeys(flows.json())).toEqual([]);

      const rawRecords = await app.inject({ method: 'GET', url: `/api/v1/ships/${shipId}/business/raw-records`, headers: authHeader('raw:read') });
      validateAgainstContract('/ships/{shipId}/business/raw-records', 'get', rawRecords.statusCode, rawRecords.json());
      expect(scanForForbiddenKeys(rawRecords.json())).toEqual([]);
    });

    it('GET /health/ha and POST /telemetry/normalize still match contract with data present', async () => {
      const ha = await app.inject({ method: 'GET', url: '/api/v1/health/ha', headers: authHeader('health:read') });
      validateAgainstContract('/health/ha', 'get', ha.statusCode, ha.json());
      expect(scanForForbiddenKeys(ha.json())).toEqual([]);

      const normalize = await app.inject({ method: 'POST', url: '/api/v1/telemetry/normalize', headers: authHeader('telemetry:process') });
      validateAgainstContract('/telemetry/normalize', 'post', normalize.statusCode, normalize.json());
    });

    it('POST /telemetry/ingest response still matches the (now-relaxed) TelemetryIngestResponse contract', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/telemetry/ingest',
        headers: authHeader('telemetry:ingest'),
        payload: {
          events: [
            {
              source: 'INTERFACE_COUNTER',
              idempotency_key: 'v14-contract-check',
              observed_at: new Date('2026-08-25T01:05:00.000Z').toISOString(),
              identity: { ship_id: shipId, interface_id: crewIfaceId },
              payload: { interface_name: ifaceNameById[crewIfaceId], rx_bytes: 999, tx_bytes: 999 },
            },
          ],
        },
      });
      validateAgainstContract('/telemetry/ingest', 'post', res.statusCode, res.json());
      // analytics_processed can now genuinely be true — assert it is a real boolean, not forced false.
      expect(typeof res.json().data.analytics_processed).toBe('boolean');
    });
  });
});
