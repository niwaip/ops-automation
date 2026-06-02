import {
  normalizeAiDraftStepInput,
  normalizeDraftInputParams,
  normalizeDraftOutputParams,
} from './temporal-workflow-draft.normalizers';
import {
  normalizeWorkflowInputRenderPath,
} from './temporal-workflow-template.helpers';
import {
  buildPlaceholderValueFromSchemaHint,
  extractValueByPath,
} from './temporal-workflow-draft.normalizers';
import type {
  TemporalWorkflowActivityResolutionSupport,
} from './temporal-workflow-activity-resolution.service';
import type {
  TemporalWorkflowAiDraftSupport,
} from './temporal-workflow-draft.service';
import type {
  TemporalWorkflowBrowserDraftSupport,
} from './temporal-workflow-browser-draft.service';
import type {
  TemporalWorkflowCodegenSupport,
} from './temporal-workflow-codegen.service';
import type {
  TemporalWorkflowSessionSupport,
} from './temporal-workflow-session.service';
import type {
  TemporalWorkflowTemplateSupport,
} from './temporal-workflow-template.service';
import type {
  ActivityDsl,
  WorkflowDsl,
} from './temporal-workflow.types';

interface AiDraftSupportDependencies {
  fetchReferenceUrlExcerpt: (referenceUrl: string) => Promise<string>;
  sanitizeJsonValue: <T>(value: T) => T;
  parseJsonFromAiContent: (content: string) => Record<string, any>;
  pickFirstNonEmptyString: (...values: unknown[]) => string | undefined;
  normalizeHttpRequestConfig: (config: Record<string, any>, declaredInputKeys?: Set<string>) => Record<string, any>;
  optimizeHttpRequestConfig: (
    stepConfig: Record<string, any>,
    inputParams?: Record<string, any>,
    userRequest?: string,
  ) => Promise<{
    success: boolean;
    optimizedConfig?: Record<string, any>;
    previewResponse?: Record<string, any>;
    explanation?: string;
    error?: string;
  }>;
  previewHttpRequestConfig: (
    stepConfig: Record<string, any>,
    inputParams?: Record<string, any>,
  ) => Promise<{
    success: boolean;
    baseConfig?: Record<string, any>;
    resolvedRequest?: Record<string, any>;
    previewResponse?: Record<string, any>;
    error?: string;
  }>;
  generateStructuredTransformConfig: (
    sourceSample: Record<string, any> | string,
    userRequest: string,
    existingConfig?: Record<string, any>,
  ) => Promise<{
    success: boolean;
    config?: Record<string, any>;
    explanation?: string;
    error?: string;
  }>;
  generateAiStructuredTransformDraftConfig: (
    sourceSample: Record<string, any> | string,
    userRequest: string,
    existingConfig?: Record<string, any>,
  ) => Promise<{
    success: boolean;
    config?: Record<string, any>;
    sampleOutput?: unknown;
    explanation?: string;
    error?: string;
  }>;
  normalizeStructuredTransformConfig: (config: Record<string, any>, placeholderKeys?: Set<string>) => Record<string, any>;
  collectTemplateVariables: (value: unknown, target?: Set<string>) => Set<string>;
  renderHttpTemplateValue: (value: unknown, params: Record<string, any>) => unknown;
  normalizeName: (value: string | undefined | null) => string;
  normalizeDescription: (value: string | undefined | null) => string | null;
  normalizeTaskQueue: (value: string | undefined | null) => string;
  normalizeWorkflowClassName: (candidate: string | undefined, workflowName: string) => string;
  normalizeWorkflowDsl: (
    workflowDsl: WorkflowDsl,
    workflowName?: string,
    taskQueue?: string,
    activityDsl?: ActivityDsl,
  ) => Promise<WorkflowDsl>;
  buildWorkflowSemanticHint: (...values: unknown[]) => string;
}

interface TemplateSupportDependencies {
  getBuiltinDocumentRenderActivity: () => any;
  buildDefaultWorkflowInputPolicyParams: (inputParams: Record<string, any> | undefined) => Record<string, any>;
  normalizeName: (value: string | undefined | null) => string;
  normalizeDescription: (value: string | undefined | null) => string | null;
  normalizeTaskQueue: (value: string | undefined | null) => string;
  normalizeWorkflowDsl: (
    workflowDsl: WorkflowDsl,
    workflowName?: string,
    taskQueue?: string,
    activityDsl?: ActivityDsl,
  ) => Promise<WorkflowDsl>;
  pickFirstNonEmptyString: (...values: unknown[]) => string | undefined;
  uniqueVariables: (variables: string[]) => string[];
  buildWorkflowSemanticHint: (...values: unknown[]) => string;
}

interface BrowserDraftSupportDependencies {
  normalizeName: (value: string | undefined | null) => string;
  normalizeDescription: (value: string | undefined | null) => string | null;
  pickFirstNonEmptyString: (...values: unknown[]) => string | undefined;
  collectTemplateVariables: (value: unknown, target?: Set<string>) => Set<string>;
  buildWorkflowSemanticHint: (...values: unknown[]) => string;
}

export function createTemporalWorkflowAiDraftSupport(
  deps: AiDraftSupportDependencies,
): TemporalWorkflowAiDraftSupport {
  return {
    fetchReferenceUrlExcerpt: (referenceUrl) => deps.fetchReferenceUrlExcerpt(referenceUrl),
    sanitizeJsonValue: <T>(value: T) => deps.sanitizeJsonValue(value),
    parseJsonFromAiContent: (content) => deps.parseJsonFromAiContent(content),
    pickFirstNonEmptyString: (...values) => deps.pickFirstNonEmptyString(...values),
    normalizeHttpRequestConfig: (config, declaredInputKeys) => (
      deps.normalizeHttpRequestConfig(config, declaredInputKeys)
    ),
    optimizeHttpRequestConfig: (stepConfig, inputParams, userRequest) => (
      deps.optimizeHttpRequestConfig(stepConfig, inputParams, userRequest)
    ),
    previewHttpRequestConfig: (stepConfig, inputParams) => (
      deps.previewHttpRequestConfig(stepConfig, inputParams)
    ),
    generateStructuredTransformConfig: (sourceSample, userRequest, existingConfig) => (
      deps.generateStructuredTransformConfig(sourceSample, userRequest, existingConfig)
    ),
    generateAiStructuredTransformDraftConfig: (sourceSample, userRequest, existingConfig) => (
      deps.generateAiStructuredTransformDraftConfig(sourceSample, userRequest, existingConfig)
    ),
    normalizeStructuredTransformConfig: (config, placeholderKeys) => (
      deps.normalizeStructuredTransformConfig(config, placeholderKeys)
    ),
    collectTemplateVariables: (value, target) => deps.collectTemplateVariables(value, target),
    extractValueByPath,
    renderHttpTemplateValue: (value, params) => deps.renderHttpTemplateValue(value, params),
    buildPlaceholderValueFromSchemaHint,
    normalizeName: (value) => deps.normalizeName(value),
    normalizeDescription: (value) => deps.normalizeDescription(value),
    normalizeTaskQueue: (value) => deps.normalizeTaskQueue(value),
    normalizeWorkflowClassName: (candidate, workflowName) => (
      deps.normalizeWorkflowClassName(candidate, workflowName)
    ),
    normalizeWorkflowDsl: (workflowDsl, workflowName, taskQueue, activityDsl) => (
      deps.normalizeWorkflowDsl(workflowDsl, workflowName, taskQueue, activityDsl)
    ),
    normalizeDraftInputParams: (inputParams, steps, referenceUrl) => normalizeDraftInputParams({
      inputParams,
      steps,
      referenceUrl,
      pickFirstNonEmptyString: (...values) => deps.pickFirstNonEmptyString(...values),
      collectTemplateVariables: (value, target) => deps.collectTemplateVariables(value, target),
      normalizeWorkflowInputRenderPath,
      buildWorkflowSemanticHint: (...values) => deps.buildWorkflowSemanticHint(...values),
    }),
    normalizeDraftOutputParams: (outputParams) => normalizeDraftOutputParams(
      outputParams,
      (...values) => deps.pickFirstNonEmptyString(...values),
    ),
    normalizeAiDraftStepInput: (rawInput, activityRef, stepName, workflowIntentText, previousActivityRef) => (
      normalizeAiDraftStepInput({
        rawInput,
        activityRef,
        stepName,
        workflowIntentText,
        previousActivityRef,
        sanitizeJsonValue: <T>(value: T) => deps.sanitizeJsonValue(value),
        normalizeStructuredTransformConfig: (config, placeholderKeys) => (
          deps.normalizeStructuredTransformConfig(config, placeholderKeys)
        ),
        pickFirstNonEmptyString: (...values) => deps.pickFirstNonEmptyString(...values),
      })
    ),
  };
}

export function createTemporalWorkflowTemplateSupport(
  deps: TemplateSupportDependencies,
): TemporalWorkflowTemplateSupport {
  return {
    getBuiltinDocumentRenderActivity: () => deps.getBuiltinDocumentRenderActivity(),
    buildDefaultWorkflowInputPolicyParams: (inputParams) => (
      deps.buildDefaultWorkflowInputPolicyParams(inputParams)
    ),
    normalizeName: (value) => deps.normalizeName(value),
    normalizeDescription: (value) => deps.normalizeDescription(value),
    normalizeTaskQueue: (value) => deps.normalizeTaskQueue(value),
    normalizeWorkflowDsl: (workflowDsl, workflowName, taskQueue, activityDsl) => (
      deps.normalizeWorkflowDsl(workflowDsl, workflowName, taskQueue, activityDsl)
    ),
    pickFirstNonEmptyString: (...values) => deps.pickFirstNonEmptyString(...values),
    uniqueVariables: (variables) => deps.uniqueVariables(variables),
    buildWorkflowSemanticHint: (...values) => deps.buildWorkflowSemanticHint(...values),
  };
}

export function createTemporalWorkflowBrowserDraftSupport(
  deps: BrowserDraftSupportDependencies,
): TemporalWorkflowBrowserDraftSupport {
  return {
    normalizeName: (value) => deps.normalizeName(value),
    normalizeDescription: (value) => deps.normalizeDescription(value),
    pickFirstNonEmptyString: (...values) => deps.pickFirstNonEmptyString(...values),
    collectTemplateVariables: (value, target) => deps.collectTemplateVariables(value, target),
    buildWorkflowSemanticHint: (...values) => deps.buildWorkflowSemanticHint(...values),
  };
}

export function createTemporalWorkflowCodegenSupport(
  buildDeterministicWorkflowCode: (workflowDsl: WorkflowDsl, activityDsl: ActivityDsl) => string | null,
): TemporalWorkflowCodegenSupport {
  return {
    buildDeterministicWorkflowCode: (workflowDsl, activityDsl) => (
      buildDeterministicWorkflowCode(workflowDsl, activityDsl)
    ),
  };
}

export function createTemporalWorkflowSessionSupport(
  generateAiWorkflowDraft: TemporalWorkflowSessionSupport['generateAiWorkflowDraft'],
  refineAiWorkflowDraft: TemporalWorkflowSessionSupport['refineAiWorkflowDraft'],
): TemporalWorkflowSessionSupport {
  return {
    generateAiWorkflowDraft: (data) => generateAiWorkflowDraft(data),
    refineAiWorkflowDraft: (data) => refineAiWorkflowDraft(data),
  };
}

export function createTemporalWorkflowActivityResolutionSupport(
  buildDeterministicActivityCode: TemporalWorkflowActivityResolutionSupport['buildDeterministicActivityCode'],
): TemporalWorkflowActivityResolutionSupport {
  return {
    buildDeterministicActivityCode: (activityDef) => buildDeterministicActivityCode(activityDef),
  };
}
