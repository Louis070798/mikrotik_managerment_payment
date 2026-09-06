import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { RequirePermission } from '@auth-stub/auth-stub.guard';
import { zodBody } from '@common/zod-validation.pipe';
import { DashboardQuerySchema } from '../dashboard/dto';
import { DevicesService } from './devices.service';
import { CreateDeviceSchema, DeviceTelemetryPushSchema, ListDevicesQuerySchema, UpdateDeviceSchema } from './dto';

@Controller('devices')
export class DevicesController {
  constructor(private readonly service: DevicesService) {}

  @Get()
  @RequirePermission('inventory:read')
  list(@Query() query: Record<string, string>) {
    const parsed = ListDevicesQuerySchema.parse(query);
    return this.service.list({ shipId: parsed.ship_id, role: parsed.role, status: parsed.status });
  }

  @Get(':deviceId')
  @RequirePermission('inventory:read')
  getOne(@Param('deviceId') deviceId: string) {
    return this.service.getById(deviceId);
  }

  @Get(':deviceId/traffic')
  @RequirePermission('inventory:read')
  getTraffic(@Param('deviceId') deviceId: string, @Query() query: Record<string, string>) {
    const parsed = DashboardQuerySchema.parse(query);
    return this.service.getTraffic(deviceId, parsed);
  }

  @Get(':deviceId/interfaces/traffic')
  @RequirePermission('inventory:read')
  getInterfaceTraffic(@Param('deviceId') deviceId: string, @Query() query: Record<string, string>) {
    const parsed = DashboardQuerySchema.parse(query);
    return this.service.getInterfaceTraffic(deviceId, parsed);
  }

  @Post()
  @RequirePermission('inventory:write')
  create(@Body(zodBody(CreateDeviceSchema)) body: ReturnType<typeof CreateDeviceSchema['parse']>) {
    return this.service.create(body);
  }

  @Patch(':deviceId')
  @RequirePermission('inventory:write')
  update(@Param('deviceId') deviceId: string, @Body(zodBody(UpdateDeviceSchema)) body: ReturnType<typeof UpdateDeviceSchema['parse']>) {
    return this.service.update(deviceId, body);
  }

  @Delete(':deviceId')
  @HttpCode(204)
  @RequirePermission('inventory:write')
  async remove(@Param('deviceId') deviceId: string) {
    await this.service.remove(deviceId);
  }

  @Post(':deviceId/push-key')
  @RequirePermission('inventory:write')
  issuePushApiKey(@Param('deviceId') deviceId: string) {
    return this.service.issuePushApiKey(deviceId);
  }

  @Delete(':deviceId/push-key')
  @HttpCode(204)
  @RequirePermission('inventory:write')
  async revokePushApiKey(@Param('deviceId') deviceId: string) {
    await this.service.revokePushApiKey(deviceId);
  }

  @Post(':deviceId/radius-secret')
  @RequirePermission('inventory:write')
  issueRadiusSecret(@Param('deviceId') deviceId: string) {
    return this.service.issueRadiusSecret(deviceId);
  }

  @Delete(':deviceId/radius-secret')
  @HttpCode(204)
  @RequirePermission('inventory:write')
  async revokeRadiusSecret(@Param('deviceId') deviceId: string) {
    await this.service.revokeRadiusSecret(deviceId);
  }

  // Thiết bị tự gọi vào (RouterOS scheduler, mỗi 5 phút) — xác thực bằng X-Device-Api-Key riêng của
  // nó, KHÔNG phải actor người dùng, nên cố ý KHÔNG gắn @RequirePermission (không đi qua AuthStubGuard).
  @Post(':deviceId/telemetry-push')
  telemetryPush(
    @Param('deviceId') deviceId: string,
    @Headers('x-device-api-key') apiKey: string | undefined,
    @Body(zodBody(DeviceTelemetryPushSchema)) body: ReturnType<typeof DeviceTelemetryPushSchema['parse']>,
  ) {
    return this.service.ingestPush(deviceId, apiKey, body);
  }
}
