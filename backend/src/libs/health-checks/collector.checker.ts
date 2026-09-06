import { Injectable, Logger } from '@nestjs/common';
import { HealthChecker, CheckAttemptResult } from './types';
import { EndpointCandidate } from '@registry/registry.types';

/**
 * Collector health check — SYSTEM_SPEC §10.2/§10.3: "Last flow received, queue depth,
 * packet loss" cho IPFIX; tổng quát hoá thành HTTP functional check: GET {checkConfig.path}
 * kỳ vọng JSON { status, last_event_at?, queue_depth? }.
 *
 * Đây KHÔNG phải kiểm tra TCP port — nó gọi endpoint /healthz thật của collector và đọc
 * nội dung trả về để suy luận DEGRADED khi last_event_at quá cũ, đúng tinh thần "health check
 * phải kiểm tra chức năng" (SYSTEM_SPEC §10.3). Ở giai đoạn này (module Inventory + Server
 * Health, chưa tới Phase 3-4) chưa có collector thật chạy — checker dùng để test với một
 * HTTP stub trong integration test, chứng minh cơ chế hoạt động đúng.
 */
@Injectable()
export class CollectorHealthChecker implements HealthChecker {
  readonly healthcheckType = 'HTTP_FUNCTIONAL';
  private readonly logger = new Logger(CollectorHealthChecker.name);

  async check(endpoint: EndpointCandidate): Promise<CheckAttemptResult> {
    const cfg = endpoint.checkConfig as { path?: string; staleness_threshold_s?: number };
    const path = cfg.path ?? '/healthz';
    const stalenessThresholdS = cfg.staleness_threshold_s ?? 120;
    const url = `${endpoint.protocol}://${endpoint.host}:${endpoint.port}${path}`;

    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), endpoint.timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      const rttMs = Date.now() - started;
      if (!res.ok) {
        return { success: false, rttMs, errorMessage: `HTTP ${res.status}` };
      }
      const body = (await res.json()) as { status?: string; last_event_at?: string; queue_depth?: number };
      if (body.status !== 'ok') {
        return { success: false, rttMs, errorMessage: `Collector reported status=${body.status}` };
      }

      let degraded = false;
      let stalenessS: number | undefined;
      if (body.last_event_at) {
        stalenessS = (Date.now() - new Date(body.last_event_at).getTime()) / 1000;
        degraded = stalenessS > stalenessThresholdS;
      }

      return {
        success: true,
        degraded,
        rttMs,
        details: { last_event_at: body.last_event_at, staleness_s: stalenessS, queue_depth: body.queue_depth },
        errorMessage: degraded ? `last_event_at is ${Math.round(stalenessS ?? 0)}s old (threshold ${stalenessThresholdS}s)` : undefined,
      };
    } catch (err) {
      return { success: false, rttMs: Date.now() - started, errorMessage: (err as Error).message };
    } finally {
      clearTimeout(timer);
    }
  }
}
