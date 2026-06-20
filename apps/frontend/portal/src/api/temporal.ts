import apiClient, { ensureFreshAccessToken } from './client';
import { useAuthStore } from '@/shared/store/authStore';
import { postSseStream } from './streaming';
import type { TemplateParamsSchema, TemplateStep } from './template';

const AI_DRAFT_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

export interface WorkflowSignalHandler {
  name: string;
  description?: string;
}

export interface WorkflowQueryHandler {
  name: string;
  description?: string;
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: 'activity' | 'signal' | 'query' | 'childWorkflow' | 'parallel';
  activityRef?: string;
  activityName?: string;
  input?: Record<string, any>;
  // Activity execution timeout (e.g., "30s", "1m")
  startToCloseTimeout?: string;
  // Total timeout from schedule to completion, including retries
  scheduleToCloseTimeout?: string;
  // Maximum interval between activity heartbeats
  heartbeatTimeout?: string;
  // Retry policy for the activity
  retryPolicy?: {
    maxRetries?: number;
    initialIntervalMs?: number; // First retry interval in ms
    backoffCoefficient?: number; // Exponential backoff multiplier (default 2.0)
    maxIntervalMs?: number; // Cap between retries
    nonRetryableErrorTypes?: string[]; // Errors that won't be retried
  };
  // For parallel execution
  parallelSteps?: string[];
}

export type WorkflowInputParamSource =
  | 'declared'
  | 'inferred_from_template'
  | 'inferred_from_reference_url'
  | 'merged';

export type WorkflowInputParamType = 'string' | 'number' | 'boolean' | 'date';
export type WorkflowLocalizedValueMap = Record<string, string | number | boolean>;
export type WorkflowParamRequiredMode = 'always' | 'conditional' | 'optional' | 'system_required';
export type WorkflowPolicyDefaultValue = string | number | boolean | WorkflowLocalizedValueMap;

export interface WorkflowParamPolicy {
  enabled?: boolean;
  requiredMode?: WorkflowParamRequiredMode;
  defaultValue?: WorkflowPolicyDefaultValue;
  defaultValueResolver?: string;
  valueSourcePriority?: string[];
  confirmationThreshold?: number;
  previewBlocking?: boolean;
  validationRules?: Record<string, unknown>[];
  transformRule?: string;
  templateBinding?: string;
}

export interface WorkflowInputPolicy {
  params?: Record<string, WorkflowParamPolicy>;
}

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

export interface WorkflowDsl {
  name: string;
  // Python class name used for workflow entrypoint lookup during validation/execution
  workflowClassName?: string;
  // Display name used in @workflow.defn(name="...")
  workflowDefnName?: string;
  taskQueue: string;
  steps: WorkflowStep[];
  sourceContext?: TemporalWorkflowSourceContext;
  // Entry parameters - aggregate template variables and explicit inputs from workflow steps
  inputParams?: Record<string, WorkflowInputParamDefinition>;
  // Workflow-level parameter policy derived from or overriding inputParams
  inputPolicy?: WorkflowInputPolicy;
  // Output parameters - defaults to last step's output, can be customized
  outputParams?: Record<string, { description?: string; sourceStep?: string }>;
  // Extra guidance for AI code generation
  extraPrompt?: string;
  // Workflow-level execution timeout
  workflowExecutionTimeout?: string;
  // Single workflow run timeout
  workflowRunTimeout?: string;
  // Timeout for workflow task processing
  workflowTaskTimeout?: string;
  // Default retry policy for all activities
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

export interface TemporalWorkflowSourceTemplate {
  templateId?: string;
  skillId?: string;
  fileName?: string;
  format?: string;
  variableCount?: number;
  templateAssetVersion?: string; // 新增：资产版本
  renderPlanVersion?: number; // 新增：渲染计划版本
}

export interface TemporalWorkflowSourceContext {
  sourceType?: 'template' | 'browser_template' | 'ai' | 'text' | 'url';
  referenceUrl?: string;
  userDescription?: string;
  generatedAt?: string;
  warnings?: string[];
  sourceTemplate?: TemporalWorkflowSourceTemplate | null;
  templateAssetSummary?: {
    // 新增：资产摘要
    assetVersion: string;
    renderPlanVersion: number;
    fieldCount: number;
    source: string;
  };
}

export interface TemporalWorkflowDTO {
  id: string;
  name: string;
  description: string | null;
  taskQueue: string;
  workflowDsl: WorkflowDsl;
  activityDsl: ActivityDsl;
  generatedCode?: string | null;
  artifactVersion?: number;
  artifactHash?: string | null;
  validationStatus?: 'draft' | 'generated' | 'validated' | 'failed' | string;
  validationScore?: number;
  validatedAt?: string | null;
  isActive: boolean;
  deployedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sourceTemplate?: TemporalWorkflowSourceTemplate | null;
  sourceContext?: TemporalWorkflowSourceContext | null;
}

export interface TemporalWorkflowArtifactDTO {
  workflowId: string;
  workflowName: string;
  taskQueue: string;
  artifactVersion?: number | null;
  artifactHash?: string | null;
  generatedCode?: string | null;
  validationStatus: 'draft' | 'generated' | 'validated' | 'failed' | string;
  validationScore: number;
  validatedAt?: string | null;
  validationResult?: Record<string, unknown> | null;
}

export interface CreateTemporalWorkflowDTO {
  name: string;
  description?: string;
  taskQueue?: string;
  workflowDsl: WorkflowDsl;
  activityDsl: ActivityDsl;
  generatedCode?: string;
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

export interface WorkflowCodeResult {
  success: boolean;
  code?: string;
  error?: string;
  attempts?: number;
  autoRetried?: boolean;
  generationMode?: 'deterministic' | 'ai';
}

export interface WorkflowCodeStreamEvent {
  type: string;
  content?: string;
  success?: boolean;
  code?: string;
  error?: string;
  attempts?: number;
  autoRetried?: boolean;
  generationMode?: 'deterministic' | 'ai';
}

export interface WorkflowRealValidationResult {
  success: boolean;
  logs: string[];
  result?: any;
  error?: string;
  traceback?: string;
  score: number;
}

export interface GenerateAndSaveWorkflowCodeResult {
  workflow: TemporalWorkflowDTO;
  generation: WorkflowCodeResult;
}

export interface ValidateSavedArtifactResult {
  workflow: TemporalWorkflowDTO;
  validation: WorkflowRealValidationResult;
}

export interface HttpRequestOptimizeResult {
  success: boolean;
  optimizedConfig?: Record<string, any>;
  previewResponse?: Record<string, any>;
  explanation?: string;
  error?: string;
}

export interface HttpRequestPreviewResult {
  success: boolean;
  baseConfig?: Record<string, any>;
  resolvedRequest?: Record<string, any>;
  previewResponse?: Record<string, any>;
  error?: string;
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
    templateAssetVersion?: string; // 新增
    renderPlanVersion?: number; // 新增
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

export interface GenerateBrowserDraftDTO {
  script?: string;
  commands?: BrowserDraftCommandInput[];
  templateId?: string;
  templateSteps?: TemplateStep[];
  paramsSchema?: TemplateParamsSchema;
  name?: string;
  description?: string;
  inputParams?: Record<string, WorkflowInputParamDefinition>;
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

export interface AiWorkflowDraft {
  name: string;
  description: string;
  taskQueue: string;
  workflowDsl: WorkflowDsl;
  activityDsl: ActivityDsl;
  warnings: string[];
  sourceContext?: TemporalWorkflowSourceContext;
}

export const temporalWorkflowApi = {
  list: async (): Promise<TemporalWorkflowDTO[]> => {
    return apiClient.get<TemporalWorkflowDTO[]>('/temporal');
  },

  getById: async (id: string): Promise<TemporalWorkflowDTO> => {
    return apiClient.get<TemporalWorkflowDTO>(`/temporal/${id}`);
  },

  create: async (data: CreateTemporalWorkflowDTO): Promise<TemporalWorkflowDTO> => {
    return apiClient.post<TemporalWorkflowDTO>('/temporal', data);
  },

  update: async (id: string, data: UpdateTemporalWorkflowDTO): Promise<TemporalWorkflowDTO> => {
    return apiClient.put<TemporalWorkflowDTO>(`/temporal/${id}`, data);
  },

  delete: async (id: string): Promise<{ success: boolean }> => {
    return apiClient.delete(`/temporal/${id}`);
  },

  deploy: async (id: string): Promise<TemporalWorkflowDTO> => {
    return apiClient.post<TemporalWorkflowDTO>(`/temporal/${id}/deploy`);
  },

  validate: async (
    workflowDsl: WorkflowDsl,
    activityDsl: ActivityDsl
  ): Promise<TemporalValidationResult> => {
    return apiClient.post<TemporalValidationResult>('/temporal/validate', {
      workflowDsl,
      activityDsl,
    });
  },

  generateWorkflowCode: async (
    workflowDsl: WorkflowDsl,
    activityDsl: ActivityDsl,
    errorContext?: string
  ): Promise<WorkflowCodeResult> => {
    return apiClient.post<WorkflowCodeResult>('/temporal/generate-code', {
      workflowDsl,
      activityDsl,
      errorContext,
    });
  },

  generateAndSave: async (
    id: string,
    data?: { errorContext?: string; forceAiGeneration?: boolean }
  ): Promise<GenerateAndSaveWorkflowCodeResult> => {
    return apiClient.post<GenerateAndSaveWorkflowCodeResult>(
      `/temporal/${id}/generate-and-save`,
      data
    );
  },

  getArtifact: async (id: string): Promise<TemporalWorkflowArtifactDTO> => {
    return apiClient.get<TemporalWorkflowArtifactDTO>(`/temporal/${id}/artifact`);
  },

  generateWorkflowCodeStream: async (
    workflowDsl: WorkflowDsl,
    activityDsl: ActivityDsl,
    errorContext: string | undefined,
    forceAiGeneration: boolean | undefined,
    onEvent: (event: WorkflowCodeStreamEvent) => void
  ): Promise<void> => {
    const token = (await ensureFreshAccessToken()) || useAuthStore.getState().accessToken;
    return postSseStream({
      url: '/api/temporal/generate-code/stream',
      payload: { workflowDsl, activityDsl, errorContext, forceAiGeneration },
      token,
      requireDoneEvent: true,
      onEvent: onEvent as (event: { type: string; [key: string]: unknown }) => void,
    });
  },

  validateWorkflowReal: async (
    code: string,
    fn: string,
    input?: Record<string, any>,
    taskQueue?: string,
    timeout?: string
  ): Promise<WorkflowRealValidationResult> => {
    return apiClient.post<WorkflowRealValidationResult>('/temporal/validate-code', {
      code,
      fn,
      input,
      taskQueue,
      timeout,
    });
  },

  validateSavedArtifact: async (
    id: string,
    data?: { input?: Record<string, any>; timeout?: string }
  ): Promise<ValidateSavedArtifactResult> => {
    return apiClient.post<ValidateSavedArtifactResult>(
      `/temporal/${id}/validate-saved-artifact`,
      data
    );
  },

  // SSE streaming real validation with the workflow test worker
  validateWorkflowRealStream: async (
    code: string,
    fn: string,
    input: Record<string, any>,
    taskQueue: string | undefined,
    onEvent: (event: {
      type: string;
      content?: string;
      result?: any;
      error?: string;
      success?: boolean;
      score?: number;
    }) => void,
    timeout?: string
  ): Promise<void> => {
    const token = (await ensureFreshAccessToken()) || useAuthStore.getState().accessToken;
    return postSseStream({
      url: '/api/temporal/validate-code/stream',
      payload: { code, fn, input, taskQueue, timeout },
      token,
      requireDoneEvent: true,
      onEvent: onEvent as (event: { type: string; [key: string]: unknown }) => void,
    });
  },

  generateTemplateDraft: async (templateId: string): Promise<TemplateWorkflowDraft> => {
    return apiClient.post<TemplateWorkflowDraft>('/temporal/generate-template-draft', {
      templateId,
    });
  },

  compileTemplateDraft: async (
    data: CompileTemplateWorkflowDraftDTO
  ): Promise<TemplateWorkflowDraft> => {
    return apiClient.post<TemplateWorkflowDraft>('/temporal/compile-template-draft', data);
  },

  generateBrowserDraft: async (data: GenerateBrowserDraftDTO): Promise<BrowserWorkflowDraft> => {
    return apiClient.post<BrowserWorkflowDraft>('/temporal/generate-browser-draft', data);
  },

  generateAiDraft: async (data: GenerateAiWorkflowDraftDTO): Promise<AiWorkflowDraft> => {
    return apiClient.post<AiWorkflowDraft>('/temporal/generate-ai-draft', data, {
      timeout: AI_DRAFT_REQUEST_TIMEOUT_MS,
    });
  },

  createAiDraftSession: async (
    data: GenerateAiWorkflowDraftSessionDTO
  ): Promise<AiWorkflowDraftSession> => {
    return apiClient.post<AiWorkflowDraftSession>('/temporal/draft-sessions', data, {
      timeout: AI_DRAFT_REQUEST_TIMEOUT_MS,
    });
  },

  listAiDraftSessions: async (): Promise<AiWorkflowDraftSessionListItem[]> => {
    return apiClient.get<AiWorkflowDraftSessionListItem[]>('/temporal/draft-sessions');
  },

  getAiDraftSession: async (sessionId: string): Promise<AiWorkflowDraftSession> => {
    return apiClient.get<AiWorkflowDraftSession>(`/temporal/draft-sessions/${sessionId}`);
  },

  deleteAiDraftSession: async (sessionId: string): Promise<{ success: boolean }> => {
    return apiClient.delete<{ success: boolean }>(`/temporal/draft-sessions/${sessionId}`);
  },

  refineAiWorkflowDraft: async (data: RefineAiWorkflowDraftDTO): Promise<AiWorkflowDraft> => {
    return apiClient.post<AiWorkflowDraft>('/temporal/refine-ai-draft', data, {
      timeout: AI_DRAFT_REQUEST_TIMEOUT_MS,
    });
  },

  refineAiDraftSession: async (
    sessionId: string,
    userPrompt: string
  ): Promise<AiWorkflowDraftSession> => {
    return apiClient.post<AiWorkflowDraftSession>(
      `/temporal/draft-sessions/${sessionId}/messages`,
      { userPrompt },
      {
        timeout: AI_DRAFT_REQUEST_TIMEOUT_MS,
      }
    );
  },

  optimizeHttpRequestConfig: async (
    stepConfig: Record<string, any>,
    inputParams: Record<string, any>,
    userRequest: string
  ): Promise<HttpRequestOptimizeResult> => {
    return apiClient.post<HttpRequestOptimizeResult>('/temporal/optimize-http-config', {
      stepConfig,
      inputParams,
      userRequest,
    });
  },

  previewHttpRequestConfig: async (
    stepConfig: Record<string, any>,
    inputParams: Record<string, any>
  ): Promise<HttpRequestPreviewResult> => {
    return apiClient.post<HttpRequestPreviewResult>('/temporal/preview-http-config', {
      stepConfig,
      inputParams,
    });
  },

  generateStructuredTransformConfig: async (
    sourceSample: any,
    userRequest: string,
    existingConfig?: Record<string, any>
  ): Promise<{
    success: boolean;
    config?: Record<string, any>;
    explanation?: string;
    error?: string;
  }> => {
    return apiClient.post('/temporal/generate-structured-transform-config', {
      sourceSample,
      userRequest,
      existingConfig,
    });
  },
};

export const DEFAULT_WORKFLOW_DSL: WorkflowDsl = {
  name: '',
  workflowClassName: '',
  workflowDefnName: '',
  taskQueue: 'SKILL_TASK_QUEUE',
  steps: [],
  conditionals: [],
};

export const DEFAULT_ACTIVITY_DSL: ActivityDsl = {
  activities: [],
};
