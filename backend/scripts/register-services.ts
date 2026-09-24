/**
 * Dang ky service_endpoints THAT vao database control.
 *
 * VI SAO CAN SCRIPT NAY:
 *   docs/runbooks/server-bootstrap.md muc 4 ("Register service endpoints") la mot buoc THU CONG.
 *   Khong co migration hay seed nao chen dong service_endpoints. Neu khong ai lam tay buoc do,
 *   he thong cai xong van chay nhung:
 *     - trang "VPN ZeroTier"  -> 422 ZEROTIER_NOT_CONFIGURED
 *       ("No service_endpoints row for service_name=\"zerotier.controller\"")
 *     - GET /ships/{id}/crew/radius-health -> luon UNKNOWN (registry.resolve tra ve mang rong)
 *   Day KHONG phai loi cua ban cai dat -- chi la buoc bootstrap chua ai chay tren DB do.
 *
 * DUNG:
 *   npm run services:register -- --list        # xem dang co gi, khong sua gi
 *   npm run services:register -- --dry-run     # in ra se lam gi, khong ghi DB
 *   npm run services:register                  # ghi that (idempotent)
 *   npm run services:register -- --only=zerotier.controller
 *   npm run services:register -- --force-update   # CHO PHEP ghi de dong da co (mac dinh: khong)
 *
 * AN TOAN VOI DU LIEU THAT: script KHONG BAO GIO xoa dong nao. Dong chua co -> tao moi.
 * Dong da co nhung khac cau hinh -> MAC DINH BO QUA va bao ra (co the la nguoi van hanh da
 * chinh tay co chu dich); chi ghi de khi truyen --force-update, va moi lan ghi deu luu lai
 * ban cu trong service_endpoint_revisions.
 *
 * NGUYEN TAC: script KHONG BAO GIO tu bia dia chi. Moi endpoint chi duoc dang ky khi cac bien
 * moi truong tuong ung da co that trong .env. Thieu bien -> BO QUA + in ra dung bien can dat.
 * Tha de trang bao "chua cau hinh" con hon ghi mot IP doan mo vao DB roi health check bao do.
 */
import { Client } from 'pg';
import { loadEnv, requireEnv } from './load-env';

type Plan = {
  serviceName: string;
  serviceType: string;
  host: string;
  port: number;
  protocol: string;
  priority: number;
  healthcheckType: string;
  healthcheckIntervalS: number;
  timeoutMs: number;
  secretRef: string | null;
  checkConfig: Record<string, unknown>;
  note: string;
};

type Skipped = { serviceName: string; reason: string };

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

function env(key: string): string | undefined {
  const v = process.env[key];
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

function intEnv(key: string, fallback: number): number {
  const v = env(key);
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0 || n > 65535) throw new Error(`${key}="${v}" khong phai so cong hop le.`);
  return n;
}

/** Xay danh sach endpoint tu env THAT. Khong co bien -> khong dang ky, khong doan. */
function buildPlans(environment: string): { plans: Plan[]; skipped: Skipped[] } {
  const plans: Plan[] = [];
  const skipped: Skipped[] = [];

  // ---- zerotier.controller -------------------------------------------------
  // Host phai la dia chi ma BACKEND goi toi duoc. Trong trien khai co zt-api-proxy thi day la
  // dia chi cua proxy, khong phai controller 9993 (controller nam trong docker network noi bo).
  // Vi vay khong the doan -- bat buoc dat ZEROTIER_CONTROLLER_HOST.
  const ztHost = env('ZEROTIER_CONTROLLER_HOST');
  if (!ztHost) {
    skipped.push({
      serviceName: 'zerotier.controller',
      reason:
        'Thieu ZEROTIER_CONTROLLER_HOST trong .env. Dat dia chi ma BACKEND goi toi duoc\n' +
        '        (controller ZeroTier truc tiep, hoac zt-api-proxy neu controller chay trong Docker).\n' +
        '        Vi du: ZEROTIER_CONTROLLER_HOST=127.0.0.1 / ZEROTIER_CONTROLLER_PORT=9993',
    });
  } else if (!env('ZEROTIER_CONTROLLER_TOKEN')) {
    skipped.push({
      serviceName: 'zerotier.controller',
      reason:
        'Co ZEROTIER_CONTROLLER_HOST nhung thieu ZEROTIER_CONTROLLER_TOKEN.\n' +
        '        Token = noi dung file authtoken.secret cua controller (thuong o\n' +
        '        /var/lib/zerotier-one/authtoken.secret). Dang ky ma khong co token thi\n' +
        '        trang VPN van 422, chi doi thong bao loi.',
    });
  } else {
    plans.push({
      serviceName: 'zerotier.controller',
      serviceType: 'ZEROTIER',
      host: ztHost,
      port: intEnv('ZEROTIER_CONTROLLER_PORT', 9993),
      protocol: env('ZEROTIER_CONTROLLER_PROTOCOL') ?? 'http',
      priority: 100,
      // health-sweep khong co checker cho service_type=ZEROTIER (checkerFor() tra null) nen
      // gia tri nay chi la khai bao y dinh, khong bao gio duoc chay -> khong sinh trang thai gia.
      healthcheckType: 'HTTP_FUNCTIONAL',
      healthcheckIntervalS: 60,
      timeoutMs: 5000,
      secretRef: 'env:ZEROTIER_CONTROLLER_TOKEN',
      checkConfig: {},
      note: 'Sua trang "VPN ZeroTier" (422 ZEROTIER_NOT_CONFIGURED).',
    });
  }

  // ---- radius.auth / radius.accounting -------------------------------------
  // RadiusHealthChecker gui Access-Request THAT -> can host backend goi toi duoc VA mot shared
  // secret ma FreeRADIUS chap nhan cho chinh IP cua backend (phai co dong trong bang `nas`).
  // RADIUS_SERVER_ADDRESS khong dung duoc o day: no la "dia chi nhu ROUTER nhin thay" (IP
  // ZeroTier de sinh lenh RouterOS), server khong tu ket noi toi no.
  const raHost = env('RADIUS_HEALTHCHECK_HOST');
  const raSecret = env('RADIUS_HEALTHCHECK_SECRET');
  if (!raHost || !raSecret) {
    skipped.push({
      serviceName: 'radius.auth + radius.accounting',
      reason:
        `Thieu ${!raHost ? 'RADIUS_HEALTHCHECK_HOST' : ''}${!raHost && !raSecret ? ' va ' : ''}${!raSecret ? 'RADIUS_HEALTHCHECK_SECRET' : ''}.\n` +
        '        Health check RADIUS gui Access-Request THAT nen can:\n' +
        '          1) RADIUS_HEALTHCHECK_HOST = IP FreeRADIUS ma BACKEND goi toi duoc\n' +
        '          2) RADIUS_HEALTHCHECK_SECRET = shared secret rieng cho IP cua backend\n' +
        '        Va tren FreeRADIUS phai co dong NAS cho chinh backend, vi du:\n' +
        "          INSERT INTO nas (nasname, shortname, type, secret, description)\n" +
        "          VALUES ('<IP-cua-backend>', 'fleet-backend', 'other', '<secret>', 'health probe');\n" +
        '          (roi systemctl restart freeradius -- clients chi doc luc khoi dong)\n' +
        '        Chua co thi BO QUA -- radius-health se bao UNKNOWN (dung su that: chua do bao gio),\n' +
        '        thay vi dang ky bua roi bao UNHEALTHY.',
    });
  } else {
    const probeUser = env('RADIUS_HEALTHCHECK_USERNAME') ?? 'healthcheck-probe';
    const probePass = env('RADIUS_HEALTHCHECK_PASSWORD') ?? 'healthcheck-probe-password';
    // Access-Accept HOAC Access-Reject deu tinh la HEALTHY (xem radius.checker.ts) nen user
    // probe khong can ton tai that trong radcheck.
    plans.push({
      serviceName: 'radius.auth',
      serviceType: 'RADIUS',
      host: raHost,
      port: intEnv('RADIUS_AUTH_PORT', 1812),
      protocol: 'udp',
      priority: 100,
      healthcheckType: 'RADIUS_ACCESS_REQUEST',
      healthcheckIntervalS: 30,
      timeoutMs: 5000,
      secretRef: 'env:RADIUS_HEALTHCHECK_SECRET',
      checkConfig: { probe_username: probeUser, probe_password: probePass },
      note: 'Bo trang thai UNKNOWN cua GET /ships/{id}/crew/radius-health.',
    });
    plans.push({
      serviceName: 'radius.accounting',
      serviceType: 'RADIUS_ACCT',
      host: raHost,
      port: intEnv('RADIUS_ACCT_PORT', 1813),
      protocol: 'udp',
      priority: 100,
      healthcheckType: 'RADIUS_ACCESS_REQUEST',
      healthcheckIntervalS: 30,
      timeoutMs: 5000,
      secretRef: 'env:RADIUS_HEALTHCHECK_SECRET',
      checkConfig: { probe_username: probeUser, probe_password: probePass },
      note: 'Bo trang thai UNKNOWN cua GET /ships/{id}/crew/radius-health.',
    });
  }

  // ---- database.control ----------------------------------------------------
  // DatabaseHealthChecker mo ket noi SQL THAT bang secret_ref -> khong co mat khau thi probe
  // chac chan that bai va endpoint se bao UNHEALTHY mot cach sai su that. Nen chi dang ky khi
  // DATABASE_CONTROL_PASSWORD co that.
  const controlUrl = new URL(requireEnv('DATABASE_CONTROL_URL', null));
  if (!env('DATABASE_CONTROL_PASSWORD')) {
    skipped.push({
      serviceName: 'database.control',
      reason:
        'Thieu DATABASE_CONTROL_PASSWORD. Health check DB mo ket noi SQL that bang bien nay\n' +
        '        (DATABASE_CONTROL_URL khong duoc dung lam secret -- ADR-05: DB chi giu secret_ref).\n' +
        '        Dat DATABASE_CONTROL_PASSWORD=<mat khau cua user trong DATABASE_CONTROL_URL> roi chay lai.',
    });
  } else {
    plans.push({
      serviceName: 'database.control',
      serviceType: 'DATABASE',
      host: controlUrl.hostname,
      port: controlUrl.port ? Number.parseInt(controlUrl.port, 10) : 5432,
      protocol: 'tcp',
      priority: 100,
      healthcheckType: 'SQL_RW',
      healthcheckIntervalS: 30,
      timeoutMs: 5000,
      secretRef: 'env:DATABASE_CONTROL_PASSWORD',
      checkConfig: {
        username: decodeURIComponent(controlUrl.username),
        database: controlUrl.pathname.replace(/^\//, ''),
      },
      note: 'Health check DB control (SQL_RW that).',
    });
  }

  // ---- database.aaa (chi khi dung FreeRADIUS ngoai) -------------------------
  const aaaUrlRaw = env('DATABASE_AAA_URL');
  if (!aaaUrlRaw) {
    skipped.push({ serviceName: 'database.aaa', reason: 'Khong co DATABASE_AAA_URL -- dung, bo qua.' });
  } else if (!env('DATABASE_AAA_PASSWORD')) {
    skipped.push({
      serviceName: 'database.aaa',
      reason: 'Thieu DATABASE_AAA_PASSWORD (mat khau role `radius`). Cung ly do nhu database.control.',
    });
  } else {
    const aaaUrl = new URL(aaaUrlRaw);
    plans.push({
      serviceName: 'database.aaa',
      serviceType: 'DATABASE',
      host: aaaUrl.hostname,
      port: aaaUrl.port ? Number.parseInt(aaaUrl.port, 10) : 5432,
      protocol: 'tcp',
      priority: 100,
      healthcheckType: 'SQL_RW',
      healthcheckIntervalS: 30,
      timeoutMs: 5000,
      secretRef: 'env:DATABASE_AAA_PASSWORD',
      checkConfig: {
        username: decodeURIComponent(aaaUrl.username),
        database: aaaUrl.pathname.replace(/^\//, ''),
      },
      note: 'DB radius cua FreeRADIUS (radacct/radcheck/nas).',
    });
  }

  void environment;
  return { plans, skipped };
}

async function listExisting(client: Client): Promise<void> {
  const { rows } = await client.query(
    `SELECT service_name, service_type, environment, host, port, protocol, enabled, in_maintenance,
            secret_ref, created_at
       FROM service_endpoints
      WHERE deleted_at IS NULL
      ORDER BY service_name, priority, host`,
  );
  if (rows.length === 0) {
    console.log('service_endpoints: RONG (0 dong).');
    console.log('  -> Day chinh la nguyen nhan trang VPN ZeroTier bao ZEROTIER_NOT_CONFIGURED');
    console.log('     va crew/radius-health luon UNKNOWN.');
    return;
  }
  console.log(`service_endpoints: ${rows.length} dong`);
  for (const r of rows) {
    const flags = [r.enabled ? 'enabled' : 'DISABLED', r.in_maintenance ? 'MAINTENANCE' : null].filter(Boolean).join(', ');
    console.log(`  ${r.service_name.padEnd(22)} ${String(r.service_type).padEnd(10)} ${r.protocol}://${r.host}:${r.port}  [${flags}]  secret_ref=${r.secret_ref ?? '-'}`);
  }
}

async function upsert(
  client: Client,
  plan: Plan,
  environment: string,
  dryRun: boolean,
  allowUpdate: boolean,
): Promise<'created' | 'updated' | 'unchanged' | 'kept'> {
  const { rows: existingRows } = await client.query(
    `SELECT id, service_type, priority, healthcheck_type, healthcheck_interval_s, timeout_ms,
            secret_ref, check_config, enabled, config_version
       FROM service_endpoints
      WHERE service_name = $1 AND environment = $2 AND host = $3 AND port = $4 AND protocol = $5
        AND deleted_at IS NULL`,
    [plan.serviceName, environment, plan.host, plan.port, plan.protocol],
  );
  const existing = existingRows[0];

  if (!existing) {
    if (dryRun) return 'created';
    const { rows } = await client.query(
      `INSERT INTO service_endpoints
         (service_name, service_type, environment, host, port, protocol, priority, enabled,
          healthcheck_type, healthcheck_interval_s, timeout_ms, secret_ref, check_config)
       VALUES ($1, $2::service_type, $3, $4, $5, $6, $7, true, $8::healthcheck_type, $9, $10, $11, $12::jsonb)
       RETURNING id`,
      [
        plan.serviceName, plan.serviceType, environment, plan.host, plan.port, plan.protocol,
        plan.priority, plan.healthcheckType, plan.healthcheckIntervalS, plan.timeoutMs,
        plan.secretRef, JSON.stringify(plan.checkConfig),
      ],
    );
    await client.query(
      `INSERT INTO service_endpoint_revisions (endpoint_id, version, payload, change_reason, changed_by)
       VALUES ($1, 1, $2::jsonb, $3, $4)`,
      [
        rows[0].id,
        JSON.stringify({ ...plan, secretRef: plan.secretRef, environment, enabled: true }),
        'Bootstrap: scripts/register-services.ts',
        'scripts/register-services.ts',
      ],
    );
    return 'created';
  }

  const same =
    existing.service_type === plan.serviceType &&
    existing.priority === plan.priority &&
    existing.healthcheck_type === plan.healthcheckType &&
    existing.healthcheck_interval_s === plan.healthcheckIntervalS &&
    existing.timeout_ms === plan.timeoutMs &&
    existing.secret_ref === plan.secretRef &&
    existing.enabled === true &&
    JSON.stringify(existing.check_config ?? {}) === JSON.stringify(plan.checkConfig);
  if (same) return 'unchanged';

  // DU LIEU THAT: dong nay da ton tai va KHAC voi env. Co the do nguoi van hanh chinh tay
  // (doi priority, doi secret_ref, them probe rieng...). Mac dinh KHONG ghi de -- chi bao ra.
  // Muon ghi de phai noi ro bang --force-update.
  if (!allowUpdate) return 'kept';
  if (dryRun) return 'updated';

  const nextVersion = (existing.config_version ?? 1) + 1;
  await client.query(
    `UPDATE service_endpoints
        SET service_type = $1::service_type, priority = $2, enabled = true,
            healthcheck_type = $3::healthcheck_type, healthcheck_interval_s = $4, timeout_ms = $5,
            secret_ref = $6, check_config = $7::jsonb, config_version = $8, updated_at = now()
      WHERE id = $9`,
    [
      plan.serviceType, plan.priority, plan.healthcheckType, plan.healthcheckIntervalS,
      plan.timeoutMs, plan.secretRef, JSON.stringify(plan.checkConfig), nextVersion, existing.id,
    ],
  );
  await client.query(
    `INSERT INTO service_endpoint_revisions (endpoint_id, version, payload, change_reason, changed_by)
     VALUES ($1, $2, $3::jsonb, $4, $5)`,
    [
      existing.id, nextVersion,
      JSON.stringify({ ...plan, environment, enabled: true }),
      'Bootstrap re-run: scripts/register-services.ts',
      'scripts/register-services.ts',
    ],
  );
  return 'updated';
}

async function main(): Promise<void> {
  const envFile = loadEnv();
  const url = requireEnv('DATABASE_CONTROL_URL', envFile);
  const environment = env('NODE_ENV') ?? 'development';
  const dryRun = flag('dry-run');
  const forceUpdate = flag('force-update');
  const only = arg('only');

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    console.log(`Env file: ${envFile ?? '(khong co)'}`);
    console.log(`environment = "${environment}" (tu NODE_ENV -- phai khop cot service_endpoints.environment)`);
    console.log('');

    if (flag('list')) {
      await listExisting(client);
      return;
    }

    const { plans, skipped } = buildPlans(environment);
    const selected = only ? plans.filter((p) => p.serviceName === only) : plans;
    if (only && selected.length === 0) {
      console.log(`Khong co ke hoach nao cho --only=${only}. Cac service co the dang ky: ${plans.map((p) => p.serviceName).join(', ') || '(khong co)'}`);
      return;
    }

    if (dryRun) console.log('--- DRY RUN: khong ghi gi vao DB ---\n');

    for (const plan of selected) {
      const action = await upsert(client, plan, environment, dryRun, forceUpdate);
      const label =
        action === 'created' ? 'TAO MOI  '
        : action === 'updated' ? 'CAP NHAT '
        : action === 'kept' ? 'BO QUA   '
        : 'GIU NGUYEN';
      console.log(`[${label}] ${plan.serviceName.padEnd(22)} ${plan.protocol}://${plan.host}:${plan.port}  secret_ref=${plan.secretRef ?? '-'}`);
      if (action === 'kept') {
        console.log('           Dong nay DA TON TAI va khac cau hinh trong .env -- khong ghi de.');
        console.log('           Xem chi tiet: --list  |  Co chu y muon ghi de: --force-update');
      } else {
        console.log(`           ${plan.note}`);
      }
    }

    if (skipped.length > 0) {
      console.log('\n--- BO QUA (thieu cau hinh that -- script khong tu bia dia chi) ---');
      for (const s of skipped) {
        console.log(`  ${s.serviceName}:`);
        console.log(`        ${s.reason}`);
      }
    }

    console.log('\nXong. Kiem tra lai: npm run services:register -- --list');
    if (!dryRun && selected.length > 0) {
      console.log('LUU Y: ServiceRegistry co cache trong process -- restart backend de chac chan doc dong moi.');
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`\nLOI: ${(err as Error).message}`);
  process.exitCode = 1;
});
