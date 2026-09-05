import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SaveUserEmailDto, TestUserEmailDto } from './user-email-connection.dto';
import { UserEmailConnectionService } from './user-email-connection.service';

@Controller(['user-connections/email', 'im-channels/email', 'api/user-connections/email'])
@UseGuards(AuthGuard('jwt'))
export class UserEmailConnectionController {
  constructor(private readonly service: UserEmailConnectionService) {}

  @Get()
  getConnection(@Request() req: any) {
    return this.service.getConnection(req.user.id);
  }

  @Put()
  saveConnection(@Request() req: any, @Body() dto: SaveUserEmailDto) {
    return this.service.saveConnection(req.user.id, dto);
  }

  @Post('test')
  testConnection(@Request() req: any, @Body() dto: TestUserEmailDto) {
    return this.service.testConnection(req.user.id, dto);
  }

  @Post('oauth/microsoft/device-code')
  beginMicrosoftOAuth(@Body('clientId') clientId?: string) {
    return this.service.beginMicrosoftOAuth(clientId);
  }

  @Post('oauth/microsoft/poll')
  pollMicrosoftOAuth(
    @Request() req: any,
    @Body('deviceCode') deviceCode: string,
    @Body('clientId') clientId?: string
  ) {
    return this.service.pollMicrosoftOAuth(req.user.id, deviceCode, clientId);
  }

  @Delete()
  deleteConnection(@Request() req: any) {
    return this.service.deleteConnection(req.user.id);
  }
}

import { Public } from '@ops/identity-access';

@Public()
@Controller('internal/user-connections/email')
export class InternalUserEmailConnectionController {
  constructor(private readonly service: UserEmailConnectionService) {}

  @Get('runtime-config')
  async getRuntimeConfig(
    @Query('userId') queryUserId?: string,
    @Query('executionId') queryExecutionId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('x-execution-id') headerExecutionId?: string
  ) {
    const userId = queryUserId || headerUserId;
    const executionId = queryExecutionId || headerExecutionId;
    const values = await this.service.getResolvedRuntimeConfig(userId, executionId);
    return { values };
  }
}
