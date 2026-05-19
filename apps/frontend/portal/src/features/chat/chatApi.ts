/**
 * Chat API
 * 聊天API调用封装
 */

import { StreamEvent, ChatRequest, AIModel, UploadedFile } from './types';
import { useAuthStore } from '@/shared/store/authStore';
import { ensureFreshAccessToken, refreshAccessToken } from '@/shared/api/http/client';

// 使用 Vite 代理路径 /api/ai -> ai-orchestrator:3007
const AI_API_BASE = '/api/ai';

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
  (async () => {
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

      while (true) {
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
              const data = JSON.parse(line.slice(6));
              onEvent(data as StreamEvent);
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
    const data = await response.json();
    return data.models || [];
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

    const data = await response.json();
    return {
      fileId: data.fileId,
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
 * 获取聊天历史
 */
export async function getChatHistory(sessionId: string): Promise<ChatMessage[]> {
  try {
    const response = await fetchWithAuthRetry(`${AI_API_BASE}/chat/history/${sessionId}`);
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    const data = await response.json();
    return data.messages || [];
  } catch (error) {
    console.error('Failed to get chat history:', error);
    return [];
  }
}

/**
 * 导入ChatMessage类型（避免循环引用）
 */
import { ChatMessage } from './types';
