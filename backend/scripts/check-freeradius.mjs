/**
 * Kiem chung tich hop FreeRADIUS truoc khi bat RADIUS_MODE=freeradius.
 *
 * Chay:  node scripts/check-freeradius.mjs      (tu thu muc backend/)
 *
 * Script KHONG sua gi ngoai mot ban ghi thu trong radcheck, va tu xoa ngay sau do. Chay duoc
 * nhieu lan, an toan tren he thong that.
 */
import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;
const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);
const warn = (m) => console.log(`  \x1b[33m!\x1b[0m ${m}`);
const head = (m) => console.log(`\n\x1b[1m${m}\x1b[0m`);

let failed = 0;
const fail = (m) => { bad(m); failed += 1; };

const AAA_URL = process.env.DATABASE_AAA_URL;
const CONTROL_URL = process.env.DATABASE_CONTROL_URL;

head('1. Bien moi truong');
if (!AAA_URL) {
  fail('DATABASE_AAA_URL chua duoc dat trong backend/.env');
  console.log('\n    Vi du (chu y @ trong mat khau phai ma hoa thanh %40):');
  console.log('    DATABASE_AAA_URL=postgres://radius:aoas%402025@10.149.79.186:5432/radius\n');
  process.exit(1);
}
ok(`DATABASE_AAA_URL = ${AAA_URL.replace(/:\/\/([^:]+):[^@]*@/, '://$1:***@')}`);
console.log(`  · RADIUS_MODE = ${process.env.RADIUS_MODE ?? '(chua dat -> embedded)'}`);

// Bat loi ma hoa URL som: mat khau chua ma hoa lam URL parse sai am tham.
try {
  const u = new URL(AAA_URL);
  if (!u.hostname) throw new Error('khong doc duoc hostname');
  ok(`Chuoi ket noi hop le — host ${u.hostname}:${u.port || 5432}, db ${u.pathname.slice(1)}`);
} catch (e) {
  fail(`DATABASE_AAA_URL khong parse duoc (${e.message}). Ky tu @ : / ? # trong mat khau phai ma hoa URL.`);
  process.exit(1);
}

const aaa = new Client({ connectionString: AAA_URL, connectionTimeoutMillis: 8000 });

head('2. Ket noi PostgreSQL cua FreeRADIUS');
try {
  await aaa.connect();
  const { rows } = await aaa.query('SELECT current_user, current_database()');
  ok(`Ket noi duoc — user ${rows[0].current_user}, database ${rows[0].current_database}`);
} catch (e) {
  fail(`Khong ket noi duoc: ${e.message}`);
  process.exit(1);
}

head('3. Bang can thiet');
const need = ['radacct', 'radcheck', 'radreply', 'radpostauth', 'nas'];
const { rows: tbl } = await aaa.query(
  `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = ANY($1)`, [need],
);
const have = new Set(tbl.map((r) => r.tablename));
for (const t of need) have.has(t) ? ok(t) : fail(`thieu bang ${t}`);

head('4. Cot cua radacct ma job dong bo can');
const needCols = ['acctsessionid','username','nasipaddress','acctstarttime','acctupdatetime',
  'acctstoptime','acctsessiontime','acctinputoctets','acctoutputoctets','callingstationid',
  'acctterminatecause','framedipaddress'];
const { rows: cols } = await aaa.query(
  `SELECT column_name FROM information_schema.columns WHERE table_name='radacct'`);
const haveCols = new Set(cols.map((c) => c.column_name));
for (const c of needCols) haveCols.has(c) ? ok(c) : fail(`thieu cot radacct.${c}`);
if (haveCols.has('acctinputgigawords')) {
  warn('radacct CO cot gigawords — schema nay khac ban da kiem chung, bao lai de sua lai phep cong byte.');
} else {
  ok('khong co cot gigawords (dung schema PostgreSQL — byte da la 64-bit hoan chinh)');
}

head('5. So lieu hien co');
for (const t of ['radcheck','radreply','nas','radacct','radpostauth']) {
  if (!have.has(t)) continue;
  const { rows: [r] } = await aaa.query(`SELECT count(*)::int AS n FROM ${t}`);
  console.log(`  · ${t.padEnd(12)} ${r.n} dong`);
}

head('6. Quyen ghi (tao 1 ban ghi thu roi xoa)');
const probe = `__fleet_probe_${Date.now()}`;
try {
  await aaa.query(`INSERT INTO radcheck (username, attribute, op, value) VALUES ($1,'Cleartext-Password',':=','probe')`, [probe]);
  const { rows: [r] } = await aaa.query(`SELECT value FROM radcheck WHERE username=$1`, [probe]);
  if (r?.value === 'probe') ok('Ghi va doc lai duoc radcheck');
  else fail('Ghi xong nhung doc lai khong dung');
  await aaa.query(`DELETE FROM radcheck WHERE username=$1`, [probe]);
  ok('Da don ban ghi thu');
} catch (e) {
  fail(`Khong ghi duoc vao radcheck: ${e.message}`);
}

head('7. Doi chieu NAS voi thiet bi trong control DB');
if (!CONTROL_URL) {
  warn('DATABASE_CONTROL_URL chua co — bo qua doi chieu');
} else {
  const ctl = new Client({ connectionString: CONTROL_URL, connectionTimeoutMillis: 8000 });
  try {
    await ctl.connect();
    const { rows: devs } = await ctl.query(
      `SELECT code, name, ip_address FROM devices WHERE deleted_at IS NULL AND ip_address IS NOT NULL`);
    const { rows: nasRows } = await aaa.query(`SELECT nasname, shortname FROM nas`);
    const nasIps = new Set(nasRows.map((n) => String(n.nasname).split('/')[0]));

    if (devs.length === 0) warn('Chua thiet bi nao co ip_address trong control DB');
    for (const d of devs) {
      if (nasIps.has(d.ip_address)) ok(`${d.code ?? d.name} (${d.ip_address}) — co trong bang nas`);
      else fail(`${d.code ?? d.name} (${d.ip_address}) — KHONG co trong bang nas, goi RADIUS tu router nay se bi bo im lang`);
    }
    const devIps = new Set(devs.map((d) => d.ip_address));
    for (const n of nasRows) {
      const ip = String(n.nasname).split('/')[0];
      if (!devIps.has(ip)) {
        fail(`nas.${n.shortname} (${ip}) — khong khop devices.ip_address nao, phien tu NAS nay se bi job dong bo bo qua`);
      }
    }
    await ctl.end();
  } catch (e) {
    warn(`Khong doi chieu duoc control DB: ${e.message}`);
  }
}

head('8. Thu dung truy van cua job dong bo');
try {
  const { rows } = await aaa.query(
    `SELECT acctsessionid, username, nasipaddress, acctstarttime, acctstoptime,
            acctinputoctets, acctoutputoctets
       FROM radacct
      WHERE acctstoptime IS NULL OR acctupdatetime > now() - interval '1 day'
      ORDER BY radacctid DESC LIMIT 5`);
  ok(`Truy van chay duoc — ${rows.length} phien gan day`);
  for (const r of rows) {
    console.log(`  · ${r.username} @ ${r.nasipaddress} | ${r.acctstarttime?.toISOString?.() ?? r.acctstarttime}` +
      ` | up ${r.acctinputoctets ?? 0} / down ${r.acctoutputoctets ?? 0}` +
      ` | ${r.acctstoptime ? 'da dong' : 'DANG MO'}`);
  }
  if (rows.length === 0) {
    warn('Chua co phien nao. Dang nhap hotspot that tu router roi chay lai script nay.');
  }
} catch (e) {
  fail(`Truy van that bai: ${e.message}`);
}

await aaa.end();

head(failed === 0 ? 'KET LUAN: San sang bat RADIUS_MODE=freeradius' : `KET LUAN: Con ${failed} van de phai xu ly truoc`);
process.exit(failed === 0 ? 0 : 1);
