/**
 * Cursor pagination tối giản dựa trên offset đã mã hoá base64 — đủ cho khối lượng dữ liệu
 * inventory (hàng trăm đến hàng nghìn hàng). Không dùng cho bảng lớn (raw/analytics) —
 * ở đó cursor phải mã hoá (created_at, id) theo docs/backend/03-API_DESIGN.md §1.5.
 */
export function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset })).toString('base64url');
}

export function decodeCursor(cursor?: string | null): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const offset = Number(parsed.offset);
    return Number.isFinite(offset) && offset >= 0 ? offset : 0;
  } catch {
    return 0;
  }
}

export interface PageMeta {
  cursor_next: string | null;
  has_more: boolean;
  limit: number;
}

export function buildPageMeta(offset: number, limit: number, fetchedCount: number, totalCount: number): PageMeta {
  const nextOffset = offset + fetchedCount;
  const hasMore = nextOffset < totalCount;
  return { cursor_next: hasMore ? encodeCursor(nextOffset) : null, has_more: hasMore, limit };
}
