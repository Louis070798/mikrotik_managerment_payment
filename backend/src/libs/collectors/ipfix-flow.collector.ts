import { createHash } from 'node:crypto';
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
 * Một flow record IPFIX (RFC 7011) đã decode theo template.
 *
 * Lớp này KHÔNG phân loại service/domain. ipfix-parser.ts ghi
 * classification_method='UNKNOWN' + unknown_reason='NO_CLASSIFIER_IMPLEMENTED' — collector
 * không được đoán tên dịch vụ từ port (443 -> "HTTPS" là suy diễn, không phải đo đạc).
 */
export type IpfixFlowReading = {
  observedAt: Date;
  srcIp: string;
  dstIp: string;
  bytes: number | bigint;
  srcPort?: number | null;
  dstPort?: number | null;
  protocol?: number | null;
  packets?: number | bigint | null;
  vlanId?: number | null;
  srcMac?: string | null;
  direction?: 'INGRESS' | 'EGRESS' | null;
  /** UUID interfaces.id của ingress interface nếu đã map từ ingressInterfaceIndex. */
  interfaceId?: string | null;
  /** ifIndex thô trong template IPFIX, giữ lại để map về interfaces sau. */
  ingressInterfaceIndex?: number | null;
  /** flowStart/flowEnd để phân biệt các flow trùng 5-tuple trong cùng mốc export. */
  flowStartAt?: Date | null;
  flowEndAt?: Date | null;
};

/**
 * IPFIX không có ID bản ghi tự nhiên, nên khoá idempotency là hash của flow key
 * (5-tuple + cửa sổ thời gian + số byte). Hai gói export lặp cùng một flow -> cùng khoá ->
 * ingest trả DUPLICATE, không sinh ipfix_flow_records thứ hai (ipfix-parser không tự dedup).
 */
export function ipfixIdempotencyKey(target: CollectorTarget, reading: IpfixFlowReading): string {
  const parts = [
    target.shipId,
    target.deviceId,
    reading.srcIp,
    reading.dstIp,
    reading.srcPort ?? '',
    reading.dstPort ?? '',
    reading.protocol ?? '',
    (reading.flowStartAt ?? reading.observedAt).toISOString(),
    (reading.flowEndAt ?? reading.observedAt).toISOString(),
    String(reading.bytes),
  ].join('|');
  return `ipfix:${createHash('sha256').update(parts).digest('hex').slice(0, 40)}`;
}

export function ipfixReadingToEvent(target: CollectorTarget, reading: IpfixFlowReading, adapter: string): TelemetryEventEnvelope {
  return {
    source: 'IPFIX_FLOW',
    idempotency_key: ipfixIdempotencyKey(target, reading),
    observed_at: reading.observedAt.toISOString(),
    identity: compactPayload({
      ship_id: target.shipId,
      device_id: target.deviceId,
      interface_id: reading.interfaceId ?? undefined,
      source_device_ref: target.sourceDeviceRef ?? undefined,
      source_interface_ref: reading.ingressInterfaceIndex !== null && reading.ingressInterfaceIndex !== undefined ? String(reading.ingressInterfaceIndex) : undefined,
    }) as TelemetryEventEnvelope['identity'],
    payload: compactPayload({
      src_ip: reading.srcIp,
      dst_ip: reading.dstIp,
      src_port: reading.srcPort ?? null,
      dst_port: reading.dstPort ?? null,
      protocol: reading.protocol ?? null,
      bytes: counterToPayloadValue(reading.bytes),
      packets: counterToPayloadValue(reading.packets),
      vlan_id: reading.vlanId ?? null,
      src_mac: reading.srcMac,
      direction: reading.direction,
    }),
    metadata: compactPayload({
      collector_adapter: adapter,
      flow_start_at: reading.flowStartAt?.toISOString(),
      flow_end_at: reading.flowEndAt?.toISOString(),
    }),
  };
}

export interface IpfixFlowCollector extends TelemetryCollector<IpfixFlowReading> {}

const IPFIX_MISSING = [
  'UDP listener cổng 2055/4739 + bộ giải mã template IPFIX (RFC 7011) chưa có trong backend',
  'lưu template theo Observation Domain ID (data record vô nghĩa nếu chưa nhận được template)',
  'exporter IPFIX test trong CI để chạy integration test thật',
];

@Injectable()
export class IpfixUdpFlowCollector implements IpfixFlowCollector {
  readonly source = 'IPFIX_FLOW' as const;
  readonly adapter = 'ipfix-flow-udp';

  describe(): CollectorAdapterInfo {
    return { adapter: this.adapter, source: this.source, transport: 'IPFIX_UDP', status: 'NOT_IMPLEMENTED', missingRequirements: [...IPFIX_MISSING] };
  }

  async collect(_target: CollectorTarget, _ctx: CollectorRunContext): Promise<CollectorBatch<IpfixFlowReading>> {
    throw new CollectorNotConfiguredError(this.adapter, IPFIX_MISSING);
  }

  toTelemetryEvents(batch: CollectorBatch<IpfixFlowReading>): TelemetryEventEnvelope[] {
    return batch.readings.map((reading) => ipfixReadingToEvent(batch.target, reading, this.adapter));
  }
}
