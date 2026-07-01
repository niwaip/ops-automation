import type {
  PostSseStreamRequest,
  StreamEventPayload,
  StreamingTransportPort,
} from '@ops/user-core';

const isStreamEventPayload = (value: Record<string, unknown>): value is StreamEventPayload =>
  typeof value.type === 'string';

export const browserStreamingTransport: StreamingTransportPort = {
  postSseStream({
    url,
    payload,
    token,
    requireDoneEvent = false,
    onEvent,
  }: PostSseStreamRequest) {
    const xhr = new XMLHttpRequest();
    const promise = new Promise<void>((resolve, reject) => {
      let processedLength = 0;
      let lineBuffer = '';
      let hasDoneEvent = false;

      const processChunk = (chunk: string) => {
        if (!chunk) {
          return;
        }

        lineBuffer += chunk;
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) {
            continue;
          }
          try {
            const data = JSON.parse(line.slice(6)) as Record<string, unknown>;
            if (!isStreamEventPayload(data)) {
              continue;
            }
            if (data.type === 'done') {
              hasDoneEvent = true;
            }
            onEvent(data);
          } catch {
            // Ignore malformed SSE chunks and continue reading the stream.
          }
        }
      };

      xhr.open('POST', url);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      xhr.onprogress = () => {
        const newChunk = xhr.responseText.slice(processedLength);
        processedLength = xhr.responseText.length;
        processChunk(newChunk);
      };

      xhr.onload = () => {
        const newChunk = xhr.responseText.slice(processedLength);
        processChunk(newChunk);

        const trailingLine = lineBuffer.trim();
        if (trailingLine.startsWith('data: ')) {
          try {
            const data = JSON.parse(trailingLine.slice(6)) as Record<string, unknown>;
            if (isStreamEventPayload(data)) {
              if (data.type === 'done') {
                hasDoneEvent = true;
              }
              onEvent(data);
            }
          } catch {
            // Ignore malformed trailing data.
          }
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          if (!requireDoneEvent || hasDoneEvent) {
            resolve();
          } else {
            reject(new Error('SSE stream ended without done event'));
          }
          return;
        }

        if (xhr.status === 401) {
          reject(new Error('登录状态已失效，请重新登录后再试'));
          return;
        }

        if (xhr.status === 403) {
          reject(new Error('当前账号无权执行该操作'));
          return;
        }

        const responseText = xhr.responseText?.trim();
        reject(new Error(responseText || `HTTP ${xhr.status}: ${xhr.statusText}`));
      };

      xhr.onerror = () => reject(new Error('Network error'));
      xhr.send(JSON.stringify(payload));
    });

    return {
      promise,
      abort: () => xhr?.abort?.(),
    };
  },
};
