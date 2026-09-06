import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as dgram from 'node:dgram';
import { ENV_TOKEN } from '@config/config.module';
import type { Env } from '@config/env.schema';
import { DnsResolutionCacheService } from '@dns-resolution-cache/dns-resolution-cache.service';
import { InventoryCacheService } from '@inventory-cache/inventory-cache.service';
import { parseDnsLogLine } from './dns-log-parser';

/**
 * DNS syslog UDP collector — nhận log DNS thật từ RouterOS (`/system logging action target=remote`),
 * bóc 2 dạng dòng (câu hỏi/trả lời — dns-log-parser.ts) rồi ghi vào DnsResolutionCacheService dùng
 * chung với classifier.ts lúc chuẩn hoá IPFIX_FLOW. Chỉ đọc/ghi bảng tra cứu trong tiến trình —
 * KHÔNG ghi DB, KHÔNG gọi TelemetryService (log DNS không phải sự kiện cần lưu vĩnh viễn/đối soát,
 * chỉ là dữ liệu tham chiếu tạm để phân loại — đúng bản chất "bảng tra cứu" của tài liệu tham khảo).
 */
@Injectable()
export class DnsLogCollectorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DnsLogCollectorService.name);
  private socket?: dgram.Socket;

  constructor(
    @Inject(ENV_TOKEN) private readonly env: Env,
    private readonly dnsCache: DnsResolutionCacheService,
    private readonly inventoryCache: InventoryCacheService,
  ) {}

  onModuleInit() {
    const socket = dgram.createSocket('udp4');
    socket.on('message', (msg, rinfo) => {
      this.handlePacket(msg, rinfo).catch((err) => this.logger.error(`Unhandled error processing DNS log packet from ${rinfo.address}: ${(err as Error).message}`));
    });
    socket.on('error', (err) => this.logger.error(`DNS log UDP socket error: ${err.message}`));
    socket.bind(this.env.DNS_LOG_PORT, () => {
      this.logger.log(`DNS log collector listening on :${this.env.DNS_LOG_PORT}`);
    });
    this.socket = socket;
  }

  onModuleDestroy() {
    this.socket?.close();
  }

  private async handlePacket(msg: Buffer, rinfo: dgram.RemoteInfo) {
    const device = this.inventoryCache.deviceByIpAddress(rinfo.address);
    if (!device) {
      // Không log cảnh báo mỗi dòng (log DNS tần suất rất cao) -- chỉ âm thầm bỏ qua thiết bị lạ.
      return;
    }

    // 1 gói UDP syslog thường mang 1 dòng, nhưng tách theo dòng để chịu được trường hợp gộp nhiều.
    const text = msg.toString('utf8');
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      const parsed = parseDnsLogLine(line);
      if (!parsed) continue; // ~40-45% dòng không khớp là bình thường (PTR/TXT/SRV/tên miền lỗi...)

      // Khoá theo device.id (ổn định, có sẵn cả lúc chuẩn hoá IPFIX_FLOW qua event.deviceId) —
      // KHÔNG dùng rinfo.address, vì lúc classifier.ts tra cứu (trong normalizeIpfixFlowEvent) chỉ
      // có deviceId trên raw_telemetry_events, không có lại địa chỉ UDP gốc.
      if (parsed.type === 'query') {
        this.dnsCache.recordQuery(device.id, parsed.clientIp, parsed.txId);
      } else {
        this.dnsCache.recordAnswer(device.id, parsed.txId, parsed.domain, parsed.resolvedIp);
      }
    }
  }
}
