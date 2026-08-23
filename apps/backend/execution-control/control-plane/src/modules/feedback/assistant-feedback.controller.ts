import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedRequest } from '../auth/auth.middleware';
import { PersistAssistantFeedbackDto, SetAssistantFeedbackDto } from './assistant-feedback.dto';
import { AssistantFeedbackService } from './assistant-feedback.service';

@ApiTags('Internal Feedback')
@ApiBearerAuth()
@Controller('internal')
export class AssistantFeedbackController {
  constructor(private readonly feedbackService: AssistantFeedbackService) {}

  @Post('assistant-feedback')
  @ApiOperation({ summary: 'Persist an assistant feedback event from the AI service' })
  set(
    @Body() body: PersistAssistantFeedbackDto,
    @Req() req: AuthenticatedRequest
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException('Authentication required');
    if (body.eventType === 'clear') {
      return this.feedbackService.clear(userId, body.sessionId, body.messageId, body.clearEventId);
    }
    const input: SetAssistantFeedbackDto = {
      eventId: body.eventId,
      rating: body.rating!,
      reasonCode: body.reasonCode,
      comment: body.comment,
      executionId: body.executionId,
    };
    return this.feedbackService.set(userId, body.sessionId, body.messageId, input);
  }

  @Get('assistant-feedback/:sessionId/:messageId')
  @ApiOperation({ summary: 'Read current assistant feedback for the AI service' })
  get(
    @Param('sessionId') sessionId: string,
    @Param('messageId') messageId: string,
    @Req() req: AuthenticatedRequest
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException('Authentication required');
    return this.feedbackService.get(userId, sessionId, messageId);
  }
}
