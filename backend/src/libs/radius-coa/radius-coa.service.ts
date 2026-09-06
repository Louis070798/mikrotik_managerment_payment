import { Injectable, Logger } from '@nestjs/common';
import * as dgram from 'node:dgram';
import * as crypto from 'node:crypto';
import { RADIUS_ATTR, RADIUS_CODE } from '@radius-server/radius-attributes';
import { buildZeroOctetAuthenticator, encodeAttr } from '@radius-server/radius-packet';

/** Cổng CoA/Disconnect mặc định RouterOS lắng nghe (RFC 5176 §3.1) — không cấu hình được theo
 * từng thiết bị trong phase này (devices không có cột coa_port riêng). */
const DEFAULT_COA_PORT = 3799;

export type DisconnectResult =
  | { outcome: 'ACK' }
  | { outcome: 'NAK' }
  | { outcome: 'TIMEOUT' | 'ERROR'; message: string };

/**
 * CoA/Disconnect CLIENT thật (RFC 5176) — backend chủ động gửi Disconnect-Request tới NAS
 * (router MikroTik) để ngắt 1 phiên đang chạy, đúng yêu cầu SYSTEM_SPEC §4.2 "CoA/Disconnect
 * nếu cần ngắt session". Đối xứng ngược với radius-server/ (ở đó backend là SERVER nhận gói từ
 * NAS; ở đây backend là CLIENT gửi gói tới NAS) — dùng chung các hàm mã hoá gói RADIUS gốc.
 *
 * Yêu cầu router đã bật "RADIUS incoming" (accept-from chứa IP backend) — nếu chưa bật, NAS sẽ
 * không phản hồi và hàm này trả về TIMEOUT, không phải lỗi giả định.
 */
@Injectable()
export class RadiusCoaService {
  private readonly logger = new Logger(RadiusCoaService.name);

  async sendDisconnectRequest(
    nasHost: string,
    secret: string,
    params: { username: string; acctSessionId: string },
    timeoutMs = 5000,
  ): Promise<DisconnectResult> {
    return new Promise((resolve) => {
      const socket = dgram.createSocket('udp4');
      const identifier = Math.floor(Math.random() * 256);

      const attrs = Buffer.concat([
        encodeAttr(RADIUS_ATTR.USER_NAME, Buffer.from(params.username, 'utf8')),
        encodeAttr(RADIUS_ATTR.ACCT_SESSION_ID, Buffer.from(params.acctSessionId, 'utf8')),
      ]);
      const length = 20 + attrs.length;
      const requestAuthenticator = buildZeroOctetAuthenticator(RADIUS_CODE.DISCONNECT_REQUEST, identifier, length, attrs, secret);

      const header = Buffer.alloc(4);
      header.writeUInt8(RADIUS_CODE.DISCONNECT_REQUEST, 0);
      header.writeUInt8(identifier, 1);
      header.writeUInt16BE(length, 2);
      const packet = Buffer.concat([header, requestAuthenticator, attrs]);

      const finish = (result: DisconnectResult) => {
        clearTimeout(timer);
        socket.close();
        resolve(result);
      };

      const timer = setTimeout(() => finish({ outcome: 'TIMEOUT', message: `Không nhận được phản hồi từ NAS ${nasHost} sau ${timeoutMs}ms — kiểm tra router đã bật RADIUS incoming (accept-from) chưa` }), timeoutMs);

      socket.once('error', (err) => finish({ outcome: 'ERROR', message: err.message }));

      socket.once('message', (msg) => {
        try {
          if (msg.length < 20) throw new Error('Phản hồi Disconnect quá ngắn');
          const code = msg.readUInt8(0);
          const respId = msg.readUInt8(1);
          if (respId !== identifier) throw new Error('Sai identifier trong phản hồi Disconnect');
          const respAuthenticator = msg.subarray(4, 20);
          const respLength = msg.readUInt16BE(2);
          const respAttrs = msg.subarray(20, respLength);
          const expected = crypto
            .createHash('md5')
            .update(Buffer.concat([msg.subarray(0, 4), requestAuthenticator, respAttrs, Buffer.from(secret, 'utf8')]))
            .digest();
          if (!expected.equals(respAuthenticator)) throw new Error('Response Authenticator sai — secret không khớp hoặc gói giả mạo');

          if (code === RADIUS_CODE.DISCONNECT_ACK) finish({ outcome: 'ACK' });
          else if (code === RADIUS_CODE.DISCONNECT_NAK) finish({ outcome: 'NAK' });
          else finish({ outcome: 'ERROR', message: `NAS trả mã không mong đợi: ${code}` });
        } catch (err) {
          finish({ outcome: 'ERROR', message: (err as Error).message });
        }
      });

      socket.send(packet, DEFAULT_COA_PORT, nasHost, (err) => {
        if (err) finish({ outcome: 'ERROR', message: err.message });
      });
    });
  }
}
