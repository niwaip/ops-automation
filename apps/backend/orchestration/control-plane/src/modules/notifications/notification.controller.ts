import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/auth.middleware';
import { NotificationListQueryDto, NotificationListResponseDto } from './notification.dto';
import { NotificationService } from './notification.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'List unified notifications' })
  @ApiResponse({
    status: 200,
    description: 'Unified notification list',
    type: NotificationListResponseDto,
  })
  async list(
    @Query() query: NotificationListQueryDto,
    @Req() req: AuthenticatedRequest
  ): Promise<NotificationListResponseDto> {
    return this.notificationService.list(query, req.user);
  }
}
