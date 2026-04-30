// DTOs and Interfaces for AI Orchestrator Service

/**
 * 多模态内容块 - 支持文本和图片
 */
export interface ContentBlock {
  type: 'text' | 'image_url';
  text?: string;
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
}

/**
 * LLM Token Usage
 */
export interface LLMUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
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

export interface AIModelDTO {
  id: string;
  name: string;
  provider: string;
  api_endpoint: string;
  config: Record<string, unknown>;
  pricing?: ModelPricing;
  status: 'active' | 'inactive';
  hasApiKey?: boolean; // Indicates if API key is configured (without exposing the actual key)
  created_at: Date;
  updated_at: Date;
}

export interface CreateModelDTO {
  name: string;
  provider: string;
  api_endpoint: string;
  api_key?: string; // Optional API key for direct input
  config?: Record<string, unknown>;
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
  context?: Record<string, unknown>;
  // 允许直接传入 params_schema，避免需要预先注册模版
  params_schema?: {
    properties: Record<string, {
      type: string;
      description?: string;
      default?: string | number | boolean;
    }>;
    required?: string[];
  };
}

export interface RecognizeParamsResponseDTO {
  params: Record<string, unknown>;
  confidence: number;
  usage?: LLMUsage;
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
  context?: Record<string, unknown>;
}

export interface PlanSkillMatchDTO {
  skill_id: string;
  skill_name: string;
  confidence: number;
  match_reason?: string;
}

export interface PlanStepDTO {
  id: string;
  title: string;
  description: string;
  kind: 'skill' | 'tool' | 'human_input' | 'execution';
  tool_name?: string;
  status: 'planned';
}

export interface RequiredInputDTO {
  name: string;
  type: string;
  description?: string;
  required: boolean;
  value?: unknown;
  missing: boolean;
  source: 'user_input' | 'default' | 'unresolved';
}

export interface RiskSummaryDTO {
  level: 'low' | 'medium' | 'high';
  requires_human_review: boolean;
  items: string[];
}

export interface PlanDraftDTO {
  plan_id: string;
  planner_mode: 'skill' | 'fallback';
  objective: string;
  summary: string;
  skill_match?: PlanSkillMatchDTO;
  steps: PlanStepDTO[];
  required_inputs: RequiredInputDTO[];
  usage?: LLMUsage;
  risk_summary: RiskSummaryDTO;
  metadata?: Record<string, unknown>;
}
