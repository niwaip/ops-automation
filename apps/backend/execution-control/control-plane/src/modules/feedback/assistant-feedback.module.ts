import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AssistantFeedbackController } from './assistant-feedback.controller';
import { AssistantFeedbackAdminController } from './assistant-feedback-admin.controller';
import { AssistantFeedbackService } from './assistant-feedback.service';

@Module({
  imports: [PrismaModule],
  controllers: [AssistantFeedbackController, AssistantFeedbackAdminController],
  providers: [AssistantFeedbackService],
  exports: [AssistantFeedbackService],
})
export class AssistantFeedbackModule {}
