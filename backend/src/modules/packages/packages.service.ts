import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, sql, SQL } from 'drizzle-orm';
import { DB_TOKEN, DbClient } from '@db/db.module';
import { packages, subscribers } from '@db/schema';
import { ApiException } from '@common/api-exception';
import { AuditService } from '@audit/audit.service';
import { diffOf } from '@common/diff';
import { CreatePackageInput, UpdatePackageInput } from './dto';

export interface ListPackagesFilter {
  tenantId?: string;
}

function toApi(row: typeof packages.$inferSelect, subscriberCount = 0) {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    name: row.name,
    down_mbps: row.downMbps,
    up_mbps: row.upMbps,
    quota_gb: row.quotaGb,
    duration_unit: row.durationUnit,
    duration_value: row.durationValue,
    price_vnd: Number(row.priceVnd),
    max_concurrent_devices: row.maxConcurrentDevices,
    subscriber_count: subscriberCount,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class PackagesService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: DbClient,
    private readonly audit: AuditService,
  ) {}

  async list(filter: ListPackagesFilter) {
    const conditions: SQL[] = [isNull(packages.deletedAt)];
    if (filter.tenantId) conditions.push(eq(packages.tenantId, filter.tenantId));

    const rows = await this.db
      .select()
      .from(packages)
      .where(and(...conditions))
      .orderBy(packages.name);
    if (rows.length === 0) return [];

    const counts = await this.db
      .select({ packageId: subscribers.packageId, count: sql<number>`count(*)::int` })
      .from(subscribers)
      .where(and(inArray(subscribers.packageId, rows.map((r) => r.id)), isNull(subscribers.deletedAt)))
      .groupBy(subscribers.packageId);
    const countByPackage = new Map(counts.map((c) => [c.packageId, c.count]));

    return rows.map((row) => toApi(row, countByPackage.get(row.id) ?? 0));
  }

  async getById(id: string) {
    const row = await this.db.query.packages.findFirst({ where: and(eq(packages.id, id), isNull(packages.deletedAt)) });
    if (!row) throw new ApiException('PACKAGE_NOT_FOUND', `Package ${id} not found`);
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(subscribers)
      .where(and(eq(subscribers.packageId, id), isNull(subscribers.deletedAt)));
    return toApi(row, count);
  }

  async create(input: CreatePackageInput) {
    const [row] = await this.db
      .insert(packages)
      .values({
        tenantId: input.tenant_id ?? null,
        name: input.name,
        downMbps: input.down_mbps,
        upMbps: input.up_mbps,
        quotaGb: input.quota_gb,
        durationUnit: input.duration_unit,
        durationValue: input.duration_value,
        priceVnd: String(input.price_vnd),
        maxConcurrentDevices: input.max_concurrent_devices,
      })
      .returning();

    await this.audit.record({ action: 'package.create', resourceType: 'package', resourceId: row.id, after: toApi(row), result: 'SUCCESS' });
    return toApi(row);
  }

  async update(id: string, input: UpdatePackageInput) {
    const beforeRow = await this.db.query.packages.findFirst({ where: and(eq(packages.id, id), isNull(packages.deletedAt)) });
    if (!beforeRow) throw new ApiException('PACKAGE_NOT_FOUND', `Package ${id} not found`);

    const [afterRow] = await this.db
      .update(packages)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.down_mbps !== undefined && { downMbps: input.down_mbps }),
        ...(input.up_mbps !== undefined && { upMbps: input.up_mbps }),
        ...(input.quota_gb !== undefined && { quotaGb: input.quota_gb }),
        ...(input.duration_unit !== undefined && { durationUnit: input.duration_unit }),
        ...(input.duration_value !== undefined && { durationValue: input.duration_value }),
        ...(input.price_vnd !== undefined && { priceVnd: String(input.price_vnd) }),
        ...(input.max_concurrent_devices !== undefined && { maxConcurrentDevices: input.max_concurrent_devices }),
        updatedAt: new Date(),
      })
      .where(eq(packages.id, id))
      .returning();

    await this.audit.record({
      action: 'package.update',
      resourceType: 'package',
      resourceId: id,
      before: toApi(beforeRow),
      after: toApi(afterRow),
      diff: diffOf(toApi(beforeRow), toApi(afterRow)),
      result: 'SUCCESS',
    });
    return toApi(afterRow);
  }

  async remove(id: string) {
    const before = await this.db.query.packages.findFirst({ where: and(eq(packages.id, id), isNull(packages.deletedAt)) });
    if (!before) throw new ApiException('PACKAGE_NOT_FOUND', `Package ${id} not found`);

    const inUse = await this.db.query.subscribers.findFirst({
      where: and(eq(subscribers.packageId, id), isNull(subscribers.deletedAt)),
    });
    if (inUse) throw new ApiException('PACKAGE_IN_USE', `Package ${id} still has subscribers assigned`);

    await this.db.update(packages).set({ deletedAt: new Date() }).where(eq(packages.id, id));
    await this.audit.record({ action: 'package.delete', resourceType: 'package', resourceId: id, before: toApi(before), result: 'SUCCESS' });
  }
}
