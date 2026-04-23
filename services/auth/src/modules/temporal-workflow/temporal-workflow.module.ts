import { Module } from '@nestjs/common';
import { TemporalWorkflowController } from './temporal-workflow.controller';
import { TemporalWorkflowService } from './temporal-workflow.service';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';

@Module({
  controllers: [TemporalWorkflowController, ActivityController],
  providers: [TemporalWorkflowService, ActivityService],
})
export class TemporalWorkflowModule {}