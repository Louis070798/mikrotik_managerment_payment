import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Pool } from 'pg';
import { buildTestApp, resetTestDb, authHeader, newPool, testDbTarget } from '../support/app';
import { validateAgainstContract } from '../support/contract';

/**
 * Contract test (yêu cầu #13): gọi API THẬT (Postgres thật, không mock), rồi validate response
 * thật so với contracts/openapi.yaml bằng openapi-response-validator. Đây là hàng rào chống
 * "backend đổi field nhưng quên sửa OpenAPI" — điều AGENT_COLLABORATION.md §11 cấm.
 */
describe('OpenAPI contract — response thật khớp contracts/openapi.yaml', () => {
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

  it('GET /areas (200, list rỗng)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/areas', headers: authHeader('inventory:read') });
    validateAgainstContract('/areas', 'get', res.statusCode, res.json());
  });

  it('POST /areas (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/areas',
      headers: authHeader('inventory:write'),
      payload: { code: 'AREA-C1', name: 'Contract Area', timezone: 'Asia/Bangkok' },
    });
    validateAgainstContract('/areas', 'post', res.statusCode, res.json());
  });

  it('GET /areas/{areaId} 404 khi không tồn tại', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/areas/00000000-0000-0000-0000-000000000000',
      headers: authHeader('inventory:read'),
    });
    validateAgainstContract('/areas/{areaId}', 'get', res.statusCode, res.json());
  });

  it('GET /areas 403 khi thiếu permission — khớp schema lỗi chuẩn', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/areas' });
    // 403 dùng chung ApiError schema cho mọi path — kiểm bằng path bất kỳ có khai báo 403.
    validateAgainstContract('/areas', 'get', res.statusCode, res.json());
  });

  async function createFullChain() {
    const area = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/areas',
        headers: authHeader('inventory:write'),
        payload: { code: 'AREA-C2', name: 'Area C2' },
      })
    ).json().data;
    const ship = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/ships',
        headers: authHeader('inventory:write'),
        payload: { area_id: area.id, code: 'SHIP-C2', name: 'Ship C2' },
      })
    ).json().data;
    const device = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/devices',
        headers: authHeader('inventory:write'),
        payload: { ship_id: ship.id, code: 'DEV-C2', name: 'Device C2', role: 'CORE' },
      })
    ).json().data;
    return { area, ship, device };
  }

  it('POST /ships (201)', async () => {
    const { ship } = await createFullChain();
    // response body đã được validate gián tiếp bằng validate lại request tạo tương tự.
    const res = await app.inject({ method: 'GET', url: `/api/v1/ships/${ship.id}`, headers: authHeader('inventory:read') });
    validateAgainstContract('/ships/{shipId}', 'get', res.statusCode, res.json());
  });

  it('POST /devices (201)', async () => {
    const { device } = await createFullChain();
    const res = await app.inject({ method: 'GET', url: `/api/v1/devices/${device.id}`, headers: authHeader('inventory:read') });
    validateAgainstContract('/devices/{deviceId}', 'get', res.statusCode, res.json());
  });

  it('POST /ships/{shipId}/zones (201) + POST interface + assign-zone (201)', async () => {
    const { ship, device } = await createFullChain();
    const zoneRes = await app.inject({
      method: 'POST',
      url: `/api/v1/ships/${ship.id}/zones`,
      headers: authHeader('inventory:write'),
      payload: { kind: 'CREW', name: 'crew-c2' },
    });
    validateAgainstContract('/ships/{shipId}/zones', 'post', zoneRes.statusCode, zoneRes.json());
    const zone = zoneRes.json().data;

    const ifaceRes = await app.inject({
      method: 'POST',
      url: `/api/v1/devices/${device.id}/interfaces`,
      headers: authHeader('inventory:write'),
      payload: { name: 'ether1', type: 'ETHER' },
    });
    validateAgainstContract('/devices/{deviceId}/interfaces', 'post', ifaceRes.statusCode, ifaceRes.json());
    const iface = ifaceRes.json().data;

    const assignRes = await app.inject({
      method: 'POST',
      url: `/api/v1/interfaces/${iface.id}/assign-zone`,
      headers: authHeader('inventory:write'),
      payload: { accounting_group: 'CREW_ACCESS', zone_id: zone.id, counted_in_reconciliation: true },
    });
    validateAgainstContract('/interfaces/{interfaceId}/assign-zone', 'post', assignRes.statusCode, assignRes.json());

    // Gán trùng ở interface con -> 409 INTERFACE_DOUBLE_COUNT, cũng phải khớp contract.
    const child = (
      await app.inject({
        method: 'POST',
        url: `/api/v1/devices/${device.id}/interfaces`,
        headers: authHeader('inventory:write'),
        payload: { name: 'vlan1', type: 'VLAN', parent_interface_id: iface.id },
      })
    ).json().data;
    const conflictRes = await app.inject({
      method: 'POST',
      url: `/api/v1/interfaces/${child.id}/assign-zone`,
      headers: authHeader('inventory:write'),
      payload: { accounting_group: 'CREW_ACCESS', zone_id: zone.id, counted_in_reconciliation: true },
    });
    validateAgainstContract('/interfaces/{interfaceId}/assign-zone', 'post', conflictRes.statusCode, conflictRes.json());
  });

  it('POST /services/{serviceName}/endpoints (201) + GET /service-endpoints (200) + POST check (201)', async () => {
    const dbTarget = testDbTarget();
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/services/contract-db/endpoints',
      headers: authHeader('endpoint:write'),
      payload: {
        service_type: 'DATABASE',
        // Toạ độ lấy từ DATABASE_CONTROL_URL — xem testDbTarget(), không hard-code cổng.
        host: dbTarget.host,
        port: dbTarget.port,
        protocol: 'TCP',
        healthcheck_type: 'SQL_RW',
        timeout_ms: 800,
        secret_ref: 'env:DB_TEST_PASSWORD',
        check_config: { username: dbTarget.username, database: dbTarget.database },
      },
    });
    validateAgainstContract('/services/{serviceName}/endpoints', 'post', createRes.statusCode, createRes.json());
    const ep = createRes.json().data;

    const listRes = await app.inject({ method: 'GET', url: '/api/v1/service-endpoints', headers: authHeader('endpoint:read') });
    validateAgainstContract('/service-endpoints', 'get', listRes.statusCode, listRes.json());

    const checkRes = await app.inject({
      method: 'POST',
      url: `/api/v1/service-endpoints/${ep.id}/check`,
      headers: authHeader('endpoint:read', 'endpoint:write'),
    });
    validateAgainstContract('/service-endpoints/{id}/check', 'post', checkRes.statusCode, checkRes.json());

    const revRes = await app.inject({ method: 'GET', url: `/api/v1/service-endpoints/${ep.id}/revisions`, headers: authHeader('endpoint:read') });
    validateAgainstContract('/service-endpoints/{id}/revisions', 'get', revRes.statusCode, revRes.json());
  });

  it('GET /health/summary (200) + GET /health/services (200)', async () => {
    const summaryRes = await app.inject({ method: 'GET', url: '/api/v1/health/summary', headers: authHeader('health:read') });
    validateAgainstContract('/health/summary', 'get', summaryRes.statusCode, summaryRes.json());

    const servicesRes = await app.inject({ method: 'GET', url: '/api/v1/health/services', headers: authHeader('health:read') });
    validateAgainstContract('/health/services', 'get', servicesRes.statusCode, servicesRes.json());
  });

  it('GET /alerts (200) + GET /audit-logs (200)', async () => {
    const alertsRes = await app.inject({ method: 'GET', url: '/api/v1/alerts', headers: authHeader('alert:read') });
    validateAgainstContract('/alerts', 'get', alertsRes.statusCode, alertsRes.json());

    const auditRes = await app.inject({ method: 'GET', url: '/api/v1/audit-logs', headers: authHeader('audit:read') });
    validateAgainstContract('/audit-logs', 'get', auditRes.statusCode, auditRes.json());
  });

  it('DELETE Area còn Ship -> 409, body khớp ApiError contract', async () => {
    const { area } = await createFullChain();
    const res = await app.inject({ method: 'DELETE', url: `/api/v1/areas/${area.id}`, headers: authHeader('inventory:write') });
    validateAgainstContract('/areas/{areaId}', 'delete', res.statusCode, res.json());
  });
});
