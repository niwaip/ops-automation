import { Controller, ForbiddenException, Get, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedRequest } from '../auth/auth.middleware';
import { AssistantFeedbackService } from './assistant-feedback.service';

@ApiTags('Habit Learning Admin')
@ApiBearerAuth()
@Controller('admin')
export class AssistantFeedbackAdminController {
  constructor(private readonly feedbackService: AssistantFeedbackService) {}

  @Get('habit-learning/overview')
  @ApiOperation({ summary: 'View Phase 0 feedback and habit-learning status' })
  getOverview(@Req() req: AuthenticatedRequest) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Only admins can view habit-learning overview');
    }
    return this.feedbackService.getAdminOverview();
  }
}
