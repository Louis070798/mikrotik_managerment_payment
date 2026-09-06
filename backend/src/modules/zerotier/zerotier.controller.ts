import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { RequirePermission } from '@auth-stub/auth-stub.guard';
import { zodBody } from '@common/zod-validation.pipe';
import { ZeroTierService } from './zerotier.service';
import { CreateNetworkSchema, UpdateMemberSchema, UpdateNetworkSchema } from './dto';

@Controller('zerotier')
export class ZeroTierController {
  constructor(private readonly service: ZeroTierService) {}

  @Get('networks')
  @RequirePermission('inventory:read')
  listNetworks() {
    return this.service.listNetworks();
  }

  @Post('networks')
  @RequirePermission('zerotier:write')
  createNetwork(@Body(zodBody(CreateNetworkSchema)) body: ReturnType<typeof CreateNetworkSchema['parse']>) {
    return this.service.createNetwork(body);
  }

  @Get('networks/:networkId')
  @RequirePermission('inventory:read')
  getNetwork(@Param('networkId') networkId: string) {
    return this.service.getNetwork(networkId);
  }

  @Patch('networks/:networkId')
  @RequirePermission('zerotier:write')
  updateNetwork(@Param('networkId') networkId: string, @Body(zodBody(UpdateNetworkSchema)) body: ReturnType<typeof UpdateNetworkSchema['parse']>) {
    return this.service.updateNetwork(networkId, body);
  }

  @Delete('networks/:networkId')
  @HttpCode(204)
  @RequirePermission('zerotier:write')
  async deleteNetwork(@Param('networkId') networkId: string) {
    await this.service.deleteNetwork(networkId);
  }

  @Get('networks/:networkId/members')
  @RequirePermission('inventory:read')
  listMembers(@Param('networkId') networkId: string) {
    return this.service.listMembers(networkId);
  }

  @Patch('networks/:networkId/members/:memberId')
  @RequirePermission('zerotier:write')
  updateMember(
    @Param('networkId') networkId: string,
    @Param('memberId') memberId: string,
    @Body(zodBody(UpdateMemberSchema)) body: ReturnType<typeof UpdateMemberSchema['parse']>,
  ) {
    return this.service.updateMember(networkId, memberId, body);
  }

  @Delete('networks/:networkId/members/:memberId')
  @HttpCode(204)
  @RequirePermission('zerotier:write')
  async deleteMember(@Param('networkId') networkId: string, @Param('memberId') memberId: string) {
    await this.service.deleteMember(networkId, memberId);
  }
}
