import { TemplateField } from './netflow-packet';

/**
 * Bộ nhớ đệm khuôn mẫu NetFlow v9, khoá ĐÚNG bộ ba (routerIp, sourceId, templateId) — PDF bẫy số 1:
 * chỉ dùng templateId sẽ khiến router này ghi đè khuôn mẫu của router kia, sai số liệu câm lặng.
 */
export class NetflowTemplateCache {
  private readonly cache = new Map<string, { fields: TemplateField[]; cachedAt: number }>();

  private key(routerIp: string, sourceId: number, templateId: number): string {
    return `${routerIp}|${sourceId}|${templateId}`;
  }

  set(routerIp: string, sourceId: number, templateId: number, fields: TemplateField[]): void {
    this.cache.set(this.key(routerIp, sourceId, templateId), { fields, cachedAt: Date.now() });
  }

  get(routerIp: string, sourceId: number, templateId: number): TemplateField[] | undefined {
    return this.cache.get(this.key(routerIp, sourceId, templateId))?.fields;
  }

  size(): number {
    return this.cache.size;
  }
}
