import { Module } from '@nestjs/common';
import { ModelModule } from '../model/model.module';
import { UserWorkflowReviewController } from './user-workflow-review.controller';
import { UserWorkflowReviewService } from './user-workflow-review.service';

@Module({
  imports: [ModelModule],
  controllers: [UserWorkflowReviewController],
  providers: [UserWorkflowReviewService],
})
export class UserWorkflowReviewModule {}
