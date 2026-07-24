import {
  buildBrowserOutputDisplay,
  extractBrowserExecutionResult,
} from '@/features/executions/shared/browser';
import type { PromptDebugPayload } from '../types';

interface BrowserExecutionOptions {
  taskStatus?: string;
  executionStatus?: string;
  runtimeType?: string;
}

export const parseMessageContent = (content: string): { thoughts: string[]; answer: string } => {
  const thoughts: string[] = [];
  let answer = content;

  // Legacy fallback for older chat payloads that still inline thought/action
  // tags in plain text. Remove once all producers emit independent
  // thought/action/observation stream events.
  const thoughtRegex = /【思考】([^\n]*(?:\n(?!【)[^\n]*)*)/g;
  const actionRegex = /【行动】([^\n]*(?:\n(?!【)[^\n]*)*)/g;
  const observationRegex = /【观察】([^\n]*(?:\n(?!【)[^\n]*)*)/g;
  const thinkTagRegex = /<think>([\s\S]*?)<\/think>/gi;

  let match;
  while ((match = thoughtRegex.exec(content)) !== null) {
    thoughts.push(`💭 思考: ${match[1].trim()}`);
  }
  while ((match = actionRegex.exec(content)) !== null) {
    thoughts.push(`🔧 行动: ${match[1].trim()}`);
  }
  while ((match = thinkTagRegex.exec(content)) !== null) {
    const thought = match[1].trim();
    if (thought) {
      thoughts.push(`💭 思考: ${thought}`);
    }
  }
  while (observationRegex.exec(content) !== null) {
    // Observation content is treated as model output instead of thought steps.
  }

  answer = content
    .replace(thoughtRegex, '')
    .replace(actionRegex, '')
    .replace(observationRegex, '')
    .replace(thinkTagRegex, '')
    .replace(/❌ 错误: [^\n]+/g, '')
    .trim();

  if (!answer) {
    const obsMatch = content.match(/【观察】([^\n]*(?:\n(?!【)[^\n]*)*)/);
    if (obsMatch) {
      answer = obsMatch[1].trim();
    }
  }

  return { thoughts, answer };
};

const SENSITIVE_RESULT_KEYS = new Set([
  'promptDebug',
  'llmResponseText',
  'llmCalls',
  'llmRequestMessages',
  'systemPrompt',
  'userPrompt',
]);

const URL_PATTERN = /https?:\/\/[^\s)>\]}]+/gi;

export const stripThinkingContent = (content?: string): string => {
  const raw = String(content || '').trim();
  if (!raw) {
    return '';
  }

  const { answer } = parseMessageContent(raw);
  const normalizedAnswer = maskVisibleUrls(answer.replace(/<\/?think>/gi, '').trim());
  if (normalizedAnswer) {
    return normalizedAnswer;
  }

  return maskVisibleUrls(raw.replace(/<\/?think>/gi, '').trim());
};

const stripTaskStatusBoilerplate = (content?: string): string => {
  const raw = String(content || '').trim();
  if (!raw) {
    return '';
  }

  return raw
    .replace(/^\s*任务(?:已)?完成[：:，,\s-]*/i, '')
    .replace(/^\s*任务已提交[：:，,\s-]*/i, '')
    .replace(/^\s*以下是(?:任务)?结果[：:，,\s-]*/i, '')
    .replace(/^\s*返回结果如下[：:，,\s-]*/i, '')
    .trim();
};

const maskVisibleUrls = (content?: string): string => {
  const raw = String(content || '');
  if (!raw) {
    return '';
  }

  return raw.replace(URL_PATTERN, '链接见下方');
};

const sanitizeStructuredResultValue = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return stripThinkingContent(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeStructuredResultValue(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
    (acc, [key, entryValue]) => {
      if (SENSITIVE_RESULT_KEYS.has(key)) {
        acc[key] = '[redacted]';
        return acc;
      }

      acc[key] = sanitizeStructuredResultValue(entryValue);
      return acc;
    },
    {}
  );
};

export const formatExecutionStatus = (status?: string): string | null => {
  if (!status) return null;

  const statusMap: Record<string, string> = {
    succeeded: '已完成',
    failed: '失败',
    cancelled: '已取消',
    waiting_input: '等待输入',
    running: '执行中',
    queued: '排队中',
    pending_approval: '待审批',
    human_control: '待人工处理',
  };

  return statusMap[status] || status;
};

export const toStructuredResultText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;

  const sanitizedValue = sanitizeStructuredResultValue(value);

  if (typeof value === 'string') {
    return (
      maskVisibleUrls(stripTaskStatusBoilerplate(String(sanitizedValue || '')).trim()).trim() || null
    );
  }

  try {
    return JSON.stringify(sanitizedValue, null, 2);
  } catch {
    return String(sanitizedValue);
  }
};

export const beautifyText = (text: string, useDivider = true): string => {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n\s*\n\s*\n+/g, useDivider ? '\n\n' : '\n\n')
    .replace(/\n\s*\n+/g, '\n\n')
    .replace(/^[\s\n]+|[\s\n]+$/g, '');
};

export const buildPromptDebugClipboardText = (promptDebug?: PromptDebugPayload): string => {
  if (!promptDebug) {
    return '';
  }

  return [
    '## Debug Source',
    promptDebug.debugSource || '',
    '',
    '## System Prompt',
    promptDebug.systemPrompt || '',
    '',
    '## User Prompt',
    promptDebug.userPrompt || '',
    '',
    '## Notes',
    (promptDebug.notes || []).join('\n'),
    '',
    '## LLM Request Messages',
    JSON.stringify(promptDebug.llmRequestMessages || [], null, 2),
    '',
    '## LLM Raw Response',
    promptDebug.llmResponseText || '',
    '',
    '## LLM Calls',
    JSON.stringify(promptDebug.llmCalls || [], null, 2),
  ].join('\n');
};

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

const asString = (value: unknown): string | undefined => {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const looksLikeVerboseExecutionContent = (text?: string): boolean => {
  const raw = String(text || '').trim();
  if (!raw) return false;
  if (raw.length > 600) return true;
  return /stepResults|### Ran Playwright code|snapshotId|stdout|executedCommands|任务已完成[,，]?\s*返回结果|```json/i.test(
    raw
  );
};

const summarizeDocumentExecutionResult = (value: unknown, downloadUrl?: string): string | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const status = asString(record.status)?.toLowerCase();
  const fileName = asString(record.fileName) || asString(record.filename) || asString(record.name);
  const format = asString(record.format)?.toUpperCase();
  const isDocumentResult = Boolean(
    fileName ||
      format ||
      downloadUrl ||
      ['rendered', 'success', 'succeeded', 'completed'].includes(status || '')
  );

  if (!isDocumentResult) {
    return null;
  }

  return [
    '文档已生成。',
    ...(fileName ? [`- 文件名：${fileName}`] : []),
    ...(format ? [`- 格式：${format}`] : []),
    downloadUrl ? '- 可通过下方按钮下载查看。' : '- 可在执行详情中查看生成结果。',
  ].join('\n');
};

const hasBrowserExecutionPayload = (value: unknown): boolean => {
  const result = extractBrowserExecutionResult(value);
  if (result && result.stepResults.length > 0) {
    return true;
  }
  return getExecutionStepCount(value) !== undefined;
};

const summarizeBrowserExecutionResult = (value: unknown): string | null => {
  const result = extractBrowserExecutionResult(value);
  if (!result || result.stepResults.length === 0) {
    return null;
  }

  const lastStep = result.stepResults[result.stepResults.length - 1];
  const lastOutput = buildBrowserOutputDisplay(lastStep?.output || null);
  const snapshotCount = new Set(
    [result.snapshotId, ...result.stepResults.map((step) => step.snapshotId)].filter(
      (item): item is string => Boolean(item)
    )
  ).size;
  const finalStatus =
    lastOutput.status === 'success'
      ? '成功'
      : lastOutput.status === 'failed'
        ? '失败'
        : lastOutput.status || '已完成';
  const lastAction = lastStep?.name || lastStep?.action || lastOutput.command;

  return [
    '浏览器执行已完成。',
    `- 执行步骤：${result.stepResults.length}`,
    ...(lastAction ? [`- 最后一步：${lastAction}`] : []),
    `- 最后状态：${finalStatus}`,
    ...(snapshotCount > 0 ? [`- 快照截图：${snapshotCount} 个`] : []),
    '- 详细步骤、截图和原始输出请点击下方链接查看。',
  ].join('\n');
};

export const compactExecutionText = (text?: string, executionResultData?: unknown): string => {
  const raw = stripTaskStatusBoilerplate(stripThinkingContent(text)).trim();
  if (!raw) return '';
  if (looksLikeVerboseExecutionContent(raw) && hasBrowserExecutionPayload(executionResultData)) {
    return (
      summarizeBrowserExecutionResult(executionResultData) ||
      '浏览器执行已完成，详细信息请通过下方链接查看。'
    );
  }
  return raw;
};

export const getExecutionStepCount = (value: unknown): number | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const obj = value as Record<string, unknown>;
  const candidates = [obj.stepResults, obj.executedCommands, obj.results, obj.steps];
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0) {
      return candidate.length;
    }
  }
  return undefined;
};

export const isBrowserExecutionResult = (
  executionId: string | undefined,
  answerText: string,
  finalResultData: unknown,
  options?: BrowserExecutionOptions
): boolean => {
  if (!executionId) {
    return false;
  }
  const normalizedRuntimeType =
    typeof options?.runtimeType === 'string' ? options.runtimeType.trim().toLowerCase() : '';
  if (normalizedRuntimeType === 'browser') {
    return true;
  }
  if (options?.taskStatus === 'human_control' || options?.executionStatus === 'human_control') {
    return true;
  }
  if (hasBrowserExecutionPayload(finalResultData)) {
    return true;
  }
  return looksLikeVerboseExecutionContent(answerText) && hasBrowserExecutionPayload(answerText);
};

export const summarizeOutcomeFinalResult = (
  finalResult: string | undefined,
  finalResultData: unknown,
  downloadUrl?: string
): string | undefined => {
  if (!finalResult) {
    return undefined;
  }

  return (
    summarizeDocumentExecutionResult(finalResultData, downloadUrl) ||
    compactExecutionText(finalResult, finalResultData)
  );
};
