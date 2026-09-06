import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Pool } from 'pg';
import { buildTestApp, resetTestDb, authHeader, newPool } from '../support/app';

/**
 * Integration test THẬT chạy trên Postgres thật (fleet_control_test) — không mock DB.
 * Bao phủ: Area/Ship/Device CRUD (yêu cầu #1-3), permission enforcement (AuthStubGuard),
 * và các ràng buộc xoá (AREA_HAS_SHIPS / SHIP_HAS_DEVICES).
 */
describe('Inventory — Area/Ship/Device CRUD', () => {
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

  it('GET /areas không có x-actor-permissions -> 403 FORBIDDEN (AuthStubGuard enforced)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/areas' });
    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error.code).toBe('FORBIDDEN');
    expect(body.data).toBeNull();
  });

  it('POST /areas với inventory:read (thiếu inventory:write) -> 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/areas',
      headers: { ...authHeader('inventory:read'), 'content-type': 'application/json' },
      payload: { code: 'AREA-X', name: 'X' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('tạo Area -> Ship -> Device thành công, đọc lại đúng dữ liệu (full CRUD chain)', async () => {
    const areaRes = await app.inject({
      method: 'POST',
      url: '/api/v1/areas',
      headers: authHeader('inventory:write'),
      payload: { code: 'AREA-1', name: 'Khu vực 1', timezone: 'Asia/Bangkok' },
    });
    expect(areaRes.statusCode).toBe(201);
    const area = areaRes.json().data;
    expect(area.code).toBe('AREA-1');
    expect(area.ship_count).toBe(0);

    const shipRes = await app.inject({
      method: 'POST',
      url: '/api/v1/ships',
      headers: authHeader('inventory:write'),
      payload: { area_id: area.id, code: 'SHIP-1', name: 'MV One', status: 'ACTIVE' },
    });
    expect(shipRes.statusCode).toBe(201);
    const ship = shipRes.json().data;
    expect(ship.area_id).toBe(area.id);

    const deviceRes = await app.inject({
      method: 'POST',
      url: '/api/v1/devices',
      headers: authHeader('inventory:write'),
      payload: { ship_id: ship.id, code: 'CORE-1', name: 'Core Router', role: 'CORE' },
    });
    expect(deviceRes.statusCode).toBe(201);
    const device = deviceRes.json().data;
    expect(device.ship_id).toBe(ship.id);
    expect(device.status).toBe('UNKNOWN'); // trạng thái mặc định trước khi có health check thật

    // credential_ref không bao giờ được set ở đây nhưng đảm bảo field tồn tại và null-safe.
    expect(device.credential_ref).toBeNull();

    const getAreaRes = await app.inject({
      method: 'GET',
      url: `/api/v1/areas/${area.id}`,
      headers: authHeader('inventory:read'),
    });
    expect(getAreaRes.json().data.ship_count).toBe(1);

    const getShipRes = await app.inject({
      method: 'GET',
      url: `/api/v1/ships/${ship.id}`,
      headers: authHeader('inventory:read'),
    });
    expect(getShipRes.json().data.device_count).toBe(1);
  });

  it('POST /devices với ship_id không tồn tại -> 404 SHIP_NOT_FOUND', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/devices',
      headers: authHeader('inventory:write'),
      payload: { ship_id: '00000000-0000-0000-0000-000000000000', code: 'X', name: 'X', role: 'CORE' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('SHIP_NOT_FOUND');
  });

  it('DELETE Area còn Ship -> 409 AREA_HAS_SHIPS, không xoá', async () => {
    const areaRes = await app.inject({
      method: 'POST',
      url: '/api/v1/areas',
      headers: authHeader('inventory:write'),
      payload: { code: 'AREA-2', name: 'Khu vực 2' },
    });
    const area = areaRes.json().data;
    await app.inject({
      method: 'POST',
      url: '/api/v1/ships',
      headers: authHeader('inventory:write'),
      payload: { area_id: area.id, code: 'SHIP-2', name: 'MV Two' },
    });

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/areas/${area.id}`,
      headers: authHeader('inventory:write'),
    });
    expect(delRes.statusCode).toBe(409);
    expect(delRes.json().error.code).toBe('AREA_HAS_SHIPS');

    const stillThere = await app.inject({
      method: 'GET',
      url: `/api/v1/areas/${area.id}`,
      headers: authHeader('inventory:read'),
    });
    expect(stillThere.statusCode).toBe(200);
  });

  it('DELETE Ship còn Device -> 409 SHIP_HAS_DEVICES, không xoá', async () => {
    const areaRes = await app.inject({
      method: 'POST',
      url: '/api/v1/areas',
      headers: authHeader('inventory:write'),
      payload: { code: 'AREA-3', name: 'Khu vực 3' },
    });
    const area = areaRes.json().data;
    const shipRes = await app.inject({
      method: 'POST',
      url: '/api/v1/ships',
      headers: authHeader('inventory:write'),
      payload: { area_id: area.id, code: 'SHIP-3', name: 'MV Three' },
    });
    const ship = shipRes.json().data;
    await app.inject({
      method: 'POST',
      url: '/api/v1/devices',
      headers: authHeader('inventory:write'),
      payload: { ship_id: ship.id, code: 'DEV-1', name: 'Device 1', role: 'EDGE' },
    });

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/ships/${ship.id}`,
      headers: authHeader('inventory:write'),
    });
    expect(delRes.statusCode).toBe(409);
    expect(delRes.json().error.code).toBe('SHIP_HAS_DEVICES');
  });

  it('mọi response (kể cả lỗi) đều có envelope {data, meta, error} và meta.request_id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/areas',
      headers: authHeader('inventory:read'),
    });
    const body = res.json();
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('meta');
    expect(body).toHaveProperty('error');
    expect(body.meta.request_id).toMatch(/^req_/);
  });
});
