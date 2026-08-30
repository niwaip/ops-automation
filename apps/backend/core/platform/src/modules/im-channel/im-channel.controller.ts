import { Body, Controller, Delete, Get, Post, Put, Request } from '@nestjs/common';
import { IsBoolean, IsIn } from 'class-validator';
import { ImChannelService } from './im-channel.service';

class SetImEnabledDto {
  @IsBoolean() enabled!: boolean;
}

class SetImInteractionModeDto {
  @IsIn(['auto', 'chat', 'task'])
  interactionMode!: 'auto' | 'chat' | 'task';
}

@Controller('im-channels')
export class ImChannelController {
  constructor(private readonly service: ImChannelService) {}
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
  @Delete('wechat') remove(@Request() req: any) {
    return this.service.removeWechat(req.user.id);
  }
}
