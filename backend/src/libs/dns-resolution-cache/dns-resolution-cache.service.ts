import { Injectable } from '@nestjs/common';

type Entry = { domain: string; ts: number };
type PendingQuery = { clientIp: string; ts: number };

export type DnsLookupResult = { domain: string; tier: 1 | 2 };

const PENDING_TTL_MS = 30 * 60 * 1000; // PDF mục 9 — đủ để ghép câu hỏi với câu trả lời tới sau
const RESOLUTION_TTL_MS = 6 * 60 * 60 * 1000; // dài hơn TTL DNS thật cố ý — máy khách giữ kết nối cũ lâu
const MAX_ENTRIES_PER_MAP = 500_000; // trần + LRU-evict để tránh bẫy số 8/9 (nhãn dịch vụ mất dần)

/**
 * Bảng tra cứu DNS trong bộ nhớ — dùng chung giữa DnsLogCollectorService (ghi, lúc nhận syslog
 * thật) và classifier.ts (đọc, lúc chuẩn hoá IPFIX_FLOW). Đúng tài liệu tham khảo mục 5.1 + 6:
 * tầng 1 = theo từng máy khách (chính xác nhất), tầng 2 = theo router (khi không biết máy nào hỏi).
 *
 * QUAN TRỌNG (bẫy số 9 tài liệu tham khảo): kiểm tra HẠN DÙNG (timestamp) ở mọi lần đọc, không chỉ
 * kiểm tra "có tồn tại key hay không" — nếu không, mục đã hết hạn sẽ không bao giờ được tra lại
 * VÀ cũng không bị xoá, khiến tỷ lệ "Khác" tăng dần rồi chỉ giảm khi khởi động lại tiến trình.
 */
@Injectable()
export class DnsResolutionCacheService {
  private readonly pendingQueries = new Map<string, PendingQuery>();
  private readonly perClientDomain = new Map<string, Entry>();
  private readonly perRouterDomain = new Map<string, Entry>();

  /** Dòng "dns query from ..." — ghi lại ai vừa hỏi, chờ dòng "done query" mang domain+IP tới. */
  recordQuery(deviceId: string, clientIp: string, txId: string): void {
    this.evictIfFull(this.pendingQueries);
    this.pendingQueries.set(`${deviceId}|${txId}`, { clientIp, ts: Date.now() });
  }

  /** Dòng "dns done query: ..." — mang domain + IP đã phân giải; ghép ngược với query đang chờ (nếu còn hạn). */
  recordAnswer(deviceId: string, txId: string, domain: string, resolvedIp: string): void {
    const now = Date.now();
    this.evictIfFull(this.perRouterDomain);
    this.perRouterDomain.set(`${deviceId}|${resolvedIp}`, { domain, ts: now });

    const pendingKey = `${deviceId}|${txId}`;
    const pending = this.pendingQueries.get(pendingKey);
    if (pending && now - pending.ts <= PENDING_TTL_MS) {
      this.evictIfFull(this.perClientDomain);
      this.perClientDomain.set(`${deviceId}|${pending.clientIp}|${resolvedIp}`, { domain, ts: now });
      this.pendingQueries.delete(pendingKey);
    }
  }

  /** Tra cứu lúc phân loại 1 flow: đúng router, đúng client, đúng IP đích -> tên miền + tầng tin cậy. */
  lookup(deviceId: string, clientIp: string, destIp: string): DnsLookupResult | null {
    const now = Date.now();
    const tier1 = this.perClientDomain.get(`${deviceId}|${clientIp}|${destIp}`);
    if (tier1 && now - tier1.ts <= RESOLUTION_TTL_MS) return { domain: tier1.domain, tier: 1 };

    const tier2 = this.perRouterDomain.get(`${deviceId}|${destIp}`);
    if (tier2 && now - tier2.ts <= RESOLUTION_TTL_MS) return { domain: tier2.domain, tier: 2 };

    return null;
  }

  private evictIfFull(map: Map<string, unknown>): void {
    if (map.size < MAX_ENTRIES_PER_MAP) return;
    // Map giữ đúng thứ tự chèn -> phần tử đầu tiên là cũ nhất, khớp LRU đơn giản (bẫy số 8).
    const oldestKey = map.keys().next().value;
    if (oldestKey !== undefined) map.delete(oldestKey);
  }

  /** Chỉ dùng cho giám sát/kiểm tra thủ công — không phải API công khai. */
  stats() {
    return { pendingQueries: this.pendingQueries.size, perClientDomain: this.perClientDomain.size, perRouterDomain: this.perRouterDomain.size };
  }
}
