/**
 * Chat API
 * 聊天API调用封装
 */

import { StreamEvent, ChatRequest, AIModel, UploadedFile } from './types';
import { useAuthStore } from '../../store/authStore';

// 使用Vite代理路径 /api/ai -> ops-ai-orchestrator:3007
const AI_API_BASE = '/api/ai';

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
  const token = useAuthStore.getState().accessToken;

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

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${AI_API_BASE}/chat/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: request.message,
          sessionId: request.sessionId,
          userId: request.userId,
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
    const token = useAuthStore.getState().accessToken;
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${AI_API_BASE}/models`, {
      headers,
    });
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
    const token = useAuthStore.getState().accessToken;
    const formData = new FormData();
    formData.append('file', file);

    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${AI_API_BASE}/chat/upload`, {
      method: 'POST',
      headers,
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
    const token = useAuthStore.getState().accessToken;
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${AI_API_BASE}/chat/history/${sessionId}`, {
      headers,
    });
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
