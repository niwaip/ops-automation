import * as fs from 'node:fs';
import * as path from 'node:path';

export const BASE_URL = process.env.OPS_PLATFORM_URL || 'http://127.0.0.1:3001';
export const AI_URL = process.env.AI_ORCHESTRATOR_URL || 'http://127.0.0.1:3007';
export const STORAGE_ROOT = path.resolve(process.cwd(), 'data/storage/workspaces');
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let cachedToken = null;

export async function login(username = 'admin', password = 'admin123') {
  if (cachedToken) return cachedToken;
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    throw new Error(`Login failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  cachedToken = data.accessToken;
  return cachedToken;
}

export async function apiRequest(endpoint, method = 'GET', body = null, token = cachedToken) {
  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`${method} ${endpoint} returned ${res.status}: ${errText}`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return await res.json();
  }
  return await res.text();
}

export async function getMyWorkspaces(token) {
  return await apiRequest('/workspaces/my', 'GET', null, token);
}

export async function saveTextNote(dto, token) {
  return await apiRequest('/workspaces/my/notes', 'POST', dto, token);
}

export async function getNode(workspaceId, nodeId, token) {
  return await apiRequest(`/workspaces/${workspaceId}/nodes/${nodeId}`, 'GET', null, token);
}

export async function getNodes(workspaceId, parentId = null, token) {
  const query = parentId ? `?parentId=${encodeURIComponent(parentId)}` : '';
  return await apiRequest(`/workspaces/${workspaceId}/nodes${query}`, 'GET', null, token);
}

export async function getFilePreview(workspaceId, nodeId, token) {
  return await apiRequest(`/workspaces/${workspaceId}/nodes/${nodeId}/preview`, 'GET', null, token);
}

export async function searchFiles(query, token) {
  return await apiRequest(`/workspaces/search?q=${encodeURIComponent(query)}`, 'GET', null, token);
}

export async function searchContent(query, workspaceId, token) {
  const wsParam = workspaceId ? `&workspaceId=${encodeURIComponent(workspaceId)}` : '';
  return await apiRequest(`/workspaces/search-content?q=${encodeURIComponent(query)}${wsParam}`, 'GET', null, token);
}

export async function deleteNode(workspaceId, nodeId, token) {
  return await apiRequest(`/workspaces/${workspaceId}/nodes/${nodeId}`, 'DELETE', null, token);
}

export function checkStorageFile(storagePath) {
  if (!storagePath) return { exists: false, error: 'No storage path' };
  const fullPath = path.join(STORAGE_ROOT, storagePath);
  const exists = fs.existsSync(fullPath);
  if (!exists) {
    return { exists: false, fullPath };
  }
  const stat = fs.statSync(fullPath);
  const content = stat.size < 500000 ? fs.readFileSync(fullPath, 'utf-8') : null;
  return {
    exists: true,
    fullPath,
    sizeBytes: stat.size,
    contentPreview: content ? content.slice(0, 500) : null,
  };
}

/**
 * 轮询等待后台异步提炼完成（具有确定性完成判定，不假绿）
 */
export async function waitForAiRefinement(workspaceId, nodeId, token, maxWaitMs = 25000) {
  const start = Date.now();
  let lastNode = null;

  while (Date.now() - start < maxWaitMs) {
    try {
      lastNode = await getNode(workspaceId, nodeId, token);
      if (lastNode && lastNode.digest && Boolean(lastNode.digest.summary)) {
        return {
          node: lastNode,
          success: true,
          timeout: false,
          elapsedMs: Date.now() - start,
        };
      }
    } catch {
      // ignore transient poll errors
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
  }

  return {
    node: lastNode,
    success: false,
    timeout: true,
    elapsedMs: Date.now() - start,
  };
}

/**
 * 等待所有后台任务平稳收敛终态，防止清理时触发 Record to update not found 竞态
 */
export async function waitForAllNodesToSettle(workspaceId, nodeIds, token, maxWaitMs = 45000) {
  const start = Date.now();
  const pending = new Set(nodeIds);

  while (pending.size > 0 && Date.now() - start < maxWaitMs) {
    for (const id of Array.from(pending)) {
      try {
        const node = await getNode(workspaceId, id, token);
        if (node && node.digest && Boolean(node.digest.summary)) {
          pending.delete(id);
        }
      } catch (err) {
        // 如果已明确被物理删除(404)，从 pending 移除；网络暂态错误则继续保留等待
        if (err.message?.includes('404') || err.message?.includes('not found')) {
          pending.delete(id);
        }
      }
    }
    if (pending.size > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // 给落盘与缓存留出充裕缓冲窗口
  await new Promise((resolve) => setTimeout(resolve, 2000));

  return {
    settled: pending.size === 0,
    pending: Array.from(pending),
    elapsedMs: Date.now() - start,
  };
}

/**
 * 发送真实流式聊天请求（触发真正的 Agent 推理与产物生成）
 */
export async function sendRealChatStream(token, options) {
  const sessionId = options.sessionId || `chat-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const payload = {
    message: options.message,
    sessionId,
    config: {
      mode: options.mode || 'chat',
      thinking: true,
      webSearch: false,
      workspaceSearch: false,
      ...(options.modelId ? { modelId: options.modelId } : {}),
    },
  };

  const res = await fetch(`${AI_URL}/ai/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Real chat stream failed: HTTP ${res.status} ${await res.text()}`);
  }

  const rawText = await res.text();
  const events = [];
  let executionId;
  let finalContent = '';
  let streamError = null;

  for (const line of rawText.split('\n')) {
    if (line.startsWith('data: ')) {
      try {
        const ev = JSON.parse(line.slice(6));
        events.push(ev);
        if (ev.type === 'error' || ev.event === 'error') {
          streamError = ev.content || ev.message || ev.data?.message || JSON.stringify(ev);
        }
        if (ev.type === 'result' && ev.content) {
          finalContent = ev.content;
        }
        if (ev.data?.executionId) {
          executionId = ev.data.executionId;
        }
        if (ev.executionId) {
          executionId = ev.executionId;
        }
      } catch {
        // ignore parse error on heartbeats
      }
    }
  }

  if (streamError) {
    throw new Error(`Real chat stream failed with SSE error: ${streamError}`);
  }

  if (!finalContent) {
    // fallback to observation or thought content if result not explicit
    for (const ev of [...events].reverse()) {
      if (ev.content && (ev.type === 'observation' || ev.type === 'result')) {
        finalContent = ev.content;
        break;
      }
    }
  }

  if (!finalContent) {
    throw new Error(`Real chat stream produced no content. Events: ${events.length}, Raw: ${rawText.slice(0, 300)}`);
  }

  return {
    content: finalContent,
    sessionId,
    executionId,
    events,
    rawText,
  };
}
