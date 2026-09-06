import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Pool } from 'pg';
import { buildTestApp, resetTestDb, authHeader, newPool } from '../support/app';

/**
 * Integration test cho Interface + zone mapping (yêu cầu #4): WAN / CREW / BUSINESS / MANAGEMENT,
 * và bảo vệ chống double-count (ADR-10, kiểm tra 1 cấp cha/con trực tiếp).
 */
describe('Interfaces — zone mapping WAN/CREW/BUSINESS/MANAGEMENT', () => {
  let app: NestFastifyApplication;
  let pool: Pool;
  let shipId: string;
  let deviceId: string;

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
      await app.inject({
        method: 'POST',
        url: '/api/v1/areas',
        headers: authHeader('inventory:write'),
        payload: { code: 'AREA-IF', name: 'Area IF' },
      })
    ).json().data;
    const ship = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/ships',
        headers: authHeader('inventory:write'),
        payload: { area_id: area.id, code: 'SHIP-IF', name: 'Ship IF' },
      })
    ).json().data;
    shipId = ship.id;
    const device = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/devices',
        headers: authHeader('inventory:write'),
        payload: { ship_id: shipId, code: 'DEV-IF', name: 'Device IF', role: 'CORE' },
      })
    ).json().data;
    deviceId = device.id;
  });

  async function createInterface(name: string, parentInterfaceId: string | null = null) {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/devices/${deviceId}/interfaces`,
      headers: authHeader('inventory:write'),
      payload: { name, type: 'ETHER', parent_interface_id: parentInterfaceId },
    });
    expect(res.statusCode).toBe(201);
    return res.json().data;
  }

  it('gán WAN_INPUT không cần zone_id, gán CREW_ACCESS bắt buộc zone_id đúng kind CREW', async () => {
    const zone = (
      await app.inject({
        method: 'POST',
        url: `/api/v1/ships/${shipId}/zones`,
        headers: authHeader('inventory:write'),
        payload: { kind: 'CREW', name: 'crew-net' },
      })
    ).json().data;

    const wanIf = await createInterface('ether1-wan');
    const wanAssign = await app.inject({
      method: 'POST',
      url: `/api/v1/interfaces/${wanIf.id}/assign-zone`,
      headers: authHeader('inventory:write'),
      payload: { accounting_group: 'WAN_INPUT', counted_in_reconciliation: true },
    });
    expect(wanAssign.statusCode).toBe(201);
    expect(wanAssign.json().data.zone_id).toBeNull();
    expect(wanAssign.json().data.accounting_group).toBe('WAN_INPUT');

    const crewIf = await createInterface('ether2-crew');
    const crewAssign = await app.inject({
      method: 'POST',
      url: `/api/v1/interfaces/${crewIf.id}/assign-zone`,
      headers: authHeader('inventory:write'),
      payload: { accounting_group: 'CREW_ACCESS', zone_id: zone.id, counted_in_reconciliation: true },
    });
    expect(crewAssign.statusCode).toBe(201);
    expect(crewAssign.json().data.zone_id).toBe(zone.id);
    expect(crewAssign.json().data.accounting_group).toBe('CREW_ACCESS');
  });

  it('CREW_ACCESS thiếu zone_id -> 400 VALIDATION_FAILED', async () => {
    const iface = await createInterface('ether3');
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/interfaces/${iface.id}/assign-zone`,
      headers: authHeader('inventory:write'),
      payload: { accounting_group: 'CREW_ACCESS' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_FAILED');
  });

  it('BUSINESS_ACCESS với zone_id sai kind (CREW thay vì BUSINESS) -> lỗi (ZONE_NOT_FOUND hoặc VALIDATION_FAILED)', async () => {
    const crewZone = (
      await app.inject({
        method: 'POST',
        url: `/api/v1/ships/${shipId}/zones`,
        headers: authHeader('inventory:write'),
        payload: { kind: 'CREW', name: 'crew-net-2' },
      })
    ).json().data;
    const iface = await createInterface('ether4');
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/interfaces/${iface.id}/assign-zone`,
      headers: authHeader('inventory:write'),
      payload: { accounting_group: 'BUSINESS_ACCESS', zone_id: crewZone.id },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });

  it('WAN_INPUT kèm zone_id (không được phép) -> 400 VALIDATION_FAILED', async () => {
    const zone = (
      await app.inject({
        method: 'POST',
        url: `/api/v1/ships/${shipId}/zones`,
        headers: authHeader('inventory:write'),
        payload: { kind: 'MANAGEMENT', name: 'mgmt-net' },
      })
    ).json().data;
    const iface = await createInterface('ether5');
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/interfaces/${iface.id}/assign-zone`,
      headers: authHeader('inventory:write'),
      payload: { accounting_group: 'WAN_INPUT', zone_id: zone.id },
    });
    expect(res.statusCode).toBe(400);
  });

  it('interface con (VLAN, parent=ether1) gán cùng accounting_group + counted=true như cha -> 409 INTERFACE_DOUBLE_COUNT', async () => {
    const zone = (
      await app.inject({
        method: 'POST',
        url: `/api/v1/ships/${shipId}/zones`,
        headers: authHeader('inventory:write'),
        payload: { kind: 'CREW', name: 'crew-net-3' },
      })
    ).json().data;

    const parent = await createInterface('ether1');
    await app.inject({
      method: 'POST',
      url: `/api/v1/interfaces/${parent.id}/assign-zone`,
      headers: authHeader('inventory:write'),
      payload: { accounting_group: 'CREW_ACCESS', zone_id: zone.id, counted_in_reconciliation: true },
    });

    const child = await createInterface('vlan100', parent.id);
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/interfaces/${child.id}/assign-zone`,
      headers: authHeader('inventory:write'),
      payload: { accounting_group: 'CREW_ACCESS', zone_id: zone.id, counted_in_reconciliation: true },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('INTERFACE_DOUBLE_COUNT');
    expect(res.json().error.details.conflicting_interfaces[0].id).toBe(parent.id);
  });

  it('interface con cùng cha nhưng counted_in_reconciliation=false -> KHÔNG bị chặn (không đóng góp double-count)', async () => {
    const zone = (
      await app.inject({
        method: 'POST',
        url: `/api/v1/ships/${shipId}/zones`,
        headers: authHeader('inventory:write'),
        payload: { kind: 'BUSINESS', name: 'biz-net' },
      })
    ).json().data;

    const parent = await createInterface('ether6');
    await app.inject({
      method: 'POST',
      url: `/api/v1/interfaces/${parent.id}/assign-zone`,
      headers: authHeader('inventory:write'),
      payload: { accounting_group: 'BUSINESS_ACCESS', zone_id: zone.id, counted_in_reconciliation: true },
    });

    const child = await createInterface('vlan200', parent.id);
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/interfaces/${child.id}/assign-zone`,
      headers: authHeader('inventory:write'),
      payload: { accounting_group: 'BUSINESS_ACCESS', zone_id: zone.id, counted_in_reconciliation: false },
    });
    expect(res.statusCode).toBe(201);
  });

  it('GET /ships/:shipId/interfaces trả về mọi interface của mọi device trên tàu', async () => {
    await createInterface('ether7');
    await createInterface('ether8');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/ships/${shipId}/interfaces`,
      headers: authHeader('inventory:read'),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBeGreaterThanOrEqual(2);
  });
});
