import {
  CollectorBatch,
  CollectorNotConfiguredError,
  CollectorTarget,
  IpfixFlowReading,
  IpfixUdpFlowCollector,
  RouterOsInterfaceCounterCollector,
  RouterOsInterfaceCounterReading,
  compactPayload,
  counterToPayloadValue,
} from '@collectors/index';
import { TelemetryEventSchema } from '../../src/modules/telemetry/dto';

/**
 * Lớp adapter collector: phần MAP (thuần, deterministic) phải đúng ngay từ bây giờ, còn phần
 * I/O (nói chuyện với RouterOS/RADIUS/IPFIX thật) phải THẤT BẠI TO VÀ RÕ chứ không trả dữ liệu giả.
 */
const TARGET: CollectorTarget = {
  shipId: '11111111-1111-4111-8111-111111111111',
  deviceId: '22222222-2222-4222-8222-222222222222',
  // Địa chỉ do caller truyền vào (từ bảng devices/service_endpoints) — không có hằng số IP nào trong src/.
  host: '198.51.100.1',
  port: 8728,
  timeoutMs: 3000,
  secretRef: 'env:ROUTEROS_TEST_PASSWORD',
  sourceDeviceRef: 'MikroTik-CCR-lab',
};

const OBSERVED = new Date('2026-08-25T05:00:00.000Z');

function batch<T>(readings: T[]): CollectorBatch<T> {
  return { target: TARGET, collectedAt: OBSERVED, readings, skipped: [] };
}

describe('Collector adapters — trạng thái thật và ánh xạ sang telemetry event', () => {
  const routerOs = new RouterOsInterfaceCounterCollector();
  const ipfix = new IpfixUdpFlowCollector();

  describe('describe(): báo đúng là CHƯA triển khai', () => {
    it.each([
      ['routeros-interface-counter', routerOs, 'INTERFACE_COUNTER', 'ROUTEROS_API'],
      ['ipfix-flow-udp', ipfix, 'IPFIX_FLOW', 'IPFIX_UDP'],
    ])('%s', (name, collector: any, source, transport) => {
      const info = collector.describe();
      expect(info.adapter).toBe(name);
      expect(info.source).toBe(source);
      expect(info.transport).toBe(transport);
      expect(info.status).toBe('NOT_IMPLEMENTED');
      expect(info.missingRequirements.length).toBeGreaterThan(0);
    });
  });

  describe('collect(): ném lỗi rõ ràng, KHÔNG trả mảng rỗng', () => {
    it.each([
      ['routeros', routerOs],
      ['ipfix', ipfix],
    ])('%s', async (_name, collector: any) => {
      // Mảng rỗng sẽ bị hiểu là "thiết bị không có dữ liệu" — một khẳng định sai và nguy hiểm.
      await expect(collector.collect(TARGET, { runAt: OBSERVED })).rejects.toBeInstanceOf(CollectorNotConfiguredError);
      await expect(collector.collect(TARGET, { runAt: OBSERVED })).rejects.toThrow(/not implemented yet/i);
    });
  });

  describe('RouterOS interface counters', () => {
    const reading: RouterOsInterfaceCounterReading = {
      interfaceName: 'ether1-wan',
      interfaceId: '33333333-3333-4333-8333-333333333333',
      observedAt: OBSERVED,
      rxBytes: 10_000_000,
      txBytes: 5_000_000,
      rxPackets: 1_234,
      // tx-packet / errors / drops thiết bị không trả -> để null, KHÔNG điền 0.
      txPackets: null,
      rxErrors: null,
    };

    it('map sang event hợp lệ theo đúng TelemetryEventSchema', () => {
      const [event] = routerOs.toTelemetryEvents(batch([reading]));
      expect(TelemetryEventSchema.safeParse(event).success).toBe(true);
      expect(event.source).toBe('INTERFACE_COUNTER');
      expect(event.observed_at).toBe('2026-08-25T05:00:00.000Z');
      expect(event.identity.ship_id).toBe(TARGET.shipId);
      expect(event.identity.interface_id).toBe(reading.interfaceId);
      expect(event.identity.source_interface_ref).toBe('ether1-wan');
      expect(event.payload.rx_bytes).toBe('10000000');
      expect(event.payload.rx_packets).toBe('1234');
    });

    it('trường không đo được VẮNG MẶT khỏi payload, không thành 0', () => {
      const [event] = routerOs.toTelemetryEvents(batch([reading]));
      expect(event.payload).not.toHaveProperty('tx_packets');
      expect(event.payload).not.toHaveProperty('rx_errors');
      expect(event.payload).not.toHaveProperty('tx_drops');
      expect(Object.values(event.payload)).not.toContain(0);
    });

    it('idempotency key ổn định theo (interface, mốc quan sát) — poll lại cùng mốc không sinh bản ghi mới', () => {
      const [a] = routerOs.toTelemetryEvents(batch([reading]));
      const [b] = routerOs.toTelemetryEvents(batch([{ ...reading }]));
      expect(a.idempotency_key).toBe(b.idempotency_key);

      const [later] = routerOs.toTelemetryEvents(batch([{ ...reading, observedAt: new Date(OBSERVED.getTime() + 60_000) }]));
      expect(later.idempotency_key).not.toBe(a.idempotency_key);
    });

    it('không có interfaceId thì khoá rơi về (deviceId, tên interface) và vẫn ổn định', () => {
      const [event] = routerOs.toTelemetryEvents(batch([{ ...reading, interfaceId: null }]));
      expect(event.idempotency_key).toBe(`ifctr:${TARGET.deviceId}:ether1-wan:2026-08-25T05:00:00.000Z`);
      expect(event.identity).not.toHaveProperty('interface_id');
    });

    it('counter 32-bit được đánh dấu trong metadata để vận hành đặt counter_source=UNRELIABLE (ADR-10)', () => {
      const [event] = routerOs.toTelemetryEvents(batch([{ ...reading, counters32BitOnly: true }]));
      expect(event.metadata.counters_32bit_only).toBe(true);
      const [plain] = routerOs.toTelemetryEvents(batch([reading]));
      expect(plain.metadata).not.toHaveProperty('counters_32bit_only');
    });
  });

  describe('IPFIX flow', () => {
    const flow: IpfixFlowReading = {
      observedAt: OBSERVED,
      srcIp: '10.20.20.5',
      dstIp: '198.51.100.34',
      dstPort: 443,
      protocol: 6,
      bytes: 123_456,
      packets: 200,
      flowStartAt: new Date(OBSERVED.getTime() - 30_000),
      flowEndAt: OBSERVED,
    };

    it('map sang event hợp lệ và KHÔNG tự suy ra dịch vụ từ port', () => {
      const [event] = ipfix.toTelemetryEvents(batch([flow]));
      expect(TelemetryEventSchema.safeParse(event).success).toBe(true);
      expect(event.payload.dst_port).toBe(443);
      // Không có trường nào kiểu service/domain/application — phân loại là việc của classifier chưa tồn tại.
      expect(Object.keys(event.payload)).toEqual(expect.not.arrayContaining(['service', 'domain', 'application', 'category']));
    });

    it('IPFIX không có ID tự nhiên -> khoá là hash flow key; export lặp cùng flow cho cùng khoá', () => {
      const [a] = ipfix.toTelemetryEvents(batch([flow]));
      const [b] = ipfix.toTelemetryEvents(batch([{ ...flow }]));
      expect(a.idempotency_key).toBe(b.idempotency_key);
      expect(a.idempotency_key).toMatch(/^ipfix:[0-9a-f]{40}$/);

      // Khác số byte = flow khác (hoặc bản export mới) -> phải khác khoá, nếu không sẽ mất dữ liệu.
      const [other] = ipfix.toTelemetryEvents(batch([{ ...flow, bytes: 123_457 }]));
      expect(other.idempotency_key).not.toBe(a.idempotency_key);
    });
  });

  describe('helper an toàn kiểu', () => {
    it('counterToPayloadValue giữ chính xác số > 2^53 bằng bigint -> chuỗi', () => {
      expect(counterToPayloadValue(9_007_199_254_740_993n)).toBe('9007199254740993');
      expect(counterToPayloadValue(null)).toBeNull();
      expect(counterToPayloadValue(undefined)).toBeNull();
      expect(counterToPayloadValue(-1)).toBeNull();
      expect(counterToPayloadValue(Number.NaN)).toBeNull();
    });

    it('compactPayload bỏ null/undefined nhưng GIỮ số 0 thật', () => {
      expect(compactPayload({ a: null, b: undefined, c: 0, d: false, e: '' })).toEqual({ c: 0, d: false, e: '' });
    });
  });
});
