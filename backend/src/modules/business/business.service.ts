import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';
import { ApiException } from '@common/api-exception';
import { buildPageMeta, decodeCursor } from '@common/pagination';
import { resolvePeriod } from '@common/period';
import { toDate } from '@common/sql-date';
import { DB_TOKEN, DbClient } from '@db/db.module';
import { interfaceCounterDeltas, interfaces, ipfixFlowRecords, ships } from '@db/schema';
import { bucketSql } from '@telemetry-normalize/aggregation';
import { BUSINESS_UNITS, businessIdentityCapability, CLASSIFICATION_NO_DNS_MATCH_REASON, DataQuality } from './contract';
import { BusinessQuery, BusinessRawRecordsQuery } from './dto';

@Injectable()
export class BusinessService {
  constructor(@Inject(DB_TOKEN) private readonly db: DbClient) {}

  private async assertShip(shipId: string) {
    const ship = await this.db.query.ships.findFirst({ where: eq(ships.id, shipId) });
    if (!ship) throw new ApiException('SHIP_NOT_FOUND', `Ship ${shipId} not found`);
    return ship;
  }

  async listDevices(shipId: string, query: BusinessQuery) {
    const ship = await this.assertShip(shipId);
    const period = resolvePeriod(query, query.timezone ?? ship.timezone);
    const from = new Date(period.from);
    const to = new Date(period.to);

    const rows = await this.db
      .select({
        srcIp: ipfixFlowRecords.srcIp,
        srcMac: ipfixFlowRecords.srcMac,
        vlanId: ipfixFlowRecords.vlanId,
        totalBytes: sql<string>`sum(${ipfixFlowRecords.bytes})`,
        flowCount: count(ipfixFlowRecords.id),
        firstSeen: sql<Date>`min(${ipfixFlowRecords.observedAt})`,
        lastSeen: sql<Date>`max(${ipfixFlowRecords.observedAt})`,
      })
      .from(ipfixFlowRecords)
      .innerJoin(interfaces, eq(interfaces.id, ipfixFlowRecords.inInterfaceId))
      .where(
        and(
          eq(ipfixFlowRecords.shipId, shipId),
          eq(interfaces.accountingGroup, 'BUSINESS_ACCESS'),
          gte(ipfixFlowRecords.observedAt, from),
          lte(ipfixFlowRecords.observedAt, to),
        ),
      )
      .groupBy(ipfixFlowRecords.srcIp, ipfixFlowRecords.srcMac, ipfixFlowRecords.vlanId)
      .orderBy(desc(sql`sum(${ipfixFlowRecords.bytes})`));

    const devices = rows.map((row) => ({
      ip: row.srcIp,
      mac: row.srcMac,
      vlan_id: row.vlanId,
      // Direction split is not reliably derivable from a single-leg IPFIX bytes counter without
      // ingress/egress interface pairing (not implemented) — total_bytes is real, the
      // upload/download split is intentionally null rather than guessed.
      download_bytes: null,
      upload_bytes: null,
      total_bytes: Number(row.totalBytes),
      flow_count: Number(row.flowCount),
      first_seen_at: toDate(row.firstSeen)?.toISOString() ?? null,
      last_seen_at: toDate(row.lastSeen)?.toISOString() ?? null,
      identity_capability: businessIdentityCapability(),
    }));

    const dataQuality: DataQuality = {
      score: null,
      status: devices.length > 0 ? 'AVAILABLE' : 'INSUFFICIENT_DATA',
      missing_sources: devices.length > 0 ? [] : ['ipfix'],
    };

    return {
      data: {
        period,
        units: BUSINESS_UNITS,
        source: 'ipfix_flow_records',
        data_status: dataQuality.status,
        data_quality: dataQuality,
        identity_capability: businessIdentityCapability(),
        top_device: devices[0] ?? null,
        devices,
      },
      meta: {
        data_freshness_seconds: null,
        freshness_by_source: { ipfix: null },
        warnings: devices.length === 0 ? [{ code: 'INSUFFICIENT_DATA', message: 'No BUSINESS-zone IPFIX flow records found for this ship in the requested period.' }] : [],
      },
    };
  }

  async getUsage(shipId: string, query: BusinessQuery) {
    const ship = await this.assertShip(shipId);
    const period = resolvePeriod(query, query.timezone ?? ship.timezone);
    const from = new Date(period.from);
    const to = new Date(period.to);
    const bucket = bucketSql(interfaceCounterDeltas.bucket, period.granularity, period.timezone);

    const rows = await this.db
      .select({
        bucket,
        downloadBytes: sql<string>`sum(${interfaceCounterDeltas.dTxBytes})`, // tx of *_ACCESS zone = download (ADR-09, applied by analogy from CREW_ACCESS)
        uploadBytes: sql<string>`sum(${interfaceCounterDeltas.dRxBytes})`,
        counterResets: sql<string>`sum(case when ${interfaceCounterDeltas.counterReset} then 1 else 0 end)`,
        degradedBuckets: sql<string>`sum(case when ${interfaceCounterDeltas.quality} = 'DEGRADED' then 1 else 0 end)`,
      })
      .from(interfaceCounterDeltas)
      .where(
        and(
          eq(interfaceCounterDeltas.shipId, shipId),
          eq(interfaceCounterDeltas.accountingGroup, 'BUSINESS_ACCESS'),
          gte(interfaceCounterDeltas.bucket, from),
          lte(interfaceCounterDeltas.bucket, to),
        ),
      )
      .groupBy(bucket)
      .orderBy(bucket);

    const points = rows.map((row) => ({
      bucket: toDate(row.bucket)!.toISOString(),
      download_bytes: Number(row.downloadBytes),
      upload_bytes: Number(row.uploadBytes),
      total_bytes: Number(row.downloadBytes) + Number(row.uploadBytes),
      counter_resets: Number(row.counterResets),
    }));

    const dataQuality: DataQuality = {
      score: null,
      status: points.length > 0 ? 'AVAILABLE' : 'INSUFFICIENT_DATA',
      missing_sources: points.length > 0 ? [] : ['interface_counters'],
    };

    return {
      data: {
        period,
        units: BUSINESS_UNITS,
        source: 'interface_counter_deltas',
        data_status: dataQuality.status,
        data_quality: dataQuality,
        points,
      },
      meta: {
        data_freshness_seconds: null,
        freshness_by_source: { interface_counters: null },
        warnings: points.length === 0 ? [{ code: 'INSUFFICIENT_DATA', message: 'No BUSINESS_ACCESS interface counter deltas found for this ship in the requested period.' }] : [],
      },
    };
  }

  async getFlowsSummary(shipId: string, query: BusinessQuery) {
    const ship = await this.assertShip(shipId);
    const period = resolvePeriod(query, query.timezone ?? ship.timezone);
    const from = new Date(period.from);
    const to = new Date(period.to);

    const appExpr = sql<string>`coalesce(${ipfixFlowRecords.app}, 'Khác')`;
    const [[totals], topDestinations, byApp, byDomain] = await Promise.all([
      this.db
        .select({ totalBytes: sql<string | null>`sum(${ipfixFlowRecords.bytes})`, flowCount: count(ipfixFlowRecords.id) })
        .from(ipfixFlowRecords)
        .where(and(eq(ipfixFlowRecords.shipId, shipId), gte(ipfixFlowRecords.observedAt, from), lte(ipfixFlowRecords.observedAt, to))),
      this.db
        .select({ dstIp: ipfixFlowRecords.dstIp, bytes: sql<string>`sum(${ipfixFlowRecords.bytes})`, flowCount: count(ipfixFlowRecords.id) })
        .from(ipfixFlowRecords)
        .where(and(eq(ipfixFlowRecords.shipId, shipId), gte(ipfixFlowRecords.observedAt, from), lte(ipfixFlowRecords.observedAt, to)))
        .groupBy(ipfixFlowRecords.dstIp)
        .orderBy(desc(sql`sum(${ipfixFlowRecords.bytes})`))
        .limit(10),
      // Byte theo dịch vụ — chỉ flow đã khớp DNS (classification_method='DNS'); domain biết nhưng
      // không khớp catalog nào gộp vào "Khác" thay vì rơi mất khỏi bảng này.
      this.db
        .select({ app: appExpr, bytes: sql<string>`sum(${ipfixFlowRecords.bytes})`, flowCount: count(ipfixFlowRecords.id) })
        .from(ipfixFlowRecords)
        .where(
          and(
            eq(ipfixFlowRecords.shipId, shipId),
            gte(ipfixFlowRecords.observedAt, from),
            lte(ipfixFlowRecords.observedAt, to),
            eq(ipfixFlowRecords.classificationMethod, 'DNS'),
          ),
        )
        .groupBy(appExpr)
        .orderBy(desc(sql`sum(${ipfixFlowRecords.bytes})`)),
      // Byte theo tên miền thật — chi tiết hơn by_app, top 10 theo byte.
      this.db
        .select({ domain: ipfixFlowRecords.domain, bytes: sql<string>`sum(${ipfixFlowRecords.bytes})`, flowCount: count(ipfixFlowRecords.id) })
        .from(ipfixFlowRecords)
        .where(
          and(
            eq(ipfixFlowRecords.shipId, shipId),
            gte(ipfixFlowRecords.observedAt, from),
            lte(ipfixFlowRecords.observedAt, to),
            isNotNull(ipfixFlowRecords.domain),
          ),
        )
        .groupBy(ipfixFlowRecords.domain)
        .orderBy(desc(sql`sum(${ipfixFlowRecords.bytes})`))
        .limit(10),
    ]);

    const totalBytes = totals?.totalBytes !== null && totals?.totalBytes !== undefined ? Number(totals.totalBytes) : null;
    const flowCount = Number(totals?.flowCount ?? 0);
    const classifiedBytes = byApp.reduce((sum, r) => sum + Number(r.bytes), 0);
    const unattributedBytes = totalBytes !== null ? totalBytes - classifiedBytes : null;

    const dataQuality: DataQuality = {
      score: null,
      status: flowCount > 0 ? 'AVAILABLE' : 'INSUFFICIENT_DATA',
      missing_sources: flowCount > 0 ? [] : ['ipfix'],
    };

    return {
      data: {
        period,
        units: BUSINESS_UNITS,
        source: 'ipfix_flow_records',
        data_status: dataQuality.status,
        data_quality: dataQuality,
        total_bytes: totalBytes,
        flow_count: flowCount,
        // DNS-based classifier thật (telemetry-normalize/classifier.ts) — 'DNS' khi có ít nhất 1
        // flow khớp log DNS trong kỳ này; 'UNKNOWN' khi không có (IP/ASN/TLS-SNI vẫn chưa làm).
        classification_method: classifiedBytes > 0 ? 'DNS' : 'UNKNOWN',
        unknown_reason: flowCount === 0 ? null : classifiedBytes > 0 ? null : CLASSIFICATION_NO_DNS_MATCH_REASON,
        unattributed_bytes: unattributedBytes,
        top_destinations: topDestinations.map((d) => ({ dst_ip: d.dstIp, bytes: Number(d.bytes), flow_count: Number(d.flowCount) })),
        by_app: byApp.map((r) => ({ app: r.app, bytes: Number(r.bytes), flow_count: Number(r.flowCount) })),
        by_domain: byDomain.map((r) => ({ domain: r.domain, bytes: Number(r.bytes), flow_count: Number(r.flowCount) })),
        identity_capability: businessIdentityCapability(),
      },
      meta: {
        data_freshness_seconds: null,
        freshness_by_source: { ipfix: null },
        warnings: flowCount === 0 ? [{ code: 'INSUFFICIENT_DATA', message: 'No IPFIX flow records found for this ship in the requested period.' }] : [],
      },
    };
  }

  async getUnknownFlows(shipId: string, query: BusinessRawRecordsQuery) {
    // Every flow is currently classification_method=UNKNOWN (no classifier implemented), so this
    // is, honestly, the same population as raw-records today — kept as a distinct endpoint
    // because the frontend contract calls for a dedicated "flows unknown" drill-down, and this is
    // where a real classifier's leftover-unknown bucket would live once one exists.
    return this.getRawRecords(shipId, query);
  }

  async getRawRecords(shipId: string, query: BusinessRawRecordsQuery) {
    const ship = await this.assertShip(shipId);
    const period = resolvePeriod(query, query.timezone ?? ship.timezone);
    const from = new Date(period.from);
    const to = new Date(period.to);
    const offset = decodeCursor(query.cursor);

    const filters = [
      eq(ipfixFlowRecords.shipId, shipId),
      gte(ipfixFlowRecords.observedAt, from),
      lte(ipfixFlowRecords.observedAt, to),
      ...(query.src_ip ? [eq(ipfixFlowRecords.srcIp, query.src_ip)] : []),
      ...(query.dst_ip ? [eq(ipfixFlowRecords.dstIp, query.dst_ip)] : []),
    ];

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(ipfixFlowRecords)
        .where(and(...filters))
        .orderBy(desc(ipfixFlowRecords.observedAt))
        .limit(query.limit)
        .offset(offset),
      this.db
        .select({ total: count(ipfixFlowRecords.id) })
        .from(ipfixFlowRecords)
        .where(and(...filters)),
    ]);

    return {
      data: {
        period,
        units: BUSINESS_UNITS,
        source: 'ipfix_flow_records',
        records: rows.map((r) => ({
          id: r.id,
          observed_at: r.observedAt.toISOString(),
          src_ip: r.srcIp,
          dst_ip: r.dstIp,
          src_port: r.srcPort,
          dst_port: r.dstPort,
          protocol: r.protocol,
          bytes: r.bytes,
          packets: r.packets,
          vlan_id: r.vlanId,
          src_mac: r.srcMac,
          classification_method: r.classificationMethod,
          unknown_reason: r.unknownReason,
          raw_event_id: r.rawEventId,
          parser_version: r.parserVersion,
        })),
        identity_capability: businessIdentityCapability(),
      },
      meta: {
        ...buildPageMeta(offset, query.limit, rows.length, Number(total)),
        warnings: rows.length === 0 ? [{ code: 'INSUFFICIENT_DATA', message: 'No IPFIX flow records match this query.' }] : [],
      },
    };
  }
}
