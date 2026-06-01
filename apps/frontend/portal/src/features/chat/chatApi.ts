/**
 * Chat API
 * 聊天API调用封装
 */

import {
  StreamEvent,
  ChatRequest,
  AIModel,
  UploadedFile,
  StreamEventType,
  ChatMessage,
  LLMRateLimit,
  LLMUsage,
  PromptDebugPayload,
} from './types';
import { useAuthStore } from '@/shared/store/authStore';
import { ensureFreshAccessToken, refreshAccessToken } from '@/shared/api/http/client';

// 使用 Vite 代理路径 /api/ai -> ai-orchestrator:3007
const AI_API_BASE = '/api/ai';

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
};

const asString = (value: unknown): string | undefined => (
  typeof value === 'string' && value.trim() ? value : undefined
);

const asStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((item): item is string => typeof item === 'string');
};

const isStreamEventType = (value: unknown): value is StreamEventType => (
  typeof value === 'string' && Object.values(StreamEventType).includes(value as StreamEventType)
);

const normalizeUsage = (value: unknown): LLMUsage | undefined => {
  const record = asRecord(value);
  if (
    !record
    || typeof record.prompt_tokens !== 'number'
    || typeof record.completion_tokens !== 'number'
    || typeof record.total_tokens !== 'number'
  ) {
    return undefined;
  }

  const completionTokenDetails = asRecord(record.completion_tokens_details);
  return {
    prompt_tokens: record.prompt_tokens,
    completion_tokens: record.completion_tokens,
    total_tokens: record.total_tokens,
    completion_tokens_details: completionTokenDetails && typeof completionTokenDetails.reasoning_tokens === 'number'
      ? { reasoning_tokens: completionTokenDetails.reasoning_tokens }
      : undefined,
  };
};

const normalizeRateLimit = (value: unknown): LLMRateLimit | undefined => {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  return {
    requests_limit: typeof record.requests_limit === 'number' ? record.requests_limit : undefined,
    requests_remaining: typeof record.requests_remaining === 'number' ? record.requests_remaining : undefined,
    requests_reset: asString(record.requests_reset),
    tokens_limit: typeof record.tokens_limit === 'number' ? record.tokens_limit : undefined,
    tokens_remaining: typeof record.tokens_remaining === 'number' ? record.tokens_remaining : undefined,
    tokens_reset: asString(record.tokens_reset),
  };
};

const normalizePromptDebugPayload = (value: unknown): PromptDebugPayload | undefined => {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const systemPrompt = asString(record?.systemPrompt);
  const userPrompt = asString(record?.userPrompt);
  if (!systemPrompt || !userPrompt) {
    return undefined;
  }

  const llmRequestMessages: PromptDebugPayload['llmRequestMessages'] = Array.isArray(record.llmRequestMessages)
    ? record.llmRequestMessages.reduce<NonNullable<PromptDebugPayload['llmRequestMessages']>>((acc, item) => {
        const message = asRecord(item);
        const role = message?.role;
        const content = asString(message?.content);
        if (
          (role === 'system' || role === 'user' || role === 'assistant')
          && content
        ) {
          acc.push({ role, content });
        }
        return acc;
      }, [])
    : undefined;
  const llmCalls: PromptDebugPayload['llmCalls'] = Array.isArray(record.llmCalls)
    ? record.llmCalls.reduce<NonNullable<PromptDebugPayload['llmCalls']>>((acc, item) => {
        const call = asRecord(item);
        const stage = asString(call?.stage);
        const label = asString(call?.label);
        if (!call || !stage || !label) {
          return acc;
        }

        const requestMessages = Array.isArray(call.requestMessages)
          ? call.requestMessages.reduce<NonNullable<NonNullable<PromptDebugPayload['llmCalls']>[number]['requestMessages']>>((messages, messageItem) => {
              const message = asRecord(messageItem);
              const role = message?.role;
              const content = asString(message?.content);
              if (
                (role === 'system' || role === 'user' || role === 'assistant')
                && content
              ) {
                messages.push({ role, content });
              }
              return messages;
            }, [])
          : undefined;

        acc.push({
          stage,
          label,
          modelId: asString(call.modelId),
          requestMessages,
          responseText: asString(call.responseText),
          note: asString(call.note),
        });
        return acc;
      }, [])
    : undefined;

  return {
    systemPrompt,
    userPrompt,
    debugSource: record.debugSource === 'planner' || record.debugSource === 'react-engine'
      ? record.debugSource
      : undefined,
    systemPromptSectionKeys: asStringArray(record.systemPromptSectionKeys),
    systemPromptSectionSources: asStringArray(record.systemPromptSectionSources),
    userPromptSectionKeys: asStringArray(record.userPromptSectionKeys),
    userPromptSectionSources: asStringArray(record.userPromptSectionSources),
    modelId: asString(record.modelId),
    llmRequestMessages,
    llmResponseText: asString(record.llmResponseText),
    llmCalls,
    notes: asStringArray(record.notes),
  };
};

const normalizeMessageMetadata = (value: unknown): ChatMessage['metadata'] | undefined => {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const missingInputs: NonNullable<ChatMessage['metadata']>['missingInputs'] = Array.isArray(record.missingInputs)
    ? record.missingInputs.reduce<NonNullable<NonNullable<ChatMessage['metadata']>['missingInputs']>>((acc, item) => {
        const input = asRecord(item);
        if (!input) {
          return acc;
        }
        acc.push({
          name: asString(input.name),
          description: asString(input.description),
          missing: typeof input.missing === 'boolean' ? input.missing : undefined,
        });
        return acc;
      }, [])
    : undefined;
  const mode = record.mode === 'chat' || record.mode === 'task' ? record.mode : undefined;
  const taskStatus = record.taskStatus;

  return {
    mode,
    showThinking: typeof record.showThinking === 'boolean' ? record.showThinking : undefined,
    usage: normalizeUsage(record.usage),
    rateLimit: normalizeRateLimit(record.rateLimit),
    skillUsed: asString(record.skillUsed),
    params: asRecord(record.params),
    files: asStringArray(record.files),
    fileUrl: asString(record.fileUrl),
    downloadUrl: asString(record.downloadUrl),
    temporalLink: asString(record.temporalLink),
    missingInputs,
    taskStatus:
      taskStatus === 'waiting_input'
      || taskStatus === 'pending_approval'
      || taskStatus === 'running'
      || taskStatus === 'completed'
      || taskStatus === 'failed'
        ? taskStatus
        : undefined,
    executionId: asString(record.executionId),
    executionStatus: asString(record.executionStatus),
    finalResult: asString(record.finalResult),
    finalResultData: record.finalResultData,
    finalSummary: asString(record.finalSummary),
    errorMessage: asString(record.errorMessage),
    hasBusinessResult: typeof record.hasBusinessResult === 'boolean' ? record.hasBusinessResult : undefined,
    promptDebug: normalizePromptDebugPayload(record.promptDebug),
  };
};

const normalizeChatMessage = (value: unknown): ChatMessage | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const id = asString(record?.id);
  const role = record?.role;
  const content = typeof record?.content === 'string' ? record.content : '';
  if (
    !id
    || (role !== 'user' && role !== 'assistant' && role !== 'system')
  ) {
    return null;
  }

  const timestampValue = record.timestamp ?? record.createdAt ?? Date.now();
  const timestamp = timestampValue instanceof Date ? timestampValue : new Date(String(timestampValue));

  return {
    id,
    sessionId: asString(record.sessionId) ?? '',
    role,
    content,
    timestamp: Number.isNaN(timestamp.getTime()) ? new Date() : timestamp,
    metadata: normalizeMessageMetadata(record.metadata),
    isStreaming: typeof record.isStreaming === 'boolean' ? record.isStreaming : undefined,
  };
};

const normalizeStreamEvent = (value: unknown): StreamEvent | null => {
  const record = asRecord(value);
  const type = record?.type;
  if (!record || !isStreamEventType(type) || typeof record.content !== 'string') {
    return null;
  }

  return {
    type,
    content: record.content,
    data: asRecord(record.data),
    iteration: typeof record.iteration === 'number' ? record.iteration : undefined,
  };
};

const isAIModel = (value: unknown): value is AIModel => {
  const record = asRecord(value);
  if (!record) {
    return false;
  }

  return (
    typeof record.id === 'string'
    && typeof record.name === 'string'
    && typeof record.provider === 'string'
    && (record.status === 'active' || record.status === 'inactive')
  );
};

const buildAuthHeaders = (): Record<string, string> => {
  const token = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
};

const fetchWithAuthRetry = async (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => {
  const executeRequest = async (overrideToken?: string | null) => {
    const headers = new Headers(init?.headers || {});

    if (overrideToken) {
      headers.set('Authorization', `Bearer ${overrideToken}`);
    } else {
      const authHeaders = buildAuthHeaders();
      Object.entries(authHeaders).forEach(([key, value]) => headers.set(key, value));
    }

    return fetch(input, {
      ...init,
      headers,
    });
  };

  const freshToken = await ensureFreshAccessToken();
  let response = await executeRequest(freshToken);

  if (response.status !== 401) {
    return response;
  }

  const nextAccessToken = await refreshAccessToken();
  if (!nextAccessToken) {
    return response;
  }

  response = await executeRequest(nextAccessToken);
  return response;
};

/**
 * 流式聊天（支持中止）
 * 返回中止函数，调用即可停止请求
 */
export function streamChat(
  request: ChatRequest,
  onEvent: (event: StreamEvent) => void,
  onError?: (error: Error) => void,
  onComplete?: () => void,
): () => void {
  const abortController = new AbortController();

  // 异步执行流式请求
  void (async () => {
    try {
      // 文件信息只发送元数据（fileId等），内容已在上传时保存到后端
      const filesMetadata = (request.files || []).map((f) => ({
        fileId: f.fileId,
        fileName: f.fileName,
        mimeType: f.mimeType,
        size: f.size,
      }));

      const response = await fetchWithAuthRetry(`${AI_API_BASE}/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: request.message,
          sessionId: request.sessionId,
          userId: request.userId,
          executionId: request.executionId,
          userRoles: request.userRoles,
          modelId: request.modelId,
          files: filesMetadata,
          config: request.config, // 包含mode等配置
        }),
        signal: abortController.signal, // 支持中止
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      // 处理SSE流
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('Response body is null');
      }

      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // 解析SSE事件
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || ''; // 保留不完整的部分

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data: unknown = JSON.parse(line.slice(6));
              const event = normalizeStreamEvent(data);
              if (event) {
                onEvent(event);
              }
            } catch (e) {
              console.warn('Failed to parse SSE data:', line);
            }
          }
        }
      }

      onComplete?.();
    } catch (error) {
      // 如果是中止错误，不触发 onError
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Request aborted by user');
        return;
      }
      onError?.(error instanceof Error ? error : new Error('Unknown error'));
    }
  })();

  // 返回中止函数
  return () => {
    abortController.abort();
  };
}

/**
 * 获取可用模型列表
 */
export async function getAvailableModels(): Promise<AIModel[]> {
  try {
    const response = await fetchWithAuthRetry(`${AI_API_BASE}/models`);
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    const data: unknown = await response.json();
    const payload = asRecord(data);
    return Array.isArray(payload?.models) ? payload.models.filter(isAIModel) : [];
  } catch (error) {
    console.error('Failed to get models:', error);
    return [];
  }
}

/**
 * 上传文件
 */
export async function uploadFile(file: File): Promise<UploadedFile> {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetchWithAuthRetry(`${AI_API_BASE}/chat/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const data: unknown = await response.json();
    const payload = asRecord(data);
    const fileId = asString(payload?.fileId);
    if (!fileId) {
      throw new Error('Invalid upload response');
    }

    return {
      fileId,
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
      file,
    };
  } catch (error) {
    console.error('Failed to upload file:', error);
    throw error;
  }
}

/**
 * 语音转文字
 */
export async function transcribeAudio(file: Blob | File, modelId: string): Promise<string> {
  try {
    const formData = new FormData();
    formData.append('file', file, 'audio.webm');
    formData.append('modelId', modelId);

    const response = await fetchWithAuthRetry(`${AI_API_BASE}/chat/audio/transcriptions`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`HTTP error: ${response.status} ${errText}`);
    }

    const data: unknown = await response.json();
    const payload = asRecord(data);
    if (!payload || typeof payload.text !== 'string') {
      throw new Error('Invalid transcription response');
    }

    return payload.text;
  } catch (error) {
    console.error('Failed to transcribe audio:', error);
    throw error;
  }
}

/**
 * 获取聊天历史
 */
export async function getChatHistory(sessionId: string): Promise<ChatMessage[]> {
  try {
    const response = await fetchWithAuthRetry(`${AI_API_BASE}/chat/history/${sessionId}`);
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    const data: unknown = await response.json();
    const payload = asRecord(data);
    if (!Array.isArray(payload?.messages)) {
      return [];
    }

    return payload.messages
      .map((message) => normalizeChatMessage(message))
      .filter((message): message is ChatMessage => message !== null);
  } catch (error) {
    console.error('Failed to get chat history:', error);
    return [];
  }
}
