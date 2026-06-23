import { BrowserRuntimeAdapter } from '../adapters/browser-runtime.adapter';
import { ExecutionRuntimeSessionService } from '../adapters/execution-runtime-session.service';
import { ExecutionCreateService } from '../creation/execution-create.service';
import { ExecutionApprovalService } from '../human-control/execution-approval.service';
import { ExecutionHumanControlService } from '../human-control/execution-human-control.service';
import { ExecutionInputResolutionService } from '../human-control/execution-input-resolution.service';
import { ExecutionSubmitInputService } from '../human-control/execution-submit-input.service';
import { ExecutionLifecycleService } from '../lifecycle/execution-lifecycle.service';
import { ExecutionStreamService } from '../lifecycle/execution-stream.service';
import { ExecutionQueryService } from '../query/execution-query.service';
import { ExecutionFailureService } from '../recovery/execution-failure.service';
import { ExecutionApplicationHooksService } from './execution-application-hooks.service';
import { ExecutionBrowserOrchestrationService } from '../step-runner/browser/execution-browser-orchestration.service';
import { ExecutionBrowserReadService } from '../step-runner/browser/execution-browser-read.service';
import { ExecutionFlowRunnerService } from '../step-runner/flow/execution-flow-runner.service';
import { ExecutionStartService } from '../step-runner/flow/execution-start.service';
import { ExecutionStepExecutorService } from '../step-runner/flow/execution-step-executor.service';
import { ExecutionPlanNormalizationService } from '../step-runner/planning/execution-plan-normalization.service';
import { ExecutionPlanningService } from '../step-runner/planning/execution-planning.service';
import { ExecutionRuntimeControlService } from '../step-runner/runtime/execution-runtime-control.service';
import { ExecutionRuntimeHooksService } from '../step-runner/runtime/execution-runtime-hooks.service';
import { RuntimeExecutionOrchestrator } from '../step-runner/runtime/runtime-execution.orchestrator';
import { ExecutionSystemSkillResultService } from '../step-runner/runtime/execution-system-skill-result.service';
import { ExecutionStepService } from '../step-runner/steps/execution-step.service';
import { ExecutionEventService } from '../state/execution-event.service';
import { ExecutionPhaseService } from '../state/execution-phase.service';
import { ExecutionPhaseSyncService } from '../state/execution-phase-sync.service';
import { ExecutionStateService } from '../state/execution-state.service';
import { WorkflowActivityProgressService } from '../state/workflow-activity-progress.service';
import {
  MatchedExecutionServiceDependencies,
  ResolvedExecutionServiceDependencies,
  ResolveExecutionServiceDependenciesInput,
} from './execution-service-dependency-types';

export function buildExecutionServiceDependencies(
  input: ResolveExecutionServiceDependenciesInput,
  matched: MatchedExecutionServiceDependencies
): ResolvedExecutionServiceDependencies {
  const finalExecutionEventService =
    matched.executionEventService || new ExecutionEventService(input.prisma);
  const finalExecutionStepService =
    matched.executionStepService || new ExecutionStepService(input.prisma);
  const finalExecutionPhaseService =
    matched.executionPhaseService || new ExecutionPhaseService(input.prisma);
  const finalExecutionPhaseSyncService =
    matched.executionPhaseSyncService ||
    new ExecutionPhaseSyncService(input.prisma, finalExecutionPhaseService);
  const finalExecutionStateService =
    matched.executionStateService ||
    new ExecutionStateService(input.prisma, finalExecutionEventService);
  const finalExecutionApprovalService =
    matched.executionApprovalService || new ExecutionApprovalService(input.prisma);
  const finalExecutionHumanControlService =
    matched.executionHumanControlService ||
    new ExecutionHumanControlService(
      input.prisma,
      finalExecutionPhaseService,
      finalExecutionStepService
    );
  const finalExecutionInputResolutionService =
    matched.executionInputResolutionService || new ExecutionInputResolutionService();
  const finalExecutionPlanNormalizationService =
    matched.executionPlanNormalizationService ||
    new ExecutionPlanNormalizationService(finalExecutionInputResolutionService);
  const finalExecutionPlanningService =
    matched.executionPlanningService ||
    new ExecutionPlanningService(input.prisma, finalExecutionPlanNormalizationService);
  const finalExecutionCreateService =
    matched.executionCreateService ||
    new ExecutionCreateService(
      input.prisma,
      finalExecutionPlanningService,
      finalExecutionPlanNormalizationService,
      finalExecutionInputResolutionService,
      finalExecutionStepService
    );
  const finalExecutionSubmitInputService =
    matched.executionSubmitInputService ||
    new ExecutionSubmitInputService(
      input.prisma,
      finalExecutionStepService,
      finalExecutionInputResolutionService,
      finalExecutionPlanNormalizationService
    );
  const finalExecutionFailureService =
    matched.executionFailureService ||
    new ExecutionFailureService(
      input.prisma,
      finalExecutionStepService,
      finalExecutionInputResolutionService
    );
  const finalExecutionBrowserOrchestrationService =
    matched.executionBrowserOrchestrationService ||
    new ExecutionBrowserOrchestrationService(
      input.prisma,
      finalExecutionStepService,
      finalExecutionPhaseSyncService,
      finalExecutionFailureService,
      input.runtimeExecutionOrchestrator as RuntimeExecutionOrchestrator,
      input.runtimeResultInterpreter,
      input.runtimeStepRequestFactory
    );
  const finalExecutionRuntimeSessionService =
    matched.executionRuntimeSessionService || new ExecutionRuntimeSessionService();
  const finalExecutionStartService =
    matched.executionStartService ||
    new ExecutionStartService(input.prisma, finalExecutionRuntimeSessionService);
  const finalExecutionStepExecutorService =
    matched.executionStepExecutorService ||
    new ExecutionStepExecutorService(
      finalExecutionStepService,
      input.runtimeExecutionOrchestrator as RuntimeExecutionOrchestrator,
      input.runtimeStepRequestFactory,
      matched.browserPhaseExecutor
    );
  const finalExecutionRuntimeHooksService =
    matched.executionRuntimeHooksService ||
    new ExecutionRuntimeHooksService(
      finalExecutionBrowserOrchestrationService,
      finalExecutionPhaseSyncService,
      finalExecutionFailureService
    );
  const finalExecutionApplicationHooksService =
    matched.executionApplicationHooksService || new ExecutionApplicationHooksService();
  const finalExecutionRuntimeControlService =
    matched.executionRuntimeControlService ||
    new ExecutionRuntimeControlService(
      finalExecutionFailureService,
      finalExecutionHumanControlService
    );
  const finalExecutionSystemSkillResultService =
    matched.executionSystemSkillResultService ||
    new ExecutionSystemSkillResultService(
      input.runtimeResultInterpreter,
      finalExecutionPhaseSyncService
    );
  const finalWorkflowActivityProgressService =
    matched.workflowActivityProgressService ||
    new WorkflowActivityProgressService(input.prisma, finalExecutionPhaseService);
  const finalExecutionQueryService =
    matched.executionQueryService ||
    new ExecutionQueryService(input.prisma, finalExecutionPhaseService, finalExecutionStepService);
  const finalExecutionLifecycleService =
    matched.executionLifecycleService ||
    new ExecutionLifecycleService(
      input.prisma,
      finalExecutionStepService,
      finalExecutionRuntimeSessionService
    );
  const finalExecutionStreamService =
    matched.executionStreamService || new ExecutionStreamService(finalExecutionEventService);
  const finalBrowserRuntimeAdapter =
    matched.browserRuntimeAdapter || new BrowserRuntimeAdapter();
  const finalExecutionBrowserReadService =
    matched.executionBrowserReadService ||
    new ExecutionBrowserReadService(finalBrowserRuntimeAdapter);
  const finalExecutionFlowRunnerService =
    matched.executionFlowRunnerService ||
    new ExecutionFlowRunnerService(input.prisma, finalExecutionStepService);

  return {
    executionEventService: finalExecutionEventService,
    executionFailureService: finalExecutionFailureService,
    executionFlowRunnerService: finalExecutionFlowRunnerService,
    executionPhaseService: finalExecutionPhaseService,
    executionPhaseSyncService: finalExecutionPhaseSyncService,
    executionStateService: finalExecutionStateService,
    executionLifecycleService: finalExecutionLifecycleService,
    executionStreamService: finalExecutionStreamService,
    executionQueryService: finalExecutionQueryService,
    executionApplicationHooksService: finalExecutionApplicationHooksService,
    executionStepService: finalExecutionStepService,
    executionApprovalService: finalExecutionApprovalService,
    executionHumanControlService: finalExecutionHumanControlService,
    executionCreateService: finalExecutionCreateService,
    executionInputResolutionService: finalExecutionInputResolutionService,
    executionSubmitInputService: finalExecutionSubmitInputService,
    executionStartService: finalExecutionStartService,
    executionPlanningService: finalExecutionPlanningService,
    executionPlanNormalizationService: finalExecutionPlanNormalizationService,
    executionBrowserOrchestrationService: finalExecutionBrowserOrchestrationService,
    executionRuntimeSessionService: finalExecutionRuntimeSessionService,
    executionStepExecutorService: finalExecutionStepExecutorService,
    executionRuntimeHooksService: finalExecutionRuntimeHooksService,
    executionRuntimeControlService: finalExecutionRuntimeControlService,
    executionSystemSkillResultService: finalExecutionSystemSkillResultService,
    workflowActivityProgressService: finalWorkflowActivityProgressService,
    browserRuntimeAdapter: finalBrowserRuntimeAdapter,
    executionBrowserReadService: finalExecutionBrowserReadService,
  };
}
