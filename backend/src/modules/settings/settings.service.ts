import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '@audit/audit.service';
import { EnvSecretStore } from '@secrets/env-secret-store';
import { UpdateSettingsInput } from './dto';

export interface SettingsSnapshot {
  database: {
    host: string | null;
    port: number | null;
    database: string | null;
    username: string | null;
    password_configured: boolean;
  };
  radius_auth_port: number;
  radius_acct_port: number;
  netflow_port: number;
  dns_log_port: number;
  zerotier_controller_token_configured: boolean;
}

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly envStore: EnvSecretStore,
    private readonly audit: AuditService,
  ) {}

  private parseDatabaseUrl(url: string | undefined): SettingsSnapshot['database'] {
    if (!url) return { host: null, port: null, database: null, username: null, password_configured: false };
    try {
      const u = new URL(url);
      return {
        host: u.hostname || null,
        port: u.port ? Number(u.port) : null,
        database: u.pathname ? u.pathname.replace(/^\//, '') : null,
        username: u.username ? decodeURIComponent(u.username) : null,
        password_configured: u.password.length > 0,
      };
    } catch {
      // DATABASE_CONTROL_URL khong dung dinh dang URL -- van hien thi honest thay vi crash trang.
      return { host: null, port: null, database: null, username: null, password_configured: false };
    }
  }

  getCurrent(): SettingsSnapshot {
    return {
      database: this.parseDatabaseUrl(this.envStore.get('DATABASE_CONTROL_URL')),
      radius_auth_port: Number(this.envStore.get('RADIUS_AUTH_PORT') ?? 1812),
      radius_acct_port: Number(this.envStore.get('RADIUS_ACCT_PORT') ?? 1813),
      netflow_port: Number(this.envStore.get('NETFLOW_PORT') ?? 2055),
      dns_log_port: Number(this.envStore.get('DNS_LOG_PORT') ?? 5514),
      zerotier_controller_token_configured: !!this.envStore.get('ZEROTIER_CONTROLLER_TOKEN'),
    };
  }

  async update(input: UpdateSettingsInput): Promise<SettingsSnapshot & { restart_required: boolean }> {
    const changedKeys: string[] = [];

    if (input.database) {
      const currentUrl = this.envStore.get('DATABASE_CONTROL_URL') ?? 'postgres://postgres:postgres@localhost:5432/postgres';
      let u: URL;
      try {
        u = new URL(currentUrl);
      } catch {
        u = new URL('postgres://postgres:postgres@localhost:5432/postgres');
      }
      if (input.database.host) u.hostname = input.database.host;
      if (input.database.port) u.port = String(input.database.port);
      if (input.database.database) u.pathname = `/${input.database.database}`;
      if (input.database.username) u.username = input.database.username;
      // Rong/thieu = giu nguyen mat khau hien tai (u.password da mang gia tri cu vi u duoc parse
      // tu currentUrl) -- chi ghi de khi nguoi dung thuc su go mat khau moi.
      if (input.database.password) u.password = input.database.password;
      this.envStore.set('DATABASE_CONTROL_URL', u.toString());
      changedKeys.push('DATABASE_CONTROL_URL');
    }
    if (input.radius_auth_port !== undefined) {
      this.envStore.set('RADIUS_AUTH_PORT', String(input.radius_auth_port));
      changedKeys.push('RADIUS_AUTH_PORT');
    }
    if (input.radius_acct_port !== undefined) {
      this.envStore.set('RADIUS_ACCT_PORT', String(input.radius_acct_port));
      changedKeys.push('RADIUS_ACCT_PORT');
    }
    if (input.netflow_port !== undefined) {
      this.envStore.set('NETFLOW_PORT', String(input.netflow_port));
      changedKeys.push('NETFLOW_PORT');
    }
    if (input.dns_log_port !== undefined) {
      this.envStore.set('DNS_LOG_PORT', String(input.dns_log_port));
      changedKeys.push('DNS_LOG_PORT');
    }
    if (input.zerotier_controller_token) {
      this.envStore.set('ZEROTIER_CONTROLLER_TOKEN', input.zerotier_controller_token);
      changedKeys.push('ZEROTIER_CONTROLLER_TOKEN');
    }

    // Best-effort -- DUNG duoc audit_logs can chinh DB, nhung day la trang danh rieng cho luc DB
    // co the dang KHONG ket noi duoc (vd doi DATABASE_CONTROL_URL de sua loi ket noi that). Ghi
    // audit that neu DB con song; khong chan viec luu settings neu DB dang down.
    try {
      await this.audit.record({
        action: 'settings.update',
        resourceType: 'settings',
        resourceId: 'bootstrap-env',
        after: { changed_keys: changedKeys, reason: input.reason },
        result: 'SUCCESS',
      });
    } catch (err) {
      this.logger.warn(`Không ghi được audit log cho settings.update (có thể do DB đang mất kết nối): ${(err as Error).message}`);
    }

    return { ...this.getCurrent(), restart_required: changedKeys.length > 0 };
  }
}
