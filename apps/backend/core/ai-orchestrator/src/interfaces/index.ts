// DTOs and Interfaces for AI Orchestrator Service

/**
 * 多模态内容块 - 支持文本和图片
 */
export interface ContentBlock {
  type: 'text' | 'image_url';
  text?: string;
  cache_control?: {
    type: 'ephemeral';
    ttl?: '5m' | '1h';
  };
  image_url?: {
    url: string;  // 可以是URL或base64 data URI
    detail?: 'low' | 'high' | 'auto';
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentBlock[];  // 支持纯文本或多模态内容
}

export interface OpenAICompatibleConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  useJsonMode?: boolean;
  provider?: string;
  promptCacheKey?: string;
  promptCacheRetention?: 'in_memory' | '24h' | '5m' | '1h';
  anthropicVersion?: string;
}

/**
 * LLM Token Usage
 */
export interface LLMUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
  };
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/**
 * LLM Rate Limit Info (from response headers)
 */
export interface LLMRateLimit {
  requests_limit?: number;
  requests_remaining?: number;
  requests_reset?: string;
  tokens_limit?: number;
  tokens_remaining?: number;
  tokens_reset?: string;
}

/**
 * LLM Structured Response
 */
export interface LLMResponse {
  content: string;
  usage?: LLMUsage;
  rateLimit?: LLMRateLimit;
}

/**
 * Model Pricing Configuration
 */
export interface ModelPricing {
  input_price_per_1k: number;  // Price per 1,000 input tokens
  output_price_per_1k: number; // Price per 1,000 output tokens
  currency: string;            // e.g., 'CNY', 'USD'
}

export type ModelCapabilityTier = 'standard' | 'advanced';

export interface ModelDefaultScopeConfig {
  global?: boolean;
  admin_chat?: boolean;
  admin_task?: boolean;
  audio_transcription?: boolean;
}

export interface ModelRoutingPreferenceConfig {
  prefer_for_code?: boolean;
}

export interface PromptCachingModelConfig {
  enabled?: boolean;
  mode?: 'none' | 'openai_auto' | 'anthropic_auto' | 'anthropic_explicit';
  retention?: 'in_memory' | '24h' | '5m' | '1h';
  min_tokens?: number;
}

export interface ModelInvocationConfig {
  transport?: 'openai_chat_completions' | 'anthropic_messages';
  prompt_caching?: PromptCachingModelConfig;
}

export interface AIModelConfig {
  display_name?: string;
  description?: string;
  default?: boolean;
  routing_tags?: string[];
  input?: string[];
  max_tokens?: number;
  temperature?: number;
  context_window?: number;
  preset?: boolean;
  env_key?: string;
  secret_type?: 'vault' | 'env' | 'k8s_secret';
  capability_tier?: ModelCapabilityTier;
  default_scope?: ModelDefaultScopeConfig;
  routing_preferences?: ModelRoutingPreferenceConfig;
  invocation?: ModelInvocationConfig;
  [key: string]: unknown;
}

export interface AIModelDTO {
  id: string;
  name: string;
  provider: string;
  api_endpoint: string;
  providerConfigId?: string;
  config: AIModelConfig;
  pricing?: ModelPricing;
  status: 'active' | 'inactive';
  hasApiKey?: boolean; // Indicates if API key is configured (without exposing the actual key)
  created_at: Date;
  updated_at: Date;
}

export interface AIProviderSummaryDTO {
  id: string;
  provider: string;
  api_endpoint: string;
  modelCount: number;
  activeModelCount: number;
  hasCredential: boolean;
  advancedModelCount: number;
  defaultScopes: Array<'global' | 'admin_chat' | 'admin_task' | 'audio_transcription'>;
}

export interface AIProviderConfigDTO {
  id: string;
  provider: string;
  api_endpoint: string;
  hasCredential?: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface AIProviderModelListDTO {
  providerConfigId: string;
  models: string[];
}

export interface CreateProviderConfigDTO {
  provider: string;
  api_endpoint: string;
  api_key?: string;
  env_key?: string;
  secret_type?: 'vault' | 'env' | 'k8s_secret';
}

export interface UpdateProviderConfigDTO {
  provider?: string;
  api_endpoint?: string;
  api_key?: string;
  env_key?: string;
  secret_type?: 'vault' | 'env' | 'k8s_secret';
}

export interface CreateModelDTO {
  name: string;
  provider: string;
  api_endpoint: string;
  providerConfigId?: string;
  api_key?: string; // Optional API key for direct input
  config?: AIModelConfig;
}

export interface AIAgentDTO {
  id: string;
  model_id: string;
  session_id?: string;
  status: 'idle' | 'active' | 'error';
  created_at: Date;
}

export interface CreateAgentDTO {
  model_id: string;
  session_id?: string;
}

export interface RecognizeParamsDTO {
  template_id: string;
  user_input: string;
  modelId?: string;
  context?: Record<string, unknown>;
  guide_context?: DocumentGuideContext;
  // 允许直接传入 params_schema，避免需要预先注册模版
  params_schema?: {
    properties: Record<string, {
      type: string;
      description?: string;
      extractionPrompt?: string;
      default?: string | number | boolean;
      semanticRole?: string;
      extractionHints?: string[];
      displayName?: string;
      groupLabel?: string;
      previewBlocking?: boolean;
      confirmationThreshold?: number;
    }>;
    required?: string[];
  };
}

export interface DocumentGuideContext {
  mode: 'document_skill';
  templateOverview?: string;
  guideMarkdown?: string;
  paramCollectionGuidance?: string;
  validationRules?: string;
  outputExample?: Record<string, unknown>;
  extractionHints?: string[];
  sourceTemplate?: {
    templateId?: string;
    skillId?: string;
    fileName?: string;
    format?: string;
    variableCount?: number;
  };
}

export interface PromptDebugLLMCall {
  stage: string;
  label: string;
  modelId?: string;
  requestMessages?: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  responseText?: string;
  note?: string;
}

export interface RecognizeParamsResponseDTO {
  params: Record<string, unknown>;
  confidence: number;
  field_confidences?: Record<string, number>;
  uncertain_fields?: string[];
  usage?: LLMUsage;
  debug?: {
    llmCalls?: PromptDebugLLMCall[];
    notes?: string[];
  };
}

export interface DecideFailureDTO {
  session_id: string;
  step_id: string;
  error_type: string;
  error_message: string;
}

export interface DecideFailureResponseDTO {
  decision: 'takeover' | 'retry' | 'skip';
  reason: string;
}

export interface BrowserPhaseRecoveryPatchDTO {
  type: 'replace_selector' | 'append_wait';
  failed_step_id: string;
  selector?: string;
  duration_ms?: number;
  note?: string;
}

export interface PlanBrowserPhaseRecoveryDTO {
  execution_id: string;
  phase_key: string;
  phase_name?: string;
  phase_type?: string;
  attempt: number;
  modelId?: string;
  commands: Array<{
    step_id: string;
    action: string;
    capability_type?: string;
    input?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }>;
  result: {
    failed_step_id?: string;
    failed_action?: string;
    error_code?: string;
    error_message?: string;
    retryable?: boolean;
    takeover_reason?: string;
  };
}

export interface PlanBrowserPhaseRecoveryResponseDTO {
  action: 'retry_with_patch' | 'takeover_required' | 'abort';
  reason: string;
  patch?: BrowserPhaseRecoveryPatchDTO | null;
}

export interface APIKeyReference {
  reference_id: string;
  secret_type: 'vault' | 'env' | 'k8s_secret';
}

export interface ExecuteActivityDTO {
  code: string;
  fn: string;
  taskQueue: string;
  input?: Record<string, any>;
}

export interface ExecuteActivityResponseDTO {
  success: boolean;
  result?: any;
  logs?: string[];
  error?: string;
}

export interface GeneratePlanDTO {
  user_input: string;
  user_id?: string;
  session_id?: string;
  modelId?: string;
  context?: Record<string, unknown>;
}

export interface PlanSkillMatchDTO {
  skill_id: string;
  skill_name: string;
  confidence: number;
  match_reason?: string;
}

export interface PlanStepBrowserPhaseCommandDTO {
  step_id: string;
  capability_type?: string;
  action: string;
  input?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface PlanStepBrowserPhaseRecoveryPolicyDTO {
  max_auto_retries?: number;
  allow_ai_recovery?: boolean;
  allow_human_takeover?: boolean;
  model_id?: string;
}

export interface PlanStepDTO {
  id: string;
  title: string;
  description: string;
  kind: 'skill' | 'tool' | 'human_input' | 'execution';
  tool_name?: string;
  status: 'planned';
  phase_key?: string;
  phase_name?: string;
  phase_type?: string;
  commands?: PlanStepBrowserPhaseCommandDTO[];
  precheck?: Record<string, unknown>;
  postcheck?: Record<string, unknown>;
  recovery_policy?: PlanStepBrowserPhaseRecoveryPolicyDTO;
}

export interface RequiredInputDTO {
  name: string;
  type: string;
  description?: string;
  display_name?: string;
  group_label?: string;
  required: boolean;
  value?: unknown;
  missing: boolean;
  source: 'user_input' | 'default' | 'unresolved';
  confidence?: number;
  needs_confirmation?: boolean;
  missing_reason?: 'missing' | 'low_confidence' | 'overall_low_confidence' | 'partial_group';
  confirmation_threshold?: number;
  preview_blocking?: boolean;
}

export interface RiskSummaryDTO {
  level: 'low' | 'medium' | 'high';
  requires_human_review: boolean;
  items: string[];
}

export interface SemanticGroupedMissingDTO {
  key: string;
  label: string;
  kind: 'field' | 'array_group';
  blocking: boolean;
  required: boolean;
  fieldNames: string[];
  missingFieldNames: string[];
  description?: string;
}

export interface PlanSemanticComplexityDTO {
  category: 'simple' | 'complex_document';
  totalFields: number;
  requiredFields: number;
  missingFields: number;
  arrayGroups: number;
  reasonCodes: string[];
}

export interface PlanSemanticDTO {
  enabled: boolean;
  mode: 'field_level' | 'complex_document';
  previewReady: boolean;
  finalReady: boolean;
  fallbackToFieldLevel: boolean;
  summary?: string;
  groupedMissing: SemanticGroupedMissingDTO[];
  complexity: PlanSemanticComplexityDTO;
}

export interface PlanDraftDTO {
  plan_id: string;
  planner_mode: 'skill' | 'fallback';
  objective: string;
  summary: string;
  skill_match?: PlanSkillMatchDTO;
  steps: PlanStepDTO[];
  required_inputs: RequiredInputDTO[];
  semantic?: PlanSemanticDTO;
  usage?: LLMUsage;
  risk_summary: RiskSummaryDTO;
  metadata?: Record<string, unknown>;
}
