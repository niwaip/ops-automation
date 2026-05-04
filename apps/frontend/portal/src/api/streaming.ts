export type StreamEventPayload = {
  type: string;
  [key: string]: unknown;
};

interface PostSseStreamOptions {
  url: string;
  payload: unknown;
  token?: string | null;
  requireDoneEvent?: boolean;
  onEvent: (event: StreamEventPayload) => void;
}

export const postSseStream = ({
  url,
  payload,
  token,
  requireDoneEvent = false,
  onEvent,
}: PostSseStreamOptions): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!token) {
      reject(new Error('登录状态已失效，请重新登录后再试'));
      return;
    }

    const xhr = new XMLHttpRequest();
    let processedLength = 0;
    let lineBuffer = '';
    let hasDoneEvent = false;

    const processChunk = (chunk: string) => {
      if (!chunk) return;

      lineBuffer += chunk;
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.substring(6)) as StreamEventPayload;
          if (event.type === 'done') hasDoneEvent = true;
          onEvent(event);
        } catch {
          // Ignore parse errors from malformed SSE chunks
        }
      }
    };

    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    xhr.onprogress = () => {
      const newChunk = xhr.responseText.slice(processedLength);
      processedLength = xhr.responseText.length;
      processChunk(newChunk);
    };

    xhr.onload = () => {
      const newChunk = xhr.responseText.slice(processedLength);
      processChunk(newChunk);

      if (lineBuffer.startsWith('data: ')) {
        try {
          const event = JSON.parse(lineBuffer.substring(6)) as StreamEventPayload;
          if (event.type === 'done') hasDoneEvent = true;
          onEvent(event);
        } catch {
          // Ignore parse errors
        }
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        if (!requireDoneEvent || hasDoneEvent) {
          resolve();
        } else {
          reject(new Error('SSE stream ended without done event'));
        }
      } else if (xhr.status === 401) {
        reject(new Error('登录状态已失效，请重新登录后再试'));
      } else if (xhr.status === 403) {
        reject(new Error('当前账号无权执行该操作'));
      } else {
        const responseText = xhr.responseText?.trim();
        reject(new Error(responseText || `HTTP ${xhr.status}: ${xhr.statusText}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(JSON.stringify(payload));
  });
};
