/**
 * Chat API
 * 聊天API调用封装
 */

import { StreamEvent, StreamEventType, ChatRequest, AIModel, UploadedFile } from './types';

// 使用Vite代理路径 /api/ai -> ops-ai-orchestrator:3007
const AI_API_BASE = '/api/ai';

/**
 * 读取文件内容为base64
 */
async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // 去掉data:xxx;base64,前缀
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 流式聊天
 */
export async function streamChat(
  request: ChatRequest,
  onEvent: (event: StreamEvent) => void,
  onError?: (error: Error) => void,
  onComplete?: () => void,
): Promise<void> {
  try {
    // 处理文件：如果有原始File对象，读取内容转为base64
    const filesWithContent = await Promise.all(
      (request.files || []).map(async (f) => {
        if (f.file && !f.content) {
          // 读取文件内容
          const content = await readFileAsBase64(f.file);
          return {
            fileId: f.fileId,
            fileName: f.fileName,
            mimeType: f.mimeType,
            size: f.size,
            content,
          };
        }
        return {
          fileId: f.fileId,
          fileName: f.fileName,
          mimeType: f.mimeType,
          size: f.size,
          content: f.content,
        };
      })
    );

    const response = await fetch(`${AI_API_BASE}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: request.message,
        sessionId: request.sessionId,
        modelId: request.modelId,
        files: filesWithContent,
        config: request.config, // 包含mode等配置
      }),
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
    onError?.(error instanceof Error ? error : new Error('Unknown error'));
  }
}

/**
 * 获取可用模型列表
 */
export async function getAvailableModels(): Promise<AIModel[]> {
  try {
    const response = await fetch(`${AI_API_BASE}/models`);
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

    const response = await fetch(`${AI_API_BASE}/chat/upload`, {
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
    const response = await fetch(`${AI_API_BASE}/chat/history/${sessionId}`);
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