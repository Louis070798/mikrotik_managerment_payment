import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { DB_TOKEN, DbClient } from '@db/db.module';
import { devices, packages, ships, subscribers, tenants } from '@db/schema';
import { FinanceQuery } from './dto';

/**
 * "Gia tri" (value), khong phai "doanh thu" (revenue) -- he thong chi luu gia niem yet cua goi
 * (packages.price_vnd) va trang thai subscriber, KHONG co bang hoa don/thanh toan nao. So nay la
 * gia tri cac goi dang ACTIVE theo gia niem yet, khong phai tien da thu duoc. Giu dung quy uoc
 * "honest by design" da ap dung cho reconciliation/ZeroTier trong phien nay -- khong goi la
 * "revenue" de tranh ngu y da xac nhan thu tien that.
 */
export interface FinanceTotals {
  active_subscription_count: number;
  active_subscription_value_vnd: number;
}

export interface FinanceByPackageRow {
  package_id: string;
  package_name: string;
  price_vnd: number;
  active_subscriber_count: number;
  subtotal_vnd: number;
}

export interface FinanceByShipRow {
  ship_id: string | null;
  ship_code: string | null;
  ship_name: string | null;
  active_subscriber_count: number;
  subtotal_vnd: number;
}

export interface FinanceByTenantRow {
  tenant_id: string;
  tenant_code: string;
  tenant_name: string;
  active_subscriber_count: number;
  subtotal_vnd: number;
}

export interface FinanceGlobalSummary {
  as_of: string;
  currency: 'VND';
  totals: FinanceTotals;
  status_breakdown: { active: number; suspended: number; expired: number };
  expiring_soon: { within_days: number; count: number; at_risk_value_vnd: number };
  by_package: FinanceByPackageRow[];
  by_ship: FinanceByShipRow[];
  by_tenant: FinanceByTenantRow[];
}

const activeNotDeleted = and(eq(subscribers.status, 'ACTIVE'), isNull(subscribers.deletedAt));

@Injectable()
export class FinanceService {
  constructor(@Inject(DB_TOKEN) private readonly db: DbClient) {}

  async getGlobalSummary(query: FinanceQuery): Promise<FinanceGlobalSummary> {
    const now = new Date();
    const expiringUntil = new Date(now.getTime() + query.expiring_within_days * 24 * 60 * 60 * 1000);

    const [totalsRow] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
        value: sql<string>`coalesce(sum(${packages.priceVnd}), 0)`,
      })
      .from(subscribers)
      .innerJoin(packages, eq(packages.id, subscribers.packageId))
      .where(activeNotDeleted);

    const statusRows = await this.db
      .select({ status: subscribers.status, count: sql<number>`count(*)::int` })
      .from(subscribers)
      .where(isNull(subscribers.deletedAt))
      .groupBy(subscribers.status);
    const countByStatus = new Map(statusRows.map((r) => [r.status, r.count]));

    const [expiringRow] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
        value: sql<string>`coalesce(sum(${packages.priceVnd}), 0)`,
      })
      .from(subscribers)
      .innerJoin(packages, eq(packages.id, subscribers.packageId))
      .where(and(activeNotDeleted, gte(subscribers.expiresAt, now), lte(subscribers.expiresAt, expiringUntil)));

    const byPackageRows = await this.db
      .select({
        packageId: packages.id,
        packageName: packages.name,
        priceVnd: packages.priceVnd,
        activeCount: sql<number>`count(${subscribers.id}) filter (where ${subscribers.status} = 'ACTIVE' and ${subscribers.deletedAt} is null)::int`,
      })
      .from(packages)
      .leftJoin(subscribers, eq(subscribers.packageId, packages.id))
      .where(isNull(packages.deletedAt))
      .groupBy(packages.id, packages.name, packages.priceVnd);

    const byShipRows = await this.db
      .select({
        shipId: ships.id,
        shipCode: ships.code,
        shipName: ships.name,
        activeCount: sql<number>`count(${subscribers.id})::int`,
        subtotal: sql<string>`coalesce(sum(${packages.priceVnd}), 0)`,
      })
      .from(subscribers)
      .innerJoin(packages, eq(packages.id, subscribers.packageId))
      .leftJoin(devices, eq(devices.id, subscribers.nasDeviceId))
      .leftJoin(ships, and(eq(ships.id, devices.shipId), isNull(ships.deletedAt)))
      .where(activeNotDeleted)
      .groupBy(ships.id, ships.code, ships.name);

    const byTenantRows = await this.db
      .select({
        tenantId: tenants.id,
        tenantCode: tenants.code,
        tenantName: tenants.name,
        activeCount: sql<number>`count(${subscribers.id})::int`,
        subtotal: sql<string>`coalesce(sum(${packages.priceVnd}), 0)`,
      })
      .from(subscribers)
      .innerJoin(packages, eq(packages.id, subscribers.packageId))
      .innerJoin(tenants, eq(tenants.id, subscribers.tenantId))
      .where(and(activeNotDeleted, isNull(tenants.deletedAt)))
      .groupBy(tenants.id, tenants.code, tenants.name);

    return {
      as_of: now.toISOString(),
      currency: 'VND',
      totals: {
        active_subscription_count: totalsRow?.count ?? 0,
        active_subscription_value_vnd: Number(totalsRow?.value ?? 0),
      },
      status_breakdown: {
        active: countByStatus.get('ACTIVE') ?? 0,
        suspended: countByStatus.get('SUSPENDED') ?? 0,
        expired: countByStatus.get('EXPIRED') ?? 0,
      },
      expiring_soon: {
        within_days: query.expiring_within_days,
        count: expiringRow?.count ?? 0,
        at_risk_value_vnd: Number(expiringRow?.value ?? 0),
      },
      by_package: byPackageRows
        .map((row) => ({
          package_id: row.packageId,
          package_name: row.packageName,
          price_vnd: Number(row.priceVnd),
          active_subscriber_count: row.activeCount,
          subtotal_vnd: Number(row.priceVnd) * row.activeCount,
        }))
        .sort((a, b) => b.subtotal_vnd - a.subtotal_vnd),
      by_ship: byShipRows
        .map((row) => ({
          ship_id: row.shipId,
          ship_code: row.shipCode,
          ship_name: row.shipName,
          active_subscriber_count: row.activeCount,
          subtotal_vnd: Number(row.subtotal),
        }))
        .sort((a, b) => b.subtotal_vnd - a.subtotal_vnd),
      by_tenant: byTenantRows
        .map((row) => ({
          tenant_id: row.tenantId,
          tenant_code: row.tenantCode,
          tenant_name: row.tenantName,
          active_subscriber_count: row.activeCount,
          subtotal_vnd: Number(row.subtotal),
        }))
        .sort((a, b) => b.subtotal_vnd - a.subtotal_vnd),
    };
  }
}
