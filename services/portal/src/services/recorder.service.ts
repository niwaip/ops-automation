/**
 * Recorder Service - WebSocket connection to Playwright codegen
 */

export type RecorderStatus = 'idle' | 'connecting' | 'recording' | 'paused' | 'stopped' | 'error';

export interface RecorderWebSocketMessage {
  type: 'START' | 'SCRIPT_UPDATE' | 'STOP' | 'ERROR' | 'PAUSE' | 'RESUME' | 'STATUS';
  payload?: {
    url?: string;
    script?: string;
    message?: string;
    status?: RecorderStatus;
  };
}

export interface RecorderState {
  status: RecorderStatus;
  script: string;
  targetUrl: string;
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

const WS_URL = import.meta.env.VITE_RECORDER_WS_URL || 'ws://localhost:8080/recorder';

class RecorderService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private listeners: Map<string, Set<(data: unknown) => void>> = new Map();

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.emit('status', { status: 'idle' });
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const message: RecorderWebSocketMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        this.emit('error', { message: 'WebSocket connection error' });
        reject(error);
      };

      this.ws.onclose = () => {
        this.emit('status', { status: 'stopped' });
        this.attemptReconnect();
      };
    });
  }

  private handleMessage(message: RecorderWebSocketMessage) {
    switch (message.type) {
      case 'START':
        this.emit('status', { status: 'recording', url: message.payload?.url });
        break;
      case 'SCRIPT_UPDATE':
        this.emit('script', { script: message.payload?.script || '' });
        break;
      case 'STOP':
        this.emit('status', { status: 'stopped' });
        this.emit('script', { script: message.payload?.script || '' });
        break;
      case 'ERROR':
        this.emit('error', { message: message.payload?.message || 'Unknown error' });
        this.emit('status', { status: 'error' });
        break;
      case 'PAUSE':
        this.emit('status', { status: 'paused' });
        break;
      case 'RESUME':
        this.emit('status', { status: 'recording' });
        break;
      case 'STATUS':
        this.emit('status', { status: message.payload?.status || 'idle' });
        break;
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        this.connect().catch(() => {
          console.error('Reconnect failed');
        });
      }, this.reconnectDelay * this.reconnectAttempts);
    }
  }

  startRecording(url: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.emit('error', { message: 'WebSocket not connected' });
      return;
    }
    this.ws.send(JSON.stringify({ type: 'START', payload: { url } }));
  }

  stopRecording(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.emit('error', { message: 'WebSocket not connected' });
      return;
    }
    this.ws.send(JSON.stringify({ type: 'STOP' }));
  }

  pauseRecording(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.emit('error', { message: 'WebSocket not connected' });
      return;
    }
    this.ws.send(JSON.stringify({ type: 'PAUSE' }));
  }

  resumeRecording(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.emit('error', { message: 'WebSocket not connected' });
      return;
    }
    this.ws.send(JSON.stringify({ type: 'RESUME' }));
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
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
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const recorderService = new RecorderService();
export default recorderService;