import { Body, Controller, Delete, ForbiddenException, Get, Post, Put, Request, SetMetadata } from '@nestjs/common';
import { IsBoolean, IsIn, IsString, IsUUID, MaxLength } from 'class-validator';
import { ImChannelService } from './im-channel.service';

class SetImEnabledDto {
  @IsBoolean() enabled!: boolean;
}

class SetImInteractionModeDto {
  @IsIn(['auto', 'chat', 'task'])
  interactionMode!: 'auto' | 'chat' | 'task';
}

class InternalReminderDto {
  @IsUUID() userId!: string;
  @IsString() @MaxLength(4300) text!: string;
  @IsUUID() idempotencyKey!: string;
}

@Controller('im-channels')
export class ImChannelController {
  constructor(private readonly service: ImChannelService) {}
  @SetMetadata('isPublic', true)
  @Post('internal/reminder')
  async sendInternalReminder(@Request() req: any, @Body() body: InternalReminderDto) {
    const secret = process.env.INTERNAL_API_SHARED_SECRET || process.env.INTERNAL_API_SECRET;
    if (!secret || req.headers['x-internal-auth'] !== secret) {
      throw new ForbiddenException('Internal authentication required');
    }
    await this.service.sendReminder(body.userId, body.text, body.idempotencyKey);
    return { success: true };
  }
  @Get('wechat') getWechat(@Request() req: any) {
    return this.service.getWechat(req.user.id);
  }
  @Post('wechat/provisioning') provision(@Request() req: any) {
    return this.service.beginWechatProvisioning(req.user.id);
  }
  @Put('wechat/enabled') setEnabled(@Request() req: any, @Body() body: SetImEnabledDto) {
    return this.service.setEnabled(req.user.id, body.enabled);
  }
  @Put('wechat/interaction-mode')
  setInteractionMode(@Request() req: any, @Body() body: SetImInteractionModeDto) {
    return this.service.setInteractionMode(req.user.id, body.interactionMode);
  }
  @Post('wechat/test-file')
  sendTestFile(
    @Request() req: any,
    @Body() body?: { fileName?: string; content?: string }
  ) {
    return this.service.sendTestFile(req.user.id, body?.fileName, body?.content);
  }
  @Delete('wechat') remove(@Request() req: any) {
    return this.service.removeWechat(req.user.id);
  }
}
