import { DnsResolutionCacheService } from '@dns-resolution-cache/dns-resolution-cache.service';
import { classifyDomainToApp } from './service-catalog';

export type ClassifyResult = {
  method: 'DNS' | 'UNKNOWN';
  confidence: number | null;
  domain: string | null;
  app: string | null;
  unknownReason: string | null;
};

/**
 * Ghép NetFlow (bao nhiêu byte, tới IP nào) với cache DNS (IP đó là tên miền gì) để ra kết quả
 * phân loại thật cho 1 flow — tài liệu tham khảo mục 6: tầng 1 (đúng máy khách) tin cậy hơn tầng 2
 * (đúng router, không rõ máy khách nào đã hỏi). KHÔNG lẫn "không biết domain" (method=UNKNOWN) với
 * "biết domain nhưng chưa có trong service-catalog.ts" (method vẫn là DNS, app=null → hiển thị "Khác").
 */
export function classifyFlow(dnsCache: DnsResolutionCacheService, deviceId: string | null, clientIp: string, destIp: string): ClassifyResult {
  if (!deviceId) {
    return { method: 'UNKNOWN', confidence: null, domain: null, app: null, unknownReason: 'NO_DEVICE_ID' };
  }

  const hit = dnsCache.lookup(deviceId, clientIp, destIp);
  if (!hit) {
    return { method: 'UNKNOWN', confidence: null, domain: null, app: null, unknownReason: 'NO_DNS_RECORD' };
  }

  const app = classifyDomainToApp(hit.domain);
  // Tầng 1 (per-client) tin cậy hơn tầng 2 (per-router, có thể domain do máy khách khác hỏi).
  const confidence = hit.tier === 1 ? 0.95 : 0.7;
  return { method: 'DNS', confidence, domain: hit.domain, app, unknownReason: null };
}
