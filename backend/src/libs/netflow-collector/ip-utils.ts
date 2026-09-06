/**
 * Phân biệt IP nội bộ (RFC 1918 / ULA) với IP công cộng — dùng để xác định bên nào của 1 flow là
 * máy khách thật, bên nào là máy chủ ở xa, KHÔNG cần tra bảng chủ sở hữu nào (đơn giản hơn, luôn
 * sẵn có). Đây chính là "laIpCongCong()" trong tài liệu tham khảo.
 */
export function isPrivateIp(ip: string): boolean {
  if (ip.includes(':')) return isPrivateIpv6(ip);
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  return lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe8') || lower === '::1';
}

export function isPublicIp(ip: string): boolean {
  return !isPrivateIp(ip);
}
