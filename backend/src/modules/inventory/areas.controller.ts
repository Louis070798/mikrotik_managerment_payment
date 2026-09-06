import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { RequirePermission } from '@auth-stub/auth-stub.guard';
import { zodBody } from '@common/zod-validation.pipe';
import { AreasService } from './areas.service';
import { CreateAreaSchema, UpdateAreaSchema } from './dto';

@Controller('areas')
export class AreasController {
  constructor(private readonly service: AreasService) {}

  @Get()
  @RequirePermission('inventory:read')
  list() {
    return this.service.list();
  }

  @Get(':areaId')
  @RequirePermission('inventory:read')
  getOne(@Param('areaId') areaId: string) {
    return this.service.getById(areaId);
  }

  @Post()
  @RequirePermission('inventory:write')
  create(@Body(zodBody(CreateAreaSchema)) body: ReturnType<typeof CreateAreaSchema['parse']>) {
    return this.service.create(body);
  }

  @Patch(':areaId')
  @RequirePermission('inventory:write')
  update(@Param('areaId') areaId: string, @Body(zodBody(UpdateAreaSchema)) body: ReturnType<typeof UpdateAreaSchema['parse']>) {
    return this.service.update(areaId, body);
  }

  @Delete(':areaId')
  @HttpCode(204)
  @RequirePermission('inventory:write')
  async remove(@Param('areaId') areaId: string) {
    await this.service.remove(areaId);
  }
}
