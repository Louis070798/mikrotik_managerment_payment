import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Inject } from '@nestjs/common';
import { isNull } from 'drizzle-orm';
import { DB_TOKEN, DbClient } from '@db/db.module';
import { devices, ships } from '@db/schema';

export type CachedDevice = typeof devices.$inferSelect;
export type CachedShip = typeof ships.$inferSelect;

const REFRESH_INTERVAL_MS = 20_000;

/**
 * Cache trong bộ nhớ cho 2 truy vấn lặp lại nhiều nhất khi có traffic thật liên tục (đây là nguyên
 * nhân thật gây bão hoà connection pool, không phải bản thân pool nhỏ — xem client.ts):
 *   1. "Gói UDP tới từ IP này thuộc thiết bị nào" — RadiusServerService/NetflowCollectorService/
 *      DnsLogCollectorService đều tự query devices.findFirst() riêng, MỖI GÓI TIN.
 *   2. "device_id/ship_id này còn tồn tại, thuộc tàu nào" — TelemetryService.resolveIdentity() query
 *      lại CHO MỖI EVENT (1 gói NetFlow có thể mang hàng chục event).
 *
 * Làm mới định kỳ bằng 2 truy vấn gộp (SELECT * FROM devices/ships) thay vì 1 truy vấn/gói — IP/tên
 * thiết bị hiếm khi đổi nên độ trễ vài chục giây (REFRESH_INTERVAL_MS) giữa các lần làm mới là chấp
 * nhận được cho đường dẫn UDP tốc độ cao; DevicesService/ShipsService gọi invalidate() sau khi
 * tạo/sửa để không phải chờ chu kỳ tiếp theo (vd người dùng vừa lưu IP ở wizard, test ngay lập tức).
 */
@Injectable()
export class InventoryCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InventoryCacheService.name);
  private deviceByIp = new Map<string, CachedDevice>();
  private deviceById = new Map<string, CachedDevice>();
  private shipById = new Map<string, CachedShip>();
  private timer?: NodeJS.Timeout;

  constructor(@Inject(DB_TOKEN) private readonly db: DbClient) {}

  async onModuleInit(): Promise<void> {
    await this.refresh();
    this.timer = setInterval(() => void this.refresh(), REFRESH_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async refresh(): Promise<void> {
    try {
      const [deviceRows, shipRows] = await Promise.all([
        this.db.query.devices.findMany({ where: isNull(devices.deletedAt) }),
        this.db.query.ships.findMany({ where: isNull(ships.deletedAt) }),
      ]);
      const deviceByIp = new Map<string, CachedDevice>();
      const deviceById = new Map<string, CachedDevice>();
      for (const row of deviceRows) {
        deviceById.set(row.id, row);
        if (row.ipAddress) deviceByIp.set(row.ipAddress, row);
      }
      this.deviceByIp = deviceByIp;
      this.deviceById = deviceById;
      this.shipById = new Map(shipRows.map((row) => [row.id, row]));
    } catch (err) {
      // Postgres tạm mất kết nối không nên làm collector chết theo — giữ nguyên cache cũ (dữ liệu
      // cũ vẫn tốt hơn không có gì), refresh() tự thử lại ở chu kỳ kế tiếp.
      this.logger.warn(`Làm mới inventory cache thất bại (giữ nguyên cache cũ): ${(err as Error).message}`);
    }
  }

  /** Gọi ngay sau khi tạo/sửa/xoá thiết bị hoặc tàu — không phải chờ REFRESH_INTERVAL_MS mới thấy thay đổi. */
  invalidate(): void {
    void this.refresh();
  }

  deviceByIpAddress(ip: string): CachedDevice | null {
    return this.deviceByIp.get(ip) ?? null;
  }

  deviceByDeviceId(id: string): CachedDevice | null {
    return this.deviceById.get(id) ?? null;
  }

  shipByShipId(id: string): CachedShip | null {
    return this.shipById.get(id) ?? null;
  }
}
