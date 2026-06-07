import type {
  PostSseStreamRequest,
  StreamEventPayload,
  StreamingTransportPort,
} from "@ops/user-core";

const isStreamEventPayload = (
  value: Record<string, unknown>,
): value is StreamEventPayload => typeof value.type === "string";

export const browserStreamingTransport: StreamingTransportPort = {
  async postSseStream({
    url,
    payload,
    token,
    onEvent,
  }: PostSseStreamRequest): Promise<void> {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(errorText || `HTTP ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Response body is null");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() || "";

      for (const chunk of chunks) {
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) {
            continue;
          }
          const data = JSON.parse(line.slice(6)) as Record<string, unknown>;
          if (isStreamEventPayload(data)) {
            onEvent(data);
          }
        }
      }
    }

    const trailingLine = buffer.trim();
    if (trailingLine.startsWith("data: ")) {
      const data = JSON.parse(trailingLine.slice(6)) as Record<string, unknown>;
      if (isStreamEventPayload(data)) {
        onEvent(data);
      }
    }
  },
};
