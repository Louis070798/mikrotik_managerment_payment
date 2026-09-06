import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Pool } from 'pg';
import { buildTestApp, resetTestDb, authHeader, newPool } from '../support/app';
import {
  CollectorTarget,
  IpfixUdpFlowCollector,
  RouterOsInterfaceCounterCollector,
} from '@collectors/index';

/**
 * Chứng minh lớp adapter collector cắm vừa pipeline THẬT: lấy đúng output của
 * `toTelemetryEvents()` đẩy qua POST /telemetry/ingest trên PostgreSQL thật, dữ liệu phải
 * chạy hết đường ingest -> normalize -> reconciliation mà không cần sửa gì ở giữa.
 *
 * Đây là phần collector có thể kiểm chứng ngay khi CHƯA có RouterOS/RADIUS/IPFIX thật:
 * hợp đồng dữ liệu và khoá idempotency là thứ dễ sai nhất và tốn nhất khi phát hiện muộn.
 * Reading trong test là dữ liệu do test dựng để kiểm hợp đồng, KHÔNG phải số liệu vận hành.
 */
describe('Collector adapters -> /telemetry/ingest round-trip (PostgreSQL thật)', () => {
  let app: NestFastifyApplication;
  let pool: Pool;
  let target: CollectorTarget;
  let wanIfaceId: string;
  let crewIfaceId: string;

  const routerOs = new RouterOsInterfaceCounterCollector();
  const ipfix = new IpfixUdpFlowCollector();

  // Không còn RadiusAccountingUdpCollector (adapter stub đã bị xoá — thay bằng server UDP thật,
  // libs/radius-server/). Envelope dựng tay ở đây khớp ĐÚNG shape server thật gửi vào ingest()
  // (radius-server.service.ts handlePacket()), để test round-trip vẫn phủ đúng radius-parser.ts.
  function radiusTelemetryEvents(status: 'START' | 'STOP', opts: {
    acctSessionId: string;
    observedAt: Date;
    username: string;
    framedIp: string;
    acctInputOctets?: number;
    acctInputGigawords?: number;
    acctOutputOctets?: number;
    acctOutputGigawords?: number;
    acctTerminateCause?: string;
  }) {
    return [
      {
        source: 'RADIUS_ACCOUNTING',
        idempotency_key: `radius:${opts.acctSessionId}:${status}:${Math.floor(opts.observedAt.getTime() / 1000)}`,
        observed_at: opts.observedAt.toISOString(),
        identity: {
          device_id: target.deviceId,
          ship_id: target.shipId,
          user_identity: opts.username,
          user_identity_type: 'USERNAME',
          source_device_ref: target.sourceDeviceRef,
        },
        payload: {
          acct_status_type: status,
          acct_session_id: opts.acctSessionId,
          username: opts.username,
          framed_ip: opts.framedIp,
          ...(opts.acctInputOctets !== undefined && { acct_input_octets: opts.acctInputOctets }),
          ...(opts.acctInputGigawords !== undefined && { acct_input_gigawords: opts.acctInputGigawords }),
          ...(opts.acctOutputOctets !== undefined && { acct_output_octets: opts.acctOutputOctets }),
          ...(opts.acctOutputGigawords !== undefined && { acct_output_gigawords: opts.acctOutputGigawords }),
          ...(opts.acctTerminateCause !== undefined && { acct_terminate_cause: opts.acctTerminateCause }),
        },
      },
    ];
  }

  const T0 = new Date('2026-08-25T06:00:00.000Z');
  const T1 = new Date(T0.getTime() + 60_000);

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
      await app.inject({ method: 'POST', url: '/api/v1/areas', headers: authHeader('inventory:write'), payload: { code: 'AREA-COL', name: 'Area COL' } })
    ).json().data;
    const ship = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/ships',
        headers: authHeader('inventory:write'),
        payload: { area_id: area.id, code: 'SHIP-COL', name: 'Ship COL' },
      })
    ).json().data;
    const device = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/devices',
        headers: authHeader('inventory:write'),
        payload: { ship_id: ship.id, code: 'DEV-COL', name: 'Device COL', role: 'EDGE' },
      })
    ).json().data;

    const crewZone = (
      await app.inject({ method: 'POST', url: `/api/v1/ships/${ship.id}/zones`, headers: authHeader('inventory:write'), payload: { kind: 'CREW', name: 'crew-col' } })
    ).json().data;

    const wan = (
      await app.inject({ method: 'POST', url: `/api/v1/devices/${device.id}/interfaces`, headers: authHeader('inventory:write'), payload: { name: 'ether1-wan', type: 'ETHER' } })
    ).json().data;
    wanIfaceId = wan.id;
    await app.inject({
      method: 'POST',
      url: `/api/v1/interfaces/${wanIfaceId}/assign-zone`,
      headers: authHeader('inventory:write'),
      payload: { accounting_group: 'WAN_INPUT', counted_in_reconciliation: true },
    });

    const crew = (
      await app.inject({ method: 'POST', url: `/api/v1/devices/${device.id}/interfaces`, headers: authHeader('inventory:write'), payload: { name: 'ether2-crew', type: 'ETHER' } })
    ).json().data;
    crewIfaceId = crew.id;
    await app.inject({
      method: 'POST',
      url: `/api/v1/interfaces/${crewIfaceId}/assign-zone`,
      headers: authHeader('inventory:write'),
      payload: { accounting_group: 'CREW_ACCESS', zone_id: crewZone.id, counted_in_reconciliation: true },
    });

    // Toạ độ thiết bị đến từ inventory trong DB — không có hằng số nào trong mã nguồn collector.
    target = {
      shipId: ship.id,
      deviceId: device.id,
      host: '198.51.100.1', // TEST-NET-2 (RFC 5737), chỉ tồn tại trong test
      port: 8728,
      timeoutMs: 3000,
      secretRef: 'env:ROUTEROS_TEST_PASSWORD',
      sourceDeviceRef: 'DEV-COL',
    };
  });

  function ingest(events: unknown[]) {
    return app.inject({ method: 'POST', url: '/api/v1/telemetry/ingest', headers: authHeader('telemetry:ingest'), payload: { events } });
  }

  it('event do RouterOS adapter sinh ra được ingest + normalize thành sample và delta', async () => {
    const mk = (observedAt: Date, rxBytes: number, txBytes: number) =>
      routerOs.toTelemetryEvents({
        target,
        collectedAt: observedAt,
        skipped: [],
        readings: [{ interfaceName: 'ether1-wan', interfaceId: wanIfaceId, observedAt, rxBytes, txBytes, rxPackets: null, txPackets: null }],
      });

    const first = await ingest(mk(T0, 1_000_000, 500_000));
    expect(first.statusCode).toBe(201);
    const second = await ingest(mk(T1, 1_006_000, 502_500));
    expect(second.statusCode).toBe(201);
    expect(second.json().data.analytics_processed).toBe(true);

    const { rows } = await pool.query(`SELECT d_rx_bytes, d_tx_bytes, d_rx_packets, quality FROM interface_counter_deltas WHERE interface_id = $1`, [wanIfaceId]);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].d_rx_bytes)).toBe(6_000);
    expect(Number(rows[0].d_tx_bytes)).toBe(2_500);
    expect(rows[0].d_rx_packets).toBeNull(); // adapter không gửi packets -> vẫn NULL, không phải 0
    expect(rows[0].quality).toBe('GOOD');

    // Poll lại đúng mốc cũ (thường gặp khi collector retry) -> DUPLICATE, không sinh sample thứ hai.
    const replay = await ingest(mk(T1, 1_006_000, 502_500));
    expect(replay.json().data.duplicate_count).toBe(1);
    const samples = await pool.query(`SELECT count(*)::int AS c FROM interface_counter_samples WHERE interface_id = $1`, [wanIfaceId]);
    expect(samples.rows[0].c).toBe(2);
  });

  it('event do RADIUS adapter sinh ra tạo phiên và cộng gigawords đúng ADR-09', async () => {
    const start = radiusTelemetryEvents('START', { acctSessionId: 'col-sess-1', observedAt: T0, username: 'crew.col', framedIp: '10.50.50.5' });
    const stop = radiusTelemetryEvents('STOP', {
      acctSessionId: 'col-sess-1',
      observedAt: T1,
      username: 'crew.col',
      framedIp: '10.50.50.5',
      acctInputOctets: 1_000,
      acctInputGigawords: 1,
      acctOutputOctets: 2_000,
      acctOutputGigawords: 2,
      acctTerminateCause: 'User-Request',
    });

    expect((await ingest(start)).statusCode).toBe(201);
    expect((await ingest(stop)).statusCode).toBe(201);

    const { rows } = await pool.query(`SELECT status, upload_bytes, download_bytes FROM radius_sessions WHERE acct_session_id = 'col-sess-1'`);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('CLOSED');
    expect(Number(rows[0].upload_bytes)).toBe(1_000 + 1 * 4294967296);
    expect(Number(rows[0].download_bytes)).toBe(2_000 + 2 * 4294967296);
  });

  it('event do IPFIX adapter sinh ra tạo flow record với classification UNKNOWN', async () => {
    const events = ipfix.toTelemetryEvents({
      target,
      collectedAt: T1,
      skipped: [],
      readings: [
        {
          observedAt: T1,
          srcIp: '10.50.50.5',
          dstIp: '198.51.100.77',
          dstPort: 443,
          protocol: 6,
          bytes: 42_000,
          packets: 80,
          interfaceId: crewIfaceId,
          flowStartAt: T0,
          flowEndAt: T1,
        },
      ],
    });

    expect((await ingest(events)).statusCode).toBe(201);
    const { rows } = await pool.query(`SELECT bytes, packets, classification_method, unknown_reason FROM ipfix_flow_records WHERE src_ip = '10.50.50.5'`);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].bytes)).toBe(42_000);
    expect(Number(rows[0].packets)).toBe(80);
    expect(rows[0].classification_method).toBe('UNKNOWN');
    expect(rows[0].unknown_reason).toBe('NO_CLASSIFIER_IMPLEMENTED');

    // Exporter gửi lại đúng flow đó -> cùng khoá hash -> không có bản ghi thứ hai.
    const replay = await ingest(events);
    expect(replay.json().data.duplicate_count).toBe(1);
    const again = await pool.query(`SELECT count(*)::int AS c FROM ipfix_flow_records WHERE src_ip = '10.50.50.5'`);
    expect(again.rows[0].c).toBe(1);
  });
});
