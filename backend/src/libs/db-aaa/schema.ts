import { bigint, bigserial, integer, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * Schema PostgreSQL CUA FREERADIUS (rlm_sql), KHONG phai control DB cua he thong nay.
 *
 * Day la database do chinh FreeRADIUS so huu va ghi vao — backend chi la khach: DOC `radacct` de
 * dong bo phien ve `radius_sessions`, va GHI `radcheck`/`radreply` khi cap tai khoan. Vi vay
 * KHONG co migration nao o day: schema thuoc ve goi FreeRADIUS da cai tren server, phien ban nao
 * thi cot do. Neu doi phien ban FreeRADIUS, doi chieu lai cot truoc khi sua file nay.
 *
 * Chi khai bao nhung cot thuc su dung toi — khai thua thi moi khac biet nho giua cac ban
 * FreeRADIUS deu thanh loi runtime khong can thiet.
 *
 * `nasipaddress`/`framedipaddress` la kieu INET trong Postgres; driver pg tra ve chuoi nen khai
 * varchar la dung ve runtime (Drizzle khong tu ep kieu), chi la ten kieu tren giay khong khop.
 */

/** Phien accounting that — FreeRADIUS INSERT luc Start, UPDATE luc Interim/Stop. */
export const radacct = pgTable('radacct', {
  radacctid: bigserial('radacctid', { mode: 'number' }).primaryKey(),
  acctSessionId: varchar('acctsessionid', { length: 64 }).notNull(),
  acctUniqueId: varchar('acctuniqueid', { length: 32 }).notNull(),
  username: varchar('username', { length: 64 }).notNull(),
  nasIpAddress: varchar('nasipaddress').notNull(),
  nasPortType: varchar('nasporttype', { length: 32 }),
  acctStartTime: timestamp('acctstarttime', { withTimezone: true }),
  acctUpdateTime: timestamp('acctupdatetime', { withTimezone: true }),
  acctStopTime: timestamp('acctstoptime', { withTimezone: true }),
  acctSessionTime: bigint('acctsessiontime', { mode: 'number' }),
  // DA LA GIA TRI 64-BIT HOAN CHINH, khong phai byte 32-bit tho.
  //
  // RFC 2869 tach Acct-Input-Octets (32 bit) va Acct-Input-Gigawords (so lan tran 2^32) thanh 2
  // thuoc tinh. Schema MySQL cua FreeRADIUS luu ca hai thanh 2 cot roi de ung dung tu cong. Schema
  // POSTGRESQL thi KHONG: queries.conf gop san ngay luc INSERT bang
  //     ('%{%{Acct-Input-Gigawords}:-0}'::bigint << 32) + '%{%{Acct-Input-Octets}:-0}'::bigint
  // nen o day chi co dung 2 cot, va KHONG duoc cong gigawords them lan nua.
  //
  // Da kiem chung bang \d radacct tren server that (19/09/2026): khong ton tai cot gigawords nao.
  acctInputOctets: bigint('acctinputoctets', { mode: 'number' }),
  acctOutputOctets: bigint('acctoutputoctets', { mode: 'number' }),
  callingStationId: varchar('callingstationid', { length: 50 }),
  acctTerminateCause: varchar('acctterminatecause', { length: 32 }),
  framedIpAddress: varchar('framedipaddress'),
});

/** Thuoc tinh kiem tra luc xac thuc (mat khau, Expiration...). */
export const radcheck = pgTable('radcheck', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  username: varchar('username', { length: 64 }).notNull(),
  attribute: varchar('attribute', { length: 64 }).notNull(),
  op: varchar('op', { length: 2 }).notNull(),
  value: varchar('value', { length: 253 }).notNull(),
});

/** Thuoc tinh tra ve khi Access-Accept (Mikrotik-Rate-Limit...). */
export const radreply = pgTable('radreply', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  username: varchar('username', { length: 64 }).notNull(),
  attribute: varchar('attribute', { length: 64 }).notNull(),
  op: varchar('op', { length: 2 }).notNull(),
  value: varchar('value', { length: 253 }).notNull(),
});

/** Danh sach NAS + shared secret, khi FreeRADIUS doc clients tu SQL thay vi clients.conf. */
export const nas = pgTable('nas', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  nasname: varchar('nasname').notNull(),
  shortname: varchar('shortname', { length: 32 }).notNull(),
  type: varchar('type', { length: 30 }).notNull(),
  ports: integer('ports'),
  secret: varchar('secret', { length: 60 }).notNull(),
  description: varchar('description', { length: 200 }),
});
