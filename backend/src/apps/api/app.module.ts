import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppConfigModule } from '@config/config.module';
import { DbModule } from '@db/db.module';
import { RegistryModule } from '@registry/registry.module';
import { HealthChecksModule } from '@health-checks/health-checks.module';
import { AuditLibModule } from '@audit/audit.module';
import { AlertsLibModule } from '@alerts-lib/alerts.module';
import { CollectorsModule } from '@collectors/collectors.module';
import { RadiusServerModule } from '@radius-server/radius-server.module';
import { NetflowCollectorModule } from '@netflow-collector/netflow-collector.module';
import { DnsLogCollectorModule } from '@dns-log-collector/dns-log-collector.module';
import { RequestContextMiddleware } from '@common/request-context.middleware';
import { AuthStubGuard } from '@auth-stub/auth-stub.guard';
import { AuthModule } from '../../modules/auth/auth.module';
import { InventoryModule } from '../../modules/inventory/inventory.module';
import { InterfacesModule } from '../../modules/interfaces/interfaces.module';
import { ServiceEndpointsModule } from '../../modules/service-endpoints/service-endpoints.module';
import { HealthModule } from '../../modules/health/health.module';
import { AlertsModule } from '../../modules/alerts/alerts.module';
import { AuditApiModule } from '../../modules/audit/audit.module';
import { DashboardModule } from '../../modules/dashboard/dashboard.module';
import { TelemetryModule } from '../../modules/telemetry/telemetry.module';
import { CrewModule } from '../../modules/crew/crew.module';
import { BusinessModule } from '../../modules/business/business.module';
import { TenantsModule } from '../../modules/tenants/tenants.module';
import { PackagesModule } from '../../modules/packages/packages.module';
import { SubscribersModule } from '../../modules/subscribers/subscribers.module';
import { ZeroTierModule } from '../../modules/zerotier/zerotier.module';
import { FinanceModule } from '../../modules/finance/finance.module';
import { SettingsModule } from '../../modules/settings/settings.module';

@Module({
  imports: [
    AppConfigModule,
    EventEmitterModule.forRoot(),
    DbModule,
    RegistryModule,
    AuditLibModule,
    AlertsLibModule,
    HealthChecksModule,
    // Lớp adapter cho collector thật (RouterOS / RADIUS / IPFIX). Chưa có controller nên
    // không thêm bề mặt API nào; đăng ký ở đây để CollectorRegistry sẵn sàng inject khi
    // collector thật được triển khai. Xem src/libs/collectors/collectors.module.ts.
    CollectorsModule,
    AuthModule,
    InventoryModule,
    InterfacesModule,
    ServiceEndpointsModule,
    HealthModule,
    AlertsModule,
    AuditApiModule,
    DashboardModule,
    TelemetryModule,
    CrewModule,
    BusinessModule,
    TenantsModule,
    PackagesModule,
    SubscribersModule,
    ZeroTierModule,
    FinanceModule,
    SettingsModule,
    RadiusServerModule,
    NetflowCollectorModule,
    DnsLogCollectorModule,
  ],
  providers: [
    // AuthStubGuard đăng ký GLOBAL ở đây — mọi route đều bị chặn theo @RequirePermission()
    // trừ khi handler không gắn decorator này (canActivate() trả true nếu không có metadata).
    // Đây là chỗ cắm duy nhất; khi thay bằng Auth/RBAC thật chỉ cần đổi provider này.
    { provide: APP_GUARD, useClass: AuthStubGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
