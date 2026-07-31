/**
 * Chat API
 * portal 侧仅保留上传/转写与 Date 适配，协议归一化复用 user-core。
 */

import { createChatApi } from '@ops/user-core';
import { StreamEvent, ChatRequest, AIModel, UploadedFile } from './types';
import { browserStreamingTransport } from '@/adapters/streaming/browserStreamingTransport';
import { apiClient, ensureFreshAccessToken, refreshAccessToken } from '@/shared/api/http/client';
import { runtimeConfig } from '@/shared/config/runtime';
import { useAuthStore } from '@/shared/store/authStore';

// 使用 Vite 代理路径 /api/ai -> ai-orchestrator:3007
const AI_API_BASE = '/api/ai';

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
};

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined;

const coreChatApi = createChatApi(apiClient, runtimeConfig);

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
  init?: RequestInit
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
  onComplete?: () => void
): () => void {
  let isAborted = false;
  let activeAbortFn: (() => void) | null = null;

  void (async () => {
    try {
      const freshToken = await ensureFreshAccessToken();
      if (isAborted) return;

      const token = freshToken || useAuthStore.getState().accessToken;
      const streamHandle = coreChatApi.stream(
        browserStreamingTransport,
        token,
        request,
        (event) => onEvent(event as StreamEvent)
      );

      activeAbortFn = () => streamHandle.abort();

      await streamHandle.promise;
      onComplete?.();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Request aborted by user');
        return;
      }
      onError?.(error instanceof Error ? error : new Error('Unknown error'));
    }
  })();

  return () => {
    isAborted = true;
    if (activeAbortFn) {
      activeAbortFn();
    }
  };
}

/**
 * 获取可用模型列表
 */
export async function getAvailableModels(): Promise<AIModel[]> {
  try {
    return await coreChatApi.getAvailableModels();
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
