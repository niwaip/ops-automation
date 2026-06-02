import { Module } from '@nestjs/common';
import { BrowserPhaseRecoveryPlanner } from './browser-phase-recovery.planner';
import { BrowserPhaseExecutor } from './browser-phase.executor';
import { BrowserRuntimeAdapter } from './browser-runtime.adapter';
import { CapabilityRuntimeAdapter } from './capability-runtime.adapter';
import { DocumentRuntimeAdapter } from './document-runtime.adapter';
import { ExecutionController } from './execution.controller';
import { ExecutionApprovalService } from './execution-approval.service';
import { ExecutionBrowserOrchestrationService } from './execution-browser-orchestration.service';
import { ExecutionEventService } from './execution-event.service';
import { ExecutionFailureService } from './execution-failure.service';
import { ExecutionFlowRunnerService } from './execution-flow-runner.service';
import { ExecutionHumanControlService } from './execution-human-control.service';
import { ExecutionInputResolutionService } from './execution-input-resolution.service';
import { ExecutionPlanningService } from './execution-planning.service';
import { ExecutionPlanNormalizationService } from './execution-plan-normalization.service';
import { ExecutionPhaseService } from './execution-phase.service';
import { ExecutionPhaseSyncService } from './execution-phase-sync.service';
import { ExecutionRuntimeSessionService } from './execution-runtime-session.service';
import { ExecutionStateService } from './execution-state.service';
import { ExecutionStepExecutorService } from './execution-step-executor.service';
import { ExecutionStepService } from './execution-step.service';
import { ExecutionService } from './execution.service';
import { RuntimeAdapterRegistry } from './runtime-adapter.registry';
import { RuntimeExecutionOrchestrator } from './runtime-execution.orchestrator';
import { RuntimeResultInterpreter } from './runtime-result.interpreter';
import { RuntimeStepRequestFactory } from './runtime-step-request.factory';
import { WorkflowRuntimeAdapter } from './workflow-runtime.adapter';
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
    ExecutionStepExecutorService,
    ExecutionStepService,
    RuntimeAdapterRegistry,
    RuntimeExecutionOrchestrator,
    RuntimeResultInterpreter,
    RuntimeStepRequestFactory,
  ],
})
export class ExecutionModule {}
