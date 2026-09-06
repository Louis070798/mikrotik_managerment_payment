import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, sql, count } from 'drizzle-orm';
import { DB_TOKEN, DbClient } from '@db/db.module';
import { areas, ships } from '@db/schema';
import { ApiException } from '@common/api-exception';
import { AuditService } from '@audit/audit.service';
import { diffOf } from '@common/diff';
import { CreateAreaInput, UpdateAreaInput } from './dto';

@Injectable()
export class AreasService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: DbClient,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const rows = await this.db
      .select({
        id: areas.id,
        code: areas.code,
        name: areas.name,
        timezone: areas.timezone,
        orgId: areas.orgId,
        shipCount: count(ships.id),
      })
      .from(areas)
      .leftJoin(ships, and(eq(ships.areaId, areas.id), isNull(ships.deletedAt)))
      .where(isNull(areas.deletedAt))
      .groupBy(areas.id)
      .orderBy(areas.name);

    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      timezone: r.timezone,
      org_id: r.orgId,
      ship_count: Number(r.shipCount),
    }));
  }

  async getById(id: string) {
    const row = await this.db.query.areas.findFirst({ where: and(eq(areas.id, id), isNull(areas.deletedAt)) });
    if (!row) throw new ApiException('AREA_NOT_FOUND', `Area ${id} not found`);
    const [{ shipCount }] = await this.db
      .select({ shipCount: count(ships.id) })
      .from(ships)
      .where(and(eq(ships.areaId, id), isNull(ships.deletedAt)));
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      timezone: row.timezone,
      org_id: row.orgId,
      geo: row.geo,
      ship_count: Number(shipCount),
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }

  async create(input: CreateAreaInput) {
    // areas_org_code_uq la unique(org_id, code) -- Postgres coi moi NULL org_id la khac nhau nen
    // chi thuc su co nguy co trung khi org_id co gia tri; kiem tra truoc de tra 409 ro rang thay vi
    // de rot xuong AllExceptionsFilter thanh 500 INTERNAL_ERROR (dung pattern tenants.service.ts).
    if (input.org_id) {
      const existing = await this.db.query.areas.findFirst({ where: and(eq(areas.orgId, input.org_id), eq(areas.code, input.code), isNull(areas.deletedAt)) });
      if (existing) throw new ApiException('RESOURCE_CONFLICT', `Area code '${input.code}' is already in use for this org`, { code: input.code });
    }

    const [row] = await this.db
      .insert(areas)
      .values({
        code: input.code,
        name: input.name,
        timezone: input.timezone,
        orgId: input.org_id ?? null,
        geo: input.geo ?? null,
      })
      .returning();

    await this.audit.record({
      action: 'area.create',
      resourceType: 'area',
      resourceId: row.id,
      after: row,
      result: 'SUCCESS',
    });
    return this.getById(row.id);
  }

  async update(id: string, input: UpdateAreaInput) {
    const before = await this.db.query.areas.findFirst({ where: and(eq(areas.id, id), isNull(areas.deletedAt)) });
    if (!before) throw new ApiException('AREA_NOT_FOUND', `Area ${id} not found`);

    const [after] = await this.db
      .update(areas)
      .set({
        ...(input.code !== undefined && { code: input.code }),
        ...(input.name !== undefined && { name: input.name }),
        ...(input.timezone !== undefined && { timezone: input.timezone }),
        ...(input.org_id !== undefined && { orgId: input.org_id }),
        ...(input.geo !== undefined && { geo: input.geo }),
        updatedAt: new Date(),
      })
      .where(eq(areas.id, id))
      .returning();

    await this.audit.record({
      action: 'area.update',
      resourceType: 'area',
      resourceId: id,
      before,
      after,
      diff: diffOf(before, after),
      result: 'SUCCESS',
    });
    return this.getById(id);
  }

  async remove(id: string) {
    const before = await this.db.query.areas.findFirst({ where: and(eq(areas.id, id), isNull(areas.deletedAt)) });
    if (!before) throw new ApiException('AREA_NOT_FOUND', `Area ${id} not found`);

    const [{ shipCount }] = await this.db
      .select({ shipCount: count(ships.id) })
      .from(ships)
      .where(and(eq(ships.areaId, id), isNull(ships.deletedAt)));
    if (Number(shipCount) > 0) {
      throw new ApiException('AREA_HAS_SHIPS', `Area ${id} still has ${shipCount} ship(s)`, {
        ship_count: Number(shipCount),
      });
    }

    await this.db.update(areas).set({ deletedAt: new Date() }).where(eq(areas.id, id));
    await this.audit.record({
      action: 'area.delete',
      resourceType: 'area',
      resourceId: id,
      before,
      result: 'SUCCESS',
    });
  }
}

