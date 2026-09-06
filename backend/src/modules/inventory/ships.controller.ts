import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { RequirePermission } from '@auth-stub/auth-stub.guard';
import { zodBody } from '@common/zod-validation.pipe';
import { ShipsService } from './ships.service';
import { CreateShipSchema, ListShipsQuerySchema, UpdateShipSchema } from './dto';

@Controller('ships')
export class ShipsController {
  constructor(private readonly service: ShipsService) {}

  @Get()
  @RequirePermission('inventory:read')
  list(@Query() query: Record<string, string>) {
    const parsed = ListShipsQuerySchema.parse(query);
    return this.service.list({ areaId: parsed.area_id, status: parsed.status, q: parsed.q });
  }

  @Get(':shipId')
  @RequirePermission('inventory:read')
  getOne(@Param('shipId') shipId: string) {
    return this.service.getById(shipId);
  }

  @Post()
  @RequirePermission('inventory:write')
  create(@Body(zodBody(CreateShipSchema)) body: ReturnType<typeof CreateShipSchema['parse']>) {
    return this.service.create(body);
  }

  @Patch(':shipId')
  @RequirePermission('inventory:write')
  update(@Param('shipId') shipId: string, @Body(zodBody(UpdateShipSchema)) body: ReturnType<typeof UpdateShipSchema['parse']>) {
    return this.service.update(shipId, body);
  }

  @Delete(':shipId')
  @HttpCode(204)
  @RequirePermission('inventory:write')
  async remove(@Param('shipId') shipId: string) {
    await this.service.remove(shipId);
  }
}
