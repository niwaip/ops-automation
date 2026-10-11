import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Request,
} from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { DingtalkChannelService } from './dingtalk-channel.service';

class SaveDingtalkDto {
  @IsString()
  @MaxLength(2048)
  webhookUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  secret?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  alias?: string;
}

class SetDingtalkEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}

@Controller('im-channels/dingtalk')
export class DingtalkChannelController {
  constructor(private readonly service: DingtalkChannelService) {}

  @Get()
  get(@Request() req: any) {
    return this.service.get(req.user.id);
  }

  @Put()
  save(@Request() req: any, @Body() body: SaveDingtalkDto) {
    return this.service.save(req.user.id, body.webhookUrl, body.secret, body.alias);
  }

  @Put('enabled')
  setEnabled(@Request() req: any, @Body() body: SetDingtalkEnabledDto) {
    return this.service.setEnabled(req.user.id, body.enabled);
  }

  @Post('test')
  test(@Request() req: any, @Body() body?: { message?: string }) {
    return this.service.test(req.user.id, body?.message);
  }

  @Delete()
  remove(@Request() req: any) {
    return this.service.remove(req.user.id);
  }
}
