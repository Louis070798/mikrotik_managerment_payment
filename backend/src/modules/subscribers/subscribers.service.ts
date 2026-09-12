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
    // Thuan tuy hien thi cho admin nhan dien -- KHONG dung trong xac thuc RADIUS (van chi dung
    // username). null neu chua dat.
    display_name: row.displayName,
    notes: row.notes,
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

  /**
   * Subscriber la 1 tai khoan dang nhap Hotspot/PPPoE that. Mat khau do ADMIN TU GO NGAY luc tao
   * (input.password bat buoc) -- KHONG con tu sinh ngau nhien nua (bo tinh nang "cap mat khau" tu
   * dong theo yeu cau nguoi dung). Server chi luu ban bam (scrypt), khong bao gio tra lai mat khau
   * qua toApi() (list/get/update) vi da la thu admin tu nhap, khong can "hien 1 lan" nua.
   */
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
        displayName: input.display_name ?? null,
        notes: input.notes ?? null,
        authType: input.auth_type,
        nasDeviceId: input.nas_device_id ?? null,
        packageId: input.package_id,
        expiresAt: new Date(input.expires_at),
        passwordHash: hashPassword(input.password),
        passwordIssuedAt: new Date(),
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
        ...(input.display_name !== undefined && { displayName: input.display_name }),
        ...(input.notes !== undefined && { notes: input.notes }),
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
   * Dat mat khau RADIUS cho subscriber (PPPoE/Hotspot) BANG MAT KHAU ADMIN TU GO -- khong con tu
   * sinh ngau nhien (bo tinh nang "cap mat khau" tu dong). Bam scrypt luu lai, KHONG tra plaintext
   * ve nua (admin da biet minh vua go gi, khong can "hien 1 lan"). Backend tu xac thuc
   * Access-Request bang hash nay (radius-server.service.ts).
   */
  async setPassword(id: string, password: string) {
    const before = await this.db.query.subscribers.findFirst({ where: and(eq(subscribers.id, id), isNull(subscribers.deletedAt)) });
    if (!before) throw new ApiException('SUBSCRIBER_NOT_FOUND', `Subscriber ${id} not found`);

    const passwordIssuedAt = new Date();
    await this.db
      .update(subscribers)
      .set({ passwordHash: hashPassword(password), passwordIssuedAt, updatedAt: passwordIssuedAt })
      .where(eq(subscribers.id, id));

    await this.audit.record({
      action: 'subscriber.password_issue',
      resourceType: 'subscriber',
      resourceId: id,
      before: { password_configured: before.passwordHash !== null },
      after: { password_configured: true },
      result: 'SUCCESS',
    });

    return { issued_at: passwordIssuedAt.toISOString() };
  }

  /**
   * Reset quota_used_bytes ve 0 -- tac vu quan ly rieng (khong phai 1 field PATCH thuong) vi day
   * la hanh dong co chu dich ro rang ("gia han/cap lai dung luong cho user nay"), can audit rieng
   * de phan biet voi 1 lan sua thong tin thong thuong. Khong dong lien voi issuePassword/update.
   */
  async resetQuota(id: string) {
    const before = await this.db.query.subscribers.findFirst({ where: and(eq(subscribers.id, id), isNull(subscribers.deletedAt)) });
    if (!before) throw new ApiException('SUBSCRIBER_NOT_FOUND', `Subscriber ${id} not found`);

    const [afterRow] = await this.db
      .update(subscribers)
      .set({ quotaUsedBytes: 0, updatedAt: new Date() })
      .where(eq(subscribers.id, id))
      .returning();

    await this.audit.record({
      action: 'subscriber.reset_quota',
      resourceType: 'subscriber',
      resourceId: id,
      before: { quota_used_bytes: before.quotaUsedBytes },
      after: { quota_used_bytes: 0 },
      result: 'SUCCESS',
    });

    return toApi(afterRow);
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
