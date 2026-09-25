import { Body, Controller, Delete, Get, Param, Post, Put, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.middleware';
import { CreateReminderDto, SnoozeReminderDto, UpdateReminderDto } from './reminder.dto';
import { ReminderService } from './reminder.service';

@Controller('reminders')
export class ReminderController {
  constructor(private readonly reminders: ReminderService) {}
  @Get() list(@Req() req: AuthenticatedRequest) { return this.reminders.list(req.user.id); }
  @Get('wechat-status') async wechatStatus(@Req() req: AuthenticatedRequest) {
    const available = await this.reminders.isWechatAvailable(req.user.id);
    return { available };
  }
  @Post() create(@Req() req: AuthenticatedRequest, @Body() dto: CreateReminderDto) {
    return this.reminders.create(req.user.id, dto);
  }
  @Post('batch') createBatch(@Req() req: AuthenticatedRequest, @Body() body: any) {
    const items = Array.isArray(body) ? body : Array.isArray(body?.items) ? body.items : [body];
    return this.reminders.createBatch(req.user.id, items);
  }
  @Put(':id') update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateReminderDto) {
    return this.reminders.update(req.user.id, id, dto);
  }
  @Delete(':id') remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.reminders.remove(req.user.id, id);
  }
  @Post('deliveries/read-all') readAll(@Req() req: AuthenticatedRequest) {
    return this.reminders.markAllRead(req.user.id);
  }
  @Post('deliveries/:id/read') read(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.reminders.markRead(req.user.id, id);
  }
  @Post('deliveries/:id/snooze') snooze(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: SnoozeReminderDto) {
    return this.reminders.snooze(req.user.id, id, dto.minutes);
  }
}
