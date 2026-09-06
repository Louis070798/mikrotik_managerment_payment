import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Pool } from 'pg';
import { buildTestApp, resetTestDb, authHeader, newPool, testDbTarget } from '../support/app';

/**
 * Integration test cho Service Endpoint registry + Server Health (yêu cầu #5-10, #12):
 * - Địa chỉ đổi được từ DB/API, KHÔNG hard-code (#5, hot-reload qua ServiceRegistry).
 * - Database health check THẬT (SQL read+write) chạy trên chính Postgres test (#8).
 * - Retry + timeout + circuit breaker THẬT (#6, #7-10 áp dụng chung cho mọi checker).
 * - secret không bao giờ lộ ra response/audit (#12).
 * - LAST_HEALTHY_ENDPOINT bảo vệ (#5 yêu cầu ẩn).
 */
describe('Service Endpoints — registry, hot-reload, health check, circuit breaker', () => {
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

  async function createDbEndpoint(overrides: Record<string, unknown> = {}) {
    // Trỏ đúng vào Postgres test đang chạy (DATABASE_CONTROL_URL), KHÔNG hard-code 5432.
    const db = testDbTarget();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/services/control-db-under-test/endpoints',
      headers: authHeader('endpoint:write'),
      payload: {
        service_type: 'DATABASE',
        host: db.host,
        port: db.port,
        protocol: 'TCP',
        priority: 10,
        healthcheck_type: 'SQL_RW',
        healthcheck_interval_s: 30,
        timeout_ms: 800,
        secret_ref: 'env:DB_TEST_PASSWORD',
        check_config: { username: db.username, database: db.database },
        ...overrides,
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json().data;
  }

  it('POST tạo endpoint KHÔNG BAO GIỜ trả secret thật, chỉ secret_configured=true', async () => {
    const ep = await createDbEndpoint();
    expect(ep.secret_configured).toBe(true);
    expect(JSON.stringify(ep)).not.toContain('fleet_dev_local_only'); // giá trị thật của DB_TEST_PASSWORD
    expect(ep).not.toHaveProperty('secret');
    expect(ep).not.toHaveProperty('secret_ref');
  });

  it('check thật chạy SQL read+write trên Postgres test -> HEALTHY, is_active=true', async () => {
    const ep = await createDbEndpoint();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/service-endpoints/${ep.id}/check`,
      headers: authHeader('endpoint:read', 'endpoint:write'),
    });
    expect(res.statusCode).toBe(201);
    const body = res.json().data;
    expect(body.status).toBe('HEALTHY');
    expect(body.is_active).toBe(true);
    expect(body.breaker_state).toBe('CLOSED');
    expect(body.last_rtt_ms).toBeGreaterThanOrEqual(0);
    expect(body.last_error).toBeNull();
  });

  it('hot-reload: PATCH host sang địa chỉ không tồn tại -> check NGAY sau đó phản ánh host mới, không cần restart app', async () => {
    const ep = await createDbEndpoint();
    // Xác nhận HEALTHY với host đúng trước.
    await app.inject({
      method: 'POST',
      url: `/api/v1/service-endpoints/${ep.id}/check`,
      headers: authHeader('endpoint:read', 'endpoint:write'),
    });

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/service-endpoints/${ep.id}`,
      headers: authHeader('endpoint:write'),
      payload: { host: '10.255.255.1', reason: 'integration test — simulate DB moved to unreachable host' },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().data.host).toBe('10.255.255.1');
    expect(patchRes.json().data.config_version).toBe(2);

    const checkRes = await app.inject({
      method: 'POST',
      url: `/api/v1/service-endpoints/${ep.id}/check`,
      headers: authHeader('endpoint:read', 'endpoint:write'),
    });
    const body = checkRes.json().data;
    // Đây là bằng chứng cache ServiceRegistry đã bị invalidate ngay khi PATCH — nếu registry
    // còn dùng host cũ (đã cache), check này sẽ vẫn HEALTHY thay vì fail.
    expect(body.status).toBe('UNHEALTHY');
    expect(body.host).toBe('10.255.255.1');
  }, 10_000);

  it('PATCH thiếu reason -> 400 VALIDATION_FAILED (mọi thay đổi endpoint bắt buộc có lý do, đi vào audit)', async () => {
    const ep = await createDbEndpoint();
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/service-endpoints/${ep.id}`,
      headers: authHeader('endpoint:write'),
      payload: { host: '10.0.0.5' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('retry thất bại liên tục 3 lần check -> circuit breaker chuyển OPEN, cập nhật failure_count', async () => {
    const ep = await createDbEndpoint({ host: '10.255.255.1', timeout_ms: 150 });

    let last;
    for (let i = 0; i < 3; i++) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/service-endpoints/${ep.id}/check`,
        headers: authHeader('endpoint:read', 'endpoint:write'),
      });
      last = res.json().data;
    }
    expect(last.status).toBe('UNHEALTHY');
    expect(last.breaker_state).toBe('OPEN');
    expect(last.failure_count).toBeGreaterThanOrEqual(3);
    expect(last.last_error).toBeTruthy();
    expect(last.last_error.attempts?.length).toBeGreaterThan(0); // bằng chứng có retry nhiều attempt
  }, 15_000);

  it('endpoint UNHEALTHY tạo alert FIRING; hồi phục (HEALTHY) tự động resolve alert đó', async () => {
    const ep = await createDbEndpoint({ host: '10.255.255.1', timeout_ms: 150 });

    await app.inject({
      method: 'POST',
      url: `/api/v1/service-endpoints/${ep.id}/check`,
      headers: authHeader('endpoint:read', 'endpoint:write'),
    });

    const alertsRes = await app.inject({ method: 'GET', url: '/api/v1/alerts?status=FIRING', headers: authHeader('alert:read') });
    const alerts = alertsRes.json().data;
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    const alert = alerts.find((a: any) => a.scope.endpoint_id === ep.id);
    expect(alert).toBeTruthy();
    expect(alert.kind).toBe('DATABASE_FAILURE');
    expect(alert.status).toBe('FIRING');

    // Sửa host về đúng -> check lại -> HEALTHY -> alert phải tự resolve, không cần thao tác thủ công.
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/service-endpoints/${ep.id}`,
      headers: authHeader('endpoint:write'),
      payload: { host: testDbTarget().host, reason: 'integration test — restore host' },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/service-endpoints/${ep.id}/check`,
      headers: authHeader('endpoint:read', 'endpoint:write'),
    });

    const afterRes = await app.inject({ method: 'GET', url: `/api/v1/alerts/${alert.id}`, headers: authHeader('alert:read') });
    expect(afterRes.json().data.status).toBe('RESOLVED');
  }, 15_000);

  it('endpoint UNHEALTHY liên tục không tạo alert trùng lặp (idempotent qua fingerprint)', async () => {
    const ep = await createDbEndpoint({ host: '10.255.255.1', timeout_ms: 150 });

    await app.inject({ method: 'POST', url: `/api/v1/service-endpoints/${ep.id}/check`, headers: authHeader('endpoint:read', 'endpoint:write') });
    await app.inject({ method: 'POST', url: `/api/v1/service-endpoints/${ep.id}/check`, headers: authHeader('endpoint:read', 'endpoint:write') });
    await app.inject({ method: 'POST', url: `/api/v1/service-endpoints/${ep.id}/check`, headers: authHeader('endpoint:read', 'endpoint:write') });

    const { rows } = await pool.query(
      `SELECT count(*)::int AS c FROM alerts WHERE (scope->>'endpoint_id') = $1 AND status = 'FIRING'`,
      [ep.id],
    );
    expect(rows[0].c).toBe(1); // 3 lần unhealthy liên tiếp chỉ tạo đúng 1 alert đang FIRING
  }, 15_000);

  it('DELETE endpoint HEALTHY duy nhất của service -> 409 LAST_HEALTHY_ENDPOINT, không xoá', async () => {
    const ep = await createDbEndpoint();
    await app.inject({
      method: 'POST',
      url: `/api/v1/service-endpoints/${ep.id}/check`,
      headers: authHeader('endpoint:read', 'endpoint:write'),
    }); // -> HEALTHY

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/service-endpoints/${ep.id}`,
      headers: authHeader('endpoint:write'),
    });
    expect(delRes.statusCode).toBe(409);
    expect(delRes.json().error.code).toBe('LAST_HEALTHY_ENDPOINT');
  });

  it('disable endpoint HEALTHY duy nhất -> 409; nhưng UNHEALTHY thì disable được bình thường', async () => {
    const healthyEp = await createDbEndpoint();
    await app.inject({ method: 'POST', url: `/api/v1/service-endpoints/${healthyEp.id}/check`, headers: authHeader('endpoint:read', 'endpoint:write') });
    const blocked = await app.inject({ method: 'POST', url: `/api/v1/service-endpoints/${healthyEp.id}/disable`, headers: authHeader('endpoint:write') });
    expect(blocked.statusCode).toBe(409);

    const unhealthyEp = await createDbEndpoint({ host: '10.255.255.1', timeout_ms: 150, priority: 20 });
    await app.inject({ method: 'POST', url: `/api/v1/service-endpoints/${unhealthyEp.id}/check`, headers: authHeader('endpoint:read', 'endpoint:write') });
    const allowed = await app.inject({ method: 'POST', url: `/api/v1/service-endpoints/${unhealthyEp.id}/disable`, headers: authHeader('endpoint:write') });
    expect(allowed.statusCode).toBe(201);
    expect(allowed.json().data.enabled).toBe(false);
  }, 15_000);

  it('maintenance mode: status -> MAINTENANCE, loại khỏi active selection, tắt lại được', async () => {
    const ep = await createDbEndpoint();
    await app.inject({ method: 'POST', url: `/api/v1/service-endpoints/${ep.id}/check`, headers: authHeader('endpoint:read', 'endpoint:write') });

    const onRes = await app.inject({
      method: 'POST',
      url: `/api/v1/service-endpoints/${ep.id}/maintenance`,
      headers: authHeader('endpoint:write'),
      payload: { enable: true, reason: 'integration test maintenance' },
    });
    expect(onRes.json().data.status).toBe('MAINTENANCE');
    expect(onRes.json().data.is_active).toBe(false);

    const offRes = await app.inject({
      method: 'POST',
      url: `/api/v1/service-endpoints/${ep.id}/maintenance`,
      headers: authHeader('endpoint:write'),
      payload: { enable: false, reason: 'integration test maintenance end' },
    });
    expect(offRes.json().data.in_maintenance).toBe(false);
  });

  it('revisions ghi lại đúng lịch sử thay đổi kèm reason, version tăng dần', async () => {
    const ep = await createDbEndpoint();
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/service-endpoints/${ep.id}`,
      headers: authHeader('endpoint:write'),
      payload: { priority: 5, reason: 'bump priority in test' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/service-endpoints/${ep.id}/revisions`,
      headers: authHeader('endpoint:read'),
    });
    const revisions = res.json().data;
    expect(revisions).toHaveLength(2);
    expect(revisions[0].version).toBe(2);
    expect(revisions[0].change_reason).toBe('bump priority in test');
    expect(revisions[1].version).toBe(1);
  });

  it('audit_logs ghi nhận create + update endpoint, không chứa secret thật trong before/after', async () => {
    const ep = await createDbEndpoint();
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/service-endpoints/${ep.id}`,
      headers: authHeader('endpoint:write'),
      payload: { priority: 7, reason: 'audit check' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/audit-logs?resource_type=service_endpoint&resource_id=${ep.id}`,
      headers: authHeader('audit:read'),
    });
    const entries = res.json().data;
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries.map((e: any) => e.action)).toEqual(expect.arrayContaining(['service_endpoint.create', 'service_endpoint.update']));
    expect(JSON.stringify(entries)).not.toContain('fleet_dev_local_only');
  });
});
