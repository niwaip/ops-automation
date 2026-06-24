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
import { BrowserPhaseExecutor } from '../step-runner/browser/browser-phase.executor';
import { ExecutionBrowserReadService } from '../step-runner/browser/execution-browser-read.service';
import { ExecutionFlowRunnerService } from '../step-runner/flow/execution-flow-runner.service';
import { ExecutionStartService } from '../step-runner/flow/execution-start.service';
import { ExecutionStepExecutorService } from '../step-runner/flow/execution-step-executor.service';
import { ExecutionPlanNormalizationService } from '../step-runner/planning/execution-plan-normalization.service';
import { ExecutionPlanningService } from '../step-runner/planning/execution-planning.service';
import { ExecutionRuntimeControlService } from '../step-runner/runtime/execution-runtime-control.service';
import { ExecutionRuntimeHooksService } from '../step-runner/runtime/execution-runtime-hooks.service';
import { ExecutionSystemSkillResultService } from '../step-runner/runtime/execution-system-skill-result.service';
import { ExecutionStepService } from '../step-runner/steps/execution-step.service';
import { ExecutionEventService } from '../state/execution-event.service';
import { ExecutionPhaseService } from '../state/execution-phase.service';
import { ExecutionPhaseSyncService } from '../state/execution-phase-sync.service';
import { ExecutionStateService } from '../state/execution-state.service';
import { WorkflowActivityProgressService } from '../state/workflow-activity-progress.service';
import {
  MatchedExecutionServiceDependencies,
  ResolveExecutionServiceDependenciesInput,
} from './execution-service-dependency-types';

const hasMethod = (value: unknown, methodName: string): boolean =>
  Boolean(value) &&
  typeof value === 'object' &&
  typeof (value as Record<string, unknown>)[methodName] === 'function';

export function matchExecutionServiceDependencies(
  input: ResolveExecutionServiceDependenciesInput
): MatchedExecutionServiceDependencies {
  const dependencyCandidates = [
    input.runtimeExecutionOrchestrator,
    input.runtimeResultInterpreter,
    input.runtimeStepRequestFactory,
    input.executionEventService,
    input.executionFailureService,
    input.executionPhaseService,
    input.executionPhaseSyncService,
    input.executionStateService,
    input.executionStepService,
    input.executionCreateService,
    input.executionInputResolutionService,
    input.executionSubmitInputService,
    input.executionStartService,
    input.executionPlanNormalizationService,
    input.browserPhaseExecutor,
    input.executionHumanControlService,
    input.executionApprovalService,
    input.executionPlanningService,
    input.executionRuntimeSessionService,
    input.executionFlowRunnerService,
    input.executionStepExecutorService,
    input.executionApplicationHooksService,
    input.executionRuntimeHooksService,
    input.executionRuntimeControlService,
    input.executionSystemSkillResultService,
    input.executionBrowserOrchestrationService,
    input.browserRuntimeAdapter,
    input.workflowActivityProgressService,
    input.executionQueryService,
    input.executionLifecycleService,
    input.executionBrowserReadService,
    input.executionStreamService,
  ];

  const pickDependency = <T>(
    explicit: T | undefined,
    predicate: (value: unknown) => boolean
  ): T | undefined => {
    if (predicate(explicit)) {
      return explicit;
    }
    return dependencyCandidates.find((candidate) => predicate(candidate)) as T | undefined;
  };

  return {
    executionEventService: pickDependency<ExecutionEventService>(
      input.executionEventService,
      (value) => hasMethod(value, 'createEvent')
    ),
    executionFailureService: pickDependency<ExecutionFailureService>(
      input.executionFailureService,
      (value) => hasMethod(value, 'enterRuntimeWaitingInput') && hasMethod(value, 'skipSingleStep')
    ),
    executionPhaseService: pickDependency<ExecutionPhaseService>(
      input.executionPhaseService,
      (value) =>
        hasMethod(value, 'listByExecutionId') ||
        hasMethod(value, 'createOrUpdatePhase') ||
        hasMethod(value, 'markCompleted') ||
        hasMethod(value, 'markRunning') ||
        hasMethod(value, 'getByExecutionIdAndPhaseKey') ||
        hasMethod(value, 'markWaitingTakeover') ||
        hasMethod(value, 'createTakeoverRecord')
    ),
    executionPhaseSyncService: pickDependency<ExecutionPhaseSyncService>(
      input.executionPhaseSyncService,
      (value) =>
        hasMethod(value, 'syncPhaseAfterStepResult') &&
        hasMethod(value, 'completeActivePhasesOnExecutionSuccess')
    ),
    executionStateService: pickDependency<ExecutionStateService>(
      input.executionStateService,
      (value) => hasMethod(value, 'updateStatus')
    ),
    executionStepService: pickDependency<ExecutionStepService>(
      input.executionStepService,
      (value) =>
        hasMethod(value, 'getById') ||
        hasMethod(value, 'createManyPlannedSteps') ||
        hasMethod(value, 'findNextPendingStep') ||
        hasMethod(value, 'finishRuntimeStep') ||
        hasMethod(value, 'requeueFailedStep') ||
        hasMethod(value, 'findPendingBrowserGotoStep') ||
        hasMethod(value, 'setCurrentStep')
    ),
    executionCreateService: pickDependency<ExecutionCreateService>(
      input.executionCreateService,
      (value) => hasMethod(value, 'create')
    ),
    executionInputResolutionService: pickDependency<ExecutionInputResolutionService>(
      input.executionInputResolutionService,
      (value) => hasMethod(value, 'resolveSubmitInputState')
    ),
    executionSubmitInputService: pickDependency<ExecutionSubmitInputService>(
      input.executionSubmitInputService,
      (value) => hasMethod(value, 'submitInputAndResume')
    ),
    executionStartService: pickDependency<ExecutionStartService>(
      input.executionStartService,
      (value) => hasMethod(value, 'startExecution')
    ),
    executionPlanNormalizationService: pickDependency<ExecutionPlanNormalizationService>(
      input.executionPlanNormalizationService,
      (value) => hasMethod(value, 'shouldSkipPlannerForExplicitStructuredInput')
    ),
    browserPhaseExecutor: pickDependency<BrowserPhaseExecutor>(
      input.browserPhaseExecutor,
      (value) => hasMethod(value, 'execute')
    ),
    executionHumanControlService: pickDependency<ExecutionHumanControlService>(
      input.executionHumanControlService,
      (value) => hasMethod(value, 'takeover') && hasMethod(value, 'resumePhaseTakeover')
    ),
    executionApprovalService: pickDependency<ExecutionApprovalService>(
      input.executionApprovalService,
      (value) => hasMethod(value, 'approve') && hasMethod(value, 'reject')
    ),
    executionPlanningService: pickDependency<ExecutionPlanningService>(
      input.executionPlanningService,
      (value) =>
        hasMethod(value, 'generatePlanDraft') && hasMethod(value, 'assertSkillAccessibleByUser')
    ),
    executionRuntimeSessionService: pickDependency<ExecutionRuntimeSessionService>(
      input.executionRuntimeSessionService,
      (value) => hasMethod(value, 'allocateRuntimeSession') && hasMethod(value, 'closeQuietly')
    ),
    executionFlowRunnerService: pickDependency<ExecutionFlowRunnerService>(
      input.executionFlowRunnerService,
      (value) => hasMethod(value, 'advanceExecutionFlow')
    ),
    executionStepExecutorService: pickDependency<ExecutionStepExecutorService>(
      input.executionStepExecutorService,
      (value) =>
        hasMethod(value, 'executeBrowserGotoStep') && hasMethod(value, 'executeSystemSkillStep')
    ),
    executionApplicationHooksService: pickDependency<ExecutionApplicationHooksService>(
      input.executionApplicationHooksService,
      (value) =>
        hasMethod(value, 'createLifecycleHooks') && hasMethod(value, 'createApprovalHooks')
    ),
    executionRuntimeHooksService: pickDependency<ExecutionRuntimeHooksService>(
      input.executionRuntimeHooksService,
      (value) =>
        hasMethod(value, 'createBrowserOrchestrationHooks') &&
        hasMethod(value, 'createStepExecutorHooks')
    ),
    executionRuntimeControlService: pickDependency<ExecutionRuntimeControlService>(
      input.executionRuntimeControlService,
      (value) =>
        hasMethod(value, 'failExecutionFromRuntimeStep') &&
        hasMethod(value, 'requestSystemTakeover')
    ),
    executionSystemSkillResultService: pickDependency<ExecutionSystemSkillResultService>(
      input.executionSystemSkillResultService,
      (value) =>
        hasMethod(value, 'handleSystemSkillStepResult') &&
        hasMethod(value, 'syncWorkflowActivityPhasesAfterSkillResult')
    ),
    executionBrowserOrchestrationService: pickDependency<ExecutionBrowserOrchestrationService>(
      input.executionBrowserOrchestrationService,
      (value) =>
        hasMethod(value, 'bootstrapBrowserExecution') &&
        hasMethod(value, 'handleBrowserPhaseStepResult')
    ),
    browserRuntimeAdapter: pickDependency<BrowserRuntimeAdapter>(
      input.browserRuntimeAdapter,
      (value) =>
        hasMethod(value, 'invokeStep') &&
        hasMethod(value, 'inspectState') &&
        hasMethod(value, 'assertState')
    ),
    workflowActivityProgressService: pickDependency<WorkflowActivityProgressService>(
      input.workflowActivityProgressService,
      (value) => hasMethod(value, 'sync')
    ),
    executionBrowserReadService: pickDependency<ExecutionBrowserReadService>(
      input.executionBrowserReadService,
      (value) =>
        hasMethod(value, 'readBrowserTextBySelector') &&
        hasMethod(value, 'extractBrowserTextResult')
    ),
    executionQueryService: pickDependency<ExecutionQueryService>(
      input.executionQueryService,
      (value) =>
        hasMethod(value, 'getById') && hasMethod(value, 'getPhases') && hasMethod(value, 'list')
    ),
    executionLifecycleService: pickDependency<ExecutionLifecycleService>(
      input.executionLifecycleService,
      (value) =>
        hasMethod(value, 'cancel') &&
        hasMethod(value, 'delete') &&
        hasMethod(value, 'cleanupBeforeDate')
    ),
    executionStreamService: pickDependency<ExecutionStreamService>(
      input.executionStreamService,
      (value) => hasMethod(value, 'subscribeToEvents') && hasMethod(value, 'publishEvent')
    ),
  };
}
