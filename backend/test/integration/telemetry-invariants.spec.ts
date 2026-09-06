import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Pool } from 'pg';
import { buildTestApp, resetTestDb, authHeader, newPool } from '../support/app';

/**
 * Bất biến của pipeline telemetry — chạy trên PostgreSQL thật, không mock.
 *
 * Năm điều phải đúng, kiểm ở mức bảng chứ không chỉ ở mức API:
 *   1. raw_telemetry_events được normalize vào ĐỦ interface_counter_*, radius_sessions,
 *      ipfix_flow_records, và mỗi bản ghi truy ngược được về raw event sinh ra nó.
 *   2. Event trùng (cùng source + idempotency_key) KHÔNG tạo bản ghi thứ hai ở BẤT KỲ
 *      bảng normalize nào — kiểm cho cả 3 nguồn, không chỉ interface counter.
 *   3. Trường thiết bị không gửi phải là NULL, không được biến thành 0.
 *   4. Chưa có classifier service/domain -> UNKNOWN + unknown_reason, confidence NULL.
 *   5. Reconciliation: gap = WAN − (CREW + BUSINESS + MANAGEMENT), đúng từng byte.
 */
describe('Telemetry invariants — normalize, idempotency, NULL, classification, reconciliation', () => {
  let app: NestFastifyApplication;
  let pool: Pool;
  let shipId: string;
  let deviceId: string;
  let wanIfaceId: string;
  let crewIfaceId: string;
  let businessIfaceId: string;
  let managementIfaceId: string;
  const ifaceNameById: Record<string, string> = {};

  const T0 = new Date('2026-08-25T03:00:00.000Z');
  const T1 = new Date(T0.getTime() + 60_000);
  const WINDOW = 'from=2026-08-25T02:00:00Z&to=2026-08-25T04:00:00Z';

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
      await app.inject({ method: 'POST', url: '/api/v1/areas', headers: authHeader('inventory:write'), payload: { code: 'AREA-INV', name: 'Area INV' } })
    ).json().data;
    const ship = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/ships',
        headers: authHeader('inventory:write'),
        payload: { area_id: area.id, code: 'SHIP-INV', name: 'Ship INV' },
      })
    ).json().data;
    shipId = ship.id;
    deviceId = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/devices',
        headers: authHeader('inventory:write'),
        payload: { ship_id: shipId, code: 'DEV-INV', name: 'Device INV', role: 'CORE' },
      })
    ).json().data.id;

    const crewZone = (
      await app.inject({ method: 'POST', url: `/api/v1/ships/${shipId}/zones`, headers: authHeader('inventory:write'), payload: { kind: 'CREW', name: 'crew-inv' } })
    ).json().data;
    const businessZone = (
      await app.inject({ method: 'POST', url: `/api/v1/ships/${shipId}/zones`, headers: authHeader('inventory:write'), payload: { kind: 'BUSINESS', name: 'biz-inv' } })
    ).json().data;
    const mgmtZone = (
      await app.inject({ method: 'POST', url: `/api/v1/ships/${shipId}/zones`, headers: authHeader('inventory:write'), payload: { kind: 'MANAGEMENT', name: 'mgmt-inv' } })
    ).json().data;

    async function createInterface(name: string, assign: Record<string, unknown>) {
      const iface = (
        await app.inject({
          method: 'POST',
          url: `/api/v1/devices/${deviceId}/interfaces`,
          headers: authHeader('inventory:write'),
          payload: { name, type: 'ETHER' },
        })
      ).json().data;
      ifaceNameById[iface.id] = iface.name;
      const assignRes = await app.inject({
        method: 'POST',
        url: `/api/v1/interfaces/${iface.id}/assign-zone`,
        headers: authHeader('inventory:write'),
        payload: { counted_in_reconciliation: true, ...assign },
      });
      expect(assignRes.statusCode).toBe(201);
      return iface.id as string;
    }

    wanIfaceId = await createInterface('ether1-wan', { accounting_group: 'WAN_INPUT' });
    crewIfaceId = await createInterface('ether2-crew', { accounting_group: 'CREW_ACCESS', zone_id: crewZone.id });
    businessIfaceId = await createInterface('ether3-biz', { accounting_group: 'BUSINESS_ACCESS', zone_id: businessZone.id });
    managementIfaceId = await createInterface('ether4-mgmt', { accounting_group: 'MANAGEMENT', zone_id: mgmtZone.id });
  });

  async function ingest(events: Record<string, unknown>[]) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/telemetry/ingest',
      headers: authHeader('telemetry:ingest'),
      payload: { events },
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  function counterEvent(interfaceId: string, key: string, observedAt: Date, rxBytes: number, txBytes: number, extra: Record<string, unknown> = {}) {
    return {
      source: 'INTERFACE_COUNTER',
      idempotency_key: key,
      observed_at: observedAt.toISOString(),
      identity: { ship_id: shipId, interface_id: interfaceId },
      payload: { interface_name: ifaceNameById[interfaceId], rx_bytes: rxBytes, tx_bytes: txBytes, ...extra },
    };
  }

  const radiusStop = () => ({
    source: 'RADIUS_ACCOUNTING',
    idempotency_key: 'inv-radius-stop',
    observed_at: T1.toISOString(),
    identity: { ship_id: shipId, interface_id: crewIfaceId },
    payload: {
      acct_status_type: 'STOP',
      acct_session_id: 'inv-sess-1',
      username: 'crew.bob',
      framed_ip: '10.30.30.7',
      acct_input_octets: 1_000,
      acct_input_gigawords: 0,
      acct_output_octets: 2_000,
      acct_output_gigawords: 0,
      acct_terminate_cause: 'User-Request',
    },
  });

  const ipfixFlow = () => ({
    source: 'IPFIX_FLOW',
    idempotency_key: 'inv-flow-1',
    observed_at: T1.toISOString(),
    identity: { ship_id: shipId, interface_id: businessIfaceId },
    payload: { src_ip: '10.40.40.9', dst_ip: '198.51.100.10', dst_port: 443, protocol: 6, bytes: 77_000 },
  });

  async function ingestAllThreeSources() {
    await ingest([
      counterEvent(wanIfaceId, 'inv-wan-1', T0, 10_000_000, 5_000_000),
      counterEvent(crewIfaceId, 'inv-crew-1', T0, 2_000_000, 1_000_000),
      counterEvent(businessIfaceId, 'inv-biz-1', T0, 500_000, 300_000),
      counterEvent(managementIfaceId, 'inv-mgmt-1', T0, 100_000, 60_000),
    ]);
    await ingest([
      // WAN: dRx = 400_000 (download), dTx = 90_000 (upload)
      counterEvent(wanIfaceId, 'inv-wan-2', T1, 10_400_000, 5_090_000),
      // CREW: dTx = 50_000 (download), dRx = 30_000 (upload)
      counterEvent(crewIfaceId, 'inv-crew-2', T1, 2_030_000, 1_050_000),
      // BUSINESS: dTx = 20_000 (download), dRx = 11_000 (upload)
      counterEvent(businessIfaceId, 'inv-biz-2', T1, 511_000, 320_000),
      // MANAGEMENT: dTx = 4_000 (download), dRx = 3_000 (upload)
      counterEvent(managementIfaceId, 'inv-mgmt-2', T1, 103_000, 64_000),
    ]);
    await ingest([radiusStop(), ipfixFlow()]);
  }

  it('1. raw telemetry được normalize vào interface counters + RADIUS sessions + IPFIX records, có truy vết raw_event_id', async () => {
    await ingestAllThreeSources();

    const pending = await pool.query(`SELECT count(*)::int AS c FROM raw_telemetry_events WHERE processed_at IS NULL`);
    expect(pending.rows[0].c).toBe(0);

    const samples = await pool.query(`SELECT count(*)::int AS c FROM interface_counter_samples WHERE ship_id = $1`, [shipId]);
    expect(samples.rows[0].c).toBe(8); // 4 interface x 2 mốc thời gian
    const deltas = await pool.query(`SELECT count(*)::int AS c FROM interface_counter_deltas WHERE ship_id = $1`, [shipId]);
    expect(deltas.rows[0].c).toBe(4); // mốc thứ hai của mỗi interface

    const sessions = await pool.query(`SELECT status, upload_bytes, download_bytes FROM radius_sessions WHERE ship_id = $1`, [shipId]);
    expect(sessions.rows).toHaveLength(1);
    // Chỉ có gói STOP, chưa từng thấy START -> ORPHANED. Đây là hành vi đúng: hệ thống ghi
    // nhận phiên có thật nhưng nói rõ là thiếu đầu, KHÔNG bịa ra một START để làm đẹp trạng thái.
    expect(sessions.rows[0].status).toBe('ORPHANED');
    expect(Number(sessions.rows[0].upload_bytes)).toBe(1_000);
    expect(Number(sessions.rows[0].download_bytes)).toBe(2_000);

    const flows = await pool.query(`SELECT bytes, raw_event_id FROM ipfix_flow_records WHERE ship_id = $1`, [shipId]);
    expect(flows.rows).toHaveLength(1);
    expect(Number(flows.rows[0].bytes)).toBe(77_000);

    // Mọi bản ghi normalize đều trỏ ngược về một raw event có thật — không có dữ liệu "từ trên trời".
    const orphans = await pool.query(
      `SELECT
         (SELECT count(*) FROM interface_counter_samples s LEFT JOIN raw_telemetry_events r ON r.id = s.raw_event_id WHERE s.ship_id = $1 AND r.id IS NULL) AS s,
         (SELECT count(*) FROM radius_accounting_events a LEFT JOIN raw_telemetry_events r ON r.id = a.raw_event_id WHERE a.ship_id = $1 AND r.id IS NULL) AS a,
         (SELECT count(*) FROM ipfix_flow_records f LEFT JOIN raw_telemetry_events r ON r.id = f.raw_event_id WHERE f.ship_id = $1 AND r.id IS NULL) AS f`,
      [shipId],
    );
    expect(Number(orphans.rows[0].s)).toBe(0);
    expect(Number(orphans.rows[0].a)).toBe(0);
    expect(Number(orphans.rows[0].f)).toBe(0);
  });

  it('2. event trùng ở cả 3 nguồn -> DUPLICATE, không sinh bản ghi normalize thứ hai', async () => {
    await ingestAllThreeSources();

    const before = await pool.query(
      `SELECT
         (SELECT count(*) FROM interface_counter_samples WHERE ship_id = $1) AS samples,
         (SELECT count(*) FROM interface_counter_deltas  WHERE ship_id = $1) AS deltas,
         (SELECT count(*) FROM radius_accounting_events  WHERE ship_id = $1) AS radius_events,
         (SELECT count(*) FROM radius_sessions           WHERE ship_id = $1) AS sessions,
         (SELECT count(*) FROM ipfix_flow_records        WHERE ship_id = $1) AS flows,
         (SELECT count(*) FROM identity_bindings         WHERE ship_id = $1) AS bindings`,
      [shipId],
    );

    // Gửi lại NGUYÊN VĂN các event của cả 3 nguồn.
    const replay = await ingest([
      counterEvent(wanIfaceId, 'inv-wan-2', T1, 10_400_000, 5_090_000),
      radiusStop(),
      ipfixFlow(),
    ]);
    expect(replay.data.duplicate_count).toBe(3);
    expect(replay.data.accepted_count).toBe(0);
    for (const event of replay.data.events) {
      expect(event.status).toBe('DUPLICATE');
      expect(event.normalized).toBeNull(); // không thử lại, cũng không bịa true/false
    }

    const after = await pool.query(
      `SELECT
         (SELECT count(*) FROM interface_counter_samples WHERE ship_id = $1) AS samples,
         (SELECT count(*) FROM interface_counter_deltas  WHERE ship_id = $1) AS deltas,
         (SELECT count(*) FROM radius_accounting_events  WHERE ship_id = $1) AS radius_events,
         (SELECT count(*) FROM radius_sessions           WHERE ship_id = $1) AS sessions,
         (SELECT count(*) FROM ipfix_flow_records        WHERE ship_id = $1) AS flows,
         (SELECT count(*) FROM identity_bindings         WHERE ship_id = $1) AS bindings`,
      [shipId],
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it('2b. trùng idempotency_key nhưng nội dung khác -> 409 IDEMPOTENCY_KEY_REUSED, không ghi đè im lặng', async () => {
    await ingest([counterEvent(wanIfaceId, 'inv-wan-x', T0, 1_000, 2_000)]);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/telemetry/ingest',
      headers: authHeader('telemetry:ingest'),
      payload: { events: [counterEvent(wanIfaceId, 'inv-wan-x', T0, 9_999, 2_000)] },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('IDEMPOTENCY_KEY_REUSED');

    const { rows } = await pool.query(`SELECT rx_bytes FROM interface_counter_samples WHERE interface_id = $1`, [wanIfaceId]);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].rx_bytes)).toBe(1_000); // giữ nguyên bản gốc
  });

  it('3. trường thiết bị không gửi giữ nguyên NULL, không biến thành 0', async () => {
    // Chỉ gửi rx_bytes/tx_bytes; packets/errors/drops hoàn toàn vắng mặt.
    await ingest([counterEvent(wanIfaceId, 'inv-null-1', T0, 1_000_000, 500_000)]);
    await ingest([counterEvent(wanIfaceId, 'inv-null-2', T1, 1_001_000, 500_500)]);

    const samples = await pool.query(
      `SELECT rx_packets, tx_packets, rx_errors, tx_errors, rx_drops, tx_drops FROM interface_counter_samples WHERE interface_id = $1 ORDER BY observed_at`,
      [wanIfaceId],
    );
    expect(samples.rows).toHaveLength(2);
    for (const row of samples.rows) {
      for (const value of Object.values(row)) expect(value).toBeNull();
    }

    // Delta packets cũng phải NULL — không có gói nào được đếm thì không được ghi 0 gói.
    const deltas = await pool.query(`SELECT d_rx_packets, d_tx_packets, d_rx_bytes, d_tx_bytes FROM interface_counter_deltas WHERE interface_id = $1`, [wanIfaceId]);
    expect(deltas.rows).toHaveLength(1);
    expect(deltas.rows[0].d_rx_packets).toBeNull();
    expect(deltas.rows[0].d_tx_packets).toBeNull();
    // Nhưng bytes thì có đo thật -> phải là số thật.
    expect(Number(deltas.rows[0].d_rx_bytes)).toBe(1_000);
    expect(Number(deltas.rows[0].d_tx_bytes)).toBe(500);

    // RADIUS: gói START chưa có octets -> session mở với upload/download NULL, không phải 0.
    await ingest([
      {
        source: 'RADIUS_ACCOUNTING',
        idempotency_key: 'inv-radius-start-null',
        observed_at: T0.toISOString(),
        identity: { ship_id: shipId, interface_id: crewIfaceId },
        payload: { acct_status_type: 'START', acct_session_id: 'inv-sess-null', username: 'crew.null', framed_ip: '10.30.30.8' },
      },
    ]);
    const session = await pool.query(`SELECT status, upload_bytes, download_bytes, session_time_s FROM radius_sessions WHERE acct_session_id = 'inv-sess-null'`);
    expect(session.rows).toHaveLength(1);
    expect(session.rows[0].status).toBe('ACTIVE');
    expect(session.rows[0].upload_bytes).toBeNull();
    expect(session.rows[0].download_bytes).toBeNull();
  });

  it('4. chưa có classifier service/domain -> UNKNOWN + unknown_reason, confidence NULL (không đoán từ port 443)', async () => {
    await ingest([ipfixFlow()]);

    const { rows } = await pool.query(
      `SELECT classification_method, classification_confidence, unknown_reason, identity_username, identity_source, identity_confidence, dst_port
       FROM ipfix_flow_records WHERE ship_id = $1`,
      [shipId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].dst_port).toBe(443); // dữ liệu thô vẫn đủ...
    expect(rows[0].classification_method).toBe('UNKNOWN'); // ...nhưng không suy ra "HTTPS/Google/..."
    expect(rows[0].classification_confidence).toBeNull();
    expect(rows[0].unknown_reason).toBe('NO_CLASSIFIER_IMPLEMENTED');
    // Không có RADIUS binding nào cho IP này -> identity cũng phải NULL, không gán bừa.
    expect(rows[0].identity_username).toBeNull();
    expect(rows[0].identity_source).toBeNull();
    expect(rows[0].identity_confidence).toBeNull();

    const api = await app.inject({ method: 'GET', url: `/api/v1/ships/${shipId}/business/flows?${WINDOW}`, headers: authHeader('business:read') });
    expect(api.statusCode).toBe(200);
    expect(api.json().data.classification_method).toBe('UNKNOWN');
    expect(api.json().data.unattributed_bytes).toBe(77_000);
  });

  it('5. reconciliation: gap = WAN − (CREW + BUSINESS + MANAGEMENT), đúng từng byte', async () => {
    await ingestAllThreeSources();

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/ships/${shipId}/reconciliation?${WINDOW}`,
      headers: authHeader('reconciliation:read'),
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;

    // ADR-09: WAN_INPUT -> download = dRx; zone *_ACCESS -> download = dTx.
    expect(data.wan.download_bytes).toBe(400_000);
    expect(data.wan.upload_bytes).toBe(90_000);
    expect(data.crew.port_download_bytes).toBe(50_000);
    expect(data.business.download_bytes).toBe(20_000);
    expect(data.management.download_bytes).toBe(4_000);

    const countedDownload = data.crew.port_download_bytes + data.business.download_bytes + data.management.download_bytes;
    const countedUpload = data.crew.port_upload_bytes + data.business.upload_bytes + data.management.upload_bytes;
    expect(countedDownload).toBe(74_000);
    expect(countedUpload).toBe(44_000);

    expect(data.gaps.wan_download_gap_bytes).toBe(data.wan.download_bytes - countedDownload);
    expect(data.gaps.wan_download_gap_bytes).toBe(326_000);
    expect(data.gaps.wan_upload_gap_bytes).toBe(data.wan.upload_bytes - countedUpload);
    expect(data.gaps.wan_upload_gap_bytes).toBe(46_000);
    expect(data.gaps.wan_download_gap_pct).toBe(Math.round((326_000 / 400_000) * 10000) / 100);
    expect(data.unattributed_bytes).toBe(326_000 + 46_000);

    // CREW gap = phía cổng (interface counter) − phía user (RADIUS đã cộng gigawords).
    expect(data.crew.user_download_bytes).toBe(2_000);
    expect(data.crew.user_upload_bytes).toBe(1_000);
    expect(data.gaps.crew_download_gap_bytes).toBe(50_000 - 2_000);
    expect(data.gaps.crew_upload_gap_bytes).toBe(30_000 - 1_000);

    // Không có nguồn nào thiếu trong kịch bản này -> phải nói thẳng là AVAILABLE.
    expect(data.data_quality.status).toBe('AVAILABLE');
    expect(data.data_quality.missing_sources).toEqual([]);
    expect(data.data_quality.counter_resets).toBe(0);
  });

  it('5b. thiếu hẳn interface counter -> 422 RECONCILIATION_UNAVAILABLE, không trả 0 cho mọi vùng', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/ships/${shipId}/reconciliation?${WINDOW}`,
      headers: authHeader('reconciliation:read'),
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('RECONCILIATION_UNAVAILABLE');
  });
});
