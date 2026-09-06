import { Injectable, Module } from '@nestjs/common';
import { CollectorAdapterInfo } from './collector.types';
import { RouterOsInterfaceCounterCollector } from './interface-counter.collector';
import { IpfixUdpFlowCollector } from './ipfix-flow.collector';

/**
 * Nơi duy nhất liệt kê các collector adapter đang tồn tại và trạng thái thật của chúng.
 * Dùng để báo cáo trung thực "chưa có collector nào chạy" thay vì để nguồn telemetry
 * trống mà không ai biết vì sao (telemetry.health() chỉ thấy "không có event").
 * RADIUS đã bỏ khỏi danh sách này — collector adapter kiểu "describe() NOT_IMPLEMENTED" của nó
 * đã bị thay hoàn toàn bởi server UDP thật (libs/radius-server/), không còn là stub nữa.
 */
@Injectable()
export class CollectorRegistry {
  constructor(
    private readonly interfaceCounters: RouterOsInterfaceCounterCollector,
    private readonly ipfix: IpfixUdpFlowCollector,
  ) {}

  describeAll(): CollectorAdapterInfo[] {
    return [this.interfaceCounters.describe(), this.ipfix.describe()];
  }

  /** true chỉ khi CÓ adapter chạy thật — hôm nay luôn false, và điều đó phải nói thẳng. */
  hasImplementedCollector(): boolean {
    return this.describeAll().some((info) => info.status === 'IMPLEMENTED');
  }
}

@Module({
  providers: [RouterOsInterfaceCounterCollector, IpfixUdpFlowCollector, CollectorRegistry],
  exports: [RouterOsInterfaceCounterCollector, IpfixUdpFlowCollector, CollectorRegistry],
})
export class CollectorsModule {}
