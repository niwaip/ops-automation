// Session State Types
export type SessionState = 'IDLE' | 'RUNNING' | 'HUMAN_CONTROL' | 'CLOSED' | 'ERROR';
export type ControlMode = 'AGENT_RUNNING' | 'HUMAN_CONTROL';
export type SessionBlockingMode = 'confirmation' | 'takeover' | 'forbidden';

// Worker Endpoints
export interface WorkerEndpoints {
  novnc?: string;
  cdp: string;
  vnc?: string;
}

// Session Entity
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
  blocking_mode?: SessionBlockingMode;
  blocking_reason?: string;
  created_at: number;
  last_activity: number;
}

// Create Session Request
export interface CreateSessionRequest {
  user_id: string;
  template_id?: string;
  params?: Record<string, unknown>;
}

// Create Session Response
export interface CreateSessionResponse {
  session: Session;
  endpoints: WorkerEndpoints;
}

// Start Session Request
export interface StartSessionRequest {
  template_id: string;
  params: Record<string, unknown>;
}

// Takeover Session Request
export interface TakeoverSessionRequest {
  reason: string;
}

// Continue Session Request
export interface ContinueSessionRequest {
  step_id: string;
}

// Lock Information
export interface LockInfo {
  user_id: string;
  session_id: string;
  acquired_at: number;
  ttl: number;
}

// Worker Info
export interface WorkerInfo {
  worker_id: string;
  status: 'available' | 'busy' | 'error';
  session_id?: string;
  endpoints?: WorkerEndpoints;
  last_heartbeat?: number;
}
