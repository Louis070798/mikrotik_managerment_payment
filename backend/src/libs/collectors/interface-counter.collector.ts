import { Injectable } from '@nestjs/common';
import {
  CollectorAdapterInfo,
  CollectorBatch,
  CollectorNotConfiguredError,
  CollectorRunContext,
  CollectorTarget,
  TelemetryCollector,
  TelemetryEventEnvelope,
  compactPayload,
  counterToPayloadValue,
} from './collector.types';

/**
 * Một lần đọc counter của MỘT interface trên RouterOS.
 *
 * Ánh xạ trường RouterOS (`/interface/print stats` hoặc SNMP IF-MIB HC counters):
 *   rx-byte    -> rxBytes    (ifHCInOctets)
 *   tx-byte    -> txBytes    (ifHCOutOctets)
 *   rx-packet  -> rxPackets  (ifHCInUcastPkts)
 *   rx-error / rx-drop -> rxErrors / rxDrops
 *
 * `null` = thiết bị không trả trường đó. KHÔNG được thay bằng 0: normalize sẽ ghi null vào
 * interface_counter_samples và delta packets thành null thay vì bịa ra 0 gói.
 */
export type RouterOsInterfaceCounterReading = {
  /** Tên interface đúng như trên thiết bị ('ether1', 'vlan100'), khớp interfaces.name để resolve UUID. */
  interfaceName: string;
  /** UUID interfaces.id nếu caller đã map được; null thì normalize tự resolve theo (device_id, name). */
  interfaceId: string | null;
  observedAt: Date;
  rxBytes: number | bigint;
  txBytes: number | bigint;
  rxPackets?: number | bigint | null;
  txPackets?: number | bigint | null;
  rxErrors?: number | bigint | null;
  txErrors?: number | bigint | null;
  rxDrops?: number | bigint | null;
  txDrops?: number | bigint | null;
  /** true khi thiết bị chỉ có counter 32-bit -> interfaces.counter_source phải là UNRELIABLE (ADR-10). */
  counters32BitOnly?: boolean;
};

/**
 * Khoá idempotency: một (interface, mốc quan sát) chỉ được ghi một lần.
 * Trùng khoá -> ingest trả DUPLICATE, không sinh sample/delta thứ hai (xem TelemetryService.ingest).
 * Dùng interfaceId khi có, nếu không thì deviceId+tên interface — vẫn ổn định giữa các lượt poll.
 */
export function interfaceCounterIdempotencyKey(target: CollectorTarget, reading: RouterOsInterfaceCounterReading): string {
  const scope = reading.interfaceId ?? `${target.deviceId}:${reading.interfaceName}`;
  return `ifctr:${scope}:${reading.observedAt.toISOString()}`;
}

/** Map thuần reading -> telemetry event (không I/O). Đây là phần đã chạy thật và unit-test được. */
export function interfaceCounterReadingToEvent(
  target: CollectorTarget,
  reading: RouterOsInterfaceCounterReading,
  adapter: string,
): TelemetryEventEnvelope {
  return {
    source: 'INTERFACE_COUNTER',
    idempotency_key: interfaceCounterIdempotencyKey(target, reading),
    observed_at: reading.observedAt.toISOString(),
    identity: compactPayload({
      ship_id: target.shipId,
      device_id: target.deviceId,
      interface_id: reading.interfaceId ?? undefined,
      source_device_ref: target.sourceDeviceRef ?? undefined,
      source_interface_ref: reading.interfaceName,
    }) as TelemetryEventEnvelope['identity'],
    payload: compactPayload({
      interface_name: reading.interfaceName,
      rx_bytes: counterToPayloadValue(reading.rxBytes),
      tx_bytes: counterToPayloadValue(reading.txBytes),
      rx_packets: counterToPayloadValue(reading.rxPackets),
      tx_packets: counterToPayloadValue(reading.txPackets),
      rx_errors: counterToPayloadValue(reading.rxErrors),
      tx_errors: counterToPayloadValue(reading.txErrors),
      rx_drops: counterToPayloadValue(reading.rxDrops),
      tx_drops: counterToPayloadValue(reading.txDrops),
    }),
    metadata: compactPayload({
      collector_adapter: adapter,
      // Cờ này để vận hành đặt interfaces.counter_source=UNRELIABLE; ADR-10 loại counter
      // 32-bit khỏi reconciliation thay vì tính rồi sai âm thầm.
      counters_32bit_only: reading.counters32BitOnly === true ? true : undefined,
    }),
  };
}

export interface InterfaceCounterCollector extends TelemetryCollector<RouterOsInterfaceCounterReading> {}

const ROUTEROS_MISSING = [
  'RouterOS API client (port 8728/8729 API-SSL) hoặc SNMP v3 client chưa có trong backend',
  'credential store cho tài khoản read-only trên thiết bị (mới chỉ có secret_ref, chưa có vault)',
  'thiết bị/CHR test trong CI để chạy integration test thật',
];

/**
 * Adapter RouterOS. Chưa có client giao thức nên collect() ném lỗi — KHÔNG trả mảng rỗng,
 * vì mảng rỗng nghĩa là "thiết bị không có interface nào", một khẳng định sai.
 */
@Injectable()
export class RouterOsInterfaceCounterCollector implements InterfaceCounterCollector {
  readonly source = 'INTERFACE_COUNTER' as const;
  readonly adapter = 'routeros-interface-counter';

  describe(): CollectorAdapterInfo {
    return { adapter: this.adapter, source: this.source, transport: 'ROUTEROS_API', status: 'NOT_IMPLEMENTED', missingRequirements: [...ROUTEROS_MISSING] };
  }

  async collect(_target: CollectorTarget, _ctx: CollectorRunContext): Promise<CollectorBatch<RouterOsInterfaceCounterReading>> {
    throw new CollectorNotConfiguredError(this.adapter, ROUTEROS_MISSING);
  }

  toTelemetryEvents(batch: CollectorBatch<RouterOsInterfaceCounterReading>): TelemetryEventEnvelope[] {
    return batch.readings.map((reading) => interfaceCounterReadingToEvent(batch.target, reading, this.adapter));
  }
}
