import type { RecorderStatus } from '@/services/recorder.service';

export interface RecorderPageState {
  status: RecorderStatus;
  script: string;
  targetUrl: string;
  error?: string;
}

export interface MCPCommand {
  tool: string;
  params: Record<string, unknown>;
}

export type RecorderPreviewMode = 'idle' | 'shared' | 'session';
