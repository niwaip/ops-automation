import { Module } from '@nestjs/common';
import { BrowserCommandService } from './browser-command.service';
import { BrowserCommandController } from './browser-command.controller';
import { RecorderDebugService } from './recorder-debug.service';
import { RecorderDebugChatSupportService } from './recorder-debug-chat-support.service';
import { RecorderDebugChatExecutionService } from './recorder-debug-chat-execution.service';
import { RecorderDebugChatFlowService } from './recorder-debug-chat-flow.service';
import { RecorderConditionalBranchService } from './recorder-conditional-branch.service';
import { RecorderDebugExecutionService } from './recorder-debug-execution.service';
import { RecorderDebugObservationRefreshService } from './recorder-debug-observation-refresh.service';
import { RecorderDebugResponseService } from './recorder-debug-response.service';
import { RecorderDebugSessionCoordinatorService } from './recorder-debug-session-coordinator.service';
import { RecorderDebugSessionStoreService } from './recorder-debug-session-store.service';
import { RecorderDebugController } from './recorder-debug.controller';
import { RecorderExportAssemblyService } from './recorder-export-assembly.service';
import { RecorderLoopExportService } from './recorder-loop-export.service';
import { RecorderLoopLocatorService } from './recorder-loop-locator.service';
import { RecorderLoopStateService } from './recorder-loop-state.service';
import { RecorderLoopService } from './recorder-loop.service';
import { RecorderExportService } from './recorder-export.service';
import { RecorderDisambiguationService } from './recorder-disambiguation.service';
import { RecorderObservationService } from './recorder-observation.service';
import { RecorderParameterService } from './recorder-parameter.service';
import { RecorderScriptExportService } from './recorder-script-export.service';
import { RecorderSnapshotService } from './recorder-snapshot.service';
import { RecorderStructureProbeService } from './recorder-structure-probe.service';
import { RecorderTemplateExportService } from './recorder-template-export.service';
import { ExecutionReconcileService } from './execution-reconcile.service';
import { BrowserActionValidatorService } from './browser-action-validator.service';
import { BrowserCandidateContextFormatter } from './browser-candidate-context.formatter';
import { BrowserPlannerPromptBuilder } from './browser-planner-prompt.builder';
import { BrowserPlannerResponseParser } from './browser-planner-response.parser';
import { BrowserExecutionControllerService } from './browser-execution-controller.service';
import { BrowserExecutionPlannerService } from './browser-execution-planner.service';
import { ModelModule } from '../model/model.module';
import { RedisModule } from '../redis/redis.module';
import { BranchAnalysisModule } from '../branch-analysis/branch-analysis.module';

@Module({
  imports: [ModelModule, RedisModule, BranchAnalysisModule],
  controllers: [BrowserCommandController, RecorderDebugController],
  providers: [
    BrowserCommandService,
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
export class BrowserCommandModule {}
