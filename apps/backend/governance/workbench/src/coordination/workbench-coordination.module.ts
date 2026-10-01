import { Module } from '@nestjs/common';
import { WorkbenchInboxModule } from '../inbox/workbench-inbox.module';
import { WorkbenchCoordinationController } from './workbench-coordination.controller';
import { WorkbenchCoordinationService } from './workbench-coordination.service';

import { OrgWorkflowService } from './org-workflow.service';
import { StageFlowAiDraftService } from './stage-flow-ai-draft.service';
import { CoordinationAttachmentStorageService } from './coordination-attachment-storage.service';
import { CoordinationStageEngineService } from './coordination-stage-engine.service';
import { CoordinationAutomationRunnerService } from './coordination-automation-runner.service';
import { CoordinationCollaboratorService } from './coordination-collaborator.service';

import { DocxClauseLocatorService } from './docx-clause-locator.service';
import { DocxCommentInjectorService } from './docx-comment-injector.service';
import { WorkspaceModule } from '../workspace/workspace.module';

@Module({
  imports: [WorkbenchInboxModule, WorkspaceModule],
  controllers: [WorkbenchCoordinationController],
  providers: [
    WorkbenchCoordinationService,
    OrgWorkflowService,
    StageFlowAiDraftService,
    CoordinationAttachmentStorageService,
    CoordinationStageEngineService,
    CoordinationAutomationRunnerService,
    CoordinationCollaboratorService,
    DocxClauseLocatorService,
    DocxCommentInjectorService,
  ],
  exports: [
    WorkbenchCoordinationService,
    OrgWorkflowService,
    StageFlowAiDraftService,
    CoordinationAttachmentStorageService,
    CoordinationStageEngineService,
    CoordinationAutomationRunnerService,
    CoordinationCollaboratorService,
    DocxClauseLocatorService,
    DocxCommentInjectorService,
  ],
})
export class WorkbenchCoordinationModule {}
