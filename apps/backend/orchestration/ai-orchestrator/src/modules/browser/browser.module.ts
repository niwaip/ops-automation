import { Module } from '@nestjs/common';
import { BrowserSemanticsClient } from '../../client/browser-semantics.client';
import { ModelModule } from '../model/model.module';
import { RedisModule } from '../redis/redis.module';
import { BranchAnalysisModule } from '../branch-analysis/branch-analysis.module';
import { BrowserCommandController } from './api/browser-command.controller';
import { RecorderDebugController } from './api/recorder-debug.controller';
import {
  RecorderDebugSessionCoordinatorService,
  RecorderDebugSessionStoreService,
} from './session';
import {
  RecorderDebugObservationRefreshService,
  RecorderObservationService,
  RecorderSnapshotService,
  RecorderStructureProbeService,
} from './observe';
import {
  BrowserActionValidatorService,
  BrowserCandidateContextFormatter,
  BrowserCommandActionService,
  BrowserCommandAtomicService,
  BrowserCommandClickContextService,
  BrowserCommandContextNormalizerService,
  BrowserCommandFieldFillService,
  BrowserCommandLoginService,
  BrowserCommandNavigationService,
  BrowserCommandReadService,
  BrowserCommandSearchService,
  BrowserCommandSemanticLogService,
  BrowserCommandSemanticRuntimeService,
  BrowserCommandSequentialService,
  BrowserCommandService,
  BrowserExecutionPlannerService,
  BrowserPlannerPromptBuilder,
  BrowserPlannerResponseParser,
  RecorderDisambiguationService,
  RecorderParameterService,
} from './intent';
import { BrowserExecutionControllerService } from './execute/browser-execution-controller.service';
import { RecorderDebugBranchFacade } from './execute/recorder-debug-branch.facade';
import { RecorderDebugObservationFacade } from './execute/recorder-debug-observation.facade';
import { RecorderDebugSessionFacade } from './execute/recorder-debug-session.facade';
import { RecorderDebugService } from './execute/recorder-debug.service';
import { RecorderDebugChatSupportService } from './execute/recorder-debug-chat-support.service';
import { RecorderDebugChatExecutionService } from './execute/recorder-debug-chat-execution.service';
import { RecorderDebugChatFlowService } from './execute/recorder-debug-chat-flow.service';
import { RecorderDebugExecutionService } from './execute/recorder-debug-execution.service';
import { RecorderDebugResponseService } from './execute/recorder-debug-response.service';
import { ExecutionReconcileService } from './execute/execution-reconcile.service';
import {
  RecorderConditionalBranchService,
  RecorderLoopExportService,
  RecorderLoopLocatorService,
  RecorderLoopService,
  RecorderLoopStateService,
} from './loop';
import {
  RecorderExportAssemblyService,
  RecorderExportService,
  RecorderScriptExportService,
  RecorderTemplateExportService,
} from './export';

@Module({
  imports: [ModelModule, RedisModule, BranchAnalysisModule],
  controllers: [BrowserCommandController, RecorderDebugController],
  providers: [
    BrowserCommandService,
    BrowserCommandLoginService,
    BrowserCommandNavigationService,
    BrowserCommandReadService,
    BrowserCommandActionService,
    BrowserCommandSearchService,
    BrowserCommandFieldFillService,
    BrowserCommandAtomicService,
    BrowserCommandSequentialService,
    BrowserCommandSemanticLogService,
    BrowserCommandSemanticRuntimeService,
    BrowserCommandContextNormalizerService,
    BrowserCommandClickContextService,
    BrowserSemanticsClient,
    BrowserCandidateContextFormatter,
    BrowserPlannerPromptBuilder,
    BrowserPlannerResponseParser,
    BrowserExecutionControllerService,
    BrowserExecutionPlannerService,
    RecorderDebugBranchFacade,
    RecorderDebugObservationFacade,
    RecorderDebugSessionFacade,
    RecorderDebugService,
    RecorderDebugChatSupportService,
    RecorderDebugChatExecutionService,
    RecorderDebugChatFlowService,
    RecorderConditionalBranchService,
    RecorderDebugExecutionService,
    RecorderDebugObservationRefreshService,
    RecorderDebugResponseService,
    RecorderDebugSessionCoordinatorService,
    RecorderDebugSessionStoreService,
    RecorderExportAssemblyService,
    RecorderLoopStateService,
    RecorderLoopLocatorService,
    RecorderLoopExportService,
    RecorderLoopService,
    RecorderExportService,
    RecorderDisambiguationService,
    RecorderObservationService,
    RecorderSnapshotService,
    RecorderStructureProbeService,
    BrowserActionValidatorService,
    RecorderParameterService,
    RecorderScriptExportService,
    RecorderTemplateExportService,
    ExecutionReconcileService,
  ],
  exports: [
    BrowserCommandService,
    RecorderDebugService,
    RecorderLoopService,
    ExecutionReconcileService,
  ],
})
export class BrowserModule {}
