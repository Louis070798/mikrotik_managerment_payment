import { VARIABLE_LENGTH_MARKER } from './netflow-fields';

/**
 * Decode khuôn dạng gói NetFlow v9 (RFC 3954) — pure, không I/O, test độc lập được với UDP socket
 * thật. KHÔNG làm IPFIX/v10 — MikroTik + tài liệu tham khảo đều cấu hình `version=9`.
 */

export type NetflowV9Header = {
  version: number;
  count: number;
  sysUptime: number;
  unixSeconds: number;
  sequenceNumber: number;
  sourceId: number;
};

export type TemplateField = { type: number; length: number };
export type TemplateRecord = { templateId: number; fields: TemplateField[] };
export type RawFlowSet = { flowSetId: number; payload: Buffer };
export type DataRecord = Map<number, Buffer>;

export function decodeHeader(buf: Buffer): NetflowV9Header {
  if (buf.length < 20) throw new Error('NetFlow v9 packet too short (< 20 byte header)');
  return {
    version: buf.readUInt16BE(0),
    count: buf.readUInt16BE(2),
    sysUptime: buf.readUInt32BE(4),
    unixSeconds: buf.readUInt32BE(8),
    sequenceNumber: buf.readUInt32BE(12),
    sourceId: buf.readUInt32BE(16),
  };
}

/** Cắt phần sau header thành từng FlowSet (flowSetId 2 byte + length 2 byte + payload). */
export function splitFlowSets(buf: Buffer): RawFlowSet[] {
  const flowSets: RawFlowSet[] = [];
  let offset = 20;
  while (offset + 4 <= buf.length) {
    const flowSetId = buf.readUInt16BE(offset);
    const length = buf.readUInt16BE(offset + 2);
    if (length < 4 || offset + length > buf.length) break; // phòng thủ, dừng thay vì throw
    flowSets.push({ flowSetId, payload: buf.subarray(offset + 4, offset + length) });
    offset += length;
  }
  return flowSets;
}

/**
 * 1 Template FlowSet (flowSetId=0) có thể chứa NHIỀU template record nối tiếp nhau. Field có độ
 * dài biến thiên (0xffff) — PDF mục 4.2: không dùng đến, gặp thì bỏ NGUYÊN template đó (return
 * null cho record đó, không throw để không hỏng các template khác trong cùng FlowSet).
 */
export function decodeTemplateRecords(payload: Buffer): TemplateRecord[] {
  const records: TemplateRecord[] = [];
  let offset = 0;
  while (offset + 4 <= payload.length) {
    const templateId = payload.readUInt16BE(offset);
    const fieldCount = payload.readUInt16BE(offset + 2);
    offset += 4;
    const fields: TemplateField[] = [];
    let hasVariableLength = false;
    for (let i = 0; i < fieldCount; i++) {
      if (offset + 4 > payload.length) return records; // dữ liệu cắt cụt, dừng phòng thủ
      const type = payload.readUInt16BE(offset);
      const length = payload.readUInt16BE(offset + 2);
      offset += 4;
      if (length === VARIABLE_LENGTH_MARKER) hasVariableLength = true;
      fields.push({ type, length });
    }
    if (!hasVariableLength && templateId >= 256) records.push({ templateId, fields });
    // templateId < 256 = Options Template hoặc dự trữ — bỏ qua trong Phase A (không cần Option data).
  }
  return records;
}

/**
 * Data FlowSet (flowSetId = templateId đã cache) — cắt payload thành các record kích thước cố
 * định bằng tổng field length của khuôn mẫu; phần dư cuối (padding) bị bỏ qua.
 */
export function decodeDataRecords(template: TemplateRecord, payload: Buffer): DataRecord[] {
  const recordLength = template.fields.reduce((sum, f) => sum + f.length, 0);
  if (recordLength <= 0) return [];
  const records: DataRecord[] = [];
  let offset = 0;
  while (offset + recordLength <= payload.length) {
    const record: DataRecord = new Map();
    let fieldOffset = offset;
    for (const field of template.fields) {
      record.set(field.type, payload.subarray(fieldOffset, fieldOffset + field.length));
      fieldOffset += field.length;
    }
    records.push(record);
    offset += recordLength;
  }
  return records;
}
