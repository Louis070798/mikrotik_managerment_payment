import { Inject, Injectable } from '@nestjs/common';
import { and, eq, ilike, inArray, isNull, SQL } from 'drizzle-orm';
import { DB_TOKEN, DbClient } from '@db/db.module';
import { subscribers, tenants, packages, devices, ships } from '@db/schema';
import { ApiException } from '@common/api-exception';
import { assertTenantOwns, currentTenantId, tenantCondition } from '@common/tenant-scope';
import { AuditService } from '@audit/audit.service';
import { FreeradiusAaaService } from '@freeradius-sync/freeradius-aaa.service';
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
    // Khi RADIUS_MODE=freeradius, moi thay doi anh huong quyen dang nhap phai duoc day sang
    // radcheck/radreply -- neu khong, sua trong app xong ma FreeRADIUS van xac thuc theo gia tri cu.
    private readonly aaa: FreeradiusAaaService,
  ) {}

  private async assertTenant(tenantId: string) {
    const row = await this.db.query.tenants.findFirst({ where: and(eq(tenants.id, tenantId), isNull(tenants.deletedAt)) });
    if (!row) throw new ApiException('TENANT_NOT_FOUND', `Tenant ${tenantId} not found`);
  }

  private async assertPackage(packageId: string) {
    const row = await this.db.query.packages.findFirst({ where: and(eq(packages.id, packageId), isNull(packages.deletedAt)) });
    if (!row) throw new ApiException('PACKAGE_NOT_FOUND', `Package ${packageId} not found`);
    // Khong chan thi dai ly nay gan duoc goi cuoc (va gia) cua dai ly khac cho subscriber cua minh.
    assertTenantOwns(row.tenantId, 'PACKAGE_NOT_FOUND', `Package ${packageId} not found`);
  }

  private async assertDevice(deviceId: string) {
    const row = await this.db.query.devices.findFirst({ where: and(eq(devices.id, deviceId), isNull(devices.deletedAt)) });
    if (!row) throw new ApiException('DEVICE_NOT_FOUND', `Device ${deviceId} not found`);
    // Thiet bi mang tenant qua tau cua no. Khong chan o day thi mot dai ly co the tro subscriber
    // cua minh vao NAS cua dai ly khac.
    if (currentTenantId() !== null) {
      const ship = row.shipId
        ? await this.db.query.ships.findFirst({ where: and(eq(ships.id, row.shipId), isNull(ships.deletedAt)), columns: { tenantId: true } })
        : null;
      assertTenantOwns(ship?.tenantId, 'DEVICE_NOT_FOUND', `Device ${deviceId} not found`);
    }
  }

  async list(filter: ListSubscribersFilter) {
    const conditions: SQL[] = [isNull(subscribers.deletedAt)];
    // Loc theo tenant cua ACTOR truoc, khong phu thuoc filter.tenantId (tham so do client dat, bo
    // di la truoc day thay subscriber cua moi dai ly). Admin khong bi rang buoc nay.
    const actorScope = tenantCondition(subscribers.tenantId);
    if (actorScope) conditions.push(actorScope);
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
    assertTenantOwns(row.tenantId, 'SUBSCRIBER_NOT_FOUND', `Subscriber ${id} not found`);
    return toApi(row);
  }

  /**
   * Doc mot subscriber va chan luon neu khong thuoc tenant cua actor. Moi thao tac ghi (update,
   * remove, setPassword, resetQuota, revokePassword) deu phai di qua day — neu khong, dai ly nay
   * doan duoc id la sua duoc ban ghi cua dai ly khac.
   */
  private async findOwned(id: string) {
    const row = await this.db.query.subscribers.findFirst({ where: and(eq(subscribers.id, id), isNull(subscribers.deletedAt)) });
    if (!row) throw new ApiException('SUBSCRIBER_NOT_FOUND', `Subscriber ${id} not found`);
    assertTenantOwns(row.tenantId, 'SUBSCRIBER_NOT_FOUND', `Subscriber ${id} not found`);
    return row;
  }

  /**
   * Subscriber la 1 tai khoan dang nhap Hotspot that. Mat khau do ADMIN TU GO NGAY luc tao
   * (input.password bat buoc) -- KHONG con tu sinh ngau nhien nua (bo tinh nang "cap mat khau" tu
   * dong theo yeu cau nguoi dung). Server chi luu ban bam (scrypt), khong bao gio tra lai mat khau
   * qua toApi() (list/get/update) vi da la thu admin tu nhap, khong can "hien 1 lan" nua.
   */
  /**
   * Doc lai goi cuoc roi day trang thai hien tai cua subscriber sang FreeRADIUS. Goi sau MOI thao
   * tac lam doi quyen dang nhap (goi cuoc, trang thai, han dung, mat khau) -- khong chi luc tao.
   * No-op khi dang chay RADIUS nhung.
   */
  private async syncToFreeradius(row: typeof subscribers.$inferSelect, password?: string) {
    if (!this.aaa.enabled) return;
    const pkg = await this.db.query.packages.findFirst({ where: eq(packages.id, row.packageId) });
    await this.aaa.upsertSubscriber({
      username: row.username,
      password,
      status: row.status,
      expiresAt: row.expiresAt,
      downMbps: pkg?.downMbps ?? null,
      upMbps: pkg?.upMbps ?? null,
    });
  }

  async create(input: CreateSubscriberInput) {
    // Dai ly khong duoc tao subscriber cho dai ly khac bang cach doi tenant_id trong body.
    assertTenantOwns(input.tenant_id, 'TENANT_NOT_FOUND', `Tenant ${input.tenant_id} not found`);
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
    await this.syncToFreeradius(row, input.password);
    return toApi(row);
  }

  async update(id: string, input: UpdateSubscriberInput) {
    const beforeRow = await this.findOwned(id);

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
    await this.syncToFreeradius(afterRow);
    return toApi(afterRow);
  }

  async remove(id: string) {
    const before = await this.findOwned(id);

    await this.db.update(subscribers).set({ deletedAt: new Date() }).where(eq(subscribers.id, id));
    await this.audit.record({ action: 'subscriber.delete', resourceType: 'subscriber', resourceId: id, before: toApi(before), result: 'SUCCESS' });
    await this.aaa.removeSubscriber(before.username);
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

    // Loc theo tenant cua actor. Thieu dieu kien nay thi mot dai ly chi can doan/biet id la sua
    // duoc hang loat subscriber cua dai ly khac — va vi la UPDATE hang loat nen khong co buoc doc
    // nao de chan lai. Id khong thuoc ve ho don gian la khong khop, khong bao loi de khoi do id.
    const actorScope = tenantCondition(subscribers.tenantId);
    const rows = await this.db
      .update(subscribers)
      .set(patch)
      .where(and(inArray(subscribers.id, input.subscriber_ids), isNull(subscribers.deletedAt), ...(actorScope ? [actorScope] : [])))
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
   * Dat mat khau RADIUS cho subscriber (Hotspot) BANG MAT KHAU ADMIN TU GO -- khong con tu
   * sinh ngau nhien (bo tinh nang "cap mat khau" tu dong). Bam scrypt luu lai, KHONG tra plaintext
   * ve nua (admin da biet minh vua go gi, khong can "hien 1 lan"). Backend tu xac thuc
   * Access-Request bang hash nay (radius-server.service.ts).
   */
  async setPassword(id: string, password: string) {
    const before = await this.findOwned(id);

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

    // Day la duong duy nhat dua mot user sang FreeRADIUS: password_hash la scrypt mot chieu nen
    // khong the chuyen doi, phai co plaintext ngay tai day.
    await this.syncToFreeradius({ ...before, passwordIssuedAt }, password);

    return { issued_at: passwordIssuedAt.toISOString() };
  }

  /**
   * Reset quota_used_bytes ve 0 -- tac vu quan ly rieng (khong phai 1 field PATCH thuong) vi day
   * la hanh dong co chu dich ro rang ("gia han/cap lai dung luong cho user nay"), can audit rieng
   * de phan biet voi 1 lan sua thong tin thong thuong. Khong dong lien voi issuePassword/update.
   */
  async resetQuota(id: string) {
    const before = await this.findOwned(id);

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
    const before = await this.findOwned(id);

    await this.db.update(subscribers).set({ passwordHash: null, passwordIssuedAt: null, updatedAt: new Date() }).where(eq(subscribers.id, id));

    await this.audit.record({
      action: 'subscriber.password_revoke',
      resourceType: 'subscriber',
      resourceId: id,
      before: { password_configured: before.passwordHash !== null },
      after: { password_configured: false },
      result: 'SUCCESS',
    });
    await this.aaa.removeSubscriber(before.username);
  }
}
