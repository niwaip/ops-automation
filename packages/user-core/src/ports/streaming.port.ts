import type { StreamEventPayload } from '../types/streaming.types.js';

export interface PostSseStreamRequest {
  url: string;
  payload: unknown;
  token: string;
  requireDoneEvent?: boolean;
  onEvent: (event: StreamEventPayload) => void;
}

export interface SseStreamHandle {
  promise: Promise<void>;
  abort: () => void;
}

export interface StreamingTransportPort {
  postSseStream(request: PostSseStreamRequest): SseStreamHandle;
}
