import { Body, Controller, Delete, Get, Post, Put, Query, Request } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { XiaozhiChannelService } from './xiaozhi-channel.service';

class SaveXiaozhiDto {
  @IsString() @MaxLength(2048) endpoint!: string;
  @IsOptional() @IsString() @MaxLength(100) alias?: string;
}

class SetXiaozhiEnabledDto {
  @IsBoolean() enabled!: boolean;
}

@Controller('im-channels/xiaozhi')
export class XiaozhiChannelController {
  constructor(private readonly service: XiaozhiChannelService) {}

  @Get() get(@Request() req: any) { return this.service.get(req.user.id); }
  @Put() save(@Request() req: any, @Body() body: SaveXiaozhiDto) { return this.service.save(req.user.id, body.endpoint, body.alias); }
  @Put('enabled') setEnabled(@Request() req: any, @Body() body: SetXiaozhiEnabledDto) { return this.service.setEnabled(req.user.id, body.enabled); }
  @Post('test') test(@Request() req: any) { return this.service.test(req.user.id); }
  @Get('tasks') tasks(@Request() req: any, @Query('limit') limit?: string) { return this.service.listTasks(req.user.id, Number(limit) || 20); }
  @Delete() remove(@Request() req: any) { return this.service.remove(req.user.id); }
}
