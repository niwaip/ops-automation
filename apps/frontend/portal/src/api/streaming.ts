import { postSseStream as postSseStreamFromCore, type StreamEventPayload } from "@ops/user-core";
import { browserStreamingTransport } from "@/adapters/streaming/browserStreamingTransport";

interface PostSseStreamOptions {
  url: string;
  payload: unknown;
  token?: string | null;
  requireDoneEvent?: boolean;
  onEvent: (event: StreamEventPayload) => void;
}

export type { StreamEventPayload };

export const postSseStream = (options: PostSseStreamOptions): Promise<void> =>
  postSseStreamFromCore(browserStreamingTransport, options);
