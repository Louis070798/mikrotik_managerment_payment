import { Injectable, Logger } from '@nestjs/common';
import * as dgram from 'node:dgram';
import * as crypto from 'node:crypto';
import { HealthChecker, CheckAttemptResult } from './types';
import { EndpointCandidate } from '@registry/registry.types';
import { CredentialResolver } from './credential-resolver';

const ACCESS_REQUEST = 1;
const ACCESS_ACCEPT = 2;
const ACCESS_REJECT = 3;

const ATTR_USER_NAME = 1;
const ATTR_USER_PASSWORD = 2;
const ATTR_NAS_IDENTIFIER = 32;

/**
 * RADIUS synthetic health check — SYSTEM_SPEC §10.2/§10.3: "Synthetic Access-Request,
 * RTT, accept/reject, timeout", KHÔNG chỉ kiểm tra TCP/UDP port mở.
 *
 * Gửi một Access-Request thật (RFC 2865 §4.1) với username cấu hình được, mã hoá
 * User-Password theo RFC 2865 §5.2 (MD5 XOR stream với shared secret + Request Authenticator),
 * rồi xác minh Response Authenticator của gói trả về để chắc chắn phản hồi đến từ đúng
 * server nắm shared secret — không chỉ là "có gói UDP nào đó bay tới".
 *
 * Access-Accept HOẶC Access-Reject đều được tính là HEALTHY (server đang hoạt động và trả
 * lời đúng giao thức) — mục tiêu là đo khả năng phục vụ, không phải xác thực một user thật.
 * Timeout hoặc response authenticator sai → coi là thất bại (server không đáng tin hoặc không
 * phản hồi), để runner (retry + circuit breaker) xử lý tiếp.
 */
@Injectable()
export class RadiusHealthChecker implements HealthChecker {
  readonly healthcheckType = 'RADIUS_ACCESS_REQUEST';
  private readonly logger = new Logger(RadiusHealthChecker.name);

  constructor(private readonly credentials: CredentialResolver) {}

  async check(endpoint: EndpointCandidate): Promise<CheckAttemptResult> {
    const secret = await this.credentials.resolve(endpoint.secretRef);
    if (!secret) {
      return { success: false, errorMessage: 'RADIUS shared secret not resolvable from secret_ref' };
    }

    const cfg = endpoint.checkConfig as { probe_username?: string; probe_password?: string };
    const probeUsername = cfg.probe_username ?? 'healthcheck-probe';
    const probePassword = cfg.probe_password ?? 'healthcheck-probe-password';

    const started = Date.now();
    try {
      const response = await sendAccessRequest(
        endpoint.host,
        endpoint.port,
        secret,
        probeUsername,
        probePassword,
        endpoint.timeoutMs,
      );
      const rttMs = Date.now() - started;

      if (response.code !== ACCESS_ACCEPT && response.code !== ACCESS_REJECT) {
        return { success: false, rttMs, errorMessage: `Unexpected RADIUS code: ${response.code}` };
      }
      return {
        success: true,
        rttMs,
        details: { reply: response.code === ACCESS_ACCEPT ? 'ACCEPT' : 'REJECT' },
      };
    } catch (err) {
      return { success: false, rttMs: Date.now() - started, errorMessage: (err as Error).message };
    }
  }
}

function encodePassword(password: string, secret: string, requestAuthenticator: Buffer): Buffer {
  // RFC 2865 §5.2 — pad tới bội số 16, XOR từng block 16-byte với MD5(secret + block-trước).
  const pwBuf = Buffer.from(password, 'utf8');
  const padded = Buffer.alloc(Math.ceil(pwBuf.length / 16) * 16 || 16);
  pwBuf.copy(padded);

  const out = Buffer.alloc(padded.length);
  let prev = requestAuthenticator;
  for (let i = 0; i < padded.length; i += 16) {
    const hash = crypto
      .createHash('md5')
      .update(Buffer.concat([Buffer.from(secret, 'utf8'), prev]))
      .digest();
    for (let j = 0; j < 16; j++) {
      out[i + j] = padded[i + j] ^ hash[j];
    }
    prev = out.subarray(i, i + 16);
  }
  return out;
}

function buildAccessRequest(secret: string, username: string, password: string): { packet: Buffer; authenticator: Buffer; identifier: number } {
  const identifier = Math.floor(Math.random() * 256);
  const requestAuthenticator = crypto.randomBytes(16);

  const userNameAttr = encodeAttr(ATTR_USER_NAME, Buffer.from(username, 'utf8'));
  const encryptedPassword = encodePassword(password, secret, requestAuthenticator);
  const userPasswordAttr = encodeAttr(ATTR_USER_PASSWORD, encryptedPassword);
  const nasIdAttr = encodeAttr(ATTR_NAS_IDENTIFIER, Buffer.from('fleet-backend-healthcheck', 'utf8'));

  const attrs = Buffer.concat([userNameAttr, userPasswordAttr, nasIdAttr]);
  const length = 20 + attrs.length;

  const header = Buffer.alloc(20);
  header.writeUInt8(ACCESS_REQUEST, 0);
  header.writeUInt8(identifier, 1);
  header.writeUInt16BE(length, 2);
  requestAuthenticator.copy(header, 4);

  return { packet: Buffer.concat([header, attrs]), authenticator: requestAuthenticator, identifier };
}

function encodeAttr(type: number, value: Buffer): Buffer {
  const buf = Buffer.alloc(2 + value.length);
  buf.writeUInt8(type, 0);
  buf.writeUInt8(2 + value.length, 1);
  value.copy(buf, 2);
  return buf;
}

interface RadiusResponse {
  code: number;
  identifier: number;
}

function sendAccessRequest(
  host: string,
  port: number,
  secret: string,
  username: string,
  password: string,
  timeoutMs: number,
): Promise<RadiusResponse> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    const { packet, authenticator, identifier } = buildAccessRequest(secret, username, password);

    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`RADIUS request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    socket.once('error', (err) => {
      clearTimeout(timer);
      socket.close();
      reject(err);
    });

    socket.once('message', (msg) => {
      clearTimeout(timer);
      socket.close();
      try {
        if (msg.length < 20) throw new Error('RADIUS response too short');
        const code = msg.readUInt8(0);
        const respId = msg.readUInt8(1);
        const respLength = msg.readUInt16BE(2);
        const respAuthenticator = msg.subarray(4, 20);
        const respAttrs = msg.subarray(20, respLength);

        if (respId !== identifier) throw new Error('RADIUS response identifier mismatch');

        // Xác minh Response Authenticator = MD5(code+id+length+RequestAuth+attrs+secret) — RFC 2865 §3.
        const expected = crypto
          .createHash('md5')
          .update(Buffer.concat([msg.subarray(0, 4), authenticator, respAttrs, Buffer.from(secret, 'utf8')]))
          .digest();
        if (!expected.equals(respAuthenticator)) {
          throw new Error('RADIUS response authenticator invalid — shared secret mismatch or spoofed reply');
        }

        resolve({ code, identifier: respId });
      } catch (err) {
        reject(err);
      }
    });

    socket.send(packet, port, host, (err) => {
      if (err) {
        clearTimeout(timer);
        socket.close();
        reject(err);
      }
    });
  });
}
