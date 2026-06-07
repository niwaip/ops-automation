/**
 * Recorder Service - Socket.IO connection to browser-worker
 */

import { io, Socket } from 'socket.io-client';
import { runtimeConfig } from '@/shared/config/runtime';
import { apiClient } from '@/shared/api/http/client';

export type RecorderStatus = 'idle' | 'connecting' | 'recording' | 'paused' | 'stopped' | 'error';

export interface RecorderState {
  status: RecorderStatus;
  script: string;
  targetUrl: string;
  cdpPort?: number;
  error?: string;
}

export interface CompiledTemplate {
  id: string;
  name: string;
  version: string;
  status: string;
  params_schema: {
    type: string;
    properties: Record<string, { type: string; description?: string }>;
    required: string[];
  };
  steps: Array<{
    step_id: string;
    action: string;
    locator?: { type: string; value: string; fallback?: { type: string; value: string } };
    params?: Record<string, string | number>;
    wait?: { type: string; value: number | string };
    on_fail?: string;
    retry?: { max_attempts: number; delay_ms: number };
  }>;
  metadata: {
    created_by: string;
    created_at: string;
    updated_at: string;
    description?: string;
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export type RecorderTakeoverBackend = 'cli' | 'chrome-devtools';

export interface RecorderTakeoverCommand {
  tool: string;
  params: Record<string, unknown>;
  description?: string;
  locator?: {
    strategy?: string;
    value?: string;
    expression?: string;
    role?: string;
    name?: string;
  };
}

export interface RecorderPatchStep {
  id?: string;
  action: string;
  params?: Record<string, unknown>;
  locator?: {
    type?: 'selector' | 'role' | 'text' | 'label' | 'placeholder' | 'testid';
    value?: string;
    role?: string;
    name?: string;
  };
  source?: 'ai' | 'manual' | 'manual_takeover';
  backend?: 'cli' | 'chrome-devtools' | 'legacy';
  replayable?: boolean;
  scriptFragment?: string;
  createdAt?: string;
}

export interface RecorderTakeoverObservation {
  currentPageUrl?: string;
  title?: string;
  text?: string;
  snapshotPath?: string;
  screenshotPath?: string;
  timestamp?: string;
}

export interface StartTakeoverRequest {
  runtimeSessionId: string;
  sessionId?: string;
  backend: RecorderTakeoverBackend;
  failedStepId?: string;
  failedCommand?: RecorderTakeoverCommand & {
    errorMessage?: string;
    errorCode?: string;
  };
  reason?: string;
}

export interface StartTakeoverResponse {
  success: boolean;
  runtimeSessionId: string;
  takeoverSessionId: string;
  status: 'frozen' | 'recording';
  controlMode: 'HUMAN_CONTROL';
  endpoints?: {
    novnc?: string;
    cdp?: string;
  };
  startedAt: string;
}

export interface StopTakeoverRequest {
  runtimeSessionId: string;
  takeoverSessionId: string;
  keepHumanControl?: boolean;
}

export interface StopTakeoverResponse {
  success: boolean;
  runtimeSessionId: string;
  takeoverSessionId: string;
  status: 'reconciling' | 'ready_to_resume';
  patchScript: {
    rawScript: string;
    lineCount: number;
    parserVersion: string;
    recordedAt: string;
  };
  patchSteps: RecorderPatchStep[];
  observation: RecorderTakeoverObservation;
}

export interface ReconcileAfterTakeoverRequest {
  sessionId: string;
  runtimeSessionId: string;
  backend?: RecorderTakeoverBackend;
  failedStepId?: string;
  failedCommand?: RecorderTakeoverCommand & {
    errorMessage?: string;
    errorCode?: string;
  };
  originalCommands: RecorderTakeoverCommand[];
  patchSteps: RecorderPatchStep[];
  observation: RecorderTakeoverObservation;
}

export interface ReconcileAfterTakeoverResponse {
  strategy: 'replace_failed_step' | 'insert_patch_steps' | 'replan_from_current_state';
  explanation: string;
  confidence?: number;
  resumeCommands: RecorderTakeoverCommand[];
}

export interface ResumeAfterTakeoverRequest {
  runtimeSessionId: string;
  backend: RecorderTakeoverBackend;
  takeoverSessionId?: string;
  strategy?: ReconcileAfterTakeoverResponse['strategy'];
  resumeCommands: RecorderTakeoverCommand[];
}

export interface ResumeAfterTakeoverResponse {
  success: boolean;
  runtimeSessionId: string;
  status: 'resuming' | 'completed' | 'error';
  results: Array<Record<string, unknown>>;
  generatedSteps?: Array<Record<string, unknown>>;
}

const WS_URL = runtimeConfig.recorderWsUrl || 'ws://localhost:3004';
const WS_PATH = '/recorder';

class RecorderService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private listeners: Map<string, Set<(data: unknown) => void>> = new Map();

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve();
        return;
      }

      // Parse URL to get host and path
      const url = WS_URL.replace('/recorder', '');
      this.socket = io(url, {
        path: WS_PATH,
        transports: ['websocket'],
        reconnection: false, // We handle reconnection manually
      });

      this.socket.on('connect', () => {
        this.reconnectAttempts = 0;
        this.emit('connected', { connected: true });
        resolve();
      });

      this.socket.on('STATUS', (data: { status: RecorderStatus; url?: string; cdpPort?: number }) => {
        this.emit('status', data);
      });

      this.socket.on('SCRIPT_UPDATE', (data: { script: string }) => {
        this.emit('script', data);
      });

      this.socket.on('ERROR', (data: { message: string }) => {
        this.emit('error', data);
      });

      this.socket.on('connect_error', (error: Error) => {
        this.emit('error', { message: 'Socket connection error: ' + error.message });
        reject(error);
      });

      this.socket.on('disconnect', (_reason: string) => {
        this.emit('status', { status: 'stopped' });
        this.attemptReconnect();
      });
    });
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        this.connect().catch(() => {
          console.error('Reconnect failed');
        });
      }, 1000 * this.reconnectAttempts);
    }
  }

  startRecording(url: string): void {
    if (!this.socket?.connected) {
      this.emit('error', { message: 'Socket not connected' });
      return;
    }
    this.socket.emit('START', { url });
  }

  stopRecording(): void {
    if (!this.socket?.connected) {
      this.emit('error', { message: 'Socket not connected' });
      return;
    }
    this.socket.emit('STOP');
  }

  pauseRecording(): void {
    if (!this.socket?.connected) {
      this.emit('error', { message: 'Socket not connected' });
      return;
    }
    this.socket.emit('PAUSE');
  }

  resumeRecording(): void {
    if (!this.socket?.connected) {
      this.emit('error', { message: 'Socket not connected' });
      return;
    }
    this.socket.emit('RESUME');
  }

  startTakeover(request: StartTakeoverRequest): Promise<StartTakeoverResponse> {
    return apiClient.post('/browser/takeover/start', request);
  }

  stopTakeover(request: StopTakeoverRequest): Promise<StopTakeoverResponse> {
    return apiClient.post('/browser/takeover/stop', request);
  }

  reconcileAfterTakeover(
    request: ReconcileAfterTakeoverRequest,
  ): Promise<ReconcileAfterTakeoverResponse> {
    return apiClient.post('/ai/recorder-debug/reconcile', request);
  }

  resumeAfterTakeover(
    request: ResumeAfterTakeoverRequest,
  ): Promise<ResumeAfterTakeoverResponse> {
    return apiClient.post('/browser/takeover/resume', request);
  }

  getTakeoverState(runtimeSessionId: string) {
    return apiClient.get<{
      runtimeSessionId: string;
      runtime?: Record<string, unknown>;
      takeover?: Record<string, unknown>;
    }>(`/browser/takeover/${encodeURIComponent(runtimeSessionId)}`);
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  on(event: string, callback: (data: unknown) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(callback);
  }

  off(event: string, callback: (data: unknown) => void): void {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: unknown): void {
    this.listeners.get(event)?.forEach((callback) => callback(data));
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

export const recorderService = new RecorderService();
export default recorderService;
