import type { RuntimeConfigPort } from '../ports/runtime.port.js';
import type { StreamingTransportPort } from '../ports/streaming.port.js';
import type {
  AIModel,
  ChatMessage,
  ChatRequest,
  ChatSession,
  StreamEvent,
} from '../types/chat.types.js';
import type { ApiClient } from './client.js';
import { postSseStream } from './streaming.api.js';

const resolveAiPath = (runtimeConfig: RuntimeConfigPort, path: string): string => {
  const baseUrl = runtimeConfig.aiApiBaseUrl?.trim() || '/api/ai';
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
};

const normalizeTimestamp = (value: unknown): string => {
  if (typeof value === 'string' && value.trim()) {
    const normalized = new Date(value);
    if (!Number.isNaN(normalized.getTime())) {
      return normalized.toISOString();
    }
  }

  return new Date().toISOString();
};

const normalizeChatMessage = (raw: unknown): ChatMessage | null => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  const role = candidate.role;
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.sessionId !== 'string' ||
    (role !== 'user' && role !== 'assistant' && role !== 'system') ||
    typeof candidate.content !== 'string'
  ) {
    return null;
  }

  return {
    id: candidate.id,
    sessionId: candidate.sessionId,
    role,
    content: candidate.content,
    timestamp: normalizeTimestamp(
      candidate.timestamp ?? candidate.createdAt ?? candidate.updatedAt
    ),
    metadata:
      candidate.metadata && typeof candidate.metadata === 'object'
        ? (candidate.metadata as ChatMessage['metadata'])
        : undefined,
    isStreaming: typeof candidate.isStreaming === 'boolean' ? candidate.isStreaming : undefined,
  };
};

const normalizeChatSession = (raw: unknown): ChatSession | null => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  if (
    typeof candidate.id !== 'string' ||
    (candidate.status !== 'active' && candidate.status !== 'archived')
  ) {
    return null;
  }

  return {
    id: candidate.id,
    title: typeof candidate.title === 'string' ? candidate.title : undefined,
    modelId: typeof candidate.modelId === 'string' ? candidate.modelId : undefined,
    status: candidate.status,
    createdAt: normalizeTimestamp(candidate.createdAt),
    updatedAt: normalizeTimestamp(candidate.updatedAt),
  };
};

const normalizeAIModel = (raw: unknown): AIModel | null => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.name !== 'string' ||
    typeof candidate.provider !== 'string' ||
    (candidate.status !== 'active' && candidate.status !== 'inactive')
  ) {
    return null;
  }

  return {
    id: candidate.id,
    name: candidate.name,
    provider: candidate.provider,
    config:
      candidate.config && typeof candidate.config === 'object'
        ? (candidate.config as AIModel['config'])
        : undefined,
    status: candidate.status,
  };
};

const normalizeStreamEvent = (raw: unknown): StreamEvent | null => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  if (typeof candidate.type !== 'string' || typeof candidate.content !== 'string') {
    return null;
  }

  return {
    type: candidate.type as StreamEvent['type'],
    content: candidate.content,
    data:
      candidate.data && typeof candidate.data === 'object'
        ? (candidate.data as Record<string, unknown>)
        : undefined,
    iteration: typeof candidate.iteration === 'number' ? candidate.iteration : undefined,
  };
};

export const createChatApi = (client: ApiClient, runtimeConfig: RuntimeConfigPort) => ({
  stream: async (
    transport: StreamingTransportPort,
    token: string | null | undefined,
    request: ChatRequest,
    onEvent: (event: StreamEvent) => void
  ): Promise<void> =>
    postSseStream(transport, {
      url: resolveAiPath(runtimeConfig, '/chat/stream'),
      payload: {
        ...request,
        files: request.files?.map(({ fileId, fileName, mimeType, size }) => ({
          fileId,
          fileName,
          mimeType,
          size,
        })),
      },
      token,
      onEvent: (event) => {
        const normalizedEvent = normalizeStreamEvent(event);
        if (normalizedEvent) {
          onEvent(normalizedEvent);
        }
      },
    }),
  getAvailableModels: async (): Promise<AIModel[]> => {
    const response = await client.get<{ models?: unknown[] }>(
      resolveAiPath(runtimeConfig, '/models')
    );
    return (response.models || [])
      .map((item) => normalizeAIModel(item))
      .filter((item): item is AIModel => item !== null);
  },
  getChatHistory: async (sessionId: string): Promise<ChatMessage[]> => {
    const response = await client.get<{ messages?: unknown[] }>(
      resolveAiPath(runtimeConfig, `/chat/history/${encodeURIComponent(sessionId)}`)
    );
    return (response.messages || [])
      .map((item) => normalizeChatMessage(item))
      .filter((item): item is ChatMessage => item !== null);
  },
  listSessions: async (): Promise<ChatSession[]> => {
    const response = await client.get<{ sessions?: unknown[] }>(
      resolveAiPath(runtimeConfig, '/chat/sessions')
    );
    return (response.sessions || [])
      .map((item) => normalizeChatSession(item))
      .filter((item): item is ChatSession => item !== null);
  },
});
