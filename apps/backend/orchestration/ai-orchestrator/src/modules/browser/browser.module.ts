import { Module } from '@nestjs/common';
import { BrowserSemanticsClient } from '../../client/browser-semantics.client';
import { ModelModule } from '../model/model.module';
import { RedisModule } from '../redis/redis.module';
import { BranchAnalysisModule } from '../branch-analysis/branch-analysis.module';
import { BrowserCommandController } from './api/browser-command.controller';
import { RecorderDebugController } from './api/recorder-debug.controller';
import { RecorderDebugSessionStoreService } from './session/recorder-debug-session-store.service';
import { RecorderDebugSessionCoordinatorService } from './session/recorder-debug-session-coordinator.service';
import { RecorderObservationService } from './observe/recorder-observation.service';
import { RecorderSnapshotService } from './observe/recorder-snapshot.service';
import { RecorderStructureProbeService } from './observe/recorder-structure-probe.service';
import { RecorderDebugObservationRefreshService } from './observe/recorder-debug-observation-refresh.service';
import { BrowserCommandService } from './intent/browser-command.service';
import { BrowserCommandLoginService } from './intent/browser-command-login.service';
import { BrowserCommandNavigationService } from './intent/browser-command-navigation.service';
import { BrowserCommandReadService } from './intent/browser-command-read.service';
import { BrowserCommandActionService } from './intent/browser-command-action.service';
import { BrowserCommandSearchService } from './intent/browser-command-search.service';
import { BrowserCommandFieldFillService } from './intent/browser-command-field-fill.service';
import { BrowserCommandAtomicService } from './intent/browser-command-atomic.service';
import { BrowserCommandSequentialService } from './intent/browser-command-sequential.service';
import { BrowserCommandSemanticLogService } from './intent/browser-command-semantic-log.service';
import { BrowserCommandSemanticRuntimeService } from './intent/browser-command-semantic-runtime.service';
import { BrowserCommandContextNormalizerService } from './intent/browser-command-context-normalizer.service';
import { BrowserCommandClickContextService } from './intent/browser-command-click-context.service';
import { BrowserCandidateContextFormatter } from './intent/browser-candidate-context.formatter';
import { BrowserPlannerPromptBuilder } from './intent/browser-planner-prompt.builder';
import { BrowserPlannerResponseParser } from './intent/browser-planner-response.parser';
import { BrowserExecutionPlannerService } from './intent/browser-execution-planner.service';
import { BrowserActionValidatorService } from './intent/browser-action-validator.service';
import { RecorderDisambiguationService } from './intent/recorder-disambiguation.service';
import { RecorderParameterService } from './intent/recorder-parameter.service';
import { BrowserExecutionControllerService } from './execute/browser-execution-controller.service';
import { RecorderDebugService } from './execute/recorder-debug.service';
import { RecorderDebugChatSupportService } from './execute/recorder-debug-chat-support.service';
import { RecorderDebugChatExecutionService } from './execute/recorder-debug-chat-execution.service';
import { RecorderDebugChatFlowService } from './execute/recorder-debug-chat-flow.service';
import { RecorderDebugExecutionService } from './execute/recorder-debug-execution.service';
import { RecorderDebugResponseService } from './execute/recorder-debug-response.service';
import { ExecutionReconcileService } from './execute/execution-reconcile.service';
import { RecorderLoopService } from './loop/recorder-loop.service';
import { RecorderLoopStateService } from './loop/recorder-loop-state.service';
import { RecorderLoopLocatorService } from './loop/recorder-loop-locator.service';
import { RecorderLoopExportService } from './loop/recorder-loop-export.service';
import { RecorderConditionalBranchService } from './loop/recorder-conditional-branch.service';
import { RecorderExportAssemblyService } from './export/recorder-export-assembly.service';
import { RecorderExportService } from './export/recorder-export.service';
import { RecorderScriptExportService } from './export/recorder-script-export.service';
import { RecorderTemplateExportService } from './export/recorder-template-export.service';

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
