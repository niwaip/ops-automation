export type {
  StepAnalysis,
  ValidationResult,
} from '@ops/platform/dist/modules/execution-flow/interfaces';
export {
  ExecutionFlowValidationFacadeService,
} from '@ops/platform/dist/modules/execution-flow/execution-flow-validation-facade.service';
export {
  ExecutionFlowValidationHttpService,
} from '@ops/platform/dist/modules/execution-flow/execution-flow-validation-http.service';
export {
  ExecutionFlowValidationService,
} from '@ops/platform/dist/modules/execution-flow/execution-flow-validation.service';
export {
  ActivityValidationService,
} from '@ops/platform/dist/modules/temporal-workflow/temporal-activity-validation.service';
export {
  TemporalActivityValidationFacadeService,
} from '@ops/platform/dist/modules/temporal-workflow/temporal-activity-validation-facade.service';
export {
  TemporalActivityValidationHttpService,
} from '@ops/platform/dist/modules/temporal-workflow/temporal-activity-validation-http.service';
export {
  TemporalWorkflowValidationService,
} from '@ops/platform/dist/modules/temporal-workflow/temporal-workflow-validation.service';
export {
  TemporalWorkflowValidationFacadeService,
} from '@ops/platform/dist/modules/temporal-workflow/temporal-workflow-validation-facade.service';
export {
  TemporalWorkflowValidationHttpService,
} from '@ops/platform/dist/modules/temporal-workflow/temporal-workflow-validation-http.service';
export {
  TemporalWorkflowArtifactValidationService,
  TemporalWorkflowDslValidationService,
} from '@ops/platform/dist/workflow-registry/validation/index';
export {
  DEFAULT_TEMPLATE_WORKFLOW_DSL,
} from '@ops/platform/dist/modules/temporal-workflow/temporal-workflow.types';
export type {
  ActivityExecutionOptions,
  ActivityFormData,
  ActivityValidationResult,
  BuiltinActivityDTO,
  GenerateCodeResult,
} from '@ops/platform/dist/modules/temporal-workflow/temporal-activity.types';
export type {
  ActivityDefinition,
  ActivityDsl,
  AiWorkflowDraft,
  AiWorkflowDraftSession,
  AiWorkflowDraftSessionListItem,
  AiWorkflowDraftSessionMessage,
  BrowserDraftCommandInput,
  BrowserLoopDraftLike,
  BrowserLoopStopWhenDraftLike,
  BrowserScriptCommand,
  BrowserTemplateParamsSchema,
  BrowserTemplateStepInput,
  BrowserWorkflowActivityPhase,
  BrowserWorkflowActivityPhaseGroup,
  BrowserWorkflowActivityStep,
  BrowserWorkflowDraft,
  CarboneSkillMeta,
  CarboneTemplateMeta,
  CompileTemplateWorkflowDraftDTO,
  CreateTemporalWorkflowDTO,
  GenerateAiWorkflowDraftDTO,
  GenerateAiWorkflowDraftSessionDTO,
  GenerateBrowserWorkflowDraftDTO,
  GenerateTemplateWorkflowDraftDTO,
  RefineAiWorkflowDraftDTO,
  RefineAiWorkflowDraftSessionDTO,
  TemplateWorkflowAiAnalysis,
  TemplateWorkflowDraft,
  TemporalValidationResult,
  TemporalWorkflowArtifactDTO,
  TemporalWorkflowArtifactRef,
  TemporalWorkflowDTO,
  TemporalWorkflowSourceContext,
  TemporalWorkflowSourceTemplate,
  TemporalWorkflowValidationStatus,
  UpdateTemporalWorkflowDTO,
  WorkflowDsl,
  WorkflowInputParamDefinition,
  WorkflowInputParamSource,
  WorkflowInputParamType,
  WorkflowInputPolicy,
  WorkflowLocalizedValueMap,
  WorkflowParamPolicy,
  WorkflowParamRequiredMode,
  WorkflowQueryHandler,
  WorkflowResultArtifact,
  WorkflowResultBusinessSection,
  WorkflowResultEnvelope,
  WorkflowResultExecution,
  WorkflowResultPresentation,
  WorkflowResultTextFormat,
  WorkflowResultTrigger,
  WorkflowSignalHandler,
  WorkflowStep,
} from '@ops/platform/dist/modules/temporal-workflow/temporal-workflow.types';

import type {
  ActivityValidationResult,
} from '@ops/platform/dist/modules/temporal-workflow/temporal-activity.types';
import type {
  TemporalValidationResult,
} from '@ops/platform/dist/modules/temporal-workflow/temporal-workflow.types';
import type {
  ValidationResult,
} from '@ops/platform/dist/modules/execution-flow/interfaces';

export function isExecutionFlowValidationPassed(
  result: ValidationResult,
  minimumScore = 60,
): boolean {
  return result.isValid && (result.score ?? minimumScore) >= minimumScore;
}

export function collectTemporalValidationMessages(
  result: TemporalValidationResult,
): string[] {
  return [...result.errors, ...result.warnings];
}

export function collectActivityValidationMessages(
  result: ActivityValidationResult,
): string[] {
  return [...result.errors, ...result.warnings, ...result.suggestions];
}
