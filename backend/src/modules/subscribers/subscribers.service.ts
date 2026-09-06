import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, ilike, inArray, isNull, SQL } from 'drizzle-orm';
import { DB_TOKEN, DbClient } from '@db/db.module';
import { subscribers, tenants, packages, devices } from '@db/schema';
import { ApiException } from '@common/api-exception';
import { AuditService } from '@audit/audit.service';
import { diffOf } from '@common/diff';
import { hashPassword } from '@password-hash/password-hash';
import { BulkAssignInput, CreateSubscriberInput, UpdateSubscriberInput } from './dto';

export interface ListSubscribersFilter {
  tenantId?: string;
  nasDeviceId?: string;
  status?: string;
  q?: string;
  limit: number;
}

function toApi(row: typeof subscribers.$inferSelect) {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    username: row.username,
    auth_type: row.authType,
    nas_device_id: row.nasDeviceId,
    package_id: row.packageId,
    status: row.status,
    quota_used_bytes: row.quotaUsedBytes,
    expires_at: row.expiresAt.toISOString(),
    // Không bao giờ trả hash — chỉ báo đã cấp hay chưa (cùng convention devices.radius_secret_configured).
    password_configured: row.passwordHash !== null,
    password_issued_at: row.passwordIssuedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

/** 12 ký tự base64url (~72 bit entropy) — đủ ngắn để người dùng gõ tay vào máy khách Hotspot/PPPoE. */
function generateSubscriberPassword(): string {
  return randomBytes(9).toString('base64url');
}

@Injectable()
export class SubscribersService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: DbClient,
    private readonly audit: AuditService,
  ) {}

  private async assertTenant(tenantId: string) {
    const row = await this.db.query.tenants.findFirst({ where: and(eq(tenants.id, tenantId), isNull(tenants.deletedAt)) });
    if (!row) throw new ApiException('TENANT_NOT_FOUND', `Tenant ${tenantId} not found`);
  }

  private async assertPackage(packageId: string) {
    const row = await this.db.query.packages.findFirst({ where: and(eq(packages.id, packageId), isNull(packages.deletedAt)) });
    if (!row) throw new ApiException('PACKAGE_NOT_FOUND', `Package ${packageId} not found`);
  }

  private async assertDevice(deviceId: string) {
    const row = await this.db.query.devices.findFirst({ where: and(eq(devices.id, deviceId), isNull(devices.deletedAt)) });
    if (!row) throw new ApiException('DEVICE_NOT_FOUND', `Device ${deviceId} not found`);
  }

  async list(filter: ListSubscribersFilter) {
    const conditions: SQL[] = [isNull(subscribers.deletedAt)];
    if (filter.tenantId) conditions.push(eq(subscribers.tenantId, filter.tenantId));
    if (filter.nasDeviceId) conditions.push(eq(subscribers.nasDeviceId, filter.nasDeviceId));
    if (filter.status) conditions.push(eq(subscribers.status, filter.status as any));
    if (filter.q) conditions.push(ilike(subscribers.username, `%${filter.q}%`));

    const rows = await this.db
      .select()
      .from(subscribers)
      .where(and(...conditions))
      .orderBy(subscribers.username)
      .limit(filter.limit);
    return rows.map(toApi);
  }

  async getById(id: string) {
    const row = await this.db.query.subscribers.findFirst({ where: and(eq(subscribers.id, id), isNull(subscribers.deletedAt)) });
    if (!row) throw new ApiException('SUBSCRIBER_NOT_FOUND', `Subscriber ${id} not found`);
    return toApi(row);
  }

  async create(input: CreateSubscriberInput) {
    await this.assertTenant(input.tenant_id);
    await this.assertPackage(input.package_id);
    if (input.nas_device_id) await this.assertDevice(input.nas_device_id);

    // Kiem tra truoc thay vi de rot xuong unique constraint that (subscribers_tenant_username_uq,
    // schema.ts) -- neu khong, loi vi pham unique bi AllExceptionsFilter coi la unhandled -> 500
    // INTERNAL_ERROR thay vi 409 ro rang cho client sua input (dung pattern da fix o tenants.service.ts).
    const existing = await this.db.query.subscribers.findFirst({
      where: and(eq(subscribers.tenantId, input.tenant_id), eq(subscribers.username, input.username), isNull(subscribers.deletedAt)),
    });
    if (existing) throw new ApiException('RESOURCE_CONFLICT', `Username '${input.username}' is already in use for this tenant`, { username: input.username });

    const [row] = await this.db
      .insert(subscribers)
      .values({
        tenantId: input.tenant_id,
        username: input.username,
        authType: input.auth_type,
        nasDeviceId: input.nas_device_id ?? null,
        packageId: input.package_id,
        expiresAt: new Date(input.expires_at),
      })
      .returning();

    await this.audit.record({ action: 'subscriber.create', resourceType: 'subscriber', resourceId: row.id, after: toApi(row), result: 'SUCCESS' });
    return toApi(row);
  }

  async update(id: string, input: UpdateSubscriberInput) {
    const beforeRow = await this.db.query.subscribers.findFirst({ where: and(eq(subscribers.id, id), isNull(subscribers.deletedAt)) });
    if (!beforeRow) throw new ApiException('SUBSCRIBER_NOT_FOUND', `Subscriber ${id} not found`);

    if (input.package_id) await this.assertPackage(input.package_id);
    if (input.nas_device_id) await this.assertDevice(input.nas_device_id);

    const [afterRow] = await this.db
      .update(subscribers)
      .set({
        ...(input.auth_type !== undefined && { authType: input.auth_type }),
        ...(input.nas_device_id !== undefined && { nasDeviceId: input.nas_device_id }),
        ...(input.package_id !== undefined && { packageId: input.package_id }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.expires_at !== undefined && { expiresAt: new Date(input.expires_at) }),
        updatedAt: new Date(),
      })
      .where(eq(subscribers.id, id))
      .returning();

    await this.audit.record({
      action: 'subscriber.update',
      resourceType: 'subscriber',
      resourceId: id,
      before: toApi(beforeRow),
      after: toApi(afterRow),
      diff: diffOf(toApi(beforeRow), toApi(afterRow)),
      result: 'SUCCESS',
    });
    return toApi(afterRow);
  }

  async remove(id: string) {
    const before = await this.db.query.subscribers.findFirst({ where: and(eq(subscribers.id, id), isNull(subscribers.deletedAt)) });
    if (!before) throw new ApiException('SUBSCRIBER_NOT_FOUND', `Subscriber ${id} not found`);

    await this.db.update(subscribers).set({ deletedAt: new Date() }).where(eq(subscribers.id, id));
    await this.audit.record({ action: 'subscriber.delete', resourceType: 'subscriber', resourceId: id, before: toApi(before), result: 'SUCCESS' });
  }

  async bulkAssign(input: BulkAssignInput) {
    if (!input.package_id && !input.nas_device_id) {
      throw new ApiException('VALIDATION_FAILED', 'Provide package_id and/or nas_device_id to bulk-assign', {});
    }
    if (input.package_id) await this.assertPackage(input.package_id);
    if (input.nas_device_id) await this.assertDevice(input.nas_device_id);

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.package_id) patch.packageId = input.package_id;
    if (input.nas_device_id) patch.nasDeviceId = input.nas_device_id;

    const rows = await this.db
      .update(subscribers)
      .set(patch)
      .where(and(inArray(subscribers.id, input.subscriber_ids), isNull(subscribers.deletedAt)))
      .returning();

    await this.audit.record({
      action: 'subscriber.bulk_assign',
      resourceType: 'subscriber',
      resourceId: null,
      scope: { subscriber_ids: input.subscriber_ids, package_id: input.package_id ?? null, nas_device_id: input.nas_device_id ?? null },
      after: { updated_count: rows.length },
      result: 'SUCCESS',
    });

    return { updated_count: rows.length, subscribers: rows.map(toApi) };
  }

  /**
   * Cấp mật khẩu RADIUS thật cho subscriber (PPPoE/Hotspot) — sinh ngẫu nhiên, băm scrypt lưu
   * lại, trả plaintext ĐÚNG 1 LẦN (đối xứng với devices.issueRadiusSecret()/issuePushApiKey()).
   * Backend tự xác thực Access-Request bằng hash này (radius-server.service.ts) — không còn
   * uỷ quyền cho PostgreSQL AAA riêng như dự tính ban đầu (xem migration 0011).
   */
  async issuePassword(id: string) {
    const before = await this.db.query.subscribers.findFirst({ where: and(eq(subscribers.id, id), isNull(subscribers.deletedAt)) });
    if (!before) throw new ApiException('SUBSCRIBER_NOT_FOUND', `Subscriber ${id} not found`);

    const plaintext = generateSubscriberPassword();
    const passwordIssuedAt = new Date();
    await this.db
      .update(subscribers)
      .set({ passwordHash: hashPassword(plaintext), passwordIssuedAt, updatedAt: passwordIssuedAt })
      .where(eq(subscribers.id, id));

    await this.audit.record({
      action: 'subscriber.password_issue',
      resourceType: 'subscriber',
      resourceId: id,
      before: { password_configured: before.passwordHash !== null },
      after: { password_configured: true },
      result: 'SUCCESS',
    });

    return { password: plaintext, issued_at: passwordIssuedAt.toISOString() };
  }

  async revokePassword(id: string) {
    const before = await this.db.query.subscribers.findFirst({ where: and(eq(subscribers.id, id), isNull(subscribers.deletedAt)) });
    if (!before) throw new ApiException('SUBSCRIBER_NOT_FOUND', `Subscriber ${id} not found`);

    await this.db.update(subscribers).set({ passwordHash: null, passwordIssuedAt: null, updatedAt: new Date() }).where(eq(subscribers.id, id));

    await this.audit.record({
      action: 'subscriber.password_revoke',
      resourceType: 'subscriber',
      resourceId: id,
      before: { password_configured: before.passwordHash !== null },
      after: { password_configured: false },
      result: 'SUCCESS',
    });
  }
}
