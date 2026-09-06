import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, count, ilike, SQL } from 'drizzle-orm';
import { DB_TOKEN, DbClient } from '@db/db.module';
import { ships, devices, areas, tenants } from '@db/schema';
import { ApiException } from '@common/api-exception';
import { AuditService } from '@audit/audit.service';
import { diffOf } from '@common/diff';
import { InventoryCacheService } from '@inventory-cache/inventory-cache.service';
import { CreateShipInput, UpdateShipInput } from './dto';

export interface ListShipsFilter {
  areaId?: string;
  status?: string;
  q?: string;
}

@Injectable()
export class ShipsService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: DbClient,
    private readonly audit: AuditService,
    private readonly inventoryCache: InventoryCacheService,
  ) {}

  async list(filter: ListShipsFilter) {
    const conditions: SQL[] = [isNull(ships.deletedAt)];
    if (filter.areaId) conditions.push(eq(ships.areaId, filter.areaId));
    if (filter.status) conditions.push(eq(ships.status, filter.status as any));
    if (filter.q) conditions.push(ilike(ships.name, `%${filter.q}%`));

    const rows = await this.db
      .select({
        id: ships.id,
        name: ships.name,
        code: ships.code,
        areaId: ships.areaId,
        tenantId: ships.tenantId,
        status: ships.status,
        deviceCount: count(devices.id),
      })
      .from(ships)
      .leftJoin(devices, and(eq(devices.shipId, ships.id), isNull(devices.deletedAt)))
      .where(and(...conditions))
      .groupBy(ships.id)
      .orderBy(ships.name);

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      area_id: r.areaId,
      tenant_id: r.tenantId,
      status: r.status,
      device_count: Number(r.deviceCount),
    }));
  }

  async getById(id: string) {
    const row = await this.db.query.ships.findFirst({ where: and(eq(ships.id, id), isNull(ships.deletedAt)) });
    if (!row) throw new ApiException('SHIP_NOT_FOUND', `Ship ${id} not found`);
    const [{ deviceCount }] = await this.db
      .select({ deviceCount: count(devices.id) })
      .from(devices)
      .where(and(eq(devices.shipId, id), isNull(devices.deletedAt)));

    return {
      id: row.id,
      code: row.code,
      name: row.name,
      area_id: row.areaId,
      tenant_id: row.tenantId,
      status: row.status,
      timezone: row.timezone,
      imo: row.imo,
      mmsi: row.mmsi,
      crew_capacity: row.crewCapacity,
      commissioned_at: row.commissionedAt?.toISOString() ?? null,
      device_count: Number(deviceCount),
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }

  async create(input: CreateShipInput) {
    const area = await this.db.query.areas.findFirst({ where: and(eq(areas.id, input.area_id), isNull(areas.deletedAt)) });
    if (!area) throw new ApiException('AREA_NOT_FOUND', `Area ${input.area_id} not found`);
    if (input.tenant_id) {
      const tenant = await this.db.query.tenants.findFirst({ where: and(eq(tenants.id, input.tenant_id), isNull(tenants.deletedAt)) });
      if (!tenant) throw new ApiException('TENANT_NOT_FOUND', `Tenant ${input.tenant_id} not found`);
    }
    // ships_area_code_uq la unique(area_id, code) -- kiem tra truoc de tra 409 ro rang thay vi de
    // rot xuong AllExceptionsFilter thanh 500 INTERNAL_ERROR (dung pattern tenants.service.ts).
    const existingShip = await this.db.query.ships.findFirst({ where: and(eq(ships.areaId, input.area_id), eq(ships.code, input.code), isNull(ships.deletedAt)) });
    if (existingShip) throw new ApiException('RESOURCE_CONFLICT', `Ship code '${input.code}' is already in use for this area`, { code: input.code });

    const [row] = await this.db
      .insert(ships)
      .values({
        areaId: input.area_id,
        tenantId: input.tenant_id ?? null,
        code: input.code,
        name: input.name,
        status: input.status,
        timezone: input.timezone,
        imo: input.imo ?? null,
        mmsi: input.mmsi ?? null,
        crewCapacity: input.crew_capacity ?? null,
      })
      .returning();

    await this.audit.record({ action: 'ship.create', resourceType: 'ship', resourceId: row.id, after: row, result: 'SUCCESS' });
    this.inventoryCache.invalidate();
    return this.getById(row.id);
  }

  async update(id: string, input: UpdateShipInput) {
    const before = await this.db.query.ships.findFirst({ where: and(eq(ships.id, id), isNull(ships.deletedAt)) });
    if (!before) throw new ApiException('SHIP_NOT_FOUND', `Ship ${id} not found`);
    if (input.tenant_id) {
      const tenant = await this.db.query.tenants.findFirst({ where: and(eq(tenants.id, input.tenant_id), isNull(tenants.deletedAt)) });
      if (!tenant) throw new ApiException('TENANT_NOT_FOUND', `Tenant ${input.tenant_id} not found`);
    }

    const [after] = await this.db
      .update(ships)
      .set({
        ...(input.code !== undefined && { code: input.code }),
        ...(input.name !== undefined && { name: input.name }),
        ...(input.tenant_id !== undefined && { tenantId: input.tenant_id }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.timezone !== undefined && { timezone: input.timezone }),
        ...(input.imo !== undefined && { imo: input.imo }),
        ...(input.mmsi !== undefined && { mmsi: input.mmsi }),
        ...(input.crew_capacity !== undefined && { crewCapacity: input.crew_capacity }),
        updatedAt: new Date(),
      })
      .where(eq(ships.id, id))
      .returning();

    await this.audit.record({
      action: 'ship.update',
      resourceType: 'ship',
      resourceId: id,
      before,
      after,
      diff: diffOf(before, after),
      result: 'SUCCESS',
    });
    this.inventoryCache.invalidate();
    return this.getById(id);
  }

  async remove(id: string) {
    const before = await this.db.query.ships.findFirst({ where: and(eq(ships.id, id), isNull(ships.deletedAt)) });
    if (!before) throw new ApiException('SHIP_NOT_FOUND', `Ship ${id} not found`);

    const [{ deviceCount }] = await this.db
      .select({ deviceCount: count(devices.id) })
      .from(devices)
      .where(and(eq(devices.shipId, id), isNull(devices.deletedAt)));
    if (Number(deviceCount) > 0) {
      throw new ApiException('SHIP_HAS_DEVICES', `Ship ${id} still has ${deviceCount} device(s)`, {
        device_count: Number(deviceCount),
      });
    }

    await this.db.update(ships).set({ deletedAt: new Date() }).where(eq(ships.id, id));
    await this.audit.record({ action: 'ship.delete', resourceType: 'ship', resourceId: id, before, result: 'SUCCESS' });
    this.inventoryCache.invalidate();
  }
}
