import * as crypto from 'node:crypto';
import { RADIUS_CODE } from './radius-attributes';

/**
 * Encode/decode gói RADIUS thô (RFC 2865 §3) + Request/Response Authenticator cho Accounting
 * (RFC 2866 §4.1/§4.2) — pure functions, không I/O, để test độc lập được với UDP socket thật.
 * Đối xứng với `health-checks/radius.checker.ts` (đã có sẵn, nhưng là chiều CLIENT gửi
 * Access-Request) — file này là chiều SERVER nhận Accounting-Request.
 */

export type RadiusAttribute = { type: number; value: Buffer };

export type DecodedRadiusPacket = {
  code: number;
  identifier: number;
  length: number;
  /** 16 byte, nguyên văn như nhận được — dùng để verify (Accounting) hoặc làm base tính response. */
  authenticator: Buffer;
  attributes: RadiusAttribute[];
};

export function decodeRadiusPacket(msg: Buffer): DecodedRadiusPacket {
  if (msg.length < 20) throw new Error('RADIUS packet too short (< 20 byte header)');
  const code = msg.readUInt8(0);
  const identifier = msg.readUInt8(1);
  const length = msg.readUInt16BE(2);
  if (length < 20 || length > msg.length) throw new Error(`RADIUS packet length field invalid (${length})`);
  const authenticator = Buffer.from(msg.subarray(4, 20));

  const attributes: RadiusAttribute[] = [];
  let offset = 20;
  while (offset + 2 <= length) {
    const type = msg.readUInt8(offset);
    const attrLen = msg.readUInt8(offset + 1);
    if (attrLen < 2 || offset + attrLen > length) break; // malformed — dừng parse phòng thủ, không throw
    attributes.push({ type, value: Buffer.from(msg.subarray(offset + 2, offset + attrLen)) });
    offset += attrLen;
  }
  return { code, identifier, length, authenticator, attributes };
}

export function findAttr(attrs: RadiusAttribute[], type: number): Buffer | undefined {
  return attrs.find((a) => a.type === type)?.value;
}

export function attrString(attrs: RadiusAttribute[], type: number): string | undefined {
  const v = findAttr(attrs, type);
  return v ? v.toString('utf8') : undefined;
}

export function attrUint32(attrs: RadiusAttribute[], type: number): number | undefined {
  const v = findAttr(attrs, type);
  return v && v.length === 4 ? v.readUInt32BE(0) : undefined;
}

export function attrIpv4(attrs: RadiusAttribute[], type: number): string | undefined {
  const v = findAttr(attrs, type);
  return v && v.length === 4 ? `${v[0]}.${v[1]}.${v[2]}.${v[3]}` : undefined;
}

/**
 * RFC 2866 §4.1 — Request Authenticator của Accounting-Request:
 * MD5(Code + Identifier + Length + 16 octet zero + Attributes + Secret).
 * `rawPacket` phải là buffer UDP gốc (để attributes lấy đúng nguyên văn, không encode lại).
 */
export function verifyAccountingRequestAuthenticator(rawPacket: Buffer, receivedAuthenticator: Buffer, secret: string): boolean {
  const length = rawPacket.readUInt16BE(2);
  const header = Buffer.alloc(4);
  header.writeUInt8(rawPacket.readUInt8(0), 0);
  header.writeUInt8(rawPacket.readUInt8(1), 1);
  header.writeUInt16BE(length, 2);
  const zeroAuth = Buffer.alloc(16);
  const attrs = rawPacket.subarray(20, length);
  const expected = crypto
    .createHash('md5')
    .update(Buffer.concat([header, zeroAuth, attrs, Buffer.from(secret, 'utf8')]))
    .digest();
  return expected.equals(receivedAuthenticator);
}

/**
 * RFC 2866 §4.2 — Accounting-Response không kèm attribute (đủ để NAS coi là đã nhận, ngưng
 * retry). Response Authenticator = MD5(Code+ID+Length+RequestAuthenticator(gốc)+Secret).
 */
export function buildAccountingResponse(requestIdentifier: number, requestAuthenticator: Buffer, secret: string): Buffer {
  const header = Buffer.alloc(4);
  header.writeUInt8(RADIUS_CODE.ACCOUNTING_RESPONSE, 0);
  header.writeUInt8(requestIdentifier, 1);
  header.writeUInt16BE(20, 2);
  const responseAuthenticator = crypto
    .createHash('md5')
    .update(Buffer.concat([header, requestAuthenticator, Buffer.from(secret, 'utf8')]))
    .digest();
  return Buffer.concat([header, responseAuthenticator]);
}

/**
 * RFC 2865 §5.2 — giải mã User-Password (Access-Request). Đối xứng với `encodePassword()` ở
 * health-checks/radius.checker.ts (chiều CLIENT mã hoá) — XOR là phép tự nghịch đảo nên cùng
 * thuật toán, chỉ đổi input/output. Bỏ padding null ở cuối theo đúng RFC (password được pad
 * tới bội số 16 bằng byte 0 trước khi mã hoá).
 */
export function decodeUserPassword(encrypted: Buffer, requestAuthenticator: Buffer, secret: string): string {
  const out = Buffer.alloc(encrypted.length);
  let prev = requestAuthenticator;
  for (let i = 0; i < encrypted.length; i += 16) {
    const hash = crypto
      .createHash('md5')
      .update(Buffer.concat([Buffer.from(secret, 'utf8'), prev]))
      .digest();
    for (let j = 0; j < 16 && i + j < encrypted.length; j++) {
      out[i + j] = encrypted[i + j] ^ hash[j];
    }
    prev = encrypted.subarray(i, i + 16);
  }
  let end = out.length;
  while (end > 0 && out[end - 1] === 0) end--;
  return out.toString('utf8', 0, end);
}

export function encodeAttr(type: number, value: Buffer): Buffer {
  const buf = Buffer.alloc(2 + value.length);
  buf.writeUInt8(type, 0);
  buf.writeUInt8(2 + value.length, 1);
  value.copy(buf, 2);
  return buf;
}

const MIKROTIK_VENDOR_ID = 14988;
const MIKROTIK_RATE_LIMIT_VENDOR_TYPE = 8;

/**
 * Vendor-Specific attribute (RFC 2865 §5.26) mang Mikrotik-Rate-Limit — RouterOS áp giới hạn
 * băng thông thật ngay khi Access-Accept trả về, không cần cấu hình queue tay trên router.
 * Định dạng giá trị theo tài liệu MikroTik: "rx-rate/tx-rate" — rx = router NHẬN từ client
 * (upload của client), tx = router GỬI cho client (download của client). Chưa test độc lập với
 * router thật trong phiên này — nếu chiều upload/download bị đảo ngược trên thiết bị thật, đổi
 * thứ tự truyền vào hàm này (build lại string "download/upload" thay vì "upload/download").
 */
export function encodeMikrotikRateLimitAttr(rateLimitValue: string): Buffer {
  const valueBuf = Buffer.from(rateLimitValue, 'utf8');
  const vsaInner = Buffer.alloc(2 + valueBuf.length);
  vsaInner.writeUInt8(MIKROTIK_RATE_LIMIT_VENDOR_TYPE, 0);
  vsaInner.writeUInt8(2 + valueBuf.length, 1);
  valueBuf.copy(vsaInner, 2);
  const vendorIdBuf = Buffer.alloc(4);
  vendorIdBuf.writeUInt32BE(MIKROTIK_VENDOR_ID, 0);
  return encodeAttr(26, Buffer.concat([vendorIdBuf, vsaInner]));
}

/**
 * RFC 2865 §3 — Access-Accept/Access-Reject. Response Authenticator = MD5(Code+ID+Length+
 * RequestAuthenticator(gốc, nguyên văn từ Access-Request)+Attributes+Secret) — cùng công thức
 * Accounting-Response nhưng CÓ kèm attributes (vd Mikrotik-Rate-Limit trong Access-Accept).
 */
export function buildAccessResponse(code: number, requestIdentifier: number, requestAuthenticator: Buffer, secret: string, attrs: Buffer = Buffer.alloc(0)): Buffer {
  const length = 20 + attrs.length;
  const header = Buffer.alloc(4);
  header.writeUInt8(code, 0);
  header.writeUInt8(requestIdentifier, 1);
  header.writeUInt16BE(length, 2);
  const responseAuthenticator = crypto
    .createHash('md5')
    .update(Buffer.concat([header, requestAuthenticator, attrs, Buffer.from(secret, 'utf8')]))
    .digest();
  return Buffer.concat([header, responseAuthenticator, attrs]);
}

/**
 * RFC 2866 §4.1 / RFC 5176 §3 — "zero-octet" Request Authenticator, dùng khi TỰ MÌNH là bên
 * KHỞI TẠO gói (không có gói nhận trước đó để lấy authenticator thật) — Accounting-Request
 * (NAS gửi) và Disconnect-Request/CoA-Request (server này gửi, xem libs/radius-coa/) dùng
 * chung công thức: MD5(Code+ID+Length+16-octet-zero+Attributes+Secret).
 */
export function buildZeroOctetAuthenticator(code: number, identifier: number, length: number, attrs: Buffer, secret: string): Buffer {
  const header = Buffer.alloc(4);
  header.writeUInt8(code, 0);
  header.writeUInt8(identifier, 1);
  header.writeUInt16BE(length, 2);
  const zeroAuth = Buffer.alloc(16);
  return crypto
    .createHash('md5')
    .update(Buffer.concat([header, zeroAuth, attrs, Buffer.from(secret, 'utf8')]))
    .digest();
}
