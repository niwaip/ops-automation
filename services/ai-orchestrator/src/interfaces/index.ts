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

export interface AIModelDTO {
  id: string;
  name: string;
  provider: string;
  api_endpoint: string;
  config: Record<string, unknown>;
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