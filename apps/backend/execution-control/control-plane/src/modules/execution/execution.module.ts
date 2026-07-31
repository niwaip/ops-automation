import { Module } from '@nestjs/common';
import { BrowserPhaseRecoveryPlanner } from './recovery/browser-phase-recovery.planner';
import { BrowserPhaseExecutor } from './step-runner/browser/browser-phase.executor';
import { BrowserRuntimeAdapter } from './adapters/browser-runtime.adapter';
import { CapabilityRuntimeAdapter } from './adapters/capability-runtime.adapter';
import { DocumentRuntimeAdapter } from './adapters/document-runtime.adapter';
import { ExecutionController } from './execution.controller';
import { ExecutionCreateService } from './creation/execution-create.service';
import { ExecutionApprovalService } from './human-control/execution-approval.service';
import { ExecutionLifecycleService } from './lifecycle/execution-lifecycle.service';
import { ExecutionStreamService } from './lifecycle/execution-stream.service';
import { ExecutionBrowserOrchestrationService } from './step-runner/browser/execution-browser-orchestration.service';
import { ExecutionEventService } from './state/execution-event.service';
import { ExecutionFailureService } from './recovery/execution-failure.service';
import { ExecutionFlowRunnerService } from './step-runner/flow/execution-flow-runner.service';
import { ExecutionHumanControlService } from './human-control/execution-human-control.service';
import { ExecutionInputResolutionService } from './human-control/execution-input-resolution.service';
import { ExecutionSubmitInputService } from './human-control/execution-submit-input.service';
import { ExecutionPlanningService } from './step-runner/planning/execution-planning.service';
import { ExecutionPlanNormalizationService } from './step-runner/planning/execution-plan-normalization.service';
import { ExecutionStartService } from './step-runner/flow/execution-start.service';
import { ExecutionPhaseService } from './state/execution-phase.service';
import { ExecutionPhaseSyncService } from './state/execution-phase-sync.service';
import { ExecutionQueryService } from './query/execution-query.service';
import { ExecutionRuntimeSessionService } from './adapters/execution-runtime-session.service';
import { ExecutionApplicationHooksService } from './shared/execution-application-hooks.service';
import { ExecutionStateService } from './state/execution-state.service';
import { WorkflowActivityProgressService } from './state/workflow-activity-progress.service';
import { ExecutionBrowserReadService } from './step-runner/browser/execution-browser-read.service';
import { ExecutionStepExecutorService } from './step-runner/flow/execution-step-executor.service';
import { ExecutionRuntimeControlService } from './step-runner/runtime/execution-runtime-control.service';
import { ExecutionRuntimeHooksService } from './step-runner/runtime/execution-runtime-hooks.service';
import { ExecutionSystemSkillResultService } from './step-runner/runtime/execution-system-skill-result.service';
import { ExecutionStepReaderService } from './step-runner/steps/execution-step-reader.service';
import { ExecutionStepService } from './step-runner/steps/execution-step.service';
import { ExecutionStepWriterService } from './step-runner/steps/execution-step-writer.service';
import { ExecutionService } from './execution.service';
import { RuntimeAdapterRegistry } from './adapters/runtime-adapter.registry';
import { RuntimeExecutionOrchestrator } from './step-runner/runtime/runtime-execution.orchestrator';
import { RuntimeResultInterpreter } from './step-runner/runtime/runtime-result.interpreter';
import { RuntimeStepRequestFactory } from './step-runner/runtime/runtime-step-request.factory';
import { WorkflowRuntimeAdapter } from './adapters/workflow-runtime.adapter';
import { LlmOperationRuntimeAdapter } from './adapters/llm-operation-runtime.adapter';
import { BuiltinWorkflowRuntimeAdapter } from './adapters/builtin-workflow-runtime.adapter';
import { BuiltinHandlerRegistryService } from './adapters/builtin-handler-registry.service';
import { DeterministicPlanValidatorService } from './plan-runtime/deterministic-plan-validator.service';
import { DeterministicPlanFreezeService } from './plan-runtime/deterministic-plan-freeze.service';
import { DeterministicNodeInputResolverService } from './plan-runtime/deterministic-node-input-resolver.service';
import { DeterministicFinalOutputService } from './plan-runtime/deterministic-final-output.service';
import { DeterministicPlanSchedulerService } from './plan-runtime/deterministic-plan-scheduler.service';
import { DeterministicPlanRecoveryService } from './plan-runtime/deterministic-plan-recovery.service';
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
    BuiltinHandlerRegistryService,
    BuiltinWorkflowRuntimeAdapter,
    LlmOperationRuntimeAdapter,
    DeterministicPlanValidatorService,
    DeterministicPlanFreezeService,
    DeterministicNodeInputResolverService,
    DeterministicFinalOutputService,
    DeterministicPlanSchedulerService,
    DeterministicPlanRecoveryService,
    ExecutionService,
    ExecutionCreateService,
    ExecutionApprovalService,
    ExecutionBrowserOrchestrationService,
    ExecutionEventService,
    ExecutionStreamService,
    ExecutionFailureService,
    ExecutionFlowRunnerService,
    ExecutionHumanControlService,
    ExecutionInputResolutionService,
    ExecutionSubmitInputService,
    ExecutionLifecycleService,
    ExecutionPlanningService,
    ExecutionPlanNormalizationService,
    ExecutionStartService,
    ExecutionPhaseService,
    ExecutionPhaseSyncService,
    ExecutionQueryService,
    ExecutionRuntimeSessionService,
    ExecutionApplicationHooksService,
    ExecutionStateService,
    WorkflowActivityProgressService,
    ExecutionBrowserReadService,
    ExecutionStepExecutorService,
    ExecutionRuntimeControlService,
    ExecutionRuntimeHooksService,
    ExecutionSystemSkillResultService,
    ExecutionStepReaderService,
    ExecutionStepService,
    ExecutionStepWriterService,
    RuntimeAdapterRegistry,
    RuntimeExecutionOrchestrator,
    RuntimeResultInterpreter,
    RuntimeStepRequestFactory,
  ],
  exports: [
    ExecutionService,
    ExecutionEventService,
    DeterministicPlanValidatorService,
    DeterministicPlanFreezeService,
    DeterministicPlanSchedulerService,
  ],
})
export class ExecutionModule {}
