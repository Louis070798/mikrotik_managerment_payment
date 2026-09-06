import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { ApiException } from '@common/api-exception';
import { buildPageMeta, decodeCursor } from '@common/pagination';
import { resolvePeriod } from '@common/period';
import { DB_TOKEN, DbClient } from '@db/db.module';
import { devices, ipfixFlowRecords, packages, radiusAccountingEvents, radiusSessions, rawTelemetryEvents, ships, subscribers } from '@db/schema';
import { ServiceRegistry } from '@registry/service-registry.service';
import { filterByShipScope } from '@registry/ship-scope';
import { summarizeEndpointHealth } from '@health-checks/endpoint-summary';
import { serviceEndpoints, serviceHealthState } from '@db/schema';
import { toDate } from '@common/sql-date';
import { EnvCredentialResolver } from '@health-checks/credential-resolver';
import { RadiusCoaService } from '@radius-coa/radius-coa.service';
import { CREW_UNITS, crewIdentityCapability, DataQuality, displaySessionStatus, serviceUsageCapability, STALE_AFTER_SECONDS } from './contract';
import { CrewRawAccountingQuery, CrewSessionsQuery, CrewUsersQuery } from './dto';

const MIN_RADIUS_ENDPOINTS = 2;
const TELEMETRY_STALE_AFTER_SECONDS = 300;

@Injectable()
export class CrewService {
  private readonly credentials = new EnvCredentialResolver();

  constructor(
    @Inject(DB_TOKEN) private readonly db: DbClient,
    private readonly registry: ServiceRegistry,
    private readonly radiusCoa: RadiusCoaService,
  ) {}

  private async assertShip(shipId: string) {
    const ship = await this.db.query.ships.findFirst({ where: and(eq(ships.id, shipId), isNull(ships.deletedAt)) });
    if (!ship) throw new ApiException('SHIP_NOT_FOUND', `Ship ${shipId} not found`);
    return ship;
  }

  async listUsers(shipId: string, query: CrewUsersQuery) {
    const ship = await this.assertShip(shipId);
    const period = resolvePeriod(query, query.timezone ?? ship.timezone);
    const from = new Date(period.from);
    const to = new Date(period.to);
    const now = new Date();

    const [subscriberRows, sessionRows, appUsageRows, domainUsageRows, [netflowTotalRow]] = await Promise.all([
      // Goi cuoc that cua tung subscriber gan voi thiet bi cua TAU NAY -- co so de liet ke DAY DU
      // user cua tau (ke ca chua tung ket noi RADIUS lan nao), khong chi nhung username da thay
      // trong radius_sessions nhu truoc.
      this.db
        .select({
          username: subscribers.username,
          status: subscribers.status,
          quotaUsedBytes: subscribers.quotaUsedBytes,
          expiresAt: subscribers.expiresAt,
          packageId: packages.id,
          packageName: packages.name,
          packageQuotaGb: packages.quotaGb,
          packageDownMbps: packages.downMbps,
          packageUpMbps: packages.upMbps,
          packagePriceVnd: packages.priceVnd,
        })
        .from(subscribers)
        .innerJoin(devices, eq(devices.id, subscribers.nasDeviceId))
        .innerJoin(packages, eq(packages.id, subscribers.packageId))
        .where(and(eq(devices.shipId, shipId), isNull(subscribers.deletedAt)))
        .orderBy(subscribers.username),
      this.db
        .select({
          username: radiusSessions.username,
          sessionsCount: count(radiusSessions.id),
          uploadBytes: sql<string | null>`sum(${radiusSessions.uploadBytes})`,
          downloadBytes: sql<string | null>`sum(${radiusSessions.downloadBytes})`,
          anyActive: sql<boolean>`bool_or(${radiusSessions.status} = 'ACTIVE')`,
          lastActivityAt: sql<Date | null>`max(coalesce(${radiusSessions.stopTime}, ${radiusSessions.lastInterimAt}, ${radiusSessions.startTime}))`,
        })
        .from(radiusSessions)
        .where(
          and(
            eq(radiusSessions.shipId, shipId),
            lte(radiusSessions.startTime, to),
            or(isNull(radiusSessions.stopTime), gte(radiusSessions.stopTime, from)),
          ),
        )
        .groupBy(radiusSessions.username)
        .orderBy(radiusSessions.username),
      // Tầng "theo dịch vụ" — chỉ những flow đã khớp DNS VÀ khớp catalog (app khác null); domain
      // biết nhưng chưa có trong service-catalog.ts không xuất hiện ở đây (xem domain_usage).
      this.db
        .select({
          username: ipfixFlowRecords.identityUsername,
          app: ipfixFlowRecords.app,
          bytes: sql<string>`sum(${ipfixFlowRecords.bytes})`,
        })
        .from(ipfixFlowRecords)
        .where(
          and(
            eq(ipfixFlowRecords.shipId, shipId),
            gte(ipfixFlowRecords.observedAt, from),
            lte(ipfixFlowRecords.observedAt, to),
            isNotNull(ipfixFlowRecords.identityUsername),
            isNotNull(ipfixFlowRecords.app),
          ),
        )
        .groupBy(ipfixFlowRecords.identityUsername, ipfixFlowRecords.app),
      // Tầng "theo tên miền" — mọi domain đã khớp DNS bất kể có trong catalog hay không, chi tiết
      // hơn service_usage (vd thấy riêng googlevideo.com thay vì chỉ gộp "YouTube").
      this.db
        .select({
          username: ipfixFlowRecords.identityUsername,
          domain: ipfixFlowRecords.domain,
          bytes: sql<string>`sum(${ipfixFlowRecords.bytes})`,
        })
        .from(ipfixFlowRecords)
        .where(
          and(
            eq(ipfixFlowRecords.shipId, shipId),
            gte(ipfixFlowRecords.observedAt, from),
            lte(ipfixFlowRecords.observedAt, to),
            isNotNull(ipfixFlowRecords.identityUsername),
            isNotNull(ipfixFlowRecords.domain),
          ),
        )
        .groupBy(ipfixFlowRecords.identityUsername, ipfixFlowRecords.domain),
      // Tổng NetFlow đã gán được cho MỘT username thật — dùng để đối chiếu với RADIUS (billing
      // thật), không lọc theo classification_method vì đây là đối chiếu độ phủ đo lường, không
      // phải độ phủ phân loại (2 khái niệm khác nhau — xem billingReconciliation bên dưới).
      this.db
        .select({ totalBytes: sql<string | null>`sum(${ipfixFlowRecords.bytes})` })
        .from(ipfixFlowRecords)
        .where(
          and(
            eq(ipfixFlowRecords.shipId, shipId),
            gte(ipfixFlowRecords.observedAt, from),
            lte(ipfixFlowRecords.observedAt, to),
            isNotNull(ipfixFlowRecords.identityUsername),
          ),
        ),
    ]);

    const appUsageByUser = new Map<string, Array<{ app: string; bytes: number }>>();
    for (const r of appUsageRows) {
      if (!r.username || !r.app) continue;
      const arr = appUsageByUser.get(r.username) ?? [];
      arr.push({ app: r.app, bytes: Number(r.bytes) });
      appUsageByUser.set(r.username, arr);
    }
    for (const arr of appUsageByUser.values()) arr.sort((a, b) => b.bytes - a.bytes);

    const domainUsageByUser = new Map<string, Array<{ domain: string; bytes: number }>>();
    for (const r of domainUsageRows) {
      if (!r.username || !r.domain) continue;
      const arr = domainUsageByUser.get(r.username) ?? [];
      arr.push({ domain: r.domain, bytes: Number(r.bytes) });
      domainUsageByUser.set(r.username, arr);
    }
    for (const arr of domainUsageByUser.values()) {
      arr.sort((a, b) => b.bytes - a.bytes);
      arr.length = Math.min(arr.length, 20); // trần payload — top 20 domain/user, đủ để thấy bức tranh thật
    }

    const sessionByUser = new Map(sessionRows.map((r) => [r.username, r]));
    const subscriberByUser = new Map(subscriberRows.map((r) => [r.username, r]));
    // Hop nhat username: subscriber gan voi thiet bi cua tau nay (kha nang chua tung ket noi) UNION
    // voi username thay trong radius_sessions nhung khong (con) co subscriber tuong ung (vd subscriber
    // da bi xoa nhung session cu van con) -- khong bo sot ben nao.
    const usernames = new Set<string>();
    subscriberRows.forEach((r) => usernames.add(r.username));
    sessionRows.forEach((r) => {
      if (r.username) usernames.add(r.username);
    });

    const users = [...usernames]
      .sort()
      .map((username) => {
        const sub = subscriberByUser.get(username);
        const session = sessionByUser.get(username);
        const uploadBytes = session?.uploadBytes == null ? null : Number(session.uploadBytes);
        const downloadBytes = session?.downloadBytes == null ? null : Number(session.downloadBytes);
        const totalBytes = uploadBytes !== null && downloadBytes !== null ? uploadBytes + downloadBytes : null;
        const lastActivityAt = toDate(session?.lastActivityAt ?? null);
        return {
          username,
          status: session?.anyActive ? displaySessionStatus('ACTIVE', lastActivityAt, now) : 'INACTIVE',
          sessions_count: session ? Number(session.sessionsCount) : 0,
          access_count: session ? Number(session.sessionsCount) : 0,
          download_bytes: downloadBytes,
          upload_bytes: uploadBytes,
          total_bytes: totalBytes,
          last_seen_at: lastActivityAt ? lastActivityAt.toISOString() : null,
          service_usage: appUsageByUser.get(username) ?? [],
          domain_usage: domainUsageByUser.get(username) ?? [],
          identity_capability: crewIdentityCapability(),
          package: sub
            ? {
                id: sub.packageId,
                name: sub.packageName,
                quota_gb: sub.packageQuotaGb,
                down_mbps: sub.packageDownMbps,
                up_mbps: sub.packageUpMbps,
                price_vnd: Number(sub.packagePriceVnd),
              }
            : null,
          subscription_status: sub?.status ?? null,
          quota_used_bytes: sub ? sub.quotaUsedBytes : null,
          expires_at: sub ? sub.expiresAt.toISOString() : null,
        };
      });

    const dataQuality: DataQuality = {
      score: null,
      status: users.length > 0 ? 'AVAILABLE' : 'INSUFFICIENT_DATA',
      missing_sources: users.length > 0 ? [] : ['radius_accounting'],
      radius_ha_below_minimum: false, // authoritative value is GET .../crew/radius-health
    };

    // PDF tài liệu tham khảo mục 8 — đối chiếu NetFlow (đo được, có thể mất gói/UDP không đảm bảo)
    // với RADIUS (nguồn billing thật). billing_total_bytes dùng lại đúng SUM đã tính ở trên (rows),
    // không truy vấn lại. Hiển thị coverage_pct thô, KHÔNG tự động co giãn số hiển thị (quyết định
    // nghiệp vụ để hỏi lại người dùng sau khi họ thấy số liệu thật).
    const netflowTotalBytes = netflowTotalRow?.totalBytes !== null && netflowTotalRow?.totalBytes !== undefined ? Number(netflowTotalRow.totalBytes) : 0;
    const billingTotalBytes = sessionRows.reduce((sum, r) => {
      const u = r.uploadBytes === null ? 0 : Number(r.uploadBytes);
      const d = r.downloadBytes === null ? 0 : Number(r.downloadBytes);
      return sum + u + d;
    }, 0);
    const billingReconciliation =
      sessionRows.length === 0
        ? null
        : {
            netflow_total_bytes: netflowTotalBytes,
            billing_total_bytes: billingTotalBytes,
            coverage_pct: billingTotalBytes > 0 ? Math.round((netflowTotalBytes / billingTotalBytes) * 10000) / 100 : null,
          };

    return {
      data: {
        period,
        units: CREW_UNITS,
        source: 'radius_accounting',
        data_status: dataQuality.status,
        data_quality: dataQuality,
        identity_capability: crewIdentityCapability(),
        service_usage_capability: serviceUsageCapability(appUsageRows.length > 0),
        stale_after_seconds: STALE_AFTER_SECONDS,
        billing_reconciliation: billingReconciliation,
        users,
      },
      meta: {
        data_freshness_seconds: null,
        freshness_by_source: { radius_accounting: null },
        warnings:
          users.length === 0
            ? [{ code: 'INSUFFICIENT_DATA', message: 'No RADIUS accounting sessions were found for this ship in the requested period.' }]
            : [],
      },
    };
  }

  async getUserSessions(shipId: string, username: string, query: CrewSessionsQuery) {
    await this.assertShip(shipId);
    const offset = decodeCursor(query.cursor);

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(radiusSessions)
        .where(and(eq(radiusSessions.shipId, shipId), eq(radiusSessions.username, username)))
        .orderBy(desc(radiusSessions.startTime))
        .limit(query.limit)
        .offset(offset),
      this.db
        .select({ total: count(radiusSessions.id) })
        .from(radiusSessions)
        .where(and(eq(radiusSessions.shipId, shipId), eq(radiusSessions.username, username))),
    ]);

    const now = new Date();
    const sessions = rows.map((row) => ({
      id: row.id,
      acct_session_id: row.acctSessionId,
      status: displaySessionStatus(row.status, row.lastInterimAt ?? row.startTime, now),
      framed_ip: row.framedIp,
      calling_station_mac: row.callingStationMac,
      start_time: row.startTime.toISOString(),
      stop_time: row.stopTime ? row.stopTime.toISOString() : null,
      last_interim_at: row.lastInterimAt ? row.lastInterimAt.toISOString() : null,
      upload_bytes: row.uploadBytes,
      download_bytes: row.downloadBytes,
      total_bytes: row.uploadBytes !== null && row.downloadBytes !== null ? row.uploadBytes + row.downloadBytes : null,
      session_time_s: row.sessionTimeS,
      terminate_cause: row.terminateCause,
    }));

    return {
      data: {
        username,
        units: CREW_UNITS,
        source: 'radius_accounting',
        identity_capability: crewIdentityCapability(),
        sessions,
      },
      meta: {
        ...buildPageMeta(offset, query.limit, rows.length, Number(total)),
        warnings: sessions.length === 0 ? [{ code: 'INSUFFICIENT_DATA', message: `No RADIUS sessions found for username=${username} on this ship.` }] : [],
      },
    };
  }

  /**
   * CoA/Disconnect thật (RFC 5176, SYSTEM_SPEC §4.2) — gửi Disconnect-Request tới router đang
   * giữ phiên này, yêu cầu nó ngắt kết nối ngay. KHÔNG tự đánh dấu session CLOSED ở đây — trạng
   * thái thật chỉ đổi khi Accounting-Stop thật sự tới (router có thể mất vài giây để xử lý, hoặc
   * — nếu router chưa bật "RADIUS incoming" — không xử lý được dù đã ACK ở tầng UDP transport).
   */
  async disconnectSession(shipId: string, username: string, sessionId: string) {
    await this.assertShip(shipId);
    const session = await this.db.query.radiusSessions.findFirst({
      where: and(eq(radiusSessions.id, sessionId), eq(radiusSessions.shipId, shipId), eq(radiusSessions.username, username)),
    });
    if (!session) throw new ApiException('RADIUS_SESSION_NOT_FOUND', `RADIUS session ${sessionId} not found for ${username} on ship ${shipId}`);
    if (session.status !== 'ACTIVE') {
      throw new ApiException('RADIUS_SESSION_NOT_ACTIVE', `Session ${sessionId} is ${session.status}, not ACTIVE — nothing to disconnect`);
    }
    if (!session.deviceId) {
      throw new ApiException('RADIUS_DISCONNECT_FAILED', `Session ${sessionId} has no associated NAS device_id — cannot resolve where to send Disconnect-Request`);
    }

    const device = await this.db.query.devices.findFirst({ where: eq(devices.id, session.deviceId) });
    if (!device?.ipAddress) throw new ApiException('RADIUS_DISCONNECT_FAILED', `NAS device for session ${sessionId} has no ip_address configured`);

    const secret = await this.credentials.resolve(device.credentialRef);
    if (!secret) throw new ApiException('RADIUS_DISCONNECT_FAILED', `NAS device ${device.code} has no resolvable RADIUS secret (credential_ref)`);

    const result = await this.radiusCoa.sendDisconnectRequest(device.ipAddress, secret, { username, acctSessionId: session.acctSessionId });

    if (result.outcome === 'ACK') {
      return { acknowledged: true, message: 'NAS đã xác nhận (Disconnect-ACK) — chờ Accounting-Stop cập nhật trạng thái phiên.' };
    }
    if (result.outcome === 'NAK') {
      throw new ApiException('RADIUS_DISCONNECT_FAILED', 'NAS từ chối yêu cầu ngắt (Disconnect-NAK) — có thể phiên đã kết thúc phía router.');
    }
    throw new ApiException('RADIUS_DISCONNECT_FAILED', result.message);
  }

  async getRadiusHealth(shipId: string) {
    const ship = await this.assertShip(shipId);
    const [authCandidates, acctCandidates] = await Promise.all([
      this.registry.resolve('radius.auth'),
      this.registry.resolve('radius.accounting'),
    ]);
    const scoped = filterByShipScope([...authCandidates, ...acctCandidates], { shipId, areaId: ship.areaId });
    const ids = [...new Set(scoped.map((c) => c.id))];

    const rows =
      ids.length > 0
        ? await this.db
            .select()
            .from(serviceEndpoints)
            .leftJoin(serviceHealthState, eq(serviceHealthState.endpointId, serviceEndpoints.id))
            .where(sql`${serviceEndpoints.id} = ANY(${ids})`)
        : [];
    const endpoints = rows.map(summarizeEndpointHealth);
    const healthyCount = endpoints.filter((e) => e.status === 'HEALTHY' || e.status === 'DEGRADED').length;
    const belowMinimum = ids.length < MIN_RADIUS_ENDPOINTS;

    const [freshnessRow] = await this.db
      .select({ lastReceivedAt: sql<Date | null>`max(${rawTelemetryEvents.receivedAt})` })
      .from(rawTelemetryEvents)
      .where(and(eq(rawTelemetryEvents.source, 'RADIUS_ACCOUNTING'), eq(rawTelemetryEvents.shipId, shipId)));
    const lastReceivedAt = toDate(freshnessRow?.lastReceivedAt ?? null);
    const freshnessSeconds = lastReceivedAt ? Math.max(0, Math.floor((Date.now() - lastReceivedAt.getTime()) / 1000)) : null;
    const accountingStale = freshnessSeconds !== null && freshnessSeconds > TELEMETRY_STALE_AFTER_SECONDS;

    const overallStatus =
      ids.length === 0 ? 'UNKNOWN' : healthyCount === 0 ? 'UNHEALTHY' : belowMinimum || accountingStale ? 'DEGRADED' : 'HEALTHY';

    const warnings = [];
    if (belowMinimum) {
      warnings.push({
        code: 'RADIUS_HA_BELOW_MINIMUM',
        message: `SYSTEM_SPEC requires at least ${MIN_RADIUS_ENDPOINTS} RADIUS endpoints (radius.auth + radius.accounting combined) scoped to this ship; found ${ids.length}.`,
      });
    }
    if (lastReceivedAt === null) {
      warnings.push({ code: 'NO_ACCOUNTING_EVER_RECEIVED', message: 'No RADIUS_ACCOUNTING telemetry has ever been ingested for this ship.' });
    } else if (accountingStale) {
      warnings.push({ code: 'ACCOUNTING_STALE', message: `Last RADIUS accounting event was ${freshnessSeconds}s ago (threshold ${TELEMETRY_STALE_AFTER_SECONDS}s).` });
    }

    return {
      data: {
        source: 'service_registry+telemetry',
        units: CREW_UNITS,
        status: overallStatus,
        min_required_endpoints: MIN_RADIUS_ENDPOINTS,
        configured_endpoints: ids.length,
        healthy_endpoints: healthyCount,
        ha_compliant: !belowMinimum,
        endpoints,
        accounting_freshness_seconds: freshnessSeconds,
        data_quality: {
          score: null,
          status: ids.length === 0 ? 'INSUFFICIENT_DATA' : 'AVAILABLE',
          missing_sources: ids.length === 0 ? ['service_endpoints'] : [],
          radius_ha_below_minimum: belowMinimum,
        } satisfies DataQuality,
      },
      meta: {
        data_freshness_seconds: freshnessSeconds,
        freshness_by_source: { radius_accounting: freshnessSeconds },
        warnings,
      },
    };
  }

  async getRawAccounting(shipId: string, query: CrewRawAccountingQuery) {
    const ship = await this.assertShip(shipId);
    const period = resolvePeriod(query, query.timezone ?? ship.timezone);
    const from = new Date(period.from);
    const to = new Date(period.to);
    const offset = decodeCursor(query.cursor);

    const filters = [
      eq(radiusAccountingEvents.shipId, shipId),
      gte(radiusAccountingEvents.observedAt, from),
      lte(radiusAccountingEvents.observedAt, to),
      ...(query.username ? [eq(radiusAccountingEvents.username, query.username)] : []),
      ...(query.acct_session_id ? [eq(radiusAccountingEvents.acctSessionId, query.acct_session_id)] : []),
    ];

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(radiusAccountingEvents)
        .where(and(...filters))
        .orderBy(desc(radiusAccountingEvents.observedAt))
        .limit(query.limit)
        .offset(offset),
      this.db
        .select({ total: count(radiusAccountingEvents.id) })
        .from(radiusAccountingEvents)
        .where(and(...filters)),
    ]);

    return {
      data: {
        period,
        units: CREW_UNITS,
        source: 'radius_accounting_events',
        records: rows.map((r) => ({
          id: r.id,
          acct_session_id: r.acctSessionId,
          acct_status_type: r.acctStatusType,
          username: r.username,
          framed_ip: r.framedIp,
          calling_station_mac: r.callingStationMac,
          upload_bytes: r.uploadBytes,
          download_bytes: r.downloadBytes,
          session_time_s: r.sessionTimeS,
          terminate_cause: r.terminateCause,
          observed_at: r.observedAt.toISOString(),
          parser_version: r.parserVersion,
          raw_event_id: r.rawEventId,
        })),
      },
      meta: {
        ...buildPageMeta(offset, query.limit, rows.length, Number(total)),
        warnings: rows.length === 0 ? [{ code: 'INSUFFICIENT_DATA', message: 'No raw RADIUS accounting records match this query.' }] : [],
      },
    };
  }
}
