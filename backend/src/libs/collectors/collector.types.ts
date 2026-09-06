import { TelemetrySource } from '../../modules/telemetry/dto';

/**
 * Collector port layer — ranh giới giữa "thiết bị thật ngoài kia" và pipeline
 * ingest -> normalize đã chạy được trong Phase 4.
 *
 * Nguyên tắc bất di bất dịch của lớp này:
 *  1. KHÔNG BAO GIỜ sinh số liệu giả. Adapter chưa có hạ tầng thật phải ném
 *     CollectorNotConfiguredError / CollectorUnavailableError, không được trả mẫu rỗng
 *     hay số 0 — vì 0 byte và "chưa đo được" là hai sự thật khác nhau (ADR-11 §gap reasons).
 *  2. KHÔNG BAO GIỜ hard-code địa chỉ. Mọi host/port/secret đến từ CollectorTarget mà
 *     caller dựng từ bảng `devices` / `service_endpoints` (xem ServiceRegistryService).
 *  3. Trường không đo được là `null`, không phải 0 — giữ đúng hợp đồng của
 *     interface_counter_samples / radius_sessions / ipfix_flow_records.
 *  4. `collect()` chỉ ĐỌC và MAP. Mọi ghi DB đi qua POST /api/v1/telemetry/ingest để
 *     dùng lại nguyên vẹn dedup theo (source, idempotency_key) và normalize đồng bộ.
 */

/** Đích thu thập — luôn được resolve lúc chạy, không hằng số trong code. */
export type CollectorTarget = {
  shipId: string;
  deviceId: string;
  /** Host/IP lấy từ DB (devices/service_endpoints). Không hard-code. */
  host: string;
  port: number;
  timeoutMs: number;
  /** Con trỏ tới secret (vd 'env:ROUTEROS_PASSWORD'), KHÔNG phải secret. */
  secretRef?: string | null;
  username?: string | null;
  /** Nhãn thiết bị ở phía nguồn, dùng cho identity.source_device_ref khi chưa map được UUID. */
  sourceDeviceRef?: string | null;
};

export type CollectorRunContext = {
  /** Mốc thời gian của lượt chạy; adapter phải dùng thời điểm quan sát thật, không phải Date.now() mặc định. */
  runAt: Date;
  /** Giới hạn số bản ghi trả về mỗi lượt (backpressure). */
  maxRecords?: number;
};

/** Envelope khớp 1-1 với TelemetryEventSchema trong src/modules/telemetry/dto.ts. */
export type TelemetryEventEnvelope = {
  source: TelemetrySource;
  idempotency_key: string;
  source_event_id?: string;
  observed_at: string;
  identity: {
    ship_id?: string;
    device_id?: string;
    interface_id?: string;
    user_identity?: string;
    user_identity_type?: 'USERNAME' | 'IP' | 'MAC' | 'SESSION_ID' | 'UNKNOWN';
    source_device_ref?: string;
    source_interface_ref?: string;
  };
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

export type CollectorBatch<TReading> = {
  target: CollectorTarget;
  collectedAt: Date;
  readings: TReading[];
  /** Bản ghi nguồn bỏ qua vì thiếu trường bắt buộc — đếm để báo cáo trung thực, không âm thầm nuốt. */
  skipped: Array<{ reason: string; detail?: string }>;
};

export type CollectorAdapterInfo = {
  adapter: string;
  source: TelemetrySource;
  transport: 'ROUTEROS_API' | 'SNMP' | 'RADIUS_UDP' | 'IPFIX_UDP';
  /**
   * IMPLEMENTED  = nói chuyện được với thiết bị thật.
   * NOT_IMPLEMENTED = mới có port + mapper, chưa có client giao thức (trạng thái hiện tại).
   */
  status: 'IMPLEMENTED' | 'NOT_IMPLEMENTED';
  /** Việc còn thiếu để adapter này chạy thật — hiển thị nguyên văn trong /health, không phỏng đoán. */
  missingRequirements: string[];
};

/**
 * Port chung. TReading là kiểu "đã đọc từ thiết bị nhưng chưa thành telemetry event",
 * để phần map (thuần, test được) tách khỏi phần I/O (cần thiết bị thật).
 */
export interface TelemetryCollector<TReading> {
  readonly source: TelemetrySource;
  describe(): CollectorAdapterInfo;
  /** Đọc từ thiết bị thật. Ném lỗi nếu chưa cấu hình/không với tới được — không trả dữ liệu bịa. */
  collect(target: CollectorTarget, ctx: CollectorRunContext): Promise<CollectorBatch<TReading>>;
  /** Map thuần: reading -> telemetry event. Không I/O, không thời gian hiện tại, deterministic. */
  toTelemetryEvents(batch: CollectorBatch<TReading>): TelemetryEventEnvelope[];
}

export class CollectorNotConfiguredError extends Error {
  readonly code = 'COLLECTOR_NOT_CONFIGURED';
  constructor(adapter: string, missing: string[]) {
    super(`Collector ${adapter} is not implemented yet. Missing: ${missing.join('; ')}`);
    this.name = 'CollectorNotConfiguredError';
  }
}

export class CollectorUnavailableError extends Error {
  readonly code = 'COLLECTOR_UNAVAILABLE';
  constructor(adapter: string, target: CollectorTarget, cause: string) {
    super(`Collector ${adapter} could not reach ${target.host}:${target.port} — ${cause}`);
    this.name = 'CollectorUnavailableError';
  }
}

/** Counter 64-bit -> string để không mất chính xác khi > 2^53; dto.ts nhận chuỗi chữ số. */
export function counterToPayloadValue(value: number | bigint | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value < 0n ? null : value.toString();
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.trunc(value).toString();
}

/** Bỏ mọi key có giá trị null/undefined — payload chỉ chứa cái ĐO ĐƯỢC, thiếu thì vắng mặt chứ không hoá 0. */
export function compactPayload(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== null && value !== undefined));
}
