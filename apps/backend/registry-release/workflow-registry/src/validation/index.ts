export type {
  StepAnalysis,
  ValidationResult,
} from '@ops/platform/dist/modules/execution-flow';
export {
  ExecutionFlowValidationFacadeService,
  ExecutionFlowValidationHttpService,
  ExecutionFlowValidationService,
} from '@ops/platform/dist/modules/execution-flow';
export {
  ActivityValidationService,
  TemporalActivityValidationFacadeService,
  TemporalActivityValidationHttpService,
  TemporalWorkflowValidationService,
  TemporalWorkflowValidationFacadeService,
  TemporalWorkflowValidationHttpService,
} from '@ops/platform/dist/modules/temporal-workflow';
export {
  TemporalWorkflowArtifactValidationService,
  TemporalWorkflowDslValidationService,
} from '@ops/platform/dist/workflow-registry/validation/index';
export {
  DEFAULT_TEMPLATE_WORKFLOW_DSL,
} from '@ops/platform/dist/modules/temporal-workflow';
export type {
  ActivityExecutionOptions,
  ActivityFormData,
  ActivityValidationResult,
  BuiltinActivityDTO,
  GenerateCodeResult,
} from '@ops/platform/dist/modules/temporal-workflow';
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
} from '@ops/platform/dist/modules/temporal-workflow';

import type {
  ActivityValidationResult,
} from '@ops/platform/dist/modules/temporal-workflow';
import type {
  TemporalValidationResult,
} from '@ops/platform/dist/modules/temporal-workflow';
import type {
  ValidationResult,
} from '@ops/platform/dist/modules/execution-flow';

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
