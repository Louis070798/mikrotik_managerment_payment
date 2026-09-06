/**
 * Bóc 2 dạng dòng log DNS của RouterOS (`/system logging add topics=dns regex="..."`) — đúng tài
 * liệu tham khảo mục 4.3. Regex tìm mẫu bất kỳ đâu trong dòng (không neo vị trí cứng) để chịu được
 * sai khác nhỏ giữa các bản RouterOS (tiền tố syslog PRI/timestamp/hostname có thể khác nhau).
 * ~40-45% dòng không khớp dạng nào là bình thường (PDF) — trả về null, không log rác.
 */

export type DnsQueryLine = { type: 'query'; clientIp: string; txId: string; domain: string };
export type DnsAnswerLine = { type: 'answer'; txId: string; domain: string; resolvedIp: string };
export type DnsLogLine = DnsQueryLine | DnsAnswerLine | null;

const QUERY_RE = /dns\s+query\s+from\s+([0-9a-fA-F.:]+)\s*:\s*#(\d+)\s+(\S+?)\.?\s/i;
const ANSWER_RE = /dns\s+done\s+query\s*:\s*#(\d+)\s+(\S+?)\.?\s+([0-9a-fA-F.:]+)/i;

function stripTrailingDot(domain: string): string {
  return domain.endsWith('.') ? domain.slice(0, -1) : domain;
}

export function parseDnsLogLine(line: string): DnsLogLine {
  const queryMatch = QUERY_RE.exec(line);
  if (queryMatch) {
    return { type: 'query', clientIp: queryMatch[1], txId: queryMatch[2], domain: stripTrailingDot(queryMatch[3]) };
  }
  const answerMatch = ANSWER_RE.exec(line);
  if (answerMatch) {
    return { type: 'answer', txId: answerMatch[1], domain: stripTrailingDot(answerMatch[2]), resolvedIp: answerMatch[3] };
  }
  return null;
}
