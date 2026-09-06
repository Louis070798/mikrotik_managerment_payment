import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, SQL } from 'drizzle-orm';
import { DB_TOKEN, DbClient } from '@db/db.module';
import { tenants, subscribers } from '@db/schema';
import { ApiException } from '@common/api-exception';
import { AuditService } from '@audit/audit.service';
import { diffOf } from '@common/diff';
import { CreateTenantInput, UpdateTenantInput } from './dto';

export interface ListTenantsFilter {
  parentId?: string;
}

function toApi(row: typeof tenants.$inferSelect) {
  return {
    id: row.id,
    parent_id: row.parentId,
    code: row.code,
    name: row.name,
    contact_name: row.contactName,
    contact_phone: row.contactPhone,
    contact_email: row.contactEmail,
    address: row.address,
    tax_id: row.taxId,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class TenantsService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: DbClient,
    private readonly audit: AuditService,
  ) {}

  async list(filter: ListTenantsFilter) {
    const conditions: SQL[] = [isNull(tenants.deletedAt)];
    if (filter.parentId) conditions.push(eq(tenants.parentId, filter.parentId));

    const rows = await this.db
      .select()
      .from(tenants)
      .where(and(...conditions))
      .orderBy(tenants.name);
    return rows.map(toApi);
  }

  async getById(id: string) {
    const row = await this.db.query.tenants.findFirst({ where: and(eq(tenants.id, id), isNull(tenants.deletedAt)) });
    if (!row) throw new ApiException('TENANT_NOT_FOUND', `Tenant ${id} not found`);
    return toApi(row);
  }

  async create(input: CreateTenantInput) {
    if (input.parent_id) {
      const parent = await this.db.query.tenants.findFirst({
        where: and(eq(tenants.id, input.parent_id), isNull(tenants.deletedAt)),
      });
      if (!parent) throw new ApiException('TENANT_NOT_FOUND', `Parent tenant ${input.parent_id} not found`);
    }

    // Kiem tra truoc thay vi de rot xuong unique constraint that (tenants_code_uq, schema.ts) --
    // neu khong, loi vi pham unique bi AllExceptionsFilter coi la unhandled -> 500 INTERNAL_ERROR
    // thay vi 409 ro rang cho client sua input.
    const existing = await this.db.query.tenants.findFirst({ where: and(eq(tenants.code, input.code), isNull(tenants.deletedAt)) });
    if (existing) throw new ApiException('RESOURCE_CONFLICT', `Tenant code '${input.code}' is already in use`, { code: input.code });

    const [row] = await this.db
      .insert(tenants)
      .values({
        parentId: input.parent_id ?? null,
        code: input.code,
        name: input.name,
        contactName: input.contact_name ?? null,
        contactPhone: input.contact_phone ?? null,
        contactEmail: input.contact_email ?? null,
        address: input.address ?? null,
        taxId: input.tax_id ?? null,
      })
      .returning();

    await this.audit.record({ action: 'tenant.create', resourceType: 'tenant', resourceId: row.id, after: toApi(row), result: 'SUCCESS' });
    return toApi(row);
  }

  async update(id: string, input: UpdateTenantInput) {
    const beforeRow = await this.db.query.tenants.findFirst({ where: and(eq(tenants.id, id), isNull(tenants.deletedAt)) });
    if (!beforeRow) throw new ApiException('TENANT_NOT_FOUND', `Tenant ${id} not found`);

    if (input.code !== undefined && input.code !== beforeRow.code) {
      const codeOwner = await this.db.query.tenants.findFirst({ where: and(eq(tenants.code, input.code), isNull(tenants.deletedAt)) });
      if (codeOwner && codeOwner.id !== id) throw new ApiException('RESOURCE_CONFLICT', `Tenant code '${input.code}' is already in use`, { code: input.code });
    }

    const [afterRow] = await this.db
      .update(tenants)
      .set({
        ...(input.code !== undefined && { code: input.code }),
        ...(input.name !== undefined && { name: input.name }),
        ...(input.contact_name !== undefined && { contactName: input.contact_name }),
        ...(input.contact_phone !== undefined && { contactPhone: input.contact_phone }),
        ...(input.contact_email !== undefined && { contactEmail: input.contact_email }),
        ...(input.address !== undefined && { address: input.address }),
        ...(input.tax_id !== undefined && { taxId: input.tax_id }),
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, id))
      .returning();

    await this.audit.record({
      action: 'tenant.update',
      resourceType: 'tenant',
      resourceId: id,
      before: toApi(beforeRow),
      after: toApi(afterRow),
      diff: diffOf(toApi(beforeRow), toApi(afterRow)),
      result: 'SUCCESS',
    });
    return toApi(afterRow);
  }

  async remove(id: string) {
    const before = await this.db.query.tenants.findFirst({ where: and(eq(tenants.id, id), isNull(tenants.deletedAt)) });
    if (!before) throw new ApiException('TENANT_NOT_FOUND', `Tenant ${id} not found`);

    const childTenant = await this.db.query.tenants.findFirst({ where: and(eq(tenants.parentId, id), isNull(tenants.deletedAt)) });
    if (childTenant) throw new ApiException('TENANT_HAS_DEPENDENTS', `Tenant ${id} still has child tenants`);

    const subscriber = await this.db.query.subscribers.findFirst({
      where: and(eq(subscribers.tenantId, id), isNull(subscribers.deletedAt)),
    });
    if (subscriber) throw new ApiException('TENANT_HAS_DEPENDENTS', `Tenant ${id} still has subscribers`);

    await this.db.update(tenants).set({ deletedAt: new Date() }).where(eq(tenants.id, id));
    await this.audit.record({ action: 'tenant.delete', resourceType: 'tenant', resourceId: id, before: toApi(before), result: 'SUCCESS' });
  }
}
