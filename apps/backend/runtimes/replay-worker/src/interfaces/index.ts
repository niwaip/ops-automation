/**
 * Replay Engine Interfaces and Types
 */

// Re-export types from template service (READ-ONLY reference)
export type StepAction =
  | 'click'
  | 'fill'
  | 'navigate'
  | 'wait'
  | 'select'
  | 'check'
  | 'screenshot'
  | 'assert';

export type LocatorType = 'role' | 'text' | 'label' | 'test-id' | 'css' | 'xpath';

export type WaitType = 'timeout' | 'visible' | 'hidden' | 'text';

export type OnFailAction = 'skip' | 'stop' | 'takeover';

export type StepResultType = 'success' | 'failed' | 'retry' | 'takeover';

export interface Locator {
  type: LocatorType;
  value: string;
  fallback?: Locator;
}

export interface WaitConfig {
  type: WaitType;
  value: number | string;
}

export interface Assertion {
  type: 'visible' | 'hidden' | 'text' | 'value' | 'count';
  expected: string | number | boolean;
  locator?: Locator;
}

export interface RetryConfig {
  max_attempts: number;
  delay_ms: number;
}

export interface TemplateStep {
  step_id: string;
  action: StepAction;
  locator?: Locator;
  params?: Record<string, string | number>;
  wait?: WaitConfig;
  assertions?: Assertion[];
  retry?: RetryConfig;
  on_fail?: OnFailAction;
  idempotency_key?: string;
}

export interface WorkerEndpoints {
  novnc: string;
  cdp: string;
  vnc?: string;
}

// CDP Client interfaces
export interface CDPConnectionState {
  connected: boolean;
  cdp_url: string;
  page_id?: string;
  connected_at?: Date;
}

export interface StepActionParams {
  value?: string;
  url?: string;
  timeout?: number;
  wait_type?: WaitType;
  wait_value?: number | string;
  option?: string;
  checked?: boolean;
}

export interface StepResult {
  success: boolean;
  action: StepAction;
  locator?: Locator;
  duration_ms: number;
  error_class?: string;
  error_message?: string;
  screenshot_ref?: string;
  assertion_results?: AssertionResult[];
}

export interface AssertionResult {
  type: string;
  expected: string | number | boolean;
  actual?: string | number | boolean;
  passed: boolean;
}

// Execution interfaces
export interface ExecutionState {
  execution_id: string;
  session_id: string;
  template_id: string;
  params: Record<string, unknown>;
  status: ExecutionStatus;
  current_step_index: number;
  total_steps: number;
  started_at: Date;
  completed_at?: Date;
  error?: string;
}

export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'takeover';

export interface StepLogEntry {
  id: string;
  session_id: string;
  step_id: string;
  step_index: number;
  action: StepAction;
  locator_type?: LocatorType;
  locator_value?: string;
  locator_summary?: string;
  started_at: Date;
  completed_at?: Date;
  duration_ms?: number;
  result: StepResultType;
  error_class?: string;
  error_message?: string;
  retry_count: number;
  retry_reason?: string;
  takeover_triggered: boolean;
  takeover_reason?: string;
  screenshot_ref?: string;
  trace_ref?: string;
  context: Record<string, unknown>;
}

// AI Decision interfaces (READ-ONLY reference from ai-orchestrator)
export interface DecideFailureRequest {
  session_id: string;
  step_id: string;
  error_type: string;
  error_message: string;
}

export interface DecideFailureResponse {
  decision: 'takeover' | 'retry' | 'skip';
  reason: string;
}

// Takeover interfaces
export interface TakeoverTriggerRequest {
  session_id: string;
  step_id: string;
  reason: string;
  error_class?: string;
  error_message?: string;
}

export interface TakeoverTriggerResponse {
  success: boolean;
  session_state: string;
  message?: string;
}

// Template fetch interfaces
export interface TemplateInfo {
  id: string;
  name: string;
  version: string;
  steps: TemplateStep[];
  params_schema: Record<string, unknown>;
}

// Configuration
export interface ReplayEngineConfig {
  default_step_timeout_ms: number;
  default_max_retries: number;
  default_retry_delay_ms: number;
  template_service_url: string;
  session_broker_url: string;
  ai_orchestrator_url: string;
  database_url: string;
}
