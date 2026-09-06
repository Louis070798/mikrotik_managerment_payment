import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { DB_TOKEN, DbClient } from '@db/db.module';
import { deviceBackups } from '@db/schema';
import { HealthChecker, CheckAttemptResult } from './types';
import { EndpointCandidate } from '@registry/registry.types';

/**
 * Backup health check — SYSTEM_SPEC §10.2/§8.4: "backup gần nhất có restore được không?",
 * tuổi backup, kết quả restore test. Đây là check duy nhất trong 4 loại KHÔNG đi ra mạng —
 * nó đọc trạng thái đã ghi nhận trong `device_backups` (do job BACKUP/RESTORE_TEST tạo ra,
 * ngoài phạm vi module này) cho các thiết bị dùng target lưu trữ này
 * (`storage_targets` chứa `{"target": "<service_name>"}`).
 *
 * UNKNOWN nếu chưa từng có backup nào tham chiếu target này — không suy luận HEALTHY từ
 * sự vắng mặt của dữ liệu.
 */
@Injectable()
export class BackupHealthChecker implements HealthChecker {
  readonly healthcheckType = 'BACKUP_FRESHNESS';

  constructor(@Inject(DB_TOKEN) private readonly db: DbClient) {}

  async check(endpoint: EndpointCandidate): Promise<CheckAttemptResult> {
    const cfg = endpoint.checkConfig as { warning_age_hours?: number; critical_age_hours?: number };
    const warningAgeHours = cfg.warning_age_hours ?? 26; // > 1 ngày + buffer
    const criticalAgeHours = cfg.critical_age_hours ?? 72;

    const started = Date.now();
    const [latest] = await this.db
      .select()
      .from(deviceBackups)
      .where(sql`${deviceBackups.storageTargets} @> ${JSON.stringify([{ target: endpoint.serviceName }])}::jsonb`)
      .orderBy(desc(deviceBackups.createdAt))
      .limit(1);

    const rttMs = Date.now() - started;

    if (!latest) {
      return {
        success: false,
        rttMs,
        errorMessage: `No backup ever recorded for storage target "${endpoint.serviceName}"`,
      };
    }

    const ageHours = (Date.now() - latest.createdAt.getTime()) / 3_600_000;
    const restoreFailed = latest.restoreTestResult === 'FAILED';
    const restoreUntested = latest.restoreTestResult === 'NOT_TESTED';

    if (ageHours > criticalAgeHours || restoreFailed) {
      return {
        success: false,
        rttMs,
        details: { age_hours: ageHours, restore_test_result: latest.restoreTestResult },
        errorMessage: restoreFailed
          ? 'Latest backup failed restore test'
          : `Latest backup is ${ageHours.toFixed(1)}h old (critical threshold ${criticalAgeHours}h)`,
      };
    }

    const degraded = ageHours > warningAgeHours || restoreUntested;
    return {
      success: true,
      degraded,
      rttMs,
      details: { age_hours: ageHours, restore_test_result: latest.restoreTestResult, backup_id: latest.id },
      errorMessage: degraded
        ? restoreUntested
          ? 'Latest backup has not been restore-tested yet'
          : `Latest backup is ${ageHours.toFixed(1)}h old (warning threshold ${warningAgeHours}h)`
        : undefined,
    };
  }
}
