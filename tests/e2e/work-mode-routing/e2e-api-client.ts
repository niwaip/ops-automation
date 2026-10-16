import fs from 'node:fs';
import path from 'node:path';

export interface ChatStreamResponse {
  statusCode: number;
  events: any[];
  traceId?: string;
  executionId?: string;
  matchedCapabilities: string[];
  executionStatus?: string;
  waitingInputPrompt?: string;
  observationContent: string;
  llmContent: string;
  error?: string;
  rawText: string;
}

export interface ChatFilePayload {
  fileName: string;
  fileSize: number;
  fileType: string;
  fileBase64: string;
}

export interface SendChatOptions {
  message: string;
  sessionId?: string;
  executionId?: string;
  files?: ChatFilePayload[];
  mode?: string;
  webSearch?: boolean;
  workspaceSearch?: boolean;
  modelId?: string;
}

const TOKEN_CACHE = new Map<string, string>();

export async function getAuthToken(username = 'test', password = 'test123'): Promise<string> {
  const cacheKey = `${username}:${password}`;
  if (TOKEN_CACHE.has(cacheKey)) {
    return TOKEN_CACHE.get(cacheKey)!;
  }
  const res = await fetch('http://127.0.0.1:3001/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    throw new Error(`Login failed for ${username}: HTTP ${res.status}`);
  }
  const data = await res.json();
  TOKEN_CACHE.set(cacheKey, data.accessToken);
  return data.accessToken;
}

export async function sendChatStream(
  token: string,
  options: SendChatOptions
): Promise<ChatStreamResponse> {
  const sessionId = options.sessionId || `wm-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const payload: any = {
    message: options.message,
    sessionId,
    config: {
      mode: options.mode || 'task',
      thinking: true,
      webSearch: options.webSearch ?? false,
      workspaceSearch: options.workspaceSearch ?? false,
      ...(options.modelId ? { modelId: options.modelId } : {}),
    },
  };

  if (options.executionId) {
    payload.executionId = options.executionId;
  }
  if (options.files && options.files.length > 0) {
    payload.files = options.files;
  }

  const res = await fetch('http://127.0.0.1:3007/ai/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const rawText = await res.text();
  const events: any[] = [];
  let traceId: string | undefined;
  let executionId: string | undefined;
  const matchedCapabilities: string[] = [];
  let executionStatus: string | undefined;
  let waitingInputPrompt: string | undefined;
  let observationContent = '';
  let llmContent = '';
  let error: string | undefined;

  for (const line of rawText.split('\n')) {
    if (line.startsWith('data: ')) {
      try {
        const ev = JSON.parse(line.slice(6));
        events.push(ev);
        if (ev.traceId) traceId = ev.traceId;
        if (ev.data?.traceId) traceId = ev.data.traceId;

        if (ev.type === 'thought') {
          const capMatch =
            ev.content?.match(/已匹配到技能:\s*([^，,\n]+)/) ||
            ev.content?.match(/已识别到技能:\s*([^，,\n]+)/);
          if (capMatch && !matchedCapabilities.includes(capMatch[1].trim())) {
            matchedCapabilities.push(capMatch[1].trim());
          }
          const skillMatches = ev.content?.matchAll(/Skill:\s*([a-zA-Z0-9._-]+)/g);
          if (skillMatches) {
            for (const m of skillMatches) {
              if (m[1] && !matchedCapabilities.includes(m[1])) matchedCapabilities.push(m[1]);
            }
          }
          if (Array.isArray(ev.data?.deterministicPlan?.nodes)) {
            for (const node of ev.data.deterministicPlan.nodes) {
              const id = node.skillId || node.operationId || node.nodeId;
              if (id && !matchedCapabilities.includes(id)) matchedCapabilities.push(id);
            }
          }
          const execIdMatch = ev.content?.match(/执行单 ID:?\s*`?([0-9a-fA-F-]+)`?/);
          if (execIdMatch && !executionId) {
            executionId = execIdMatch[1];
          }
          const statusMatch = ev.content?.match(/任务状态变更为:\s*(\w+)/);
          if (statusMatch) executionStatus = statusMatch[1];
        }

        if (ev.type === 'action') {
          const actMatch = ev.content?.match(/正在执行：\s*([a-zA-Z0-9._-]+)/);
          if (actMatch && !matchedCapabilities.includes(actMatch[1].trim())) {
            matchedCapabilities.push(actMatch[1].trim());
          }
        }

        if (ev.type === 'waiting_input') {
          if (ev.data?.executionId) executionId = ev.data.executionId;
          waitingInputPrompt = ev.data?.prompt || ev.content;
          executionStatus = 'waiting_input';
        }

        if (ev.type === 'result') {
          if (ev.data?.executionId) executionId = ev.data.executionId;
          if (ev.data?.status) executionStatus = ev.data.status;
          if (ev.data?.skillId && !matchedCapabilities.includes(ev.data.skillId)) {
            matchedCapabilities.push(ev.data.skillId);
          }
          if (Array.isArray(ev.data?.businessData?.capabilitiesUsed)) {
            for (const c of ev.data.businessData.capabilitiesUsed) {
              const name = c.id || c.name;
              if (name && !matchedCapabilities.includes(name)) matchedCapabilities.push(name);
            }
          }
          if (Array.isArray(ev.data?.capabilitiesUsed)) {
            for (const c of ev.data.capabilitiesUsed) {
              const name = c.id || c.name;
              if (name && !matchedCapabilities.includes(name)) matchedCapabilities.push(name);
            }
          }
          if (Array.isArray(ev.data?.plan?.steps)) {
            for (const s of ev.data.plan.steps) {
              const name = s.skill_name || s.skill_id;
              if (name && !matchedCapabilities.includes(name)) matchedCapabilities.push(name);
            }
          }
          if (typeof ev.content === 'string' && ev.content) {
            observationContent += '\n' + ev.content;
          }
          if (typeof ev.data?.chatSummary === 'string') {
            observationContent += '\n' + ev.data.chatSummary;
          }
          if (typeof ev.data?.resultSummary === 'string') {
            observationContent += '\n' + ev.data.resultSummary;
          }
          if (typeof ev.data?.summary === 'string') {
            observationContent += '\n' + ev.data.summary;
          }
        }

        if (ev.type === 'observation' && typeof ev.content === 'string') {
          observationContent += '\n' + ev.content;
        }

        if (ev.type === 'content' && typeof ev.content === 'string') {
          llmContent += ev.content;
        }

        if (ev.type === 'error') {
          error = ev.content || ev.data?.errorMessage;
        }
      } catch (e) {
        // ignore parse error on partial lines
      }
    }
  }

  return {
    statusCode: res.status,
    events,
    traceId,
    executionId,
    matchedCapabilities,
    executionStatus,
    waitingInputPrompt,
    observationContent: observationContent.trim(),
    llmContent: llmContent.trim(),
    error,
    rawText,
  };
}

export async function fetchControlPlaneExecution(token: string, executionId: string): Promise<any> {
  const res = await fetch(`http://127.0.0.1:3003/api/executions/${executionId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return await res.json();
}

export function getFixtureContent(): { content: string; buffer: Buffer; base64: string } {
  const fixturePath = path.resolve(process.cwd(), 'tests/e2e/work-mode-routing/fixtures/source.md');
  const buffer = fs.readFileSync(fixturePath);
  return {
    content: buffer.toString('utf-8'),
    buffer,
    base64: buffer.toString('base64'),
  };
}
