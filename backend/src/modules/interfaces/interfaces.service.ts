import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, inArray } from 'drizzle-orm';
import { DB_TOKEN, DbClient } from '@db/db.module';
import { interfaces, devices, networkZones, ships } from '@db/schema';
import { ApiException } from '@common/api-exception';
import { AuditService } from '@audit/audit.service';
import { diffOf } from '@common/diff';
import { AssignZoneInput, CreateInterfaceInput, CreateZoneInput, UpdateInterfaceInput, ZONE_KIND_BY_ACCOUNTING_GROUP } from './dto';

function toApi(row: typeof interfaces.$inferSelect) {
  return {
    id: row.id,
    device_id: row.deviceId,
    name: row.name,
    type: row.type,
    mac: row.mac,
    parent_interface_id: row.parentInterfaceId,
    zone_id: row.zoneId,
    snmp_index: row.snmpIndex,
    speed_bps: row.speedBps,
    mtu: row.mtu,
    admin_state: row.adminState,
    oper_state: row.operState,
    accounting_group: row.accountingGroup,
    counted_in_reconciliation: row.countedInReconciliation,
    counter_source: row.counterSource,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class InterfacesService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: DbClient,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------------
  // Zones
  // ---------------------------------------------------------------------

  async listZones(shipId: string) {
    const ship = await this.db.query.ships.findFirst({ where: and(eq(ships.id, shipId), isNull(ships.deletedAt)) });
    if (!ship) throw new ApiException('SHIP_NOT_FOUND', `Ship ${shipId} not found`);
    const rows = await this.db.select().from(networkZones).where(eq(networkZones.shipId, shipId));
    return rows.map((r) => ({ id: r.id, ship_id: r.shipId, kind: r.kind, name: r.name, description: r.description }));
  }

  async createZone(shipId: string, input: CreateZoneInput) {
    const ship = await this.db.query.ships.findFirst({ where: and(eq(ships.id, shipId), isNull(ships.deletedAt)) });
    if (!ship) throw new ApiException('SHIP_NOT_FOUND', `Ship ${shipId} not found`);

    const [row] = await this.db
      .insert(networkZones)
      .values({ shipId, kind: input.kind, name: input.name, description: input.description ?? null })
      .returning();

    await this.audit.record({ action: 'zone.create', resourceType: 'network_zone', resourceId: row.id, after: row, result: 'SUCCESS' });
    return { id: row.id, ship_id: row.shipId, kind: row.kind, name: row.name, description: row.description };
  }

  // ---------------------------------------------------------------------
  // Interfaces
  // ---------------------------------------------------------------------

  async listByShip(shipId: string) {
    const ship = await this.db.query.ships.findFirst({ where: and(eq(ships.id, shipId), isNull(ships.deletedAt)) });
    if (!ship) throw new ApiException('SHIP_NOT_FOUND', `Ship ${shipId} not found`);

    const shipDevices = await this.db.select({ id: devices.id }).from(devices).where(and(eq(devices.shipId, shipId), isNull(devices.deletedAt)));
    if (shipDevices.length === 0) return [];

    const rows = await this.db
      .select()
      .from(interfaces)
      .where(
        inArray(
          interfaces.deviceId,
          shipDevices.map((d) => d.id),
        ),
      );
    return rows.map(toApi);
  }

  async getById(id: string) {
    const row = await this.db.query.interfaces.findFirst({ where: eq(interfaces.id, id) });
    if (!row) throw new ApiException('INTERFACE_NOT_FOUND', `Interface ${id} not found`);
    return toApi(row);
  }

  async createForDevice(deviceId: string, input: CreateInterfaceInput) {
    const device = await this.db.query.devices.findFirst({ where: and(eq(devices.id, deviceId), isNull(devices.deletedAt)) });
    if (!device) throw new ApiException('DEVICE_NOT_FOUND', `Device ${deviceId} not found`);

    if (input.parent_interface_id) {
      const parent = await this.db.query.interfaces.findFirst({ where: eq(interfaces.id, input.parent_interface_id) });
      if (!parent || parent.deviceId !== deviceId) {
        throw new ApiException('INTERFACE_NOT_FOUND', `Parent interface ${input.parent_interface_id} not found on this device`);
      }
    }

    const [row] = await this.db
      .insert(interfaces)
      .values({
        deviceId,
        name: input.name,
        type: input.type,
        mac: input.mac ?? null,
        parentInterfaceId: input.parent_interface_id ?? null,
        snmpIndex: input.snmp_index ?? null,
        speedBps: input.speed_bps ?? null,
        mtu: input.mtu ?? null,
      })
      .returning();

    await this.audit.record({ action: 'interface.create', resourceType: 'interface', resourceId: row.id, after: toApi(row), result: 'SUCCESS' });
    return toApi(row);
  }

  async update(id: string, input: UpdateInterfaceInput) {
    const before = await this.db.query.interfaces.findFirst({ where: eq(interfaces.id, id) });
    if (!before) throw new ApiException('INTERFACE_NOT_FOUND', `Interface ${id} not found`);

    const [after] = await this.db
      .update(interfaces)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.mac !== undefined && { mac: input.mac }),
        ...(input.speed_bps !== undefined && { speedBps: input.speed_bps }),
        ...(input.mtu !== undefined && { mtu: input.mtu }),
        ...(input.admin_state !== undefined && { adminState: input.admin_state }),
        ...(input.oper_state !== undefined && { operState: input.oper_state }),
        updatedAt: new Date(),
      })
      .where(eq(interfaces.id, id))
      .returning();

    await this.audit.record({
      action: 'interface.update',
      resourceType: 'interface',
      resourceId: id,
      before: toApi(before),
      after: toApi(after),
      diff: diffOf(toApi(before), toApi(after)),
      result: 'SUCCESS',
    });
    return toApi(after);
  }

  /**
   * Item #4 — gán interface vào một trong bốn nhóm WAN/CREW/BUSINESS/MANAGEMENT.
   * Enforce ADR-10 (docs/backend/01-BACKEND_DESIGN.md): không cho phép cha VÀ con cùng
   * counted_in_reconciliation=true trong cùng accounting_group — SYSTEM_SPEC §6.1 cấm
   * "cộng đồng thời bridge, VLAN và port thành viên nếu chúng đo cùng một luồng dữ liệu".
   *
   * Đây là kiểm tra một-cấp (cha trực tiếp + con trực tiếp), khớp phạm vi CRUD của module
   * này. Việc quét toàn fleet theo chuỗi tổ tiên/hậu duệ tuỳ ý là job định kỳ riêng
   * (docs/backend/01-BACKEND_DESIGN.md ADR-10), ngoài phạm vi task hiện tại.
   */
  async assignZone(id: string, input: AssignZoneInput) {
    const iface = await this.db.query.interfaces.findFirst({ where: eq(interfaces.id, id) });
    if (!iface) throw new ApiException('INTERFACE_NOT_FOUND', `Interface ${id} not found`);

    if (input.zone_id) {
      const zone = await this.db.query.networkZones.findFirst({ where: eq(networkZones.id, input.zone_id) });
      if (!zone) throw new ApiException('ZONE_NOT_FOUND', `Zone ${input.zone_id} not found`);

      const device = await this.db.query.devices.findFirst({ where: eq(devices.id, iface.deviceId) });
      if (device && zone.shipId !== device.shipId) {
        throw new ApiException('VALIDATION_FAILED', 'Zone does not belong to the same ship as this interface device');
      }

      const expectedKind = ZONE_KIND_BY_ACCOUNTING_GROUP[input.accounting_group];
      if (expectedKind && zone.kind !== expectedKind) {
        throw new ApiException(
          'VALIDATION_FAILED',
          `accounting_group=${input.accounting_group} requires a zone of kind=${expectedKind}, got kind=${zone.kind}`,
        );
      }
    }

    if (input.counted_in_reconciliation && input.accounting_group !== 'NONE') {
      await this.assertNoDoubleCount(iface, input.accounting_group);
    }

    const before = iface;
    const [after] = await this.db
      .update(interfaces)
      .set({
        accountingGroup: input.accounting_group,
        zoneId: input.zone_id ?? null,
        countedInReconciliation: input.counted_in_reconciliation,
        updatedAt: new Date(),
      })
      .where(eq(interfaces.id, id))
      .returning();

    await this.audit.record({
      action: 'interface.assign_zone',
      resourceType: 'interface',
      resourceId: id,
      before: toApi(before),
      after: toApi(after),
      diff: diffOf(toApi(before), toApi(after)),
      result: 'SUCCESS',
    });
    return toApi(after);
  }

  private async assertNoDoubleCount(iface: typeof interfaces.$inferSelect, group: string): Promise<void> {
    const relatedIds: string[] = [];
    if (iface.parentInterfaceId) relatedIds.push(iface.parentInterfaceId);

    const children = await this.db
      .select({ id: interfaces.id })
      .from(interfaces)
      .where(eq(interfaces.parentInterfaceId, iface.id));
    relatedIds.push(...children.map((c) => c.id));

    if (relatedIds.length === 0) return;

    const conflicts = await this.db
      .select({ id: interfaces.id, name: interfaces.name })
      .from(interfaces)
      .where(and(inArray(interfaces.id, relatedIds), eq(interfaces.accountingGroup, group as any), eq(interfaces.countedInReconciliation, true)));

    if (conflicts.length > 0) {
      throw new ApiException(
        'INTERFACE_DOUBLE_COUNT',
        `Interface would double-count traffic already counted by a parent/child interface in the same accounting_group=${group}`,
        { conflicting_interfaces: conflicts },
      );
    }
  }
}
