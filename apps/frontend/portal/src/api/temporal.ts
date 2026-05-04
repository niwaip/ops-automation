import apiClient, { ensureFreshAccessToken } from './client';
import { useAuthStore } from '../store/authStore';
import { postSseStream } from './streaming';

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
    initialIntervalMs?: number;  // First retry interval in ms
    backoffCoefficient?: number;  // Exponential backoff multiplier (default 2.0)
    maxIntervalMs?: number;      // Cap between retries
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

export interface WorkflowInputParamDefinition {
  description?: string;
  required?: boolean;
  defaultValue?: string;
  source?: WorkflowInputParamSource;
  type?: WorkflowInputParamType;
  exampleValue?: string | number | boolean;
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
}

export interface TemporalWorkflowSourceContext {
  sourceType?: 'template' | 'ai' | 'text' | 'url';
  referenceUrl?: string;
  userDescription?: string;
  generatedAt?: string;
  warnings?: string[];
  sourceTemplate?: TemporalWorkflowSourceTemplate | null;
}

export interface TemporalWorkflowDTO {
  id: string;
  name: string;
  description: string | null;
  taskQueue: string;
  workflowDsl: WorkflowDsl;
  activityDsl: ActivityDsl;
  generatedCode?: string | null;
  isActive: boolean;
  deployedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sourceTemplate?: TemporalWorkflowSourceTemplate | null;
  sourceContext?: TemporalWorkflowSourceContext | null;
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

  validate: async (workflowDsl: WorkflowDsl, activityDsl: ActivityDsl): Promise<TemporalValidationResult> => {
    return apiClient.post<TemporalValidationResult>('/temporal/validate', { workflowDsl, activityDsl });
  },

  generateWorkflowCode: async (workflowDsl: WorkflowDsl, activityDsl: ActivityDsl, errorContext?: string): Promise<WorkflowCodeResult> => {
    return apiClient.post<WorkflowCodeResult>('/temporal/generate-code', { workflowDsl, activityDsl, errorContext });
  },

  generateWorkflowCodeStream: async (
    workflowDsl: WorkflowDsl,
    activityDsl: ActivityDsl,
    errorContext: string | undefined,
    forceAiGeneration: boolean | undefined,
    onEvent: (event: WorkflowCodeStreamEvent) => void,
  ): Promise<void> => {
    const token = await ensureFreshAccessToken() || useAuthStore.getState().accessToken;
    return postSseStream({
      url: '/api/temporal/generate-code/stream',
      payload: { workflowDsl, activityDsl, errorContext, forceAiGeneration },
      token,
      requireDoneEvent: true,
      onEvent: onEvent as (event: { type: string; [key: string]: unknown }) => void,
    });
  },

  validateWorkflowReal: async (code: string, fn: string, input?: Record<string, any>, taskQueue?: string): Promise<WorkflowRealValidationResult> => {
    return apiClient.post<WorkflowRealValidationResult>('/temporal/validate-code', { code, fn, input, taskQueue });
  },

  // SSE streaming real validation with the workflow test worker
  validateWorkflowRealStream: async (code: string, fn: string, input: Record<string, any>, taskQueue: string | undefined, onEvent: (event: { type: string; content?: string; result?: any; error?: string; success?: boolean; score?: number }) => void): Promise<void> => {
    const token = await ensureFreshAccessToken() || useAuthStore.getState().accessToken;
    return postSseStream({
      url: '/api/temporal/validate-code/stream',
      payload: { code, fn, input, taskQueue },
      token,
      requireDoneEvent: true,
      onEvent: onEvent as (event: { type: string; [key: string]: unknown }) => void,
    });
  },

  generateTemplateDraft: async (templateId: string): Promise<TemplateWorkflowDraft> => {
    return apiClient.post<TemplateWorkflowDraft>('/temporal/generate-template-draft', { templateId });
  },

  generateAiDraft: async (data: GenerateAiWorkflowDraftDTO): Promise<AiWorkflowDraft> => {
    return apiClient.post<AiWorkflowDraft>('/temporal/generate-ai-draft', data);
  },

  createAiDraftSession: async (data: GenerateAiWorkflowDraftSessionDTO): Promise<AiWorkflowDraftSession> => {
    return apiClient.post<AiWorkflowDraftSession>('/temporal/draft-sessions', data);
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
    return apiClient.post<AiWorkflowDraft>('/temporal/refine-ai-draft', data);
  },

  refineAiDraftSession: async (sessionId: string, userPrompt: string): Promise<AiWorkflowDraftSession> => {
    return apiClient.post<AiWorkflowDraftSession>(`/temporal/draft-sessions/${sessionId}/messages`, { userPrompt });
  },

  optimizeHttpRequestConfig: async (
    stepConfig: Record<string, any>,
    inputParams: Record<string, any>,
    userRequest: string,
  ): Promise<HttpRequestOptimizeResult> => {
    return apiClient.post<HttpRequestOptimizeResult>('/temporal/optimize-http-config', {
      stepConfig,
      inputParams,
      userRequest,
    });
  },

  previewHttpRequestConfig: async (
    stepConfig: Record<string, any>,
    inputParams: Record<string, any>,
  ): Promise<HttpRequestPreviewResult> => {
    return apiClient.post<HttpRequestPreviewResult>('/temporal/preview-http-config', {
      stepConfig,
      inputParams,
    });
  },

  generateStructuredTransformConfig: async (
    sourceSample: any,
    userRequest: string,
    existingConfig?: Record<string, any>,
  ): Promise<{ success: boolean; config?: Record<string, any>; explanation?: string; error?: string }> => {
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
