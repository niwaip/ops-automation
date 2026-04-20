/**
 * Recorder Service - Socket.IO connection to browser-worker
 */

import { io, Socket } from 'socket.io-client';

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

const WS_URL = import.meta.env.VITE_RECORDER_WS_URL || `ws://${import.meta.env.VITE_HOST_IP || 'localhost'}:3004`;
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