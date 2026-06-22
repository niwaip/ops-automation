import { Module } from '@nestjs/common';
import { BrowserPhaseRecoveryPlanner } from './recovery/browser-phase-recovery.planner';
import { BrowserPhaseExecutor } from './step-runner/browser-phase.executor';
import { BrowserRuntimeAdapter } from './adapters/browser-runtime.adapter';
import { CapabilityRuntimeAdapter } from './adapters/capability-runtime.adapter';
import { DocumentRuntimeAdapter } from './adapters/document-runtime.adapter';
import { ExecutionController } from './execution.controller';
import { ExecutionApprovalService } from './human-control/execution-approval.service';
import { ExecutionBrowserOrchestrationService } from './step-runner/execution-browser-orchestration.service';
import { ExecutionEventService } from './state/execution-event.service';
import { ExecutionFailureService } from './recovery/execution-failure.service';
import { ExecutionFlowRunnerService } from './step-runner/execution-flow-runner.service';
import { ExecutionHumanControlService } from './human-control/execution-human-control.service';
import { ExecutionInputResolutionService } from './human-control/execution-input-resolution.service';
import { ExecutionPlanningService } from './step-runner/execution-planning.service';
import { ExecutionPlanNormalizationService } from './step-runner/execution-plan-normalization.service';
import { ExecutionPhaseService } from './state/execution-phase.service';
import { ExecutionPhaseSyncService } from './state/execution-phase-sync.service';
import { ExecutionRuntimeSessionService } from './adapters/execution-runtime-session.service';
import { ExecutionStateService } from './state/execution-state.service';
import { WorkflowActivityProgressService } from './state/workflow-activity-progress.service';
import { ExecutionStepExecutorService } from './step-runner/execution-step-executor.service';
import { ExecutionStepService } from './step-runner/execution-step.service';
import { ExecutionService } from './execution.service';
import { RuntimeAdapterRegistry } from './adapters/runtime-adapter.registry';
import { RuntimeExecutionOrchestrator } from './step-runner/runtime-execution.orchestrator';
import { RuntimeResultInterpreter } from './step-runner/runtime-result.interpreter';
import { RuntimeStepRequestFactory } from './step-runner/runtime-step-request.factory';
import { WorkflowRuntimeAdapter } from './adapters/workflow-runtime.adapter';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ExecutionController],
  providers: [
    BrowserPhaseRecoveryPlanner,
    BrowserRuntimeAdapter,
    BrowserPhaseExecutor,
    CapabilityRuntimeAdapter,
    DocumentRuntimeAdapter,
    WorkflowRuntimeAdapter,
    ExecutionService,
    ExecutionApprovalService,
    ExecutionBrowserOrchestrationService,
    ExecutionEventService,
    ExecutionFailureService,
    ExecutionFlowRunnerService,
    ExecutionHumanControlService,
    ExecutionInputResolutionService,
    ExecutionPlanningService,
    ExecutionPlanNormalizationService,
    ExecutionPhaseService,
    ExecutionPhaseSyncService,
    ExecutionRuntimeSessionService,
    ExecutionStateService,
    WorkflowActivityProgressService,
    ExecutionStepExecutorService,
    ExecutionStepService,
    RuntimeAdapterRegistry,
    RuntimeExecutionOrchestrator,
    RuntimeResultInterpreter,
    RuntimeStepRequestFactory,
  ],
  exports: [
    BrowserPhaseRecoveryPlanner,
    BrowserRuntimeAdapter,
    BrowserPhaseExecutor,
    CapabilityRuntimeAdapter,
    DocumentRuntimeAdapter,
    WorkflowRuntimeAdapter,
    ExecutionService,
    ExecutionApprovalService,
    ExecutionBrowserOrchestrationService,
    ExecutionEventService,
    ExecutionFailureService,
    ExecutionFlowRunnerService,
    ExecutionHumanControlService,
    ExecutionInputResolutionService,
    ExecutionPlanningService,
    ExecutionPlanNormalizationService,
    ExecutionPhaseService,
    ExecutionPhaseSyncService,
    ExecutionRuntimeSessionService,
    ExecutionStateService,
    WorkflowActivityProgressService,
    ExecutionStepExecutorService,
    ExecutionStepService,
    RuntimeAdapterRegistry,
    RuntimeExecutionOrchestrator,
    RuntimeResultInterpreter,
    RuntimeStepRequestFactory,
  ],
})
export class ExecutionModule {}
