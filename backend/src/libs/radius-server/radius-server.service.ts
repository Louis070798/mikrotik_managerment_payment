import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as dgram from 'node:dgram';
import { Inject } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { ENV_TOKEN } from '@config/config.module';
import type { Env } from '@config/env.schema';
import { DB_TOKEN, DbClient } from '@db/db.module';
import { subscribers, packages } from '@db/schema';
import { compactPayload } from '@collectors/collector.types';
import { InventoryCacheService } from '@inventory-cache/inventory-cache.service';
import { verifyPassword } from '@password-hash/password-hash';
import { EnvCredentialResolver } from '../health-checks/credential-resolver';
import { TelemetryService } from '../../modules/telemetry/telemetry.service';
import { RADIUS_ATTR, RADIUS_CODE, acctStatusTypeName } from './radius-attributes';
import {
  attrIpv4,
  attrString,
  attrUint32,
  buildAccessResponse,
  buildAccountingResponse,
  decodeRadiusPacket,
  decodeUserPassword,
  DecodedRadiusPacket,
  encodeMikrotikRateLimitAttr,
  findAttr,
  verifyAccountingRequestAuthenticator,
} from './radius-packet';

const BYTES_PER_GB = 1_000_000_000; // Quy ước decimal GB (khớp packages.quota_gb) — không phải GiB.

/**
 * RADIUS server thật (RFC 2865 Access + RFC 2866 Accounting) — nghe UDP thật, xác thực bằng
 * shared secret thật của từng thiết bị (Accounting) và mật khẩu thật của từng subscriber
 * (Access, PAP — ADR-08), ghi vào ĐÚNG pipeline telemetry/radius_sessions đã chạy thật.
 * Access-Request tra subscriber theo (nas_device_id, username) — subscriber phải đã được cấp
 * mật khẩu qua POST /subscribers/{id}/password (subscribers.service.ts issuePassword()).
 */
@Injectable()
export class RadiusServerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RadiusServerService.name);
  private acctSocket?: dgram.Socket;
  private authSocket?: dgram.Socket;
  private readonly credentials = new EnvCredentialResolver();

  constructor(
    @Inject(ENV_TOKEN) private readonly env: Env,
    @Inject(DB_TOKEN) private readonly db: DbClient,
    private readonly telemetry: TelemetryService,
    private readonly inventoryCache: InventoryCacheService,
  ) {}

  onModuleInit() {
    this.acctSocket = this.bindSocket(this.env.RADIUS_ACCT_PORT, 'accounting');
    this.authSocket = this.bindSocket(this.env.RADIUS_AUTH_PORT, 'access (PAP)');
  }

  private bindSocket(port: number, label: string): dgram.Socket {
    const socket = dgram.createSocket('udp4');
    socket.on('message', (msg, rinfo) => {
      this.handlePacket(msg, rinfo, socket).catch((err) => this.logger.error(`Unhandled error processing RADIUS packet from ${rinfo.address}: ${(err as Error).message}`));
    });
    socket.on('error', (err) => this.logger.error(`RADIUS UDP socket error (${label}, :${port}): ${err.message}`));
    socket.bind(port, () => {
      this.logger.log(`RADIUS ${label} server listening on :${port}`);
    });
    return socket;
  }

  onModuleDestroy() {
    this.acctSocket?.close();
    this.authSocket?.close();
  }

  private async handlePacket(msg: Buffer, rinfo: dgram.RemoteInfo, socket: dgram.Socket) {
    let decoded;
    try {
      decoded = decodeRadiusPacket(msg);
    } catch (err) {
      this.logger.warn(`Dropped malformed RADIUS packet from ${rinfo.address}: ${(err as Error).message}`);
      return;
    }

    if (decoded.code === RADIUS_CODE.ACCESS_REQUEST) {
      await this.handleAccessRequest(decoded, rinfo, socket);
      return;
    }

    if (decoded.code !== RADIUS_CODE.ACCOUNTING_REQUEST) {
      // CoA-ACK/NAK và các code khác không được xử lý ở đây (backend không tự gửi CoA/Disconnect
      // từ socket này — xem libs/radius-coa/ cho chiều client riêng biệt) — im lặng bỏ qua.
      return;
    }

    const device = this.inventoryCache.deviceByIpAddress(rinfo.address);
    if (!device) {
      this.logger.warn(`Dropped Accounting-Request from unknown NAS IP ${rinfo.address} — no devices.ip_address match`);
      return;
    }

    const secret = await this.credentials.resolve(device.credentialRef);
    if (!secret) {
      this.logger.warn(`Dropped Accounting-Request from ${rinfo.address} (device ${device.code}) — devices.credential_ref not set/resolvable`);
      return;
    }

    if (!verifyAccountingRequestAuthenticator(msg, decoded.authenticator, secret)) {
      this.logger.warn(`Dropped Accounting-Request from ${rinfo.address} (device ${device.code}) — Request Authenticator mismatch (sai shared secret hoặc gói giả)`);
      return;
    }

    // Đã xác thực đúng -> LUÔN trả Accounting-Response (RFC 2866 §4.2), kể cả khi không forward
    // vào ingest (vd status type không map được) — nếu không NAS sẽ retry vô hạn.
    const response = buildAccountingResponse(decoded.identifier, decoded.authenticator, secret);
    socket.send(response, rinfo.port, rinfo.address);

    const statusCode = attrUint32(decoded.attributes, RADIUS_ATTR.ACCT_STATUS_TYPE);
    const statusType = statusCode !== undefined ? acctStatusTypeName(statusCode) : undefined;
    const sessionId = attrString(decoded.attributes, RADIUS_ATTR.ACCT_SESSION_ID);
    if (!statusType || !sessionId) {
      this.logger.warn(`Accounting-Request from ${device.code} thiếu/không map được Acct-Status-Type(${statusCode})/Acct-Session-Id — đã ACK, không forward vào ingest`);
      return;
    }

    const username = attrString(decoded.attributes, RADIUS_ATTR.USER_NAME);
    const framedIp = attrIpv4(decoded.attributes, RADIUS_ATTR.FRAMED_IP_ADDRESS);
    const callingStationMac = attrString(decoded.attributes, RADIUS_ATTR.CALLING_STATION_ID);
    const inputOctets = attrUint32(decoded.attributes, RADIUS_ATTR.ACCT_INPUT_OCTETS);
    const inputGigawords = attrUint32(decoded.attributes, RADIUS_ATTR.ACCT_INPUT_GIGAWORDS);
    const outputOctets = attrUint32(decoded.attributes, RADIUS_ATTR.ACCT_OUTPUT_OCTETS);
    const outputGigawords = attrUint32(decoded.attributes, RADIUS_ATTR.ACCT_OUTPUT_GIGAWORDS);
    const sessionTime = attrUint32(decoded.attributes, RADIUS_ATTR.ACCT_SESSION_TIME);
    const terminateCause = attrUint32(decoded.attributes, RADIUS_ATTR.ACCT_TERMINATE_CAUSE);

    const observedAt = new Date();
    // 1 gói Accounting thật cho đúng 1 (session, status, giây quan sát) — khớp unique index
    // (source, idempotency_key) của raw_telemetry_events, chống ghi trùng khi NAS retry.
    const idempotencyKey = `radius:${sessionId}:${statusType}:${Math.floor(observedAt.getTime() / 1000)}`;

    try {
      await this.telemetry.ingest({
        events: [
          {
            source: 'RADIUS_ACCOUNTING',
            idempotency_key: idempotencyKey,
            observed_at: observedAt.toISOString(),
            identity: compactPayload({
              device_id: device.id,
              ship_id: device.shipId,
              user_identity: username,
              user_identity_type: username ? 'USERNAME' : undefined,
              source_device_ref: device.code,
            }) as any,
            payload: compactPayload({
              acct_status_type: statusType,
              acct_session_id: sessionId,
              username,
              framed_ip: framedIp,
              calling_station_mac: callingStationMac,
              acct_input_octets: inputOctets,
              acct_input_gigawords: inputGigawords,
              acct_output_octets: outputOctets,
              acct_output_gigawords: outputGigawords,
              acct_session_time: sessionTime,
              acct_terminate_cause: terminateCause !== undefined ? String(terminateCause) : undefined,
            }),
            metadata: { nas_source_ip: rinfo.address },
          },
        ],
      });
    } catch (err) {
      this.logger.error(`Failed to ingest RADIUS accounting event (device ${device.code}, session ${sessionId}): ${(err as Error).message}`);
    }
  }

  /**
   * RFC 2865 Access-Request (PAP, ADR-08) — subscriber phải khớp đúng (nas_device_id, username)
   * và có mật khẩu đã cấp (issuePassword()). Access-Accept kèm Mikrotik-Rate-Limit lấy từ gói
   * cước thật (packages.up_mbps/down_mbps) — RouterOS tự áp giới hạn băng thông, không cần cấu
   * hình queue tay. Access-Reject không tiết lộ lý do cụ thể ra ngoài (chỉ log nội bộ) — RFC 2865
   * không có field "lý do từ chối" chuẩn cho NAS hiển thị, tránh dò thông tin qua Reply-Message.
   */
  private async handleAccessRequest(decoded: DecodedRadiusPacket, rinfo: dgram.RemoteInfo, socket: dgram.Socket) {
    const device = this.inventoryCache.deviceByIpAddress(rinfo.address);
    if (!device) {
      this.logger.warn(`Dropped Access-Request from unknown NAS IP ${rinfo.address} — no devices.ip_address match`);
      return;
    }

    const secret = await this.credentials.resolve(device.credentialRef);
    if (!secret) {
      this.logger.warn(`Dropped Access-Request from ${rinfo.address} (device ${device.code}) — devices.credential_ref not set/resolvable`);
      return;
    }

    const username = attrString(decoded.attributes, RADIUS_ATTR.USER_NAME);
    const encryptedPassword = findAttr(decoded.attributes, RADIUS_ATTR.USER_PASSWORD);
    if (!username || !encryptedPassword) {
      this.logger.warn(`Dropped Access-Request qua NAS ${device.code} — thiếu User-Name/User-Password`);
      return;
    }

    const password = decodeUserPassword(encryptedPassword, decoded.authenticator, secret);

    const reject = (reason: string) => {
      this.logger.warn(`Access-Reject cho "${username}" qua NAS ${device.code}: ${reason}`);
      socket.send(buildAccessResponse(RADIUS_CODE.ACCESS_REJECT, decoded.identifier, decoded.authenticator, secret), rinfo.port, rinfo.address);
    };

    const row = (
      await this.db
        .select({ subscriber: subscribers, package: packages })
        .from(subscribers)
        .innerJoin(packages, eq(subscribers.packageId, packages.id))
        .where(and(eq(subscribers.nasDeviceId, device.id), eq(subscribers.username, username), isNull(subscribers.deletedAt)))
        .limit(1)
    )[0];

    if (!row) return reject('không tìm thấy subscriber khớp (nas_device_id, username)');
    const { subscriber, package: pkg } = row;

    if (!subscriber.passwordHash) return reject('subscriber chưa được cấp mật khẩu (issuePassword chưa chạy)');
    if (!verifyPassword(password, subscriber.passwordHash)) return reject('sai mật khẩu');
    if (subscriber.status !== 'ACTIVE') return reject(`subscriber đang ở trạng thái ${subscriber.status}`);
    if (subscriber.expiresAt.getTime() <= Date.now()) return reject('subscriber đã hết hạn (expires_at)');
    if (subscriber.quotaUsedBytes >= pkg.quotaGb * BYTES_PER_GB) return reject('subscriber đã dùng hết quota gói cước');

    const rateLimitAttr = encodeMikrotikRateLimitAttr(`${pkg.upMbps}M/${pkg.downMbps}M`);
    const accept = buildAccessResponse(RADIUS_CODE.ACCESS_ACCEPT, decoded.identifier, decoded.authenticator, secret, rateLimitAttr);
    socket.send(accept, rinfo.port, rinfo.address);
    this.logger.log(`Access-Accept cho "${username}" qua NAS ${device.code} (gói ${pkg.name}, rate-limit ${pkg.upMbps}M/${pkg.downMbps}M)`);
  }
}
