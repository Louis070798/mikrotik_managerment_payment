-- LOCAL/STAGING bootstrap schema for FreeRADIUS SQL (PostgreSQL).
-- Production must review permissions, encryption/key management and the official
-- FreeRADIUS schema for the exact server version before applying.

CREATE TABLE IF NOT EXISTS radcheck (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(64) NOT NULL,
  attribute VARCHAR(64) NOT NULL,
  op VARCHAR(2) NOT NULL DEFAULT ':=',
  value VARCHAR(253) NOT NULL,
  UNIQUE (username, attribute, op)
);

CREATE TABLE IF NOT EXISTS radreply (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(64) NOT NULL,
  attribute VARCHAR(64) NOT NULL,
  op VARCHAR(2) NOT NULL DEFAULT ':=',
  value VARCHAR(253) NOT NULL
);

CREATE TABLE IF NOT EXISTS radgroupcheck (
  id BIGSERIAL PRIMARY KEY,
  groupname VARCHAR(64) NOT NULL,
  attribute VARCHAR(64) NOT NULL,
  op VARCHAR(2) NOT NULL DEFAULT ':=',
  value VARCHAR(253) NOT NULL,
  UNIQUE (groupname, attribute, op)
);

CREATE TABLE IF NOT EXISTS radgroupreply (
  id BIGSERIAL PRIMARY KEY,
  groupname VARCHAR(64) NOT NULL,
  attribute VARCHAR(64) NOT NULL,
  op VARCHAR(2) NOT NULL DEFAULT ':=',
  value VARCHAR(253) NOT NULL
);

CREATE TABLE IF NOT EXISTS radusergroup (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(64) NOT NULL,
  groupname VARCHAR(64) NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS radacct (
  radacctid BIGSERIAL PRIMARY KEY,
  acctsessionid VARCHAR(64) NOT NULL,
  acctuniqueid VARCHAR(32) NOT NULL,
  username VARCHAR(64) NOT NULL DEFAULT '',
  groupname VARCHAR(64) NOT NULL DEFAULT '',
  realm VARCHAR(64) NOT NULL DEFAULT '',
  nasipaddress INET NOT NULL,
  nasportid VARCHAR(15),
  nasporttype VARCHAR(32),
  acctstarttime TIMESTAMPTZ,
  acctupdatetime TIMESTAMPTZ,
  acctstoptime TIMESTAMPTZ,
  acctsessiontime BIGINT,
  acctauthentic VARCHAR(32),
  connectinfo_start VARCHAR(50),
  connectinfo_stop VARCHAR(50),
  acctinputoctets BIGINT,
  acctoutputoctets BIGINT,
  acctinputgigawords BIGINT,
  acctoutputgigawords BIGINT,
  calledstationid VARCHAR(50),
  callingstationid VARCHAR(50),
  acctterminatecause VARCHAR(32),
  servicetype VARCHAR(32),
  framedprotocol VARCHAR(32),
  framedipaddress INET,
  framedipv6address INET,
  framedipv6prefix INET,
  framedinterfaceid VARCHAR(44),
  delegatedipv6prefix INET
);

CREATE UNIQUE INDEX IF NOT EXISTS radacct_acctuniqueid_uq ON radacct (acctuniqueid);
CREATE INDEX IF NOT EXISTS radacct_username_start_ix ON radacct (username, acctstarttime);
CREATE INDEX IF NOT EXISTS radacct_session_ix ON radacct (acctsessionid);
CREATE INDEX IF NOT EXISTS radacct_nas_ix ON radacct (nasipaddress);

CREATE TABLE IF NOT EXISTS radpostauth (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(64) NOT NULL DEFAULT '',
  pass VARCHAR(253) NOT NULL DEFAULT '',
  reply VARCHAR(32) NOT NULL DEFAULT '',
  authdate TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS radpostauth_username_date_ix ON radpostauth (username, authdate);

CREATE TABLE IF NOT EXISTS nas (
  id BIGSERIAL PRIMARY KEY,
  nasname INET NOT NULL UNIQUE,
  shortname VARCHAR(32) NOT NULL,
  type VARCHAR(30) NOT NULL DEFAULT 'other',
  ports INTEGER,
  secret VARCHAR(60) NOT NULL,
  server VARCHAR(64),
  community VARCHAR(50),
  description VARCHAR(200)
);

