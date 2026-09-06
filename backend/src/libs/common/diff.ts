/** So sánh nông (shallow) hai object cùng khoá — dùng để sinh audit_logs.diff. */
export function diffOf(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, unknown> {
  const diff: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      diff[key] = { before: before[key], after: after[key] };
    }
  }
  return diff;
}
