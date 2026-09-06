import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { buildPageMeta, decodeCursor } from '@common/pagination';
import { toDate } from '@common/sql-date';
import { ApiException } from '@common/api-exception';
import { DB_TOKEN, DbClient } from '@db/db.module';
import { areas, devices, interfaceCounterDeltas, interfaceCounterSamples, interfaces, radiusSessions, ships } from '@db/schema';
import { bucketSql } from '@telemetry-normalize/aggregation';
import {
  DashboardQuery,
  DashboardPeriod,
  RawRecordsQuery,
  TELEMETRY_MISSING_SOURCES,
} from './dto';
import { DASHBOARD_UNITS, makeDashboardMeta, makeDataQuality, makeTelemetryWarnings, makeUnavailableAvailability, resolvePeriod } from './dashboard.contract';

const RECON_FORMULA_VERSION = 'recon-1.0.0';

/**
 * ADR-09 direction convention for a *_ACCESS zone: tx = download (router transmits TO the zone),
 * rx = upload. Confirmed by spec for CREW_ACCESS; applied by explicit, documented analogy to
 * BUSINESS_ACCESS and MANAGEMENT since no separate rule is given for those in ADR-09's table.
 */
type ZoneTotals = { downloadBytes: number | null; uploadBytes: number | null; rowCount: number };

async function sumZoneBytes(db: DbClient, shipId: string, accountingGroup: string, from: Date, to: Date): Promise<ZoneTotals> {
  const directionColumn = accountingGroup === 'WAN_INPUT' ? interfaceCounterDeltas.dRxBytes : interfaceCounterDeltas.dTxBytes;
  const oppositeColumn = accountingGroup === 'WAN_INPUT' ? interfaceCounterDeltas.dTxBytes : interfaceCounterDeltas.dRxBytes;
  const [row] = await db
    .select({
      dl: sql<string | null>`sum(${directionColumn})`,
      ul: sql<string | null>`sum(${oppositeColumn})`,
      rowCount: count(interfaceCounterDeltas.id),
    })
    .from(interfaceCounterDeltas)
    .where(
      and(
        eq(interfaceCounterDeltas.shipId, shipId),
        eq(interfaceCounterDeltas.accountingGroup, accountingGroup as any),
        gte(interfaceCounterDeltas.bucket, from),
        lte(interfaceCounterDeltas.bucket, to),
      ),
    );
  const rowCount = Number(row?.rowCount ?? 0);
  return {
    downloadBytes: rowCount > 0 && row?.dl !== null && row?.dl !== undefined ? Number(row.dl) : null,
    uploadBytes: rowCount > 0 && row?.ul !== null && row?.ul !== undefined ? Number(row.ul) : null,
    rowCount,
  };
}

export function computeGap(measured: number | null, reported: number | null): { gapBytes: number | null; gapPct: number | null } {
  if (measured === null || reported === null) return { gapBytes: null, gapPct: null };
  const gapBytes = measured - reported;
  const gapPct = measured === 0 ? null : Math.round((gapBytes / measured) * 10000) / 100;
  return { gapBytes, gapPct };
}

function toStatusCounts(rows: Array<{ status: string; count: number | string }>) {
  return Object.fromEntries(rows.map((row) => [row.status.toLowerCase(), Number(row.count)]));
}

@Injectable()
export class DashboardService {
  constructor(@Inject(DB_TOKEN) private readonly db: DbClient) {}

  async getGlobal(query: DashboardQuery) {
    const period = resolvePeriod(query, query.timezone ?? 'UTC');
    const [[{ totalAreas }], [{ totalShips }], [{ totalDevices }]] = await Promise.all([
      this.db.select({ totalAreas: count(areas.id) }).from(areas).where(isNull(areas.deletedAt)),
      this.db.select({ totalShips: count(ships.id) }).from(ships).where(isNull(ships.deletedAt)),
      this.db.select({ totalDevices: count(devices.id) }).from(devices).where(isNull(devices.deletedAt)),
    ]);
    const shipStatusRows = await this.db
      .select({ status: ships.status, count: count(ships.id) })
      .from(ships)
      .where(isNull(ships.deletedAt))
      .groupBy(ships.status);
    const statusCounts = toStatusCounts(shipStatusRows);
    const warnings = makeTelemetryWarnings(
      'INSUFFICIENT_DATA',
      'Telemetry collectors are not configured; traffic metrics are intentionally unavailable.',
    );

    return {
      data: {
        scope: { type: 'GLOBAL' },
        period,
        units: DASHBOARD_UNITS,
        data_status: 'INSUFFICIENT_DATA',
        availability: makeUnavailableAvailability('INSUFFICIENT_DATA'),
        data_quality: makeDataQuality(),
        total_areas: Number(totalAreas),
        total_ships: Number(totalShips),
        total_devices: Number(totalDevices),
        online_ships: statusCounts.active ?? 0,
        degraded_ships: statusCounts.maintenance ?? 0,
        offline_ships: 0,
        total_wan_throughput: null,
        active_crew_users: null,
        traffic: { wan_download_bytes: null, wan_upload_bytes: null, crew_bytes: null, business_bytes: null },
      },
      meta: makeDashboardMeta(period, warnings),
    };
  }

  async getArea(areaId: string, query: DashboardQuery) {
    const area = await this.db.query.areas.findFirst({ where: and(eq(areas.id, areaId), isNull(areas.deletedAt)) });
    if (!area) throw new ApiException('AREA_NOT_FOUND', `Area ${areaId} not found`);
    const rows = await this.db
      .select({ id: ships.id, code: ships.code, name: ships.name, status: ships.status, timezone: ships.timezone })
      .from(ships)
      .where(and(eq(ships.areaId, areaId), isNull(ships.deletedAt)))
      .orderBy(ships.name);
    const period = resolvePeriod(query, query.timezone ?? area.timezone);
    const warnings = makeTelemetryWarnings('INSUFFICIENT_DATA', 'Telemetry collectors are not configured for this area.');

    return {
      data: {
        scope: { type: 'AREA', id: area.id },
        area: { id: area.id, code: area.code, name: area.name, timezone: area.timezone },
        period,
        units: DASHBOARD_UNITS,
        data_status: 'INSUFFICIENT_DATA',
        availability: makeUnavailableAvailability('INSUFFICIENT_DATA'),
        data_quality: makeDataQuality(),
        inventory: { ship_count: rows.length, active_ships: rows.filter((r) => r.status === 'ACTIVE').length },
        ships: rows.map((row) => ({ id: row.id, code: row.code, name: row.name, status: row.status, timezone: row.timezone })),
        traffic: { wan_download_bytes: null, wan_upload_bytes: null, crew_bytes: null, business_bytes: null },
      },
      meta: makeDashboardMeta(period, warnings),
    };
  }

  async getShip(shipId: string, query: DashboardQuery) {
    const ship = await this.db.query.ships.findFirst({ where: and(eq(ships.id, shipId), isNull(ships.deletedAt)) });
    if (!ship) throw new ApiException('SHIP_NOT_FOUND', `Ship ${shipId} not found`);
    const area = await this.db.query.areas.findFirst({ where: eq(areas.id, ship.areaId) });
    const deviceStatusRows = await this.db
      .select({ status: devices.status, count: count(devices.id) })
      .from(devices)
      .where(and(eq(devices.shipId, shipId), isNull(devices.deletedAt)))
      .groupBy(devices.status);
    const deviceCounts = toStatusCounts(deviceStatusRows);
    const period = resolvePeriod(query, query.timezone ?? ship.timezone);
    const warnings = makeTelemetryWarnings('INSUFFICIENT_DATA', 'Telemetry collectors are not configured for this ship.');

    return {
      data: {
        scope: { type: 'SHIP', id: ship.id },
        ship: {
          id: ship.id,
          code: ship.code,
          name: ship.name,
          area: area ? { id: area.id, code: area.code, name: area.name } : null,
          status: ship.status,
          timezone: ship.timezone,
        },
        period,
        units: DASHBOARD_UNITS,
        data_status: 'INSUFFICIENT_DATA',
        availability: makeUnavailableAvailability('INSUFFICIENT_DATA'),
        data_quality: makeDataQuality(),
        connectivity: {
          management_vpn: { status: 'UNKNOWN', handshake_age_seconds: null, rtt_ms: null, loss_pct: null },
          devices: {
            total: Object.values(deviceCounts).reduce((sum, value) => sum + value, 0),
            online: deviceCounts.online ?? 0,
            degraded: deviceCounts.degraded ?? 0,
            offline: deviceCounts.offline ?? 0,
          },
        },
        wan: [],
        crew: {
          active_sessions: null,
          total_users: null,
          download_bytes: null,
          upload_bytes: null,
          users_near_quota: null,
          users_over_quota: null,
          users_without_accounting: null,
        },
        business: { download_bytes: null, upload_bytes: null, active_devices: null, identified_pct: null },
        reconciliation_summary: { status: 'UNAVAILABLE', crew_gap_pct: null, wan_gap_pct: null, data_quality_score: null, top_gap_reason: null },
        alerts: { critical: 0, major: 0, warning: 0 },
        status: ship.status,
        wan_rx: null,
        wan_tx: null,
        active_crew_users: null,
        crew_usage: null,
        business_usage: null,
      },
      meta: makeDashboardMeta(period, warnings),
    };
  }
}

@Injectable()
export class ReconciliationService {
  constructor(@Inject(DB_TOKEN) private readonly db: DbClient) {}

  private async assertShip(shipId: string) {
    const ship = await this.db.query.ships.findFirst({ where: and(eq(ships.id, shipId), isNull(ships.deletedAt)) });
    if (!ship) throw new ApiException('SHIP_NOT_FOUND', `Ship ${shipId} not found`);
    return ship;
  }

  private unavailable(period: DashboardPeriod, extraMissing: string[] = []) {
    throw new ApiException('RECONCILIATION_UNAVAILABLE', 'Reconciliation telemetry is not available', {
      missing_sources: [...new Set([...TELEMETRY_MISSING_SOURCES, ...extraMissing])],
      period,
      formula_version: RECON_FORMULA_VERSION,
    });
  }

  async getSummary(shipId: string, query: DashboardQuery) {
    const ship = await this.assertShip(shipId);
    const period = resolvePeriod(query, query.timezone ?? ship.timezone);
    const from = new Date(period.from);
    const to = new Date(period.to);

    const [wan, crewPort, business, management] = await Promise.all([
      sumZoneBytes(this.db, shipId, 'WAN_INPUT', from, to),
      sumZoneBytes(this.db, shipId, 'CREW_ACCESS', from, to),
      sumZoneBytes(this.db, shipId, 'BUSINESS_ACCESS', from, to),
      sumZoneBytes(this.db, shipId, 'MANAGEMENT', from, to),
    ]);

    // Genuinely no interface_counter telemetry at all for this ship/period — cannot compute
    // anything, so this is the one case that stays a hard 422 rather than a data-quality flag.
    if (wan.rowCount === 0 && crewPort.rowCount === 0 && business.rowCount === 0 && management.rowCount === 0) {
      this.unavailable(period);
    }

    const [crewUserRow] = await this.db
      .select({
        ul: sql<string | null>`sum(${radiusSessions.uploadBytes})`,
        dl: sql<string | null>`sum(${radiusSessions.downloadBytes})`,
        rowCount: count(radiusSessions.id),
        withoutStop: sql<string>`sum(case when ${radiusSessions.stopTime} is null then 1 else 0 end)`,
      })
      .from(radiusSessions)
      .where(and(eq(radiusSessions.shipId, shipId), lte(radiusSessions.startTime, to), sql`(${radiusSessions.stopTime} is null or ${radiusSessions.stopTime} >= ${from})`));
    const crewUserDl = crewUserRow?.rowCount && Number(crewUserRow.rowCount) > 0 && crewUserRow.dl !== null ? Number(crewUserRow.dl) : null;
    const crewUserUl = crewUserRow?.rowCount && Number(crewUserRow.rowCount) > 0 && crewUserRow.ul !== null ? Number(crewUserRow.ul) : null;

    const crewDownloadGap = computeGap(crewPort.downloadBytes, crewUserDl);
    const crewUploadGap = computeGap(crewPort.uploadBytes, crewUserUl);

    const countedSum = (a: number | null, b: number | null, c: number | null) => (a === null && b === null && c === null ? null : (a ?? 0) + (b ?? 0) + (c ?? 0));
    const countedDl = countedSum(crewPort.downloadBytes, business.downloadBytes, management.downloadBytes);
    const countedUl = countedSum(crewPort.uploadBytes, business.uploadBytes, management.uploadBytes);
    const wanDownloadGap = computeGap(wan.downloadBytes, countedDl);
    const wanUploadGap = computeGap(wan.uploadBytes, countedUl);

    const unattributedBytes =
      wanDownloadGap.gapBytes !== null && wanUploadGap.gapBytes !== null ? wanDownloadGap.gapBytes + wanUploadGap.gapBytes : null;

    // Only ONE attribution rule is implemented in this phase: counter resets are called out by
    // evidence but their byte contribution is not separately estimated (that needs a
    // reset-duration model this phase does not build) — the whole gap is honestly left in
    // unattributed_bytes rather than a fabricated split across ADR-11's ten reason codes. See the
    // final phase report for what a full attribution engine would add.
    const [resetRow] = await this.db
      .select({ resets: sql<string>`sum(case when ${interfaceCounterDeltas.counterReset} then 1 else 0 end)` })
      .from(interfaceCounterDeltas)
      .where(and(eq(interfaceCounterDeltas.shipId, shipId), gte(interfaceCounterDeltas.bucket, from), lte(interfaceCounterDeltas.bucket, to)));
    const counterResets = Number(resetRow?.resets ?? 0);
    const gapReasons =
      counterResets > 0
        ? [{ code: 'COUNTER_RESET', estimated_bytes: null, confidence: 0.3, evidence: { counter_resets: counterResets } }]
        : [];

    const dataScore =
      wanDownloadGap.gapPct !== null ? Math.max(0, Math.min(1, 1 - Math.abs(wanDownloadGap.gapPct) / 100)) : null;

    return {
      data: {
        period,
        units: DASHBOARD_UNITS,
        data_status: 'AVAILABLE',
        formula_version: RECON_FORMULA_VERSION,
        wan: { download_bytes: wan.downloadBytes, upload_bytes: wan.uploadBytes },
        crew: {
          port_download_bytes: crewPort.downloadBytes,
          port_upload_bytes: crewPort.uploadBytes,
          user_download_bytes: crewUserDl,
          user_upload_bytes: crewUserUl,
        },
        business: { download_bytes: business.downloadBytes, upload_bytes: business.uploadBytes },
        management: { download_bytes: management.downloadBytes, upload_bytes: management.uploadBytes },
        gaps: {
          crew_download_gap_bytes: crewDownloadGap.gapBytes,
          crew_download_gap_pct: crewDownloadGap.gapPct,
          crew_upload_gap_bytes: crewUploadGap.gapBytes,
          crew_upload_gap_pct: crewUploadGap.gapPct,
          wan_download_gap_bytes: wanDownloadGap.gapBytes,
          wan_download_gap_pct: wanDownloadGap.gapPct,
          wan_upload_gap_bytes: wanUploadGap.gapBytes,
          wan_upload_gap_pct: wanUploadGap.gapPct,
        },
        gap_reasons: gapReasons,
        unattributed_bytes: unattributedBytes,
        data_quality: {
          score: dataScore,
          status: wan.rowCount > 0 && crewPort.rowCount > 0 ? 'AVAILABLE' : 'PARTIAL',
          missing_sources: [
            ...(wan.rowCount === 0 ? ['interface_counters:WAN_INPUT'] : []),
            ...(crewPort.rowCount === 0 ? ['interface_counters:CREW_ACCESS'] : []),
            ...(crewUserRow?.rowCount === undefined || Number(crewUserRow.rowCount) === 0 ? ['radius_accounting'] : []),
          ],
          counter_resets: counterResets,
          missing_buckets: null,
          radius_sessions_without_stop: Number(crewUserRow?.withoutStop ?? 0),
        },
      },
      meta: makeDashboardMeta(period, []),
    };
  }

  /**
   * Bản tổng toàn hạm đội của getSummary() -- KHÔNG lặp N+1 theo từng tàu: 1 query group theo
   * (ship_id, accounting_group) dùng đúng quy ước hướng byte của byInterfaceGroup()/getTimeseries()
   * (case-when theo accounting_group), rồi cộng dồn ở tầng JS. Trả cả tổng hạm đội (cho "tổng
   * data") lẫn breakdown từng tàu sắp theo |độ lệch| giảm dần (cho "độ lệch" — tàu nào lệch nhiều
   * nhất hiện lên đầu).
   */
  async getGlobalSummary(query: DashboardQuery) {
    const period = resolvePeriod(query, query.timezone ?? 'UTC');
    const from = new Date(period.from);
    const to = new Date(period.to);

    const directionCase = sql<string>`case when ${interfaceCounterDeltas.accountingGroup} = 'WAN_INPUT' then ${interfaceCounterDeltas.dRxBytes} else ${interfaceCounterDeltas.dTxBytes} end`;
    const oppositeCase = sql<string>`case when ${interfaceCounterDeltas.accountingGroup} = 'WAN_INPUT' then ${interfaceCounterDeltas.dTxBytes} else ${interfaceCounterDeltas.dRxBytes} end`;

    const rows = await this.db
      .select({
        shipId: interfaceCounterDeltas.shipId,
        shipCode: ships.code,
        shipName: ships.name,
        accountingGroup: interfaceCounterDeltas.accountingGroup,
        downloadBytes: sql<string>`sum(${directionCase})`,
        uploadBytes: sql<string>`sum(${oppositeCase})`,
        rowCount: count(interfaceCounterDeltas.id),
      })
      .from(interfaceCounterDeltas)
      .innerJoin(ships, eq(ships.id, interfaceCounterDeltas.shipId))
      .where(and(gte(interfaceCounterDeltas.bucket, from), lte(interfaceCounterDeltas.bucket, to), isNull(ships.deletedAt)))
      .groupBy(interfaceCounterDeltas.shipId, ships.code, ships.name, interfaceCounterDeltas.accountingGroup);

    if (rows.length === 0) this.unavailable(period);

    type ZoneAgg = { downloadBytes: number | null; uploadBytes: number | null; rowCount: number };
    const byShip = new Map<string, { code: string; name: string; zones: Record<string, ZoneAgg> }>();
    for (const row of rows) {
      if (!byShip.has(row.shipId)) byShip.set(row.shipId, { code: row.shipCode, name: row.shipName, zones: {} });
      byShip.get(row.shipId)!.zones[row.accountingGroup] = {
        downloadBytes: Number(row.downloadBytes),
        uploadBytes: Number(row.uploadBytes),
        rowCount: Number(row.rowCount),
      };
    }

    const zoneOrNull = (zones: Record<string, ZoneAgg>, group: string): ZoneAgg => zones[group] ?? { downloadBytes: null, uploadBytes: null, rowCount: 0 };
    const countedSum = (a: number | null, b: number | null, c: number | null) =>
      a === null && b === null && c === null ? null : (a ?? 0) + (b ?? 0) + (c ?? 0);

    // Byte RADIUS theo user, toàn hạm đội (không lọc shipId) -- mẫu số cho độ lệch CREW.
    const [crewUserRow] = await this.db
      .select({
        ul: sql<string | null>`sum(${radiusSessions.uploadBytes})`,
        dl: sql<string | null>`sum(${radiusSessions.downloadBytes})`,
        rowCount: count(radiusSessions.id),
      })
      .from(radiusSessions)
      .innerJoin(ships, eq(ships.id, radiusSessions.shipId))
      .where(and(isNull(ships.deletedAt), lte(radiusSessions.startTime, to), sql`(${radiusSessions.stopTime} is null or ${radiusSessions.stopTime} >= ${from})`));
    const crewUserDl = crewUserRow?.rowCount && Number(crewUserRow.rowCount) > 0 && crewUserRow.dl !== null ? Number(crewUserRow.dl) : null;
    const crewUserUl = crewUserRow?.rowCount && Number(crewUserRow.rowCount) > 0 && crewUserRow.ul !== null ? Number(crewUserRow.ul) : null;

    const shipsBreakdown = [...byShip.entries()]
      .map(([shipId, s]) => {
        const wan = zoneOrNull(s.zones, 'WAN_INPUT');
        const crew = zoneOrNull(s.zones, 'CREW_ACCESS');
        const business = zoneOrNull(s.zones, 'BUSINESS_ACCESS');
        const management = zoneOrNull(s.zones, 'MANAGEMENT');
        const countedDl = countedSum(crew.downloadBytes, business.downloadBytes, management.downloadBytes);
        const countedUl = countedSum(crew.uploadBytes, business.uploadBytes, management.uploadBytes);
        const dlGap = computeGap(wan.downloadBytes, countedDl);
        const ulGap = computeGap(wan.uploadBytes, countedUl);
        return {
          ship_id: shipId,
          ship_code: s.code,
          ship_name: s.name,
          wan_download_bytes: wan.downloadBytes,
          wan_upload_bytes: wan.uploadBytes,
          counted_download_bytes: countedDl,
          counted_upload_bytes: countedUl,
          wan_download_gap_bytes: dlGap.gapBytes,
          wan_download_gap_pct: dlGap.gapPct,
          wan_upload_gap_bytes: ulGap.gapBytes,
          wan_upload_gap_pct: ulGap.gapPct,
        };
      })
      .sort((a, b) => Math.abs(b.wan_download_gap_pct ?? 0) - Math.abs(a.wan_download_gap_pct ?? 0));

    const fleetZoneTotal = (group: string) => {
      let dl = 0;
      let ul = 0;
      let any = false;
      for (const s of byShip.values()) {
        const z = s.zones[group];
        if (z) {
          any = true;
          dl += z.downloadBytes ?? 0;
          ul += z.uploadBytes ?? 0;
        }
      }
      return any ? { downloadBytes: dl, uploadBytes: ul } : { downloadBytes: null, uploadBytes: null };
    };
    const fleetWan = fleetZoneTotal('WAN_INPUT');
    const fleetCrew = fleetZoneTotal('CREW_ACCESS');
    const fleetBusiness = fleetZoneTotal('BUSINESS_ACCESS');
    const fleetManagement = fleetZoneTotal('MANAGEMENT');
    const fleetCountedDl = countedSum(fleetCrew.downloadBytes, fleetBusiness.downloadBytes, fleetManagement.downloadBytes);
    const fleetCountedUl = countedSum(fleetCrew.uploadBytes, fleetBusiness.uploadBytes, fleetManagement.uploadBytes);
    const fleetWanDlGap = computeGap(fleetWan.downloadBytes, fleetCountedDl);
    const fleetWanUlGap = computeGap(fleetWan.uploadBytes, fleetCountedUl);
    const fleetCrewDlGap = computeGap(fleetCrew.downloadBytes, crewUserDl);
    const fleetCrewUlGap = computeGap(fleetCrew.uploadBytes, crewUserUl);
    const totalBytes = fleetWan.downloadBytes !== null && fleetWan.uploadBytes !== null ? fleetWan.downloadBytes + fleetWan.uploadBytes : null;

    return {
      data: {
        period,
        units: DASHBOARD_UNITS,
        data_status: 'AVAILABLE',
        formula_version: RECON_FORMULA_VERSION,
        ship_count: byShip.size,
        fleet: {
          total_bytes: totalBytes,
          wan: { download_bytes: fleetWan.downloadBytes, upload_bytes: fleetWan.uploadBytes },
          crew: { port_download_bytes: fleetCrew.downloadBytes, port_upload_bytes: fleetCrew.uploadBytes, user_download_bytes: crewUserDl, user_upload_bytes: crewUserUl },
          business: { download_bytes: fleetBusiness.downloadBytes, upload_bytes: fleetBusiness.uploadBytes },
          management: { download_bytes: fleetManagement.downloadBytes, upload_bytes: fleetManagement.uploadBytes },
          gaps: {
            wan_download_gap_bytes: fleetWanDlGap.gapBytes,
            wan_download_gap_pct: fleetWanDlGap.gapPct,
            wan_upload_gap_bytes: fleetWanUlGap.gapBytes,
            wan_upload_gap_pct: fleetWanUlGap.gapPct,
            crew_download_gap_bytes: fleetCrewDlGap.gapBytes,
            crew_download_gap_pct: fleetCrewDlGap.gapPct,
            crew_upload_gap_bytes: fleetCrewUlGap.gapBytes,
            crew_upload_gap_pct: fleetCrewUlGap.gapPct,
          },
        },
        ships: shipsBreakdown,
      },
      meta: makeDashboardMeta(period, []),
    };
  }

  async getByWan(shipId: string, query: DashboardQuery) {
    const ship = await this.assertShip(shipId);
    const period = resolvePeriod(query, query.timezone ?? ship.timezone);
    return this.byInterfaceGroup(shipId, period, 'WAN_INPUT');
  }

  async getByInterface(shipId: string, query: DashboardQuery) {
    const ship = await this.assertShip(shipId);
    const period = resolvePeriod(query, query.timezone ?? ship.timezone);
    return this.byInterfaceGroup(shipId, period, null);
  }

  private async byInterfaceGroup(shipId: string, period: DashboardPeriod, accountingGroup: string | null) {
    const from = new Date(period.from);
    const to = new Date(period.to);
    const directionCase = sql<string>`case when ${interfaceCounterDeltas.accountingGroup} = 'WAN_INPUT' then ${interfaceCounterDeltas.dRxBytes} else ${interfaceCounterDeltas.dTxBytes} end`;
    const oppositeCase = sql<string>`case when ${interfaceCounterDeltas.accountingGroup} = 'WAN_INPUT' then ${interfaceCounterDeltas.dTxBytes} else ${interfaceCounterDeltas.dRxBytes} end`;
    const rows = await this.db
      .select({
        interfaceId: interfaceCounterDeltas.interfaceId,
        name: interfaces.name,
        accountingGroup: interfaceCounterDeltas.accountingGroup,
        downloadBytes: sql<string>`sum(${directionCase})`,
        uploadBytes: sql<string>`sum(${oppositeCase})`,
        counterResets: sql<string>`sum(case when ${interfaceCounterDeltas.counterReset} then 1 else 0 end)`,
      })
      .from(interfaceCounterDeltas)
      .innerJoin(interfaces, eq(interfaces.id, interfaceCounterDeltas.interfaceId))
      .where(
        and(
          eq(interfaceCounterDeltas.shipId, shipId),
          gte(interfaceCounterDeltas.bucket, from),
          lte(interfaceCounterDeltas.bucket, to),
          ...(accountingGroup ? [eq(interfaceCounterDeltas.accountingGroup, accountingGroup as any)] : []),
        ),
      )
      .groupBy(interfaceCounterDeltas.interfaceId, interfaces.name, interfaceCounterDeltas.accountingGroup);

    if (rows.length === 0) this.unavailable(period);

    return {
      data: {
        period,
        units: DASHBOARD_UNITS,
        data_status: 'AVAILABLE',
        formula_version: RECON_FORMULA_VERSION,
        interfaces: rows.map((r) => ({
          interface_id: r.interfaceId,
          name: r.name,
          accounting_group: r.accountingGroup,
          download_bytes: Number(r.downloadBytes),
          upload_bytes: Number(r.uploadBytes),
          counter_resets: Number(r.counterResets),
        })),
      },
      meta: makeDashboardMeta(period, []),
    };
  }

  async getByZone(shipId: string, query: DashboardQuery) {
    const ship = await this.assertShip(shipId);
    const period = resolvePeriod(query, query.timezone ?? ship.timezone);
    const from = new Date(period.from);
    const to = new Date(period.to);
    const groups = ['WAN_INPUT', 'CREW_ACCESS', 'BUSINESS_ACCESS', 'MANAGEMENT'];
    const totals = await Promise.all(groups.map((g) => sumZoneBytes(this.db, shipId, g, from, to)));
    if (totals.every((t) => t.rowCount === 0)) this.unavailable(period);

    return {
      data: {
        period,
        units: DASHBOARD_UNITS,
        data_status: 'AVAILABLE',
        formula_version: RECON_FORMULA_VERSION,
        zones: groups.map((g, i) => ({
          accounting_group: g,
          download_bytes: totals[i].downloadBytes,
          upload_bytes: totals[i].uploadBytes,
        })),
      },
      meta: makeDashboardMeta(period, []),
    };
  }

  async getRawRecords(shipId: string, query: RawRecordsQuery) {
    const ship = await this.assertShip(shipId);
    const period = resolvePeriod(query, query.timezone ?? ship.timezone);
    const from = new Date(period.from);
    const to = new Date(period.to);
    const offset = decodeCursor(query.cursor);

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(interfaceCounterSamples)
        .where(and(eq(interfaceCounterSamples.shipId, shipId), gte(interfaceCounterSamples.observedAt, from), lte(interfaceCounterSamples.observedAt, to)))
        .orderBy(desc(interfaceCounterSamples.observedAt))
        .limit(query.limit)
        .offset(offset),
      this.db
        .select({ total: count(interfaceCounterSamples.id) })
        .from(interfaceCounterSamples)
        .where(and(eq(interfaceCounterSamples.shipId, shipId), gte(interfaceCounterSamples.observedAt, from), lte(interfaceCounterSamples.observedAt, to))),
    ]);

    if (rows.length === 0 && offset === 0) this.unavailable(period);

    return {
      data: {
        period,
        units: DASHBOARD_UNITS,
        source: 'interface_counter_samples',
        records: rows.map((r) => ({
          id: r.id,
          interface_id: r.interfaceId,
          observed_at: r.observedAt.toISOString(),
          rx_bytes: r.rxBytes,
          tx_bytes: r.txBytes,
          counter_source: r.counterSource,
          parser_version: r.parserVersion,
        })),
      },
      meta: { ...buildPageMeta(offset, query.limit, rows.length, Number(total)), warnings: [] },
    };
  }

  async getTimeseries(shipId: string, query: DashboardQuery) {
    const ship = await this.assertShip(shipId);
    const period = resolvePeriod(query, query.timezone ?? ship.timezone);
    const from = new Date(period.from);
    const to = new Date(period.to);
    const bucket = bucketSql(interfaceCounterDeltas.bucket, period.granularity, period.timezone);

    const rows = await this.db
      .select({
        bucket,
        accountingGroup: interfaceCounterDeltas.accountingGroup,
        downloadBytes: sql<string>`sum(case when ${interfaceCounterDeltas.accountingGroup} = 'WAN_INPUT' then ${interfaceCounterDeltas.dRxBytes} else ${interfaceCounterDeltas.dTxBytes} end)`,
        uploadBytes: sql<string>`sum(case when ${interfaceCounterDeltas.accountingGroup} = 'WAN_INPUT' then ${interfaceCounterDeltas.dTxBytes} else ${interfaceCounterDeltas.dRxBytes} end)`,
      })
      .from(interfaceCounterDeltas)
      .where(and(eq(interfaceCounterDeltas.shipId, shipId), gte(interfaceCounterDeltas.bucket, from), lte(interfaceCounterDeltas.bucket, to)))
      .groupBy(bucket, interfaceCounterDeltas.accountingGroup)
      .orderBy(bucket);

    if (rows.length === 0) this.unavailable(period);

    const byBucket = new Map<string, Record<string, { download_bytes: number; upload_bytes: number }>>();
    for (const row of rows) {
      const key = toDate(row.bucket)!.toISOString();
      if (!byBucket.has(key)) byBucket.set(key, {});
      byBucket.get(key)![row.accountingGroup] = { download_bytes: Number(row.downloadBytes), upload_bytes: Number(row.uploadBytes) };
    }

    return {
      data: {
        period,
        units: DASHBOARD_UNITS,
        data_status: 'AVAILABLE',
        formula_version: RECON_FORMULA_VERSION,
        points: [...byBucket.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([bucketIso, groups]) => ({
            bucket: bucketIso,
            wan: groups.WAN_INPUT ?? null,
            crew: groups.CREW_ACCESS ?? null,
            business: groups.BUSINESS_ACCESS ?? null,
            management: groups.MANAGEMENT ?? null,
          })),
      },
      meta: makeDashboardMeta(period, []),
    };
  }
}
