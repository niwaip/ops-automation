import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { WorkbenchInboxModule } from '../workbench-inbox/workbench-inbox.module';
import { WorkbenchCoordinationController } from './workbench-coordination.controller';
import { WorkbenchCoordinationService } from './workbench-coordination.service';

import { MockHrService } from './mock-hr.service';
import { OrgWorkflowService } from './org-workflow.service';
import { StageFlowAiDraftService } from './stage-flow-ai-draft.service';

@Module({
  imports: [PrismaModule, WorkbenchInboxModule],
  controllers: [WorkbenchCoordinationController],
  providers: [
    WorkbenchCoordinationService,
    OrgWorkflowService,
    MockHrService,
    StageFlowAiDraftService,
  ],
  exports: [
    WorkbenchCoordinationService,
    OrgWorkflowService,
    MockHrService,
    StageFlowAiDraftService,
  ],
})
export class WorkbenchCoordinationModule {}
