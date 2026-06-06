export type SessionState = "IDLE" | "RUNNING" | "HUMAN_CONTROL" | "CLOSED" | "ERROR";
export type ControlMode = "AGENT_RUNNING" | "HUMAN_CONTROL";

export interface WorkerEndpoints {
  novnc?: string;
  cdp: string;
  vnc?: string;
}

export interface Session {
  id: string;
  user_id: string;
  state: SessionState;
  control_mode: ControlMode;
  frozen: boolean;
  worker_ref?: string;
  endpoints?: WorkerEndpoints;
  template_id?: string;
  params?: Record<string, unknown>;
  current_step?: string;
  step_index?: number;
  created_at: number;
  last_activity: number;
}

export interface CreateSessionRequest {
  user_id: string;
  template_id?: string;
  params?: Record<string, unknown>;
}

export interface CreateSessionResponse {
  session: Session;
  endpoints: WorkerEndpoints;
}

export interface StartSessionRequest {
  template_id: string;
  params: Record<string, unknown>;
}

export interface TakeoverSessionRequest {
  reason: string;
}

export interface ContinueSessionRequest {
  step_id: string;
}

export interface WorkerPoolStatus {
  available_workers: number;
  status: "available" | "exhausted";
  message: string;
}

export interface WorkerPoolResetResponse {
  success: boolean;
  available_workers: number;
  message: string;
}

export interface StepResult {
  step_id: string;
  step_index: number;
  action: string;
  success: boolean;
  error?: string;
  message?: string;
  screenshot?: string;
  text?: string;
  html?: string;
  timestamp: number;
}
