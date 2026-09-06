import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RequirePermission } from '@auth-stub/auth-stub.guard';
import { zodQuery } from '@common/zod-validation.pipe';
import { CrewRawAccountingQuerySchema, CrewSessionsQuerySchema, CrewUsersQuerySchema } from './dto';
import { CrewService } from './crew.service';

@Controller('ships/:shipId/crew')
export class CrewController {
  constructor(private readonly service: CrewService) {}

  @Get('users')
  @RequirePermission('crew:read')
  users(@Param('shipId') shipId: string, @Query(zodQuery(CrewUsersQuerySchema)) query: ReturnType<typeof CrewUsersQuerySchema.parse>) {
    return this.service.listUsers(shipId, query);
  }

  @Get('users/:username/sessions')
  @RequirePermission('crew:read')
  sessions(
    @Param('shipId') shipId: string,
    @Param('username') username: string,
    @Query(zodQuery(CrewSessionsQuerySchema)) query: ReturnType<typeof CrewSessionsQuerySchema.parse>,
  ) {
    return this.service.getUserSessions(shipId, username, query);
  }

  @Post('users/:username/sessions/:sessionId/disconnect')
  @RequirePermission('crew:write')
  disconnectSession(@Param('shipId') shipId: string, @Param('username') username: string, @Param('sessionId') sessionId: string) {
    return this.service.disconnectSession(shipId, username, sessionId);
  }

  @Get('radius-health')
  @RequirePermission('crew:read')
  radiusHealth(@Param('shipId') shipId: string) {
    return this.service.getRadiusHealth(shipId);
  }

  @Get('raw-accounting')
  @RequirePermission('raw:read')
  rawAccounting(@Param('shipId') shipId: string, @Query(zodQuery(CrewRawAccountingQuerySchema)) query: ReturnType<typeof CrewRawAccountingQuerySchema.parse>) {
    return this.service.getRawAccounting(shipId, query);
  }
}
