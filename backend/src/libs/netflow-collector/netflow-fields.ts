/**
 * NetFlow v9 (RFC 3954) — chỉ khai báo các field type cần dùng, không copy nguyên bảng chuẩn.
 * IPv4 + IPv6 đưa vào ngay từ đầu (theo tài liệu huong-dan-he-thong-chi-tiet-su-dung.pdf mục 14 —
 * bỏ IPv6 lúc đầu là mất vĩnh viễn, không lấy lại được).
 */
export const NETFLOW_FIELD = {
  IN_BYTES: 1,
  PROTOCOL: 4,
  L4_SRC_PORT: 7,
  IPV4_SRC_ADDR: 8,
  L4_DST_PORT: 11,
  IPV4_DST_ADDR: 12,
  IPV6_SRC_ADDR: 27,
  IPV6_DST_ADDR: 28,
} as const;

const IP_FIELD_TYPES = new Set<number>([NETFLOW_FIELD.IPV4_SRC_ADDR, NETFLOW_FIELD.IPV4_DST_ADDR, NETFLOW_FIELD.IPV6_SRC_ADDR, NETFLOW_FIELD.IPV6_DST_ADDR]);

/** Field độ dài biến thiên (0xffff trong khuôn mẫu) — PDF mục 4.2: không dùng đến, gặp thì bỏ khuôn mẫu đó. */
export const VARIABLE_LENGTH_MARKER = 0xffff;

function ipv4ToString(buf: Buffer): string {
  return `${buf[0]}.${buf[1]}.${buf[2]}.${buf[3]}`;
}

function ipv6ToString(buf: Buffer): string {
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) groups.push(buf.readUInt16BE(i).toString(16));
  return groups.join(':');
}

/** Diễn giải 1 field thô (đã cắt đúng độ dài theo khuôn mẫu) thành số hoặc chuỗi IP. */
export function decodeFieldValue(type: number, value: Buffer): number | string | null {
  if (IP_FIELD_TYPES.has(type)) {
    if (value.length === 4) return ipv4ToString(value);
    if (value.length === 16) return ipv6ToString(value);
    return null;
  }
  // Số nguyên big-endian, độ dài 1/2/4/8 byte tuỳ router khai trong khuôn mẫu.
  switch (value.length) {
    case 1:
      return value.readUInt8(0);
    case 2:
      return value.readUInt16BE(0);
    case 4:
      return value.readUInt32BE(0);
    case 8:
      return Number(value.readBigUInt64BE(0));
    default:
      return null;
  }
}
