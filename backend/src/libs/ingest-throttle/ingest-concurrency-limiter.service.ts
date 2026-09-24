import { Injectable } from '@nestjs/common';

/**
 * Giới hạn số tác vụ ghi DB chạy đồng thời cho các UDP collector thời gian thực (NetFlow/RADIUS).
 * `dgram` gọi callback 'message' cho MỖI gói ngay khi tới — không có khái niệm "đợi gói trước xử lý
 * xong" — nên nếu cứ bắn thẳng 1 Promise độc lập cho mỗi gói, khi 2 tàu cùng gửi NetFlow/RADIUS liên
 * tục, hàng chục tác vụ cùng lúc tranh nhau xin connection từ pool (max=30, xem db-control/client.ts)
 * và làm timeout mọi request khác (API thường, health-sweep) dù Postgres bản thân vẫn khoẻ — đúng
 * lỗi "timeout exceeded when trying to connect" gặp thật. Xếp hàng FIFO trong bộ nhớ (rẻ, chỉ giữ 1
 * closure resolve) thay vì để chúng chen nhau ở lớp connection pool.
 *
 * Dùng CHUNG 1 instance (singleton qua Nest DI) cho cả NetFlow và RADIUS — 2 collector không burst
 * cùng lúc theo cùng quy luật nên giới hạn chung linh hoạt hơn giới hạn riêng từng bên.
 */
@Injectable()
export class IngestConcurrencyLimiterService {
  private static readonly MAX_CONCURRENT = 12;
  private active = 0;
  private readonly queue: (() => void)[] = [];

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= IngestConcurrencyLimiterService.MAX_CONCURRENT) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active++;
    try {
      return await task();
    } finally {
      this.active--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}
