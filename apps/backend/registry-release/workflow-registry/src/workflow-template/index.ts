export { TemporalWorkflowModule } from '@ops/platform/dist/modules/temporal-workflow/temporal-workflow.module';
export { TemporalWorkflowService } from '@ops/platform/dist/modules/temporal-workflow/temporal-workflow.service';
export {
  TemporalWorkflowArtifactService,
  TemporalWorkflowConfigOrchestrationService,
  TemporalWorkflowConfigService,
  TemporalWorkflowDraftOrchestrationService,
  TemporalWorkflowManagementService,
  TemporalWorkflowSessionOrchestrationService,
  TemporalWorkflowSessionSupportFactoryService,
  TemporalWorkflowTemplateService,
} from '@ops/platform/dist/workflow-registry/workflow-template/index';
export {
  DEFAULT_TEMPLATE_WORKFLOW_DSL,
} from '@ops/platform/dist/modules/temporal-workflow/temporal-workflow.types';
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
  TemplateWorkflowDraft,
  TemporalWorkflowSourceTemplate,
  WorkflowDsl,
} from '@ops/platform/dist/modules/temporal-workflow/temporal-workflow.types';

export function resolveWorkflowTemplateSourceTemplate(
  workflowDsl: Pick<WorkflowDsl, 'sourceContext'> | null | undefined,
): TemporalWorkflowSourceTemplate | undefined {
  return workflowDsl?.sourceContext?.sourceTemplate ?? undefined;
}

export function hasTemplateWorkflowDraftSource(
  draft: TemplateWorkflowDraft,
): boolean {
  return Boolean(draft.sourceTemplate?.templateId?.trim());
}
