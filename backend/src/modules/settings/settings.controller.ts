import { Body, Controller, Get, Patch } from '@nestjs/common';
import { RequirePermission } from '@auth-stub/auth-stub.guard';
import { zodBody } from '@common/zod-validation.pipe';
import { SettingsService } from './settings.service';
import { UpdateSettingsSchema } from './dto';

@Controller('settings')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get()
  @RequirePermission('settings:read')
  get() {
    return this.service.getCurrent();
  }

  @Patch()
  @RequirePermission('settings:write')
  update(@Body(zodBody(UpdateSettingsSchema)) body: ReturnType<typeof UpdateSettingsSchema.parse>) {
    return this.service.update(body);
  }
}
