import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  bigint,
  numeric,
  uniqueIndex,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Enums — khớp với docs/backend/02-DATABASE_DESIGN.md
// ---------------------------------------------------------------------------

export const shipStatusEnum = pgEnum('ship_status', [
  'PLANNED',
  'COMMISSIONING',
  'ACTIVE',
  'MAINTENANCE',
  'DECOMMISSIONED',
]);

export const deviceRoleEnum = pgEnum('device_role', ['EDGE', 'CORE', 'SWITCH', 'AP', 'CPE']);

export const deviceStatusEnum = pgEnum('device_status', [
  'UNKNOWN',
  'ONLINE',
  'DEGRADED',
  'OFFLINE',
  'MAINTENANCE',
]);

export const transportEnum = pgEnum('transport', ['REST', 'API_SSL', 'API']);

export const zoneKindEnum = pgEnum('zone_kind', ['CREW', 'BUSINESS', 'MANAGEMENT']);

// SYSTEM_SPEC §6.1 — bốn nhóm interface dùng cho đối soát. Đây là ánh xạ trực tiếp
// yêu cầu "Interface và zone mapping: WAN / CREW / BUSINESS / MANAGEMENT".
export const accountingGroupEnum = pgEnum('accounting_group', [
  'WAN_INPUT',
  'CREW_ACCESS',
  'BUSINESS_ACCESS',
  'MANAGEMENT',
  'NONE',
]);

export const interfaceTypeEnum = pgEnum('interface_type', [
  'ETHER',
  'VLAN',
  'BRIDGE',
  'WIREGUARD',
  'ZEROTIER',
  'LTE',
  'SFP',
  'PPPOE',
]);

export const linkStateEnum = pgEnum('link_state', ['UP', 'DOWN', 'UNKNOWN']);

export const counterSourceEnum = pgEnum('counter_source', ['HC64', 'LEGACY32', 'API', 'UNRELIABLE', 'UNKNOWN']);

export const telemetrySourceEnum = pgEnum('telemetry_source', [
  'INTERFACE_COUNTER',
  'RADIUS_ACCOUNTING',
  'IPFIX_FLOW',
]);

// SYSTEM_SPEC §10.1
export const healthStatusEnum = pgEnum('health_status', [
  'HEALTHY',
  'DEGRADED',
  'UNHEALTHY',
  'UNKNOWN',
  'MAINTENANCE',
]);

export const serviceTypeEnum = pgEnum('service_type', [
  'RADIUS',
  'RADIUS_ACCT',
  'DATABASE',
  'COLLECTOR',
  'STORAGE',
  'USER_MANAGER',
  'CONTROLLER',
  'BUS',
  'CACHE',
  'ZEROTIER',
]);

export const healthcheckTypeEnum = pgEnum('healthcheck_type', [
  'RADIUS_ACCESS_REQUEST',
  'RADIUS_ACCT_PROBE',
  'SQL_RW',
  'CLICKHOUSE_PING',
  'FLOW_RECENCY',
  'POLL_RECENCY',
  'S3_RW',
  'HTTP_FUNCTIONAL',
  'NATS_RTT',
  'BACKUP_FRESHNESS',
]);

export const breakerStateEnum = pgEnum('breaker_state', ['CLOSED', 'OPEN', 'HALF_OPEN']);

export const backupKindEnum = pgEnum('backup_kind', ['BINARY', 'EXPORT', 'UMB', 'CERTIFICATE']);

export const restoreResultEnum = pgEnum('restore_result', ['PASSED', 'FAILED', 'NOT_TESTED']);

export const alertKindEnum = pgEnum('alert_kind', [
  'DEVICE_DOWN',
  'WAN_DOWN',
  'VPN_DOWN',
  'RADIUS_FAILURE',
  'DATABASE_FAILURE',
  'COLLECTOR_DELAYED',
  'BACKUP_OVERDUE',
  'BACKUP_SIZE_ANOMALY',
  'ENDPOINT_UNHEALTHY',
]);

export const severityEnum = pgEnum('severity', ['INFO', 'WARNING', 'MAJOR', 'CRITICAL']);

export const alertStatusEnum = pgEnum('alert_status', ['FIRING', 'ACKED', 'RESOLVED']);

export const actorTypeEnum = pgEnum('actor_type', ['USER', 'SYSTEM', 'JOB', 'API_TOKEN']);

export const auditResultEnum = pgEnum('audit_result', ['SUCCESS', 'FAILURE', 'DENIED']);

// Tenant / gói cước / subscriber (PPPoE/Hotspot) — xem docs/backend/02-DATABASE_DESIGN.md §1.6.
// Phase 1: CRUD control-DB thật. Cấp phát tài khoản RADIUS thật (radcheck trong PostgreSQL AAA)
// là Phase 2 — chưa nối, xem subscribers.service.ts.
export const packageDurationUnitEnum = pgEnum('package_duration_unit', ['DAY', 'MONTH']);
export const subscriberAuthTypeEnum = pgEnum('subscriber_auth_type', ['PPPOE', 'HOTSPOT']);
export const subscriberStatusEnum = pgEnum('subscriber_status', ['ACTIVE', 'SUSPENDED', 'EXPIRED']);

// Phase 4 — telemetry normalization enums. See migrations/control/0004_telemetry_normalization.sql
// for the pragmatic-Postgres-vs-Timescale note.
export const deltaQualityEnum = pgEnum('delta_quality', ['GOOD', 'DEGRADED', 'MISSING']);
export const radiusSessionStatusEnum = pgEnum('radius_session_status', ['ACTIVE', 'CLOSED', 'STALE', 'ORPHANED']);
export const bindingSourceEnum = pgEnum('binding_source', ['RADIUS', 'HOTSPOT', 'DHCP', 'ARP', 'STATIC']);

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  settings: jsonb('settings').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const areas = pgTable(
  'areas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    timezone: text('timezone').notNull().default('UTC'),
    geo: jsonb('geo'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgCodeUq: uniqueIndex('areas_org_code_uq').on(t.orgId, t.code),
  }),
);

export const ships = pgTable(
  'ships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    areaId: uuid('area_id')
      .notNull()
      .references(() => areas.id, { onDelete: 'restrict' }),
    // Đại lý/công ty quản lý tàu này (tenants — công ty/chi nhánh trong docs/backend/02-DATABASE_DESIGN.md
    // §1.6). Nullable + SET NULL vì Phase 1 tenants chỉ mới dùng cho Package/Subscriber, chưa bắt
    // buộc mọi tàu phải có đại lý.
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    imo: text('imo'),
    mmsi: text('mmsi'),
    status: shipStatusEnum('status').notNull().default('PLANNED'),
    timezone: text('timezone').notNull().default('UTC'),
    crewCapacity: integer('crew_capacity'),
    commissionedAt: timestamp('commissioned_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    areaCodeUq: uniqueIndex('ships_area_code_uq').on(t.areaId, t.code),
    areaStatusIx: index('ships_area_status_ix').on(t.areaId, t.status),
    tenantIx: index('ships_tenant_ix').on(t.tenantId),
  }),
);

export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shipId: uuid('ship_id')
      .notNull()
      .references(() => ships.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    role: deviceRoleEnum('role').notNull(),
    model: text('model'),
    serial: text('serial'),
    architecture: text('architecture'),
    routerosVersion: text('routeros_version'),
    deviceMode: text('device_mode'),
    apiTransport: transportEnum('api_transport').notNull().default('REST'),
    // Tham chiếu, KHÔNG BAO GIỜ chứa giá trị credential thật (ADR-05).
    credentialRef: text('credential_ref'),
    // Mốc thời gian cấp RADIUS secret gần nhất qua issueRadiusSecret() — bản thân secret không lưu
    // ở đây (đi qua EnvSecretStore), đối xứng với apiKeyIssuedAt bên dưới cho push key.
    radiusSecretIssuedAt: timestamp('radius_secret_issued_at', { withTimezone: true }),
    // Tham chiếu logical service/scope, KHÔNG phải IP literal (ADR-04, SYSTEM_SPEC §1.10).
    mgmtEndpointRef: text('mgmt_endpoint_ref'),
    status: deviceStatusEnum('status').notNull().default('UNKNOWN'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    pollIntervalS: integer('poll_interval_s').notNull().default(60),
    // Inventory thật (không phải secret) — router tự gửi kèm khi push, hoặc nhập tay để tham chiếu.
    ipAddress: text('ip_address'),
    // Model push 1 chiều (RouterOS tự đẩy telemetry lên, xem devices.controller.ts POST .../telemetry-push):
    // apiKeyHash là sha256(key) — key thật CHỈ trả 1 lần lúc issuePushApiKey(), không bao giờ lưu lại.
    apiKeyHash: text('api_key_hash'),
    apiKeyIssuedAt: timestamp('api_key_issued_at', { withTimezone: true }),
    // Nguyên văn RouterOS config (vd /export) — lưu để tham khảo/đối chiếu, KHÔNG bao giờ tự thực
    // thi hay đẩy xuống router (server không bao giờ kết nối ngược vào router, xem 0007). Không
    // chứa mật khẩu router thật nếu người dùng tự dán từ /export — chỉ nên dùng /export hide-sensitive.
    routerConfigText: text('router_config_text'),
    routerConfigUpdatedAt: timestamp('router_config_updated_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    shipCodeUq: uniqueIndex('devices_ship_code_uq').on(t.shipId, t.code),
    roleIx: index('devices_ship_role_ix').on(t.shipId, t.role),
    statusIx: index('devices_status_last_seen_ix').on(t.status, t.lastSeenAt),
  }),
);

export const networkZones = pgTable(
  'network_zones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shipId: uuid('ship_id')
      .notNull()
      .references(() => ships.id, { onDelete: 'cascade' }),
    kind: zoneKindEnum('kind').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    shipKindNameUq: uniqueIndex('network_zones_ship_kind_name_uq').on(t.shipId, t.kind, t.name),
  }),
);

export const interfaces = pgTable(
  'interfaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: interfaceTypeEnum('type').notNull(),
    mac: text('mac'),
    parentInterfaceId: uuid('parent_interface_id'),
    zoneId: uuid('zone_id').references(() => networkZones.id, { onDelete: 'set null' }),
    snmpIndex: integer('snmp_index'),
    speedBps: bigint('speed_bps', { mode: 'number' }),
    mtu: integer('mtu'),
    adminState: linkStateEnum('admin_state').notNull().default('UNKNOWN'),
    operState: linkStateEnum('oper_state').notNull().default('UNKNOWN'),
    accountingGroup: accountingGroupEnum('accounting_group').notNull().default('NONE'),
    countedInReconciliation: boolean('counted_in_reconciliation').notNull().default(false),
    counterSource: counterSourceEnum('counter_source').notNull().default('UNKNOWN'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    deviceNameUq: uniqueIndex('interfaces_device_name_uq').on(t.deviceId, t.name),
    accountingGroupIx: index('interfaces_accounting_group_ix').on(t.accountingGroup, t.countedInReconciliation),
  }),
);

// Phase 3 raw inbox. This is an immutable persistence/deduplication boundary;
// it is not the analytics store and does not claim that a RouterOS collector exists.
export const rawTelemetryEvents = pgTable(
  'raw_telemetry_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source: telemetrySourceEnum('source').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    sourceEventId: text('source_event_id'),
    shipId: uuid('ship_id').references(() => ships.id, { onDelete: 'set null' }),
    deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'set null' }),
    interfaceId: uuid('interface_id').references(() => interfaces.id, { onDelete: 'set null' }),
    userIdentity: text('user_identity'),
    userIdentityType: text('user_identity_type'),
    sourceDeviceRef: text('source_device_ref'),
    sourceInterfaceRef: text('source_interface_ref'),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb('payload'),
    rawReference: text('raw_reference'),
    payloadHashSha256: text('payload_hash_sha256').notNull(),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // Phase 4 — set once normalization.service.ts has processed this event (successfully or not;
    // processingError records why). NULL means "still pending" and is what the normalizer scans.
    processedAt: timestamp('processed_at', { withTimezone: true }),
    processingError: text('processing_error'),
  },
  (t) => ({
    sourceIdempotencyUq: uniqueIndex('raw_telemetry_source_idempotency_uq').on(t.source, t.idempotencyKey),
    sourceObservedIx: index('raw_telemetry_source_observed_ix').on(t.source, t.observedAt),
    shipObservedIx: index('raw_telemetry_ship_observed_ix').on(t.shipId, t.observedAt),
    receivedIx: index('raw_telemetry_received_ix').on(t.receivedAt),
    // 0004: index riêng cho hàng đợi normalize — chỉ những event CHƯA xử lý.
    // Partial index giữ nó nhỏ mãi mãi dù bảng raw phình to (processPending() quét đúng cột này).
    pendingIx: index('raw_telemetry_pending_ix').on(t.source, t.receivedAt).where(sql`${t.processedAt} is null`),
  }),
);

// ---------------------------------------------------------------------------
// Phase 4 — telemetry normalization tables (pragmatic Postgres stand-in for the
// TimescaleDB `database.analytics` tables in docs/backend/02-DATABASE_DESIGN.md §3;
// see migrations/control/0004_telemetry_normalization.sql header for the full caveat).
// ---------------------------------------------------------------------------

export const interfaceCounterSamples = pgTable(
  'interface_counter_samples',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shipId: uuid('ship_id')
      .notNull()
      .references(() => ships.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    interfaceId: uuid('interface_id')
      .notNull()
      .references(() => interfaces.id, { onDelete: 'cascade' }),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    rxBytes: bigint('rx_bytes', { mode: 'number' }).notNull(),
    txBytes: bigint('tx_bytes', { mode: 'number' }).notNull(),
    rxPackets: bigint('rx_packets', { mode: 'number' }),
    txPackets: bigint('tx_packets', { mode: 'number' }),
    rxErrors: bigint('rx_errors', { mode: 'number' }),
    txErrors: bigint('tx_errors', { mode: 'number' }),
    rxDrops: bigint('rx_drops', { mode: 'number' }),
    txDrops: bigint('tx_drops', { mode: 'number' }),
    counterSource: counterSourceEnum('counter_source').notNull(),
    rawEventId: uuid('raw_event_id')
      .notNull()
      .references(() => rawTelemetryEvents.id, { onDelete: 'cascade' }),
    parserVersion: text('parser_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    interfaceObservedUq: uniqueIndex('interface_counter_samples_interface_observed_uq').on(t.interfaceId, t.observedAt),
    // DESC khớp đúng migration 0004 và đúng chiều truy vấn: normalize luôn tìm "sample gần nhất
    // TRƯỚC mốc hiện tại" (interface-parser.ts orderBy desc), API luôn đọc dữ liệu mới nhất.
    interfaceObservedIx: index('ics_interface_observed_ix').on(t.interfaceId, t.observedAt.desc().nullsFirst()),
    shipObservedIx: index('ics_ship_observed_ix').on(t.shipId, t.observedAt.desc().nullsFirst()),
  }),
);

export const interfaceCounterDeltas = pgTable(
  'interface_counter_deltas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bucket: timestamp('bucket', { withTimezone: true }).notNull(),
    shipId: uuid('ship_id')
      .notNull()
      .references(() => ships.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id').notNull(),
    interfaceId: uuid('interface_id')
      .notNull()
      .references(() => interfaces.id, { onDelete: 'cascade' }),
    accountingGroup: accountingGroupEnum('accounting_group').notNull(),
    dRxBytes: bigint('d_rx_bytes', { mode: 'number' }).notNull(),
    dTxBytes: bigint('d_tx_bytes', { mode: 'number' }).notNull(),
    dRxPackets: bigint('d_rx_packets', { mode: 'number' }),
    dTxPackets: bigint('d_tx_packets', { mode: 'number' }),
    elapsedS: integer('elapsed_s').notNull(),
    counterReset: boolean('counter_reset').notNull().default(false),
    quality: deltaQualityEnum('quality').notNull(),
    previousSampleId: uuid('previous_sample_id'),
    currentSampleId: uuid('current_sample_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    interfaceBucketUq: uniqueIndex('icd_interface_bucket_uq').on(t.interfaceId, t.bucket),
    shipGroupBucketIx: index('icd_ship_group_bucket_ix').on(t.shipId, t.accountingGroup, t.bucket.desc().nullsFirst()),
    interfaceBucketIx: index('icd_interface_bucket_ix').on(t.interfaceId, t.bucket.desc().nullsFirst()),
  }),
);

export const radiusAccountingEvents = pgTable(
  'radius_accounting_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shipId: uuid('ship_id').references(() => ships.id, { onDelete: 'set null' }),
    deviceId: uuid('device_id'),
    acctSessionId: text('acct_session_id').notNull(),
    acctStatusType: text('acct_status_type').notNull(),
    username: text('username'),
    framedIp: text('framed_ip'),
    callingStationMac: text('calling_station_mac'),
    acctInputOctets: bigint('acct_input_octets', { mode: 'number' }),
    acctInputGigawords: integer('acct_input_gigawords'),
    acctOutputOctets: bigint('acct_output_octets', { mode: 'number' }),
    acctOutputGigawords: integer('acct_output_gigawords'),
    uploadBytes: bigint('upload_bytes', { mode: 'number' }),
    downloadBytes: bigint('download_bytes', { mode: 'number' }),
    sessionTimeS: bigint('session_time_s', { mode: 'number' }),
    terminateCause: text('terminate_cause'),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    rawEventId: uuid('raw_event_id')
      .notNull()
      .references(() => rawTelemetryEvents.id, { onDelete: 'cascade' }),
    parserVersion: text('parser_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    shipObservedIx: index('rae_ship_observed_ix').on(t.shipId, t.observedAt.desc().nullsFirst()),
    sessionIx: index('rae_session_ix').on(t.acctSessionId, t.observedAt),
    usernameIx: index('rae_username_ix').on(t.username, t.observedAt.desc().nullsFirst()),
  }),
);

export const radiusSessions = pgTable(
  'radius_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shipId: uuid('ship_id')
      .notNull()
      .references(() => ships.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id'),
    username: text('username').notNull(),
    acctSessionId: text('acct_session_id').notNull(),
    framedIp: text('framed_ip'),
    callingStationMac: text('calling_station_mac'),
    startTime: timestamp('start_time', { withTimezone: true }).notNull(),
    stopTime: timestamp('stop_time', { withTimezone: true }),
    lastInterimAt: timestamp('last_interim_at', { withTimezone: true }),
    uploadBytes: bigint('upload_bytes', { mode: 'number' }),
    downloadBytes: bigint('download_bytes', { mode: 'number' }),
    sessionTimeS: bigint('session_time_s', { mode: 'number' }),
    terminateCause: text('terminate_cause'),
    status: radiusSessionStatusEnum('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    shipSessionUq: uniqueIndex('radius_sessions_ship_session_uq').on(t.shipId, t.acctSessionId),
    shipStartIx: index('rs_ship_start_ix').on(t.shipId, t.startTime.desc().nullsFirst()),
    usernameStartIx: index('rs_username_start_ix').on(t.shipId, t.username, t.startTime.desc().nullsFirst()),
    // 0004: partial index cho "phiên đang mở" — truy vấn nóng nhất của CREW dashboard.
    activeIx: index('rs_active_ix').on(t.shipId, t.status).where(sql`${t.status} = 'ACTIVE'`),
  }),
);

export const ipfixFlowRecords = pgTable(
  'ipfix_flow_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shipId: uuid('ship_id').references(() => ships.id, { onDelete: 'set null' }),
    deviceId: uuid('device_id'),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    srcIp: text('src_ip').notNull(),
    dstIp: text('dst_ip').notNull(),
    srcPort: integer('src_port'),
    dstPort: integer('dst_port'),
    protocol: integer('protocol'),
    bytes: bigint('bytes', { mode: 'number' }).notNull(),
    packets: bigint('packets', { mode: 'number' }),
    inInterfaceId: uuid('in_interface_id').references(() => interfaces.id, { onDelete: 'set null' }),
    outInterfaceId: uuid('out_interface_id').references(() => interfaces.id, { onDelete: 'set null' }),
    vlanId: integer('vlan_id'),
    srcMac: text('src_mac'),
    direction: text('direction'),
    identityUsername: text('identity_username'),
    identitySource: bindingSourceEnum('identity_source'),
    identityConfidence: numeric('identity_confidence', { precision: 3, scale: 2 }),
    classificationMethod: text('classification_method').notNull().default('UNKNOWN'),
    classificationConfidence: numeric('classification_confidence', { precision: 3, scale: 2 }),
    unknownReason: text('unknown_reason'),
    domain: text('domain'),
    app: text('app'),
    rawEventId: uuid('raw_event_id')
      .notNull()
      .references(() => rawTelemetryEvents.id, { onDelete: 'cascade' }),
    parserVersion: text('parser_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    shipObservedIx: index('ifr_ship_observed_ix').on(t.shipId, t.observedAt.desc().nullsFirst()),
    srcIpObservedIx: index('ifr_src_ip_observed_ix').on(t.shipId, t.srcIp, t.observedAt.desc().nullsFirst()),
  }),
);

// ADR-12 temporal identity correlation. The GiST EXCLUDE constraint (no overlap per
// (ship_id, client_ip, source)) is created directly in the migration — Drizzle's pg-core does not
// have a first-class EXCLUDE builder, so it is intentionally not re-declared here to avoid
// drizzle-kit generating a conflicting DDL diff. Table shape below must stay in sync by hand with
// migrations/control/0004_telemetry_normalization.sql.
export const identityBindings = pgTable(
  'identity_bindings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shipId: uuid('ship_id')
      .notNull()
      .references(() => ships.id, { onDelete: 'cascade' }),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
    validTo: timestamp('valid_to', { withTimezone: true }),
    clientIp: text('client_ip').notNull(),
    clientMac: text('client_mac'),
    zone: zoneKindEnum('zone').notNull(),
    username: text('username'),
    deviceId: uuid('device_id'),
    interfaceId: uuid('interface_id'),
    vlanId: integer('vlan_id'),
    acctSessionId: text('acct_session_id'),
    source: bindingSourceEnum('source').notNull(),
    confidence: numeric('confidence', { precision: 3, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    shipIpFromIx: index('ib_ship_ip_from_ix').on(t.shipId, t.clientIp, t.validFrom.desc().nullsFirst()),
  }),
);

// ---------------------------------------------------------------------------
// Service registry — SYSTEM_SPEC §9.1, ADR-04
// ---------------------------------------------------------------------------

export const serviceEndpoints = pgTable(
  'service_endpoints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    serviceName: text('service_name').notNull(),
    serviceType: serviceTypeEnum('service_type').notNull(),
    environment: text('environment').notNull().default('development'),
    host: text('host').notNull(),
    port: integer('port').notNull(),
    protocol: text('protocol').notNull(),
    priority: integer('priority').notNull().default(100),
    enabled: boolean('enabled').notNull().default(true),
    region: text('region'),
    shipScope: jsonb('ship_scope').notNull().default({ type: 'ALL' }),
    healthcheckType: healthcheckTypeEnum('healthcheck_type').notNull(),
    healthcheckIntervalS: integer('healthcheck_interval_s').notNull().default(30),
    timeoutMs: integer('timeout_ms').notNull().default(5000),
    // Tham chiếu tới secret — KHÔNG BAO GIỜ giá trị thật (ADR-05).
    secretRef: text('secret_ref'),
    tls: jsonb('tls'),
    // Tham số riêng theo loại check — vd DB: {username,database}; Collector: {healthz_path};
    // RADIUS: {probe_username}. KHÔNG chứa secret (đó là secret_ref) và KHÔNG chứa địa chỉ
    // (đó là host/port) — chỉ là tham số hình thức của việc kiểm tra.
    checkConfig: jsonb('check_config').notNull().default({}),
    inMaintenance: boolean('in_maintenance').notNull().default(false),
    configVersion: integer('config_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    uq: uniqueIndex('service_endpoints_uq').on(t.serviceName, t.environment, t.host, t.port, t.protocol),
    serviceNameIx: index('service_endpoints_service_name_ix').on(t.serviceName, t.enabled, t.priority),
  }),
);

export const serviceEndpointRevisions = pgTable('service_endpoint_revisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  endpointId: uuid('endpoint_id')
    .notNull()
    .references(() => serviceEndpoints.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  payload: jsonb('payload').notNull(),
  changeReason: text('change_reason').notNull(),
  changedBy: text('changed_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Trạng thái health hiện tại — tách khỏi bảng cấu hình vì bị ghi liên tục (xem 02-DATABASE_DESIGN.md §1.3).
export const serviceHealthState = pgTable('service_health_state', {
  endpointId: uuid('endpoint_id')
    .primaryKey()
    .references(() => serviceEndpoints.id, { onDelete: 'cascade' }),
  status: healthStatusEnum('status').notNull().default('UNKNOWN'),
  since: timestamp('since', { withTimezone: true }).notNull().defaultNow(),
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  breakerState: breakerStateEnum('breaker_state').notNull().default('CLOSED'),
  breakerOpenedAt: timestamp('breaker_opened_at', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(false),
  lastError: jsonb('last_error'),
  lastRttMs: integer('last_rtt_ms'),
  lastCheckAt: timestamp('last_check_at', { withTimezone: true }),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  // Populated on both success and failure (last_error is failure-only) — e.g. DATABASE:
  // {is_primary, replica_count, replication_lag_seconds}; STORAGE: {age_hours, restore_test_result}.
  details: jsonb('details'),
});

export const deviceBackups = pgTable('device_backups', {
  id: uuid('id').primaryKey().defaultRandom(),
  deviceId: uuid('device_id')
    .notNull()
    .references(() => devices.id, { onDelete: 'cascade' }),
  kind: backupKindEnum('kind').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }),
  checksumSha256: text('checksum_sha256').notNull(),
  encrypted: boolean('encrypted').notNull().default(true),
  storageTargets: jsonb('storage_targets').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  restoreTestedAt: timestamp('restore_tested_at', { withTimezone: true }),
  restoreTestResult: restoreResultEnum('restore_test_result').notNull().default('NOT_TESTED'),
});

// ---------------------------------------------------------------------------
// Alerts — item #11 "Alerts khi endpoint unhealthy"
// ---------------------------------------------------------------------------

export const alerts = pgTable(
  'alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: alertKindEnum('kind').notNull(),
    fingerprint: text('fingerprint').notNull(),
    status: alertStatusEnum('status').notNull().default('FIRING'),
    severity: severityEnum('severity').notNull(),
    scope: jsonb('scope').notNull(),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    evidence: jsonb('evidence').notNull().default({}),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    ackedBy: text('acked_by'),
    ackedAt: timestamp('acked_at', { withTimezone: true }),
    ackNote: text('ack_note'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: text('resolved_by'),
    resolveReason: text('resolve_reason'),
  },
  (t) => ({
    // Partial unique: một fingerprint chỉ có tối đa một alert đang FIRING hoặc ACKED (chống spam).
    activeFingerprintUq: uniqueIndex('alerts_active_fingerprint_uq')
      .on(t.fingerprint)
      .where(sql`${t.status} in ('FIRING','ACKED')`),
    statusSeverityIx: index('alerts_status_severity_ix').on(t.status, t.severity, t.startedAt),
  }),
);

// ---------------------------------------------------------------------------
// Audit log — append-only, item #12
// ---------------------------------------------------------------------------

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorType: actorTypeEnum('actor_type').notNull(),
    actorId: text('actor_id'),
    actorLabel: text('actor_label').notNull(),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: uuid('resource_id'),
    scope: jsonb('scope'),
    before: jsonb('before'),
    after: jsonb('after'),
    diff: jsonb('diff'),
    requestId: text('request_id').notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    result: auditResultEnum('result').notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    resourceIx: index('audit_logs_resource_ix').on(t.resourceType, t.resourceId, t.createdAt),
    actorIx: index('audit_logs_actor_ix').on(t.actorId, t.createdAt),
    requestIdIx: index('audit_logs_request_id_ix').on(t.requestId),
  }),
);

// ---------------------------------------------------------------------------
// Tenant / gói cước / subscriber — docs/backend/02-DATABASE_DESIGN.md §1.6.
// Phase 1 (control DB thật). RADIUS provisioning thật là Phase 2.
// ---------------------------------------------------------------------------

export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parentId: uuid('parent_id'),
    code: text('code').notNull(),
    name: text('name').notNull(),
    contactName: text('contact_name'),
    contactPhone: text('contact_phone'),
    contactEmail: text('contact_email'),
    address: text('address'),
    taxId: text('tax_id'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    codeUq: uniqueIndex('tenants_code_uq').on(t.code),
    parentIx: index('tenants_parent_ix').on(t.parentId),
  }),
);

export const packages = pgTable(
  'packages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // NULL = gói dùng chung/kế thừa cho mọi tenant (mục 11 README thiết kế: RIÊNG/KẾ THỪA).
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    downMbps: integer('down_mbps').notNull(),
    upMbps: integer('up_mbps').notNull(),
    // README: "không còn gói không giới hạn" — luôn là số cụ thể.
    quotaGb: integer('quota_gb').notNull(),
    durationUnit: packageDurationUnitEnum('duration_unit').notNull(),
    durationValue: integer('duration_value').notNull(),
    priceVnd: numeric('price_vnd').notNull(),
    maxConcurrentDevices: integer('max_concurrent_devices').notNull().default(1),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIx: index('packages_tenant_ix').on(t.tenantId),
  }),
);

export const subscribers = pgTable(
  'subscribers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    username: text('username').notNull(),
    authType: subscriberAuthTypeEnum('auth_type').notNull(),
    // "NAS" trong thiết kế tham khảo = MikroTik router — tái dùng bảng devices có sẵn.
    nasDeviceId: uuid('nas_device_id').references(() => devices.id, { onDelete: 'set null' }),
    packageId: uuid('package_id')
      .notNull()
      .references(() => packages.id, { onDelete: 'restrict' }),
    status: subscriberStatusEnum('status').notNull().default('ACTIVE'),
    quotaUsedBytes: bigint('quota_used_bytes', { mode: 'number' }).notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    // Hash scrypt thật (backend/src/libs/password-hash/) — RADIUS Access-Request được chính
    // backend này xác thực trực tiếp (không còn uỷ quyền cho PostgreSQL AAA riêng như dự tính
    // ban đầu). issuePassword()/revokePassword() ở subscribers.service.ts quản lý field này,
    // đối xứng với devices.credentialRef (radius-secret) và devices.apiKeyHash (push-key).
    passwordHash: text('password_hash'),
    passwordIssuedAt: timestamp('password_issued_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantUsernameUq: uniqueIndex('subscribers_tenant_username_uq').on(t.tenantId, t.username),
    tenantStatusIx: index('subscribers_tenant_status_ix').on(t.tenantId, t.status),
    packageIx: index('subscribers_package_ix').on(t.packageId),
  }),
);

// Ten thanh vien ZeroTier (Node ID) -- controller ZeroTier that KHONG co field "name" cho member
// (chi network moi co ten that). Alias rieng cua he thong nay (giong zero-ui), KHONG gui len
// controller -- xem migration 0012_zerotier_member_labels.sql.
export const zerotierMemberLabels = pgTable(
  'zerotier_member_labels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    networkId: text('network_id').notNull(),
    memberId: text('member_id').notNull(),
    label: text('label').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    networkMemberUq: uniqueIndex('zerotier_member_labels_network_member_uq').on(t.networkId, t.memberId),
  }),
);

export const schemaMigrations = pgTable('schema_migrations', {
  name: text('name').primaryKey(),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
});
