import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as dgram from 'node:dgram';
import { ENV_TOKEN } from '@config/config.module';
import type { Env } from '@config/env.schema';
import { CollectorTarget } from '@collectors/collector.types';
import { IpfixFlowReading, ipfixReadingToEvent } from '@collectors/ipfix-flow.collector';
import { InventoryCacheService } from '@inventory-cache/inventory-cache.service';
import { TelemetryService } from '../../modules/telemetry/telemetry.service';
import { isPrivateIp } from './ip-utils';
import { decodeFieldValue, NETFLOW_FIELD } from './netflow-fields';
import { decodeDataRecords, decodeHeader, decodeTemplateRecords, splitFlowSets, TemplateRecord } from './netflow-packet';
import { NetflowTemplateCache } from './netflow-template-cache';

type ParsedFlow = {
  bytes: number;
  protocol: number | null;
  srcPort: number | null;
  dstPort: number | null;
  srcIp: string | null;
  dstIp: string | null;
};

type ConnectionEntry = { client: string; ts: number };

/**
 * NetFlow v9 UDP collector thật — nhận flow từ RouterOS `/ip traffic-flow`, giải khuôn mẫu động,
 * dò ngược chiều "tải xuống" bị mất IP máy khách do NAT (masquerade giữ nguyên cổng nguồn —
 * đúng nguyên lý mục 5.2 tài liệu tham khảo), rồi tái dùng NGUYÊN `ipfixReadingToEvent()` +
 * `TelemetryService.ingest()` đã có — không viết lại phần ghi ipfix_flow_records/tra
 * identity_bindings.
 */
@Injectable()
export class NetflowCollectorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NetflowCollectorService.name);
  private socket?: dgram.Socket;
  private readonly templates = new NetflowTemplateCache();
  // Bảng kết nối NAT tạm thời, khoá router|ip_ngoài|port_ngoài|port_trong -> client thật.
  // TTL 30 phút (PDF mục 9), trần kích thước + dọn định kỳ để tránh bẫy số 8/9.
  private readonly connectionTable = new Map<string, ConnectionEntry>();
  private static readonly CONNECTION_TTL_MS = 30 * 60 * 1000;
  private static readonly CONNECTION_TABLE_MAX = 200_000;

  constructor(
    @Inject(ENV_TOKEN) private readonly env: Env,
    private readonly telemetry: TelemetryService,
    private readonly inventoryCache: InventoryCacheService,
  ) {}

  onModuleInit() {
    const socket = dgram.createSocket('udp4');
    socket.on('message', (msg, rinfo) => {
      this.handlePacket(msg, rinfo).catch((err) => this.logger.error(`Unhandled error processing NetFlow packet from ${rinfo.address}: ${(err as Error).message}`));
    });
    socket.on('error', (err) => this.logger.error(`NetFlow UDP socket error: ${err.message}`));
    socket.bind(this.env.NETFLOW_PORT, () => {
      this.logger.log(`NetFlow v9 collector listening on :${this.env.NETFLOW_PORT}`);
    });
    this.socket = socket;
  }

  onModuleDestroy() {
    this.socket?.close();
  }

  private async handlePacket(msg: Buffer, rinfo: dgram.RemoteInfo) {
    let header;
    try {
      header = decodeHeader(msg);
    } catch (err) {
      this.logger.warn(`Dropped malformed NetFlow packet from ${rinfo.address}: ${(err as Error).message}`);
      return;
    }
    if (header.version !== 9) {
      this.logger.warn(`Dropped packet from ${rinfo.address} — version ${header.version} không phải NetFlow v9`);
      return;
    }

    const device = this.inventoryCache.deviceByIpAddress(rinfo.address);
    if (!device) {
      this.logger.warn(`Dropped NetFlow packet from unknown router IP ${rinfo.address} — no devices.ip_address match`);
      return;
    }

    const flowSets = splitFlowSets(msg);
    const parsedFlows: ParsedFlow[] = [];

    for (const flowSet of flowSets) {
      if (flowSet.flowSetId === 0) {
        for (const t of decodeTemplateRecords(flowSet.payload)) {
          this.templates.set(rinfo.address, header.sourceId, t.templateId, t.fields);
        }
        continue;
      }
      if (flowSet.flowSetId === 1) continue; // Options Template — ngoài phạm vi Phase A
      if (flowSet.flowSetId >= 256) {
        const fields = this.templates.get(rinfo.address, header.sourceId, flowSet.flowSetId);
        if (!fields) continue; // dữ liệu đến trước khuôn mẫu — bỏ gói, tự hết sau khi router phát lại template
        const template: TemplateRecord = { templateId: flowSet.flowSetId, fields };
        for (const record of decodeDataRecords(template, flowSet.payload)) {
          parsedFlows.push(this.extractFlow(record));
        }
      }
    }
    if (parsedFlows.length === 0) return;

    this.pruneConnectionTable();
    const routerKey = rinfo.address;

    // LƯỢT 1 — dạy bảng kết nối từ record còn IP máy khách thật (bên nội bộ RFC1918/ULA).
    for (const flow of parsedFlows) {
      if (!flow.srcIp || !flow.dstIp || flow.srcPort === null || flow.dstPort === null) continue;
      if (flow.srcPort === 0 && flow.dstPort === 0) continue; // ICMP, không có gì làm khoá
      if (isPrivateIp(flow.srcIp) && !isPrivateIp(flow.dstIp)) {
        // srcIp = client thật, dstIp = máy chủ ở xa -- ghi khoá để chiều "về" tra ngược được.
        this.connectionTable.set(`${routerKey}|${flow.dstIp}|${flow.dstPort}|${flow.srcPort}`, { client: flow.srcIp, ts: Date.now() });
      }
    }

    // LƯỢT 2 — gán mọi record: nội bộ ở đâu thì client ở đó; nếu cả 2 đầu đều là IP công cộng
    // (đã bị masquerade cả hai chiều) thì tra bảng kết nối bằng khoá đối xứng (cổng nguồn giữ
    // nguyên qua NAT — mấu chốt của tài liệu tham khảo mục 5.2).
    const target: CollectorTarget = { shipId: device.shipId, deviceId: device.id, host: rinfo.address, port: rinfo.port, timeoutMs: 0, sourceDeviceRef: device.code };
    const now = new Date();
    const events = [];
    let unattributed = 0;

    for (const flow of parsedFlows) {
      if (!flow.srcIp || !flow.dstIp || flow.bytes <= 0) continue;

      let client: string | null = null;
      let remote: string | null = null;
      if (isPrivateIp(flow.srcIp) && !isPrivateIp(flow.dstIp)) {
        client = flow.srcIp;
        remote = flow.dstIp;
      } else if (!isPrivateIp(flow.srcIp) && isPrivateIp(flow.dstIp)) {
        client = flow.dstIp;
        remote = flow.srcIp;
      } else if (!isPrivateIp(flow.srcIp) && !isPrivateIp(flow.dstIp) && flow.srcPort !== null && flow.dstPort !== null) {
        // Cả 2 đầu đều công cộng -- đúng tình huống PDF mô tả (chiều tải xuống mất IP máy khách).
        const hit = this.connectionTable.get(`${routerKey}|${flow.srcIp}|${flow.srcPort}|${flow.dstPort}`);
        if (hit) {
          client = hit.client;
          remote = flow.srcIp;
        }
      }
      // nội bộ <-> nội bộ (cả 2 đều private): không qua WAN, không tính (đúng laIpCongCong() cuối PDF mục 5.2).
      if (!client || !remote) {
        if (isPrivateIp(flow.srcIp) === isPrivateIp(flow.dstIp)) continue; // 2 đầu cùng loại, không qua WAN hoặc không dò được
        unattributed++;
        continue;
      }

      const reading: IpfixFlowReading = {
        observedAt: now,
        srcIp: client,
        dstIp: remote,
        bytes: flow.bytes,
        srcPort: flow.srcPort,
        dstPort: flow.dstPort,
        protocol: flow.protocol,
      };
      events.push(ipfixReadingToEvent(target, reading, 'netflow-v9-udp'));
    }

    if (unattributed > 0) {
      this.logger.debug(`${device.code}: ${unattributed}/${parsedFlows.length} flow không dò được client (chiều về không khớp bảng kết nối — bình thường ở mức thấp).`);
    }
    if (events.length === 0) return;

    try {
      for (let i = 0; i < events.length; i += 500) {
        await this.telemetry.ingest({ events: events.slice(i, i + 500) });
      }
    } catch (err) {
      this.logger.error(`Failed to ingest NetFlow batch from ${device.code}: ${(err as Error).message}`);
    }
  }

  private extractFlow(record: Map<number, Buffer>): ParsedFlow {
    const get = (type: number) => {
      const raw = record.get(type);
      return raw ? decodeFieldValue(type, raw) : null;
    };
    const bytesRaw = get(NETFLOW_FIELD.IN_BYTES);
    const srcIp = (get(NETFLOW_FIELD.IPV4_SRC_ADDR) ?? get(NETFLOW_FIELD.IPV6_SRC_ADDR)) as string | null;
    const dstIp = (get(NETFLOW_FIELD.IPV4_DST_ADDR) ?? get(NETFLOW_FIELD.IPV6_DST_ADDR)) as string | null;
    return {
      bytes: typeof bytesRaw === 'number' ? bytesRaw : 0,
      protocol: get(NETFLOW_FIELD.PROTOCOL) as number | null,
      srcPort: get(NETFLOW_FIELD.L4_SRC_PORT) as number | null,
      dstPort: get(NETFLOW_FIELD.L4_DST_PORT) as number | null,
      srcIp,
      dstIp,
    };
  }

  private pruneConnectionTable() {
    if (this.connectionTable.size < NetflowCollectorService.CONNECTION_TABLE_MAX) return;
    const cutoff = Date.now() - NetflowCollectorService.CONNECTION_TTL_MS;
    for (const [key, entry] of this.connectionTable) {
      if (entry.ts < cutoff) this.connectionTable.delete(key);
    }
  }
}
