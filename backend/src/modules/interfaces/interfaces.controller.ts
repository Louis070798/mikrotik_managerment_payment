import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { RequirePermission } from '@auth-stub/auth-stub.guard';
import { zodBody } from '@common/zod-validation.pipe';
import { InterfacesService } from './interfaces.service';
import { AssignZoneSchema, CreateInterfaceSchema, CreateZoneSchema, UpdateInterfaceSchema } from './dto';

@Controller()
export class InterfacesController {
  constructor(private readonly service: InterfacesService) {}

  @Get('ships/:shipId/zones')
  @RequirePermission('inventory:read')
  listZones(@Param('shipId') shipId: string) {
    return this.service.listZones(shipId);
  }

  @Post('ships/:shipId/zones')
  @RequirePermission('inventory:write')
  createZone(@Param('shipId') shipId: string, @Body(zodBody(CreateZoneSchema)) body: ReturnType<typeof CreateZoneSchema['parse']>) {
    return this.service.createZone(shipId, body);
  }

  @Get('ships/:shipId/interfaces')
  @RequirePermission('inventory:read')
  listByShip(@Param('shipId') shipId: string) {
    return this.service.listByShip(shipId);
  }

  @Post('devices/:deviceId/interfaces')
  @RequirePermission('inventory:write')
  create(@Param('deviceId') deviceId: string, @Body(zodBody(CreateInterfaceSchema)) body: ReturnType<typeof CreateInterfaceSchema['parse']>) {
    return this.service.createForDevice(deviceId, body);
  }

  @Get('interfaces/:interfaceId')
  @RequirePermission('inventory:read')
  getOne(@Param('interfaceId') interfaceId: string) {
    return this.service.getById(interfaceId);
  }

  @Patch('interfaces/:interfaceId')
  @RequirePermission('inventory:write')
  update(@Param('interfaceId') interfaceId: string, @Body(zodBody(UpdateInterfaceSchema)) body: ReturnType<typeof UpdateInterfaceSchema['parse']>) {
    return this.service.update(interfaceId, body);
  }

  @Post('interfaces/:interfaceId/assign-zone')
  @RequirePermission('inventory:write')
  assignZone(@Param('interfaceId') interfaceId: string, @Body(zodBody(AssignZoneSchema)) body: ReturnType<typeof AssignZoneSchema['parse']>) {
    return this.service.assignZone(interfaceId, body);
  }
}
