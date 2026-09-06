import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { RequirePermission } from '@auth-stub/auth-stub.guard';
import { zodBody } from '@common/zod-validation.pipe';
import { PackagesService } from './packages.service';
import { CreatePackageSchema, ListPackagesQuerySchema, UpdatePackageSchema } from './dto';

@Controller('packages')
export class PackagesController {
  constructor(private readonly service: PackagesService) {}

  @Get()
  @RequirePermission('package:read')
  list(@Query() query: Record<string, string>) {
    const parsed = ListPackagesQuerySchema.parse(query);
    return this.service.list({ tenantId: parsed.tenant_id });
  }

  @Get(':packageId')
  @RequirePermission('package:read')
  getOne(@Param('packageId') packageId: string) {
    return this.service.getById(packageId);
  }

  @Post()
  @RequirePermission('package:write')
  create(@Body(zodBody(CreatePackageSchema)) body: ReturnType<typeof CreatePackageSchema['parse']>) {
    return this.service.create(body);
  }

  @Patch(':packageId')
  @RequirePermission('package:write')
  update(@Param('packageId') packageId: string, @Body(zodBody(UpdatePackageSchema)) body: ReturnType<typeof UpdatePackageSchema['parse']>) {
    return this.service.update(packageId, body);
  }

  @Delete(':packageId')
  @HttpCode(204)
  @RequirePermission('package:write')
  async remove(@Param('packageId') packageId: string) {
    await this.service.remove(packageId);
  }
}
