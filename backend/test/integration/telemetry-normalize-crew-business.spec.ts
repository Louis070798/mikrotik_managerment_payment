import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Pool } from 'pg';
import { buildTestApp, resetTestDb, authHeader, newPool } from '../support/app';

/**
 * Phase 4 end-to-end integration test — replays the full ingest -> normalize -> query pipeline
 * against the real test Postgres for all 3 telemetry sources (INTERFACE_COUNTER, RADIUS_ACCOUNTING,
 * IPFIX_FLOW), then asserts the CREW/BUSINESS/reconciliation API responses are built from that
 * normalized data with the exact ADR-09/ADR-10/ADR-12 formulas, honestly reporting partial
 * availability (MANAGEMENT has no data) rather than fabricating zeros.
 */
describe('Telemetry normalize -> CREW/BUSINESS/reconciliation pipeline', () => {
  let app: NestFastifyApplication;
  let pool: Pool;
  let shipId: string;
  let wanIfaceId: string;
  let crewIfaceId: string;
  let businessIfaceId: string;

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
      await app.inject({ method: 'POST', url: '/api/v1/areas', headers: authHeader('inventory:write'), payload: { code: 'AREA-TN', name: 'Area TN' } })
    ).json().data;
    const ship = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/ships',
        headers: authHeader('inventory:write'),
        payload: { area_id: area.id, code: 'SHIP-TN', name: 'Ship TN' },
      })
    ).json().data;
    shipId = ship.id;
    const device = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/devices',
        headers: authHeader('inventory:write'),
        payload: { ship_id: shipId, code: 'DEV-TN', name: 'Device TN', role: 'CORE' },
      })
    ).json().data;
    const deviceId = device.id;

    const crewZone = (
      await app.inject({ method: 'POST', url: `/api/v1/ships/${shipId}/zones`, headers: authHeader('inventory:write'), payload: { kind: 'CREW', name: 'crew-net' } })
    ).json().data;
    const businessZone = (
      await app.inject({ method: 'POST', url: `/api/v1/ships/${shipId}/zones`, headers: authHeader('inventory:write'), payload: { kind: 'BUSINESS', name: 'biz-net' } })
    ).json().data;

    async function createInterface(name: string) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/devices/${deviceId}/interfaces`,
        headers: authHeader('inventory:write'),
        payload: { name, type: 'ETHER' },
      });
      const iface = res.json().data;
      ifaceNameById[iface.id] = iface.name;
      return iface;
    }

    const wanIf = await createInterface('ether1-wan');
    wanIfaceId = wanIf.id;
    await app.inject({
      method: 'POST',
      url: `/api/v1/interfaces/${wanIfaceId}/assign-zone`,
      headers: authHeader('inventory:write'),
      payload: { accounting_group: 'WAN_INPUT', counted_in_reconciliation: true },
    });

    const crewIf = await createInterface('ether2-crew');
    crewIfaceId = crewIf.id;
    await app.inject({
      method: 'POST',
      url: `/api/v1/interfaces/${crewIfaceId}/assign-zone`,
      headers: authHeader('inventory:write'),
      payload: { accounting_group: 'CREW_ACCESS', zone_id: crewZone.id, counted_in_reconciliation: true },
    });

    const businessIf = await createInterface('ether3-business');
    businessIfaceId = businessIf.id;
    await app.inject({
      method: 'POST',
      url: `/api/v1/interfaces/${businessIfaceId}/assign-zone`,
      headers: authHeader('inventory:write'),
      payload: { accounting_group: 'BUSINESS_ACCESS', zone_id: businessZone.id, counted_in_reconciliation: true },
    });
  });

  // dto.ts always requires payload.interface_name for INTERFACE_COUNTER (even when identity
  // .interface_id is supplied) — the parser prefers interface_id when present and only falls back
  // to resolving by name, but the DTO's superRefine does not know that, so both must be sent.
  const ifaceNameById: Record<string, string> = {};

  async function ingestCounter(interfaceId: string, key: string, observedAt: Date, rxBytes: number, txBytes: number) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/telemetry/ingest',
      headers: authHeader('telemetry:ingest'),
      payload: {
        events: [
          {
            source: 'INTERFACE_COUNTER',
            idempotency_key: key,
            observed_at: observedAt.toISOString(),
            identity: { ship_id: shipId, interface_id: interfaceId },
            payload: { interface_name: ifaceNameById[interfaceId], rx_bytes: rxBytes, tx_bytes: txBytes },
          },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  it('normalizes interface counters into deltas with exact ADR-10 arithmetic (never fabricated)', async () => {
    const t0 = new Date('2026-08-25T01:00:00.000Z');
    const t1 = new Date(t0.getTime() + 60_000);

    await ingestCounter(wanIfaceId, 'wan-c1', t0, 1_000_000, 500_000);
    const secondResult = await ingestCounter(wanIfaceId, 'wan-c2', t1, 1_005_000, 503_000);

    // First accepted sample for an interface has no previous to diff against -> normalized=true
    // but no delta row; second sample DOES produce a delta -> analytics_processed reflects that.
    expect(secondResult.data.analytics_processed).toBe(true);
    expect(secondResult.data.events[0].normalized).toBe(true);

    const { rows } = await pool.query(
      `SELECT d_rx_bytes, d_tx_bytes, elapsed_s, quality, counter_reset FROM interface_counter_deltas WHERE interface_id = $1`,
      [wanIfaceId],
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].d_rx_bytes)).toBe(5000);
    expect(Number(rows[0].d_tx_bytes)).toBe(3000);
    expect(Number(rows[0].elapsed_s)).toBe(60);
    expect(rows[0].quality).toBe('GOOD');
    expect(rows[0].counter_reset).toBe(false);
  });

  it('duplicate idempotency_key is acknowledged without a second delta row', async () => {
    const t0 = new Date('2026-08-25T01:00:00.000Z');
    await ingestCounter(wanIfaceId, 'wan-dup', t0, 1_000_000, 500_000);
    const dup = await ingestCounter(wanIfaceId, 'wan-dup', t0, 1_000_000, 500_000);
    expect(dup.data.duplicate_count).toBe(1);
    expect(dup.data.events[0].status).toBe('DUPLICATE');
    expect(dup.data.events[0].normalized).toBeNull(); // not attempted, not fabricated true/false

    const { rows } = await pool.query(`SELECT count(*)::int AS c FROM interface_counter_samples WHERE interface_id = $1`, [wanIfaceId]);
    expect(rows[0].c).toBe(1);
  });

  describe('with a full ingest across all 3 sources', () => {
    beforeEach(async () => {
      const t0 = new Date('2026-08-25T01:00:00.000Z');
      const t1 = new Date(t0.getTime() + 60_000);

      // WAN interface counters (input to the ship)
      await ingestCounter(wanIfaceId, 'wan-1', t0, 1_000_000, 500_000);
      await ingestCounter(wanIfaceId, 'wan-2', t1, 1_005_000, 503_000);
      // CREW interface counters
      await ingestCounter(crewIfaceId, 'crew-1', t0, 200_000, 100_000);
      await ingestCounter(crewIfaceId, 'crew-2', t1, 202_000, 101_500);
      // BUSINESS interface counters
      await ingestCounter(businessIfaceId, 'biz-1', t0, 50_000, 30_000);
      await ingestCounter(businessIfaceId, 'biz-2', t1, 50_800, 30_400);

      // RADIUS accounting for crew.alice — Start/Interim/Stop with gigawords, on the CREW interface.
      const radiusEvents = [
        {
          source: 'RADIUS_ACCOUNTING',
          idempotency_key: 'radius-start',
          observed_at: t0.toISOString(),
          identity: { ship_id: shipId, interface_id: crewIfaceId },
          payload: { acct_status_type: 'START', acct_session_id: 'sess-1', username: 'crew.alice', framed_ip: '10.10.10.5' },
        },
        {
          source: 'RADIUS_ACCOUNTING',
          idempotency_key: 'radius-interim',
          observed_at: t1.toISOString(),
          identity: { ship_id: shipId, interface_id: crewIfaceId },
          payload: {
            acct_status_type: 'INTERIM_UPDATE',
            acct_session_id: 'sess-1',
            username: 'crew.alice',
            framed_ip: '10.10.10.5',
            acct_input_octets: 3_000_000,
            acct_input_gigawords: 0,
            acct_output_octets: 4_000_000,
            acct_output_gigawords: 0,
          },
        },
        {
          source: 'RADIUS_ACCOUNTING',
          idempotency_key: 'radius-stop',
          observed_at: new Date(t1.getTime() + 60_000).toISOString(),
          identity: { ship_id: shipId, interface_id: crewIfaceId },
          payload: {
            acct_status_type: 'STOP',
            acct_session_id: 'sess-1',
            username: 'crew.alice',
            framed_ip: '10.10.10.5',
            // 1 gigaword each -> exercises ADR-09 combineOctets, not just plain octets
            acct_input_octets: 3_000_000,
            acct_input_gigawords: 1,
            acct_output_octets: 4_000_000,
            acct_output_gigawords: 1,
            acct_terminate_cause: 'User-Request',
          },
        },
      ];
      const radiusRes = await app.inject({
        method: 'POST',
        url: '/api/v1/telemetry/ingest',
        headers: authHeader('telemetry:ingest'),
        payload: { events: radiusEvents },
      });
      expect(radiusRes.statusCode).toBe(201);
      expect(radiusRes.json().data.analytics_processed).toBe(true);

      // IPFIX flow on the BUSINESS interface, from an unrelated device IP (no RADIUS binding).
      const flowRes = await app.inject({
        method: 'POST',
        url: '/api/v1/telemetry/ingest',
        headers: authHeader('telemetry:ingest'),
        payload: {
          events: [
            {
              source: 'IPFIX_FLOW',
              idempotency_key: 'flow-biz-1',
              observed_at: t1.toISOString(),
              identity: { ship_id: shipId, interface_id: businessIfaceId },
              payload: { src_ip: '10.20.20.5', dst_ip: '93.184.216.34', dst_port: 443, protocol: 6, bytes: 123_456, src_mac: 'aa:bb:cc:dd:ee:01' },
            },
          ],
        },
      });
      expect(flowRes.statusCode).toBe(201);
    });

    it('POST /telemetry/normalize catch-up trigger finds nothing pending (ingest already normalized synchronously)', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/telemetry/normalize', headers: authHeader('telemetry:process') });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.scanned).toBe(0);
    });

    it('RADIUS session state machine closes with gigawords-combined ADR-09 totals', async () => {
      const { rows } = await pool.query(`SELECT status, upload_bytes, download_bytes, terminate_cause FROM radius_sessions WHERE ship_id = $1 AND acct_session_id = 'sess-1'`, [shipId]);
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('CLOSED');
      // Acct-Input (upload) = 3,000,000 + 1*2^32 = 4,297,967,296; Acct-Output (download) = 4,000,000 + 1*2^32 = 4,298,967,296
      expect(Number(rows[0].upload_bytes)).toBe(3_000_000 + 4294967296);
      expect(Number(rows[0].download_bytes)).toBe(4_000_000 + 4294967296);
      expect(rows[0].terminate_cause).toBe('User-Request');
    });

    it('identity_bindings interval is opened at Start and closed at Stop (ADR-12)', async () => {
      const { rows } = await pool.query(
        `SELECT source, username, valid_from, valid_to FROM identity_bindings WHERE ship_id = $1 AND client_ip = '10.10.10.5'`,
        [shipId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].source).toBe('RADIUS');
      expect(rows[0].username).toBe('crew.alice');
      expect(rows[0].valid_to).not.toBeNull();
    });

    it('GET crew/users lists alice with correct totals and CLOSED session -> INACTIVE display status', async () => {
      const res = await app.inject({ method: 'GET', url: `/api/v1/ships/${shipId}/crew/users`, headers: authHeader('crew:read') });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.identity_capability).toEqual(expect.objectContaining({ status: 'AVAILABLE', method: 'RADIUS' }));
      expect(body.data.service_usage_capability).toEqual(expect.objectContaining({ status: 'NOT_AVAILABLE', reason: 'NO_CLASSIFIER_IMPLEMENTED' }));
      const alice = body.data.users.find((u: any) => u.username === 'crew.alice');
      expect(alice).toBeDefined();
      expect(alice.status).toBe('INACTIVE');
      expect(alice.upload_bytes).toBe(3_000_000 + 4294967296);
      expect(alice.download_bytes).toBe(4_000_000 + 4294967296);
      expect(alice.total_bytes).toBe(alice.upload_bytes + alice.download_bytes);
      expect(alice.service_usage).toBeNull(); // never fabricated
      expect(alice.domain_usage).toBeNull();
    });

    it('GET crew/users/:username/sessions returns the closed session drill-down', async () => {
      const res = await app.inject({ method: 'GET', url: `/api/v1/ships/${shipId}/crew/users/crew.alice/sessions`, headers: authHeader('crew:read') });
      expect(res.statusCode).toBe(200);
      const sessions = res.json().data.sessions;
      expect(sessions).toHaveLength(1);
      expect(sessions[0].status).toBe('CLOSED');
      expect(sessions[0].terminate_cause).toBe('User-Request');
    });

    it('GET crew/raw-accounting drill-down returns all 3 raw RADIUS events for the session', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/ships/${shipId}/crew/raw-accounting?acct_session_id=sess-1`,
        headers: authHeader('raw:read'),
      });
      expect(res.statusCode).toBe(200);
      const records = res.json().data.records;
      expect(records.map((r: any) => r.acct_status_type).sort()).toEqual(['INTERIM_UPDATE', 'START', 'STOP']);
    });

    it('GET crew/radius-health honestly reports below-minimum HA when no radius.* service_endpoints are registered', async () => {
      const res = await app.inject({ method: 'GET', url: `/api/v1/ships/${shipId}/crew/radius-health`, headers: authHeader('crew:read') });
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.configured_endpoints).toBe(0);
      expect(data.ha_compliant).toBe(false);
      expect(data.status).toBe('UNKNOWN'); // 0 endpoints — never claim HEALTHY with nothing configured
      expect(data.accounting_freshness_seconds).not.toBeNull(); // we DID receive RADIUS_ACCOUNTING for this ship
      expect(res.json().meta.warnings.some((w: any) => w.code === 'RADIUS_HA_BELOW_MINIMUM')).toBe(true);
    });

    it('GET business/devices lists the flow source IP with total_bytes real and download/upload honestly null', async () => {
      const res = await app.inject({ method: 'GET', url: `/api/v1/ships/${shipId}/business/devices`, headers: authHeader('business:read') });
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.identity_capability).toEqual(expect.objectContaining({ status: 'NOT_AVAILABLE', method: 'NONE' }));
      expect(data.devices).toHaveLength(1);
      expect(data.devices[0].ip).toBe('10.20.20.5');
      expect(data.devices[0].total_bytes).toBe(123_456);
      expect(data.devices[0].download_bytes).toBeNull();
      expect(data.devices[0].upload_bytes).toBeNull();
      expect(data.top_device.ip).toBe('10.20.20.5');
    });

    it('GET business/usage buckets BUSINESS_ACCESS interface deltas with tx=download/rx=upload convention', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/ships/${shipId}/business/usage?from=2026-08-25T00:00:00Z&to=2026-08-25T02:00:00Z&granularity=1h`,
        headers: authHeader('business:read'),
      });
      expect(res.statusCode).toBe(200);
      const points = res.json().data.points;
      expect(points.length).toBeGreaterThan(0);
      const total = points.reduce((sum: number, p: any) => sum + p.download_bytes + p.upload_bytes, 0);
      expect(total).toBe(800 + 400); // dRx=50800-50000=800 (upload), dTx=30400-30000=400 (download)
    });

    it('GET business/flows reports UNKNOWN classification honestly with unattributed_bytes = total', async () => {
      const res = await app.inject({ method: 'GET', url: `/api/v1/ships/${shipId}/business/flows`, headers: authHeader('business:read') });
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.total_bytes).toBe(123_456);
      expect(data.classification_method).toBe('UNKNOWN');
      expect(data.unknown_reason).toBe('NO_CLASSIFIER_IMPLEMENTED');
      expect(data.unattributed_bytes).toBe(123_456);
      expect(data.top_destinations[0].dst_ip).toBe('93.184.216.34');
    });

    it('GET business/flows/unknown and raw-records both surface the same raw flow drill-down today', async () => {
      const unknown = await app.inject({ method: 'GET', url: `/api/v1/ships/${shipId}/business/flows/unknown`, headers: authHeader('raw:read') });
      const raw = await app.inject({ method: 'GET', url: `/api/v1/ships/${shipId}/business/raw-records`, headers: authHeader('raw:read') });
      expect(unknown.statusCode).toBe(200);
      expect(raw.statusCode).toBe(200);
      expect(unknown.json().data.records.map((r: any) => r.id)).toEqual(raw.json().data.records.map((r: any) => r.id));
      expect(raw.json().data.records[0].classification_method).toBe('UNKNOWN');
    });

    it('GET reconciliation summary reports MANAGEMENT as genuinely missing (null, not 0) while WAN/CREW/BUSINESS are measured', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/ships/${shipId}/reconciliation?from=2026-08-25T00:00:00Z&to=2026-08-25T02:00:00Z`,
        headers: authHeader('reconciliation:read'),
      });
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.formula_version).toBe('recon-1.0.0');
      expect(data.wan.download_bytes).not.toBeNull();
      expect(data.crew.port_download_bytes).not.toBeNull();
      expect(data.crew.user_download_bytes).not.toBeNull(); // RADIUS-reported side, ADR-09 gigawords-combined
      expect(data.business.download_bytes).not.toBeNull();
      // No MANAGEMENT interface was ever assigned -> genuinely no rows -> null, never fabricated 0.
      expect(data.management.download_bytes).toBeNull();
      expect(data.management.upload_bytes).toBeNull();
      // WAN + CREW interface_counters and radius_accounting are all present -> nothing missing.
      expect(data.data_quality.missing_sources).toEqual([]);
      expect(data.data_quality.status).toBe('AVAILABLE');
    });

    it('GET reconciliation/by-zone and by-wan/by-interface expose per-zone/per-interface breakdowns', async () => {
      const byZone = await app.inject({
        method: 'GET',
        url: `/api/v1/ships/${shipId}/reconciliation/by-zone?from=2026-08-25T00:00:00Z&to=2026-08-25T02:00:00Z`,
        headers: authHeader('reconciliation:read'),
      });
      expect(byZone.statusCode).toBe(200);
      const zones = byZone.json().data.zones;
      // getByZone always reports all 4 canonical groups (never drops the ones with no data) —
      // MANAGEMENT is present but null/null since no MANAGEMENT interface was ever assigned.
      expect(zones.map((z: any) => z.accounting_group).sort()).toEqual(['BUSINESS_ACCESS', 'CREW_ACCESS', 'MANAGEMENT', 'WAN_INPUT']);
      const management = zones.find((z: any) => z.accounting_group === 'MANAGEMENT');
      expect(management.download_bytes).toBeNull();
      const wan = zones.find((z: any) => z.accounting_group === 'WAN_INPUT');
      expect(wan.download_bytes).not.toBeNull();

      const byInterface = await app.inject({
        method: 'GET',
        url: `/api/v1/ships/${shipId}/reconciliation/by-interface?from=2026-08-25T00:00:00Z&to=2026-08-25T02:00:00Z`,
        headers: authHeader('reconciliation:read'),
      });
      expect(byInterface.statusCode).toBe(200);
      expect(byInterface.json().data.interfaces.length).toBeGreaterThanOrEqual(3);
    });
  });
});
