import * as dgram from 'node:dgram';
import * as http from 'node:http';
import * as crypto from 'node:crypto';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Pool } from 'pg';
import { buildTestApp, resetTestDb, authHeader, newPool } from '../support/app';

/**
 * Integration test cho RADIUS / Collector / Backup health checker (yêu cầu #7, #9, #10) —
 * dùng server giả THẬT (UDP/HTTP) thay vì mock function, để chứng minh implementation giao
 * thức (RFC 2865 cho RADIUS) đúng end-to-end, không chỉ đúng theo assumption của mock.
 */
describe('RADIUS / Collector / Backup health checkers — real protocol servers', () => {
  let app: NestFastifyApplication;
  let pool: Pool;

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
  });

  // ---------------------------------------------------------------------
  // RADIUS — server UDP giả implement đúng RFC 2865 (không dùng lại code production).
  // ---------------------------------------------------------------------
  function startFakeRadiusServer(secret: string, opts: { accept?: boolean; silent?: boolean } = {}) {
    const socket = dgram.createSocket('udp4');
    socket.on('message', (msg, rinfo) => {
      if (opts.silent) return; // mô phỏng server chết — không trả lời gì (test timeout)
      const identifier = msg.readUInt8(1);
      const requestAuthenticator = msg.subarray(4, 20);
      const code = opts.accept === false ? 3 /* Access-Reject */ : 2 /* Access-Accept */;

      const header = Buffer.alloc(20);
      header.writeUInt8(code, 0);
      header.writeUInt8(identifier, 1);
      header.writeUInt16BE(20, 2);
      const respAuthenticator = crypto
        .createHash('md5')
        .update(Buffer.concat([header.subarray(0, 4), requestAuthenticator, Buffer.from(secret, 'utf8')]))
        .digest();
      respAuthenticator.copy(header, 4);

      socket.send(header, rinfo.port, rinfo.address);
    });
    return new Promise<{ socket: dgram.Socket; port: number }>((resolve) => {
      socket.bind(0, '127.0.0.1', () => resolve({ socket, port: (socket.address() as any).port }));
    });
  }

  it('RADIUS Access-Accept thật (RFC 2865, response authenticator hợp lệ) -> HEALTHY', async () => {
    const secret = 'shared-secret-for-test';
    const { socket, port } = await startFakeRadiusServer(secret, { accept: true });
    process.env.RADIUS_FAKE_SECRET_1 = secret;
    try {
      const ep = (
        await app.inject({
          method: 'POST',
          url: '/api/v1/services/radius-fake-1/endpoints',
          headers: authHeader('endpoint:write'),
          payload: {
            service_type: 'RADIUS',
            host: '127.0.0.1',
            port,
            protocol: 'UDP',
            healthcheck_type: 'RADIUS_ACCESS_REQUEST',
            timeout_ms: 1000,
            secret_ref: 'env:RADIUS_FAKE_SECRET_1',
            check_config: { probe_username: 'probe', probe_password: 'probe' },
          },
        })
      ).json().data;

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/service-endpoints/${ep.id}/check`,
        headers: authHeader('endpoint:read', 'endpoint:write'),
      });
      expect(res.json().data.status).toBe('HEALTHY');
    } finally {
      socket.close();
    }
  });

  it('RADIUS Access-Reject vẫn tính là HEALTHY (server sống và trả lời đúng giao thức, không phải xác thực 1 user cụ thể)', async () => {
    const secret = 'shared-secret-reject';
    const { socket, port } = await startFakeRadiusServer(secret, { accept: false });
    process.env.RADIUS_FAKE_SECRET_2 = secret;
    try {
      const ep = (
        await app.inject({
          method: 'POST',
          url: '/api/v1/services/radius-fake-2/endpoints',
          headers: authHeader('endpoint:write'),
          payload: {
            service_type: 'RADIUS',
            host: '127.0.0.1',
            port,
            protocol: 'UDP',
            healthcheck_type: 'RADIUS_ACCESS_REQUEST',
            timeout_ms: 1000,
            secret_ref: 'env:RADIUS_FAKE_SECRET_2',
            check_config: {},
          },
        })
      ).json().data;

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/service-endpoints/${ep.id}/check`,
        headers: authHeader('endpoint:read', 'endpoint:write'),
      });
      expect(res.json().data.status).toBe('HEALTHY');
    } finally {
      socket.close();
    }
  });

  it('RADIUS server im lặng (không phản hồi) -> timeout -> UNHEALTHY, KHÔNG treo test', async () => {
    const secret = 'shared-secret-silent';
    const { socket, port } = await startFakeRadiusServer(secret, { silent: true });
    process.env.RADIUS_FAKE_SECRET_3 = secret;
    try {
      const ep = (
        await app.inject({
          method: 'POST',
          url: '/api/v1/services/radius-fake-3/endpoints',
          headers: authHeader('endpoint:write'),
          payload: {
            service_type: 'RADIUS',
            host: '127.0.0.1',
            port,
            protocol: 'UDP',
            healthcheck_type: 'RADIUS_ACCESS_REQUEST',
            timeout_ms: 300,
            secret_ref: 'env:RADIUS_FAKE_SECRET_3',
            check_config: {},
          },
        })
      ).json().data;

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/service-endpoints/${ep.id}/check`,
        headers: authHeader('endpoint:read', 'endpoint:write'),
      });
      expect(res.json().data.status).toBe('UNHEALTHY');
      expect(res.json().data.last_error.message).toContain('timed out');
    } finally {
      socket.close();
    }
  }, 10_000);

  // ---------------------------------------------------------------------
  // Collector — HTTP functional check thật (không phải TCP port check).
  // ---------------------------------------------------------------------
  function startFakeCollector(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void) {
    const server = http.createServer(handler);
    return new Promise<{ server: http.Server; port: number }>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as any).port }));
    });
  }

  it('Collector trả status=ok với last_event_at gần đây -> HEALTHY', async () => {
    const { server, port } = await startFakeCollector((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', last_event_at: new Date().toISOString(), queue_depth: 5 }));
    });
    try {
      const ep = (
        await app.inject({
          method: 'POST',
          url: '/api/v1/services/collector-fake/endpoints',
          headers: authHeader('endpoint:write'),
          payload: {
            service_type: 'COLLECTOR',
            host: '127.0.0.1',
            port,
            protocol: 'http',
            healthcheck_type: 'HTTP_FUNCTIONAL',
            timeout_ms: 1000,
            check_config: { path: '/healthz' },
          },
        })
      ).json().data;

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/service-endpoints/${ep.id}/check`,
        headers: authHeader('endpoint:read', 'endpoint:write'),
      });
      expect(res.json().data.status).toBe('HEALTHY');
    } finally {
      server.close();
    }
  });

  it('Collector trả last_event_at quá cũ -> chức năng OK nhưng DEGRADED (không chỉ port mở)', async () => {
    const staleDate = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 phút trước
    const { server, port } = await startFakeCollector((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', last_event_at: staleDate }));
    });
    try {
      const ep = (
        await app.inject({
          method: 'POST',
          url: '/api/v1/services/collector-stale/endpoints',
          headers: authHeader('endpoint:write'),
          payload: {
            service_type: 'COLLECTOR',
            host: '127.0.0.1',
            port,
            protocol: 'http',
            healthcheck_type: 'HTTP_FUNCTIONAL',
            timeout_ms: 1000,
            check_config: { path: '/healthz', staleness_threshold_s: 60 },
          },
        })
      ).json().data;

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/service-endpoints/${ep.id}/check`,
        headers: authHeader('endpoint:read', 'endpoint:write'),
      });
      expect(res.json().data.status).toBe('DEGRADED');
    } finally {
      server.close();
    }
  });

  // ---------------------------------------------------------------------
  // Backup — đọc thẳng device_backups, không đi ra mạng.
  // ---------------------------------------------------------------------
  it('Backup freshness: chưa từng có backup nào -> UNHEALTHY (không suy luận HEALTHY từ việc thiếu dữ liệu)', async () => {
    const ep = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/services/backup-fake-empty/endpoints',
        headers: authHeader('endpoint:write'),
        payload: {
          service_type: 'STORAGE',
          host: 's3.internal',
          port: 443,
          protocol: 'https',
          healthcheck_type: 'BACKUP_FRESHNESS',
          timeout_ms: 1000,
          check_config: {},
        },
      })
    ).json().data;

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/service-endpoints/${ep.id}/check`,
      headers: authHeader('endpoint:read', 'endpoint:write'),
    });
    expect(res.json().data.status).toBe('UNHEALTHY');
    expect(res.json().data.last_error.message).toContain('No backup ever recorded');
  });

  it('Backup freshness: backup gần đây + restore PASSED -> HEALTHY', async () => {
    const area = (await app.inject({ method: 'POST', url: '/api/v1/areas', headers: authHeader('inventory:write'), payload: { code: 'AREA-BK', name: 'Area BK' } })).json().data;
    const ship = (await app.inject({ method: 'POST', url: '/api/v1/ships', headers: authHeader('inventory:write'), payload: { area_id: area.id, code: 'SHIP-BK', name: 'Ship BK' } })).json().data;
    const device = (await app.inject({ method: 'POST', url: '/api/v1/devices', headers: authHeader('inventory:write'), payload: { ship_id: ship.id, code: 'DEV-BK', name: 'Device BK', role: 'CORE' } })).json().data;

    const ep = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/services/backup-fake-fresh/endpoints',
        headers: authHeader('endpoint:write'),
        payload: {
          service_type: 'STORAGE',
          host: 's3.internal',
          port: 443,
          protocol: 'https',
          healthcheck_type: 'BACKUP_FRESHNESS',
          timeout_ms: 1000,
          check_config: {},
        },
      })
    ).json().data;

    await pool.query(
      `INSERT INTO device_backups (device_id, kind, checksum_sha256, storage_targets, restore_test_result, created_at)
       VALUES ($1, 'BINARY', 'deadbeef', $2::jsonb, 'PASSED', now())`,
      [device.id, JSON.stringify([{ target: 'backup-fake-fresh' }])],
    );

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/service-endpoints/${ep.id}/check`,
      headers: authHeader('endpoint:read', 'endpoint:write'),
    });
    expect(res.json().data.status).toBe('HEALTHY');
  });

  // ---------------------------------------------------------------------
  // Health summary aggregation rule
  // ---------------------------------------------------------------------
  it('GET /health/summary: overall UNHEALTHY nếu bất kỳ service nào UNHEALTHY (xấu nhất thắng)', async () => {
    process.env.RADIUS_FAKE_SECRET_AGG = 'agg-secret';
    const { socket, port } = await startFakeRadiusServer('agg-secret', { silent: true });
    try {
      const ep = (
        await app.inject({
          method: 'POST',
          url: '/api/v1/services/radius-agg/endpoints',
          headers: authHeader('endpoint:write'),
          payload: {
            service_type: 'RADIUS', host: '127.0.0.1', port, protocol: 'UDP',
            healthcheck_type: 'RADIUS_ACCESS_REQUEST', timeout_ms: 200,
            secret_ref: 'env:RADIUS_FAKE_SECRET_AGG', check_config: {},
          },
        })
      ).json().data;
      await app.inject({ method: 'POST', url: `/api/v1/service-endpoints/${ep.id}/check`, headers: authHeader('endpoint:read', 'endpoint:write') });

      const res = await app.inject({ method: 'GET', url: '/api/v1/health/summary', headers: authHeader('health:read') });
      expect(res.json().data.overall).toBe('UNHEALTHY');
      const svc = res.json().data.services.find((s: any) => s.service_name === 'radius-agg');
      expect(svc.status).toBe('UNHEALTHY');
      expect(svc.active_endpoint).toBeNull();
    } finally {
      socket.close();
    }
  }, 10_000);
});
