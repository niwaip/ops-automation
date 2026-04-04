// DTOs and Interfaces for AI Orchestrator Service

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenAICompatibleConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

export interface AIModelDTO {
  id: string;
  name: string;
  provider: string;
  api_endpoint: string;
  config: Record<string, unknown>;
  status: 'active' | 'inactive';
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