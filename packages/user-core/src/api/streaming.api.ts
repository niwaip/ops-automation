import type {
  PostSseStreamRequest,
  SseStreamHandle,
  StreamingTransportPort,
} from '../ports/streaming.port.js';

interface PostSseStreamOptions {
  url: string;
  payload: unknown;
  token?: string | null;
  requireDoneEvent?: boolean;
  onEvent: PostSseStreamRequest['onEvent'];
}

export const postSseStream = (
  transport: StreamingTransportPort,
  { url, payload, token, requireDoneEvent = false, onEvent }: PostSseStreamOptions
): SseStreamHandle => {
  if (!token) {
    return {
      promise: Promise.reject(new Error('登录状态已失效，请重新登录后再试')),
      abort: () => {},
    };
  }

  return transport.postSseStream({
    url,
    payload,
    token,
    requireDoneEvent,
    onEvent,
  });
};
