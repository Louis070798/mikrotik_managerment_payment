import { Injectable, Logger } from '@nestjs/common';
import { Client } from 'pg';
import { HealthChecker, CheckAttemptResult } from './types';
import { EndpointCandidate } from '@registry/registry.types';
import { CredentialResolver } from './credential-resolver';

/**
 * Database health check — SYSTEM_SPEC §10.2/§10.3: "Connection, read query, write
 * transaction test, replication lag", KHÔNG chỉ kiểm tra TCP port mở.
 *
 * Write test dùng TEMP TABLE: tồn tại trong phạm vi session hiện tại, tự động bị Postgres
 * dọn khi kết nối đóng — không để lại rác trên database đích, không cần quyền tạo bảng
 * thường trực. Nếu connect được nhưng write test fail (vd read-only replica) → DEGRADED,
 * không phải UNHEALTHY: đọc vẫn hoạt động, chỉ là không nhận ghi.
 */
@Injectable()
export class DatabaseHealthChecker implements HealthChecker {
  readonly healthcheckType = 'SQL_RW';
  private readonly logger = new Logger(DatabaseHealthChecker.name);

  constructor(private readonly credentials: CredentialResolver) {}

  async check(endpoint: EndpointCandidate): Promise<CheckAttemptResult> {
    const password = await this.credentials.resolve(endpoint.secretRef);
    const cfg = endpoint.checkConfig as { username?: string; database?: string };
    const username = cfg.username ?? 'fleet_app';
    const database = cfg.database ?? 'postgres';

    const client = new Client({
      host: endpoint.host,
      port: endpoint.port,
      user: username,
      password: password ?? undefined,
      database,
      connectionTimeoutMillis: endpoint.timeoutMs,
      query_timeout: endpoint.timeoutMs,
    });

    const started = Date.now();
    try {
      await client.connect();
      await client.query('SELECT 1');

      let writeOk = true;
      try {
        await client.query('CREATE TEMP TABLE IF NOT EXISTS _fleet_health_probe (id int, checked_at timestamptz)');
        await client.query('INSERT INTO _fleet_health_probe (id, checked_at) VALUES (1, now())');
        await client.query('DELETE FROM _fleet_health_probe');
      } catch (writeErr) {
        writeOk = false;
        this.logger.debug(`Write probe failed for ${endpoint.host}:${endpoint.port} — ${(writeErr as Error).message}`);
      }

      // Goal #5 (HA reporting): distinguish primary/secondary and surface replication lag —
      // without this a standby just looks like "write test failed" with no explanation why.
      let isPrimary: boolean | null = null;
      let replicationLagSeconds: number | null = null;
      let replicaCount: number | null = null;
      try {
        const { rows } = await client.query<{ in_recovery: boolean }>('SELECT pg_is_in_recovery() AS in_recovery');
        isPrimary = rows[0] ? !rows[0].in_recovery : null;
        if (isPrimary === false) {
          const { rows: lagRows } = await client.query<{ lag_seconds: number | null }>(
            "SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()))::float AS lag_seconds",
          );
          replicationLagSeconds = lagRows[0]?.lag_seconds ?? null;
        } else if (isPrimary === true) {
          const { rows: replicaRows } = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM pg_stat_replication');
          replicaCount = replicaRows[0] ? Number(replicaRows[0].count) : null;
        }
      } catch (replErr) {
        this.logger.debug(`Replication probe failed for ${endpoint.host}:${endpoint.port} — ${(replErr as Error).message}`);
      }

      const rttMs = Date.now() - started;
      return {
        success: true,
        degraded: !writeOk,
        rttMs,
        details: { read_ok: true, write_ok: writeOk, is_primary: isPrimary, replication_lag_seconds: replicationLagSeconds, replica_count: replicaCount },
        errorMessage: writeOk ? undefined : 'Read succeeded but write test failed (read-only?)',
      };
    } catch (err) {
      return { success: false, rttMs: Date.now() - started, errorMessage: (err as Error).message };
    } finally {
      await client.end().catch(() => undefined);
    }
  }
}
