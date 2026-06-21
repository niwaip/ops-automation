import { TemporalWorkflow } from '@prisma/client';

export interface WorkflowSignalHandler {
  name: string;
  description?: string;
}

export interface WorkflowQueryHandler {
  name: string;
  description?: string;
}

export interface WorkflowResultExecution {
  status?: 'success' | 'partial_success' | 'failed' | 'cancelled';
  executionId?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
}

export interface WorkflowResultTrigger {
  type?: 'manual' | 'schedule' | 'api' | 'resume';
  scheduleId?: string;
  scheduledAt?: string;
  windowStart?: string;
  windowEnd?: string;
}

export interface WorkflowResultArtifact {
  type?: string;
  name?: string;
  label?: string;
  downloadUrl?: string;
  url?: string;
  path?: string;
  mimeType?: string;
}

export type WorkflowResultTextFormat = 'plain_text' | 'markdown';

export interface WorkflowResultPresentation {
  preferAiSummary?: boolean;
  preferStructuredView?: boolean;
  chatSummary?: string;
  notificationSummary?: string;
  summaryFormat?: WorkflowResultTextFormat;
  detailText?: string;
  detailFormat?: WorkflowResultTextFormat;
}

export interface WorkflowResultBusinessSection {
  resultType?: string;
  title?: string;
  summary?: string;
  businessData?: unknown;
  metrics?: Record<string, unknown>;
  nextActions?: Array<{
    type?: string;
    label?: string;
    value?: string;
  }>;
}

export interface WorkflowResultEnvelope {
  execution?: WorkflowResultExecution;
  trigger?: WorkflowResultTrigger;
  result?: WorkflowResultBusinessSection;
  artifacts?: WorkflowResultArtifact[];
  presentation?: WorkflowResultPresentation;
  delivery?: Record<string, unknown>;
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: 'activity' | 'signal' | 'query' | 'childWorkflow' | 'parallel';
  activityRef?: string;
  activityName?: string;
  input?: Record<string, any>;
  startToCloseTimeout?: string;
  scheduleToCloseTimeout?: string;
  heartbeatTimeout?: string;
  retryPolicy?: { maxRetries?: number; backoffMs?: number };
  parallelSteps?: string[];
}

export type WorkflowInputParamSource =
  | 'declared'
  | 'inferred_from_template'
  | 'inferred_from_reference_url'
  | 'merged';

export type WorkflowInputParamType = 'string' | 'number' | 'boolean' | 'date';

export type WorkflowLocalizedValueMap = Record<string, string | number | boolean>;

export interface WorkflowInputParamDefinition {
  description?: string;
  required?: boolean;
  defaultValue?: string;
  localizedDefaultValue?: WorkflowLocalizedValueMap;
  localizedVariants?: string[];
  source?: WorkflowInputParamSource;
  type?: WorkflowInputParamType;
  exampleValue?: string | number | boolean;
  displayName?: string;
  groupLabel?: string;
  paramKind?: 'scalar' | 'array';
  arrayPath?: string;
  fieldName?: string;
  renderPath?: string | string[];
}

export type WorkflowParamRequiredMode = 'always' | 'conditional' | 'optional' | 'system_required';

export interface WorkflowParamPolicy {
  enabled?: boolean;
  requiredMode?: WorkflowParamRequiredMode;
  defaultValue?: unknown;
  defaultValueResolver?: string;
  valueSourcePriority?: string[];
  confirmationThreshold?: number;
  previewBlocking?: boolean;
  validationRules?: Array<Record<string, unknown>>;
  transformRule?: string;
  templateBinding?: string;
}

export interface WorkflowInputPolicy {
  params: Record<string, WorkflowParamPolicy>;
}

export interface WorkflowDsl {
  name: string;
  workflowClassName?: string;
  workflowDefnName?: string;
  taskQueue: string;
  steps: WorkflowStep[];
  sourceContext?: TemporalWorkflowSourceContext;
  inputParams?: Record<string, WorkflowInputParamDefinition>;
  inputPolicy?: WorkflowInputPolicy;
  outputParams?: Record<string, { description?: string; sourceStep?: string }>;
  extraPrompt?: string;
  workflowExecutionTimeout?: string;
  workflowRunTimeout?: string;
  workflowTaskTimeout?: string;
  defaultActivityRetryPolicy?: {
    maxRetries?: number;
    initialIntervalMs?: number;
    backoffCoefficient?: number;
    maxIntervalMs?: number;
  };
  conditionals?: Array<{
    step: string;
    condition: string;
    skip?: boolean;
  }>;
  signalHandlers?: WorkflowSignalHandler[];
  queryHandlers?: WorkflowQueryHandler[];
  errorHandling?: {
    type: 'saga' | 'simple';
    compensations?: Array<{
      step: string;
      activityName: string;
    }>;
  };
}

export interface ActivityDsl {
  activities: Array<{
    id?: string;
    activityRef?: string;
    name: string;
    fn: string;
    timeout: string;
    retryPolicy?: { maxRetries?: number; backoffMs?: number };
    handler: 'api' | 'carbone' | 'browser' | 'script';
    config: Record<string, any>;
    generatedCode?: string;
  }>;
}

export type ActivityDefinition = ActivityDsl['activities'][number];

export type BrowserWorkflowActivityStep = {
  name: string;
  type: 'browser';
  timeout: string;
  config: Record<string, unknown>;
  inputParams: Record<string, unknown>;
};

export type BrowserWorkflowActivityPhaseGroup = {
  phaseType: 'open' | 'transition' | 'process';
  steps: BrowserWorkflowActivityStep[];
};

export type BrowserWorkflowActivityPhase = {
  name: string;
  phaseType: 'open' | 'transition' | 'process';
  timeout: string;
  initializeSession: boolean;
  cleanupSession: boolean;
  steps: BrowserWorkflowActivityStep[];
};

export interface CreateTemporalWorkflowDTO {
  name: string;
  description?: string;
  taskQueue?: string;
  workflowDsl: WorkflowDsl;
  activityDsl: ActivityDsl;
  generatedCode?: string;
}

export type TemporalWorkflowValidationStatus = 'draft' | 'generated' | 'validated' | 'failed';

export interface TemporalWorkflowArtifactRef {
  workflowId: string;
  artifactVersion?: number | null;
  artifactHash?: string | null;
}

export interface TemporalWorkflowSourceTemplate {
  templateId?: string;
  skillId?: string;
  fileName?: string;
  format?: string;
  variableCount?: number;
  templateAssetVersion?: string;
  renderPlanVersion?: number;
}

export interface BrowserLoopStopWhenDraftLike {
  conditionFn?: string;
  condition_fn?: string;
  description?: string;
}

export interface BrowserLoopDraftLike {
  mode?: string;
  maxIterations?: number;
  onNoProgress?: 'takeover' | 'stop' | string;
  eachIteration?: {
    stepIds?: string[];
    stepCount?: number;
  };
  stopWhen?: BrowserLoopStopWhenDraftLike;
  target?: Record<string, unknown>;
  sampleRow?: Record<string, unknown>;
  updatedAt?: string;
}

export interface TemporalWorkflowSourceContext {
  sourceType?: 'template' | 'browser_template' | 'ai' | 'text' | 'url';
  referenceUrl?: string;
  userDescription?: string;
  generatedAt?: string;
  warnings?: string[];
  browserLoopDraft?: BrowserLoopDraftLike;
  sourceTemplate?: TemporalWorkflowSourceTemplate | null;
  templateAssetSummary?: {
    assetVersion: string;
    renderPlanVersion: number;
    fieldCount: number;
    source: string;
  };
}

export interface TemporalWorkflowDTO extends TemporalWorkflow {
  sourceTemplate?: TemporalWorkflowSourceTemplate | null;
  sourceContext?: TemporalWorkflowSourceContext | null;
}

export interface TemporalWorkflowArtifactDTO extends TemporalWorkflowArtifactRef {
  workflowName: string;
  taskQueue: string;
  generatedCode?: string | null;
  validationStatus: TemporalWorkflowValidationStatus | string;
  validationScore: number;
  validatedAt?: Date | string | null;
  validationResult?: Record<string, unknown> | null;
}

export interface UpdateTemporalWorkflowDTO {
  name?: string;
  description?: string;
  taskQueue?: string;
  workflowDsl?: WorkflowDsl;
  activityDsl?: ActivityDsl;
  isActive?: boolean;
  generatedCode?: string;
}

export interface TemporalValidationResult {
  isValid: boolean;
  score: number;
  errors: string[];
  warnings: string[];
}

export interface TemplateWorkflowDraft {
  name: string;
  description: string;
  taskQueue: string;
  workflowDsl: WorkflowDsl;
  activityDsl: ActivityDsl;
  sourceTemplate: {
    templateId: string;
    skillId?: string;
    fileName?: string;
    format?: string;
    variableCount: number;
    templateAssetVersion?: string;
    renderPlanVersion?: number;
  };
}

export interface GenerateTemplateWorkflowDraftDTO {
  templateId: string;
}

export interface CompileTemplateWorkflowDraftDTO {
  templateId: string;
  name?: string;
  description?: string;
  taskQueue?: string;
  inputPolicy?: WorkflowInputPolicy;
}

export interface BrowserWorkflowDraft {
  name: string;
  description: string;
  taskQueue: string;
  workflowDsl: WorkflowDsl;
  activityDsl: ActivityDsl;
  browserTemplate: {
    commandCount: number;
    placeholderCount: number;
    placeholders: string[];
  };
}

export interface GenerateAiWorkflowDraftDTO {
  description?: string;
  referenceUrl?: string;
}

export interface GenerateAiWorkflowDraftSessionDTO extends GenerateAiWorkflowDraftDTO {
  title?: string;
}

export interface RefineAiWorkflowDraftDTO {
  currentWorkflowDsl: WorkflowDsl;
  currentActivityDsl: ActivityDsl;
  userPrompt: string;
}

export interface RefineAiWorkflowDraftSessionDTO {
  sessionId: string;
  userPrompt: string;
}

export interface AiWorkflowDraft {
  name: string;
  description: string;
  taskQueue: string;
  workflowDsl: WorkflowDsl;
  activityDsl: ActivityDsl;
  warnings: string[];
  sourceContext?: TemporalWorkflowSourceContext;
}

export interface AiWorkflowDraftSessionMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  draft?: AiWorkflowDraft;
}

export interface AiWorkflowDraftSession {
  sessionId: string;
  title?: string;
  status: string;
  messages: AiWorkflowDraftSessionMessage[];
  currentDraft?: AiWorkflowDraft | null;
}

export interface AiWorkflowDraftSessionListItem {
  sessionId: string;
  title?: string;
  status: string;
  updatedAt: string;
  messageCount: number;
  currentDraftName?: string;
  currentDraftDescription?: string;
}

export interface CarboneTemplateMeta {
  id: string;
  fileName: string;
  format?: string;
  variables?: string[];
  skillId?: string;
  loops?: Array<{ arrayPath: string }>;
  suggestions?: Array<{
    suggestedName?: string;
    originalText?: string;
    elementPath?: string;
    details?: {
      description?: string;
      significance?: string;
      chapter?: string;
      displayPosition?: string;
    };
  }>;
  templateAssetManifest?: {
    assetVersion: string;
    fieldCount: number;
    languageProfile?: {
      sourceLanguage?: string;
      targetLanguages?: string[];
    };
    templateFieldSpecs?: Array<{
      fieldId: string;
      description?: string;
      required?: boolean;
      type?: string;
    }>;
    renderPlan?: {
      version?: number;
      bindings?: Array<{
        fieldId: string;
        variablePath: string;
        required?: boolean;
      }>;
    };
    renderPlanVersion?: number;
    metadata?: {
      source?: string;
    };
  };
}

export interface CarboneSkillMeta {
  id: string;
  templateId?: string;
  parameters?: Array<Record<string, any>>;
  parsingGuide?: string;
  dataParsing?: Record<string, any>;
  validation?: Record<string, any>;
  aiInstructions?: string;
  skillGuideMarkdown?: string;
  dataExampleJson?: unknown;
}

export interface TemplateWorkflowAiAnalysis {
  documentType?: string;
  workflowName?: string;
  workflowDescription?: string;
  activityDescription?: string;
  outputName?: string;
  outputDescription?: string;
  inputParamDescriptions?: Record<string, string>;
  extraPrompt?: string;
}

export interface BrowserDraftCommandInput {
  tool: string;
  params?: Record<string, unknown>;
  description?: string;
  locator?: {
    strategy?: string;
    value?: string;
    role?: string;
    name?: string;
  };
}

export interface BrowserTemplateStepInput {
  step_id?: string;
  action?: string;
  params?: Record<string, unknown>;
  output_var?: string;
  outputVar?: string;
  description?: string;
  branch?: {
    condition_fn?: string;
    on_match?: 'continue' | 'stop';
    on_mismatch?: 'continue' | 'stop' | 'takeover';
    takeover_reason?: string;
    description?: string;
  };
  locator?: {
    type?: string;
    value?: string;
  };
  wait?: {
    type?: string;
    value?: string;
    timeout?: number;
  };
  retry?: {
    max_attempts?: number;
    delay_ms?: number;
  };
  on_fail?: string;
}

export interface BrowserTemplateParamsSchema {
  type?: string;
  properties?: Record<
    string,
    {
      type?: string;
      description?: string;
      default?: unknown;
      required?: boolean;
    }
  >;
  required?: string[];
}

export interface GenerateBrowserWorkflowDraftDTO {
  script?: string;
  commands?: BrowserDraftCommandInput[];
  templateId?: string;
  templateSteps?: BrowserTemplateStepInput[];
  loopDraft?: BrowserLoopDraftLike;
  paramsSchema?: BrowserTemplateParamsSchema;
  name?: string;
  description?: string;
  inputParams?: Record<string, WorkflowInputParamDefinition>;
}

export interface BrowserScriptCommand {
  action: 'goto' | 'click' | 'fill' | 'press' | 'waitForSelector' | 'waitForTimeout';
  url?: string;
  selector?: string;
  target?: string;
  value?: string;
  timeoutMs?: number;
  locator?: {
    type: string;
    value: string;
  };
}

export const DEFAULT_TEMPLATE_WORKFLOW_DSL: Partial<WorkflowDsl> = {
  taskQueue: 'SKILL_TASK_QUEUE',
  conditionals: [],
};
