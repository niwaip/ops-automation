import {
  CHAT_TASK_STATUS,
  CONTENT_PART_TYPE,
  type ChatContentPart,
} from '@ops/backend-ai-chat-protocol';
import type {
  ChatMessage,
  ChatProgressLog,
  ChatSession,
  LLMRateLimit,
  LLMUsage,
  NormalizedChatExecutionResult,
  StreamEvent,
  StreamEventType,
} from '../../types/chat.types.js';
import { StreamEventType as StreamEventTypeValue } from '../../types/chat.types.js';

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined;

const compactText = (value: string, maxLength: number): string => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trim()}…`;
};

const sanitizeDisplayUrl = (value?: string): string | undefined => {
  if (!value) {
    return undefined;
  }
  return value.replace(/`/g, '').trim();
};

const FAILURE_STATUSES = new Set(['failed', 'error', 'cancelled', 'rolled_back']);

const resolveFailureMessageFromRecord = (record: Record<string, unknown>): string | undefined =>
  asString(record.failureReason) ||
  asString(record.errorMessage) ||
  asString(record.error) ||
  asString(record.message) ||
  asString(record.output) ||
  asString(record.detailText) ||
  asString(record.body) ||
  asString(record.summary);

const inferFailureReason = (value: unknown, depth = 0): string | undefined => {
  if (depth > 4) {
    return undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nestedFailure = inferFailureReason(item, depth + 1);
      if (nestedFailure) {
        return nestedFailure;
      }
    }
    return undefined;
  }

  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const status = asString(record.status)?.toLowerCase();
  const success = typeof record.success === 'boolean' ? record.success : undefined;
  if (success === false || (status && FAILURE_STATUSES.has(status))) {
    return resolveFailureMessageFromRecord(record) || '任务执行失败';
  }

  for (const nestedValue of Object.values(record)) {
    const nestedFailure = inferFailureReason(nestedValue, depth + 1);
    if (nestedFailure) {
      return nestedFailure;
    }
  }

  return undefined;
};

export const normalizeMissingInputs = (
  value: unknown
): NonNullable<NonNullable<ChatMessage['metadata']>['missingInputs']> | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value.reduce<NonNullable<NonNullable<ChatMessage['metadata']>['missingInputs']>>(
    (acc, item) => {
      const record = asRecord(item);
      if (!record) {
        return acc;
      }
      acc.push({
        name: asString(record.name),
        description: asString(record.description),
        missing: typeof record.missing === 'boolean' ? record.missing : undefined,
      });
      return acc;
    },
    []
  );

  return items.length > 0 ? items : undefined;
};

export const normalizeUsage = (value: unknown): LLMUsage | undefined => {
  const record = asRecord(value);
  if (
    !record ||
    typeof record.prompt_tokens !== 'number' ||
    typeof record.completion_tokens !== 'number' ||
    typeof record.total_tokens !== 'number'
  ) {
    return undefined;
  }

  const completionDetails = asRecord(record.completion_tokens_details);
  return {
    prompt_tokens: record.prompt_tokens,
    completion_tokens: record.completion_tokens,
    total_tokens: record.total_tokens,
    completion_tokens_details:
      completionDetails && typeof completionDetails.reasoning_tokens === 'number'
        ? { reasoning_tokens: completionDetails.reasoning_tokens }
        : undefined,
  };
};

export const normalizeRateLimit = (value: unknown): LLMRateLimit | undefined => {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  return {
    requests_limit: typeof record.requests_limit === 'number' ? record.requests_limit : undefined,
    requests_remaining:
      typeof record.requests_remaining === 'number' ? record.requests_remaining : undefined,
    requests_reset: asString(record.requests_reset),
    tokens_limit: typeof record.tokens_limit === 'number' ? record.tokens_limit : undefined,
    tokens_remaining:
      typeof record.tokens_remaining === 'number' ? record.tokens_remaining : undefined,
    tokens_reset: asString(record.tokens_reset),
  };
};

export const normalizeResultArtifacts = (
  value: unknown
): NonNullable<NonNullable<ChatMessage['metadata']>['artifacts']> | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const artifacts = value.reduce<NonNullable<NonNullable<ChatMessage['metadata']>['artifacts']>>(
    (acc, item) => {
      const record = asRecord(item);
      if (!record) {
        return acc;
      }
      acc.push({
        type: asString(record.type),
        name: asString(record.name),
        label: asString(record.label),
        downloadUrl: asString(record.downloadUrl),
        url: asString(record.url),
        path: asString(record.path),
        mimeType: asString(record.mimeType),
      });
      return acc;
    },
    []
  );

  return artifacts.length > 0 ? artifacts : undefined;
};

export const normalizeNormalizedResult = (
  value: unknown
): NormalizedChatExecutionResult | undefined => {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  return {
    resultType: asString(record.resultType),
    title: asString(record.title),
    summary: asString(record.summary),
    body: asString(record.body),
    summaryFormat: record.summaryFormat === 'markdown' ? 'markdown' : 'plain_text',
    detailText: asString(record.detailText),
    detailFormat: record.detailFormat === 'markdown' ? 'markdown' : 'plain_text',
    structuredData: record.structuredData,
    artifacts: normalizeResultArtifacts(record.artifacts),
    downloadUrl: asString(record.downloadUrl),
    temporalLink: asString(record.temporalLink),
    hasBusinessResult: record.hasBusinessResult === true,
    envelope: asRecord(record.envelope),
    rawResult: record.rawResult,
  };
};

export const buildTaskProgressLog = (
  event: StreamEvent,
  data: Record<string, unknown> | undefined,
  normalizedResult: NormalizedChatExecutionResult | undefined
): ChatProgressLog | undefined => {
  if (event.type === StreamEventTypeValue.THOUGHT) {
    const text = compactText(event.content.replace(/[🚀📥]/g, '').trim(), 100);
    return text ? { stage: 'thought', text } : undefined;
  }

  if (event.type === StreamEventTypeValue.ACTION) {
    const text = compactText(event.content, 100);
    return text ? { stage: 'action', text } : undefined;
  }

  if (event.type !== StreamEventTypeValue.OBSERVATION) {
    return undefined;
  }

  const result = asRecord(data?.result);
  const command = asString(result?.command);
  const pageTitle = asString(result?.pageTitle);
  const pageUrl = sanitizeDisplayUrl(asString(result?.pageUrl));
  const resultData = asRecord(result?.data);
  const duration = typeof resultData?.duration === 'number' ? resultData.duration : undefined;
  const summary = normalizedResult?.summary || normalizedResult?.detailText || normalizedResult?.body;
  const failureReason =
    inferFailureReason(result) ||
    inferFailureReason(resultData) ||
    inferFailureReason(normalizedResult?.structuredData) ||
    inferFailureReason(normalizedResult?.rawResult);
  const parts = [failureReason ? '步骤执行失败' : '步骤执行成功'];
  if (command) {
    parts.push(`命令：${command}`);
  }
  if (pageTitle) {
    parts.push(`页面：${pageTitle}`);
  } else if (pageUrl) {
    parts.push(`页面：${pageUrl}`);
  }
  if (typeof duration === 'number' && Number.isFinite(duration) && duration > 0) {
    parts.push(`耗时 ${duration} ms`);
  }
  if (summary) {
    const compactSummary = compactText(summary, 80);
    if (compactSummary && compactSummary !== '步骤执行成功' && compactSummary !== '步骤执行失败') {
      parts.push(compactSummary);
    }
  }
  if (failureReason) {
    parts.push(compactText(failureReason, 80));
  }

  return {
    stage: 'observation',
    text: compactText(parts.join('，'), 160),
  };
};

const resolveTaskStatus = (
  eventType: StreamEventType,
  mode?: 'chat' | 'task',
  data?: Record<string, unknown>
): NonNullable<NonNullable<ChatMessage['metadata']>['taskStatus']> | undefined => {
  const executionStatus = asString(data?.status);
  if (mode === 'task' && executionStatus) {
    switch (executionStatus) {
      case 'waiting_input':
        return CHAT_TASK_STATUS.WAITING_INPUT;
      case 'pending_approval':
        return CHAT_TASK_STATUS.PENDING_APPROVAL;
      case 'human_control':
        return CHAT_TASK_STATUS.HUMAN_CONTROL;
      case 'failed':
      case 'cancelled':
      case 'rolled_back':
        return CHAT_TASK_STATUS.FAILED;
      case 'succeeded':
      case 'completed':
        return CHAT_TASK_STATUS.COMPLETED;
      case 'draft':
      case 'queued':
      case 'running':
      case 'paused':
        return CHAT_TASK_STATUS.RUNNING;
      default:
        break;
    }
  }

  switch (eventType) {
    case StreamEventTypeValue.WAITING_INPUT:
      return CHAT_TASK_STATUS.WAITING_INPUT;
    case StreamEventTypeValue.PENDING_APPROVAL:
      return CHAT_TASK_STATUS.PENDING_APPROVAL;
    case StreamEventTypeValue.HUMAN_CONTROL:
      return CHAT_TASK_STATUS.HUMAN_CONTROL;
    case StreamEventTypeValue.ERROR:
      return CHAT_TASK_STATUS.FAILED;
    case StreamEventTypeValue.RESULT:
      return mode === 'task' ? CHAT_TASK_STATUS.COMPLETED : undefined;
    default:
      return mode === 'task' ? CHAT_TASK_STATUS.RUNNING : undefined;
  }
};

const isTerminalTaskResult = (
  mode: 'chat' | 'task' | undefined,
  data: Record<string, unknown> | undefined
): boolean => {
  if (mode !== 'task') {
    return true;
  }

  const executionId = asString(data?.executionId);
  const executionStatus = asString(data?.status);

  if (!executionId) {
    return true;
  }

  return (
    executionStatus === 'succeeded' ||
    executionStatus === 'completed' ||
    executionStatus === 'failed' ||
    executionStatus === 'cancelled' ||
    executionStatus === 'rolled_back'
  );
};

const buildContentParts = (
  event: StreamEvent,
  data: Record<string, unknown> | undefined,
  normalizedResult: NormalizedChatExecutionResult | undefined
): ChatContentPart[] | undefined => {
  const parts: ChatContentPart[] = [];
  const executionId = asString(data?.executionId);

  if (event.content.trim()) {
    parts.push({ type: CONTENT_PART_TYPE.TEXT, text: event.content });
  }

  if (event.type === StreamEventTypeValue.RESULT && normalizedResult?.structuredData) {
    parts.push({
      type: CONTENT_PART_TYPE.STRUCTURED_RESULT,
      schemaType: normalizedResult.resultType || 'generic',
      data: normalizedResult.structuredData,
    });
  }

  if (
    executionId &&
    (event.type === StreamEventTypeValue.WAITING_INPUT ||
      event.type === StreamEventTypeValue.PENDING_APPROVAL ||
      event.type === StreamEventTypeValue.HUMAN_CONTROL ||
      event.type === StreamEventTypeValue.RESULT)
  ) {
    parts.push({
      type: CONTENT_PART_TYPE.TASK_CARD,
      taskStatus: resolveTaskStatus(event.type, 'task') || CHAT_TASK_STATUS.RUNNING,
      executionId,
    });
  }

  if (executionId && event.type === StreamEventTypeValue.PENDING_APPROVAL) {
    parts.push({
      type: CONTENT_PART_TYPE.APPROVAL_CARD,
      executionId,
      riskLevel: asString(data?.riskLevel),
    });
  }

  const downloadUrl = asString(data?.downloadUrl) || normalizedResult?.downloadUrl;
  if (downloadUrl) {
    parts.push({
      type: CONTENT_PART_TYPE.DEEPLINK,
      url: downloadUrl,
      label: '下载结果',
    });
  }

  return parts.length > 0 ? parts : undefined;
};

export interface ReduceChatStreamEventParams {
  event: StreamEvent;
  accumulatedContent: string;
  mode?: 'chat' | 'task';
}

export interface ReduceChatStreamEventResult {
  accumulatedContent: string;
  messagePatch: Partial<ChatMessage>;
  progressLog?: ChatProgressLog;
  sessionPatch?: Partial<ChatSession>;
}

export const reduceChatStreamEvent = ({
  event,
  accumulatedContent,
  mode,
}: ReduceChatStreamEventParams): ReduceChatStreamEventResult => {
  const data = asRecord(event.data);
  const normalizedResult = normalizeNormalizedResult(data?.normalizedResult);
  const progressLog = mode === 'task' ? buildTaskProgressLog(event, data, normalizedResult) : undefined;
  const inferredFailureReason =
    event.type === StreamEventTypeValue.RESULT
      ? inferFailureReason(normalizedResult?.structuredData) ||
        inferFailureReason(normalizedResult?.rawResult) ||
        inferFailureReason(data?.result) ||
        inferFailureReason(data)
      : undefined;
  const resolvedTaskStatus = resolveTaskStatus(event.type, mode, data);
  const taskStatus =
    mode === 'task' && inferredFailureReason ? CHAT_TASK_STATUS.FAILED : resolvedTaskStatus;
  const terminalTaskResult = event.type === StreamEventTypeValue.RESULT && isTerminalTaskResult(mode, data);

  let nextAccumulatedContent = accumulatedContent;
  if (
    event.type === StreamEventTypeValue.THOUGHT ||
    event.type === StreamEventTypeValue.ACTION ||
    event.type === StreamEventTypeValue.OBSERVATION
  ) {
    if (mode !== 'task') {
      const prefix =
        event.type === StreamEventTypeValue.THOUGHT
          ? '【思考】'
          : event.type === StreamEventTypeValue.ACTION
            ? '【行动】'
            : '【观察】';
      nextAccumulatedContent = `${accumulatedContent}${accumulatedContent ? '\n' : ''}${prefix}${event.content}`;
    }
  } else if (event.type === StreamEventTypeValue.RESULT && mode === 'chat') {
    nextAccumulatedContent = event.content;
  } else if (
    event.type === StreamEventTypeValue.ERROR ||
    event.type === StreamEventTypeValue.WAITING_INPUT ||
    event.type === StreamEventTypeValue.PENDING_APPROVAL ||
    event.type === StreamEventTypeValue.HUMAN_CONTROL
  ) {
    nextAccumulatedContent = accumulatedContent || event.content;
  }

  const nextSessionStatus: ChatSession['status'] | undefined =
    data?.status === 'archived' ? 'archived' : data?.status === 'active' ? 'active' : undefined;
  const sessionPatch =
    event.type === StreamEventTypeValue.SESSION_PATCH
      ? {
          title: asString(data?.title),
          updatedAt: asString(data?.updatedAt),
          status: nextSessionStatus,
        }
      : undefined;

  if (event.type === StreamEventTypeValue.SESSION_PATCH) {
    return {
      accumulatedContent,
      progressLog,
      sessionPatch,
      messagePatch: {},
    };
  }

  return {
    accumulatedContent: nextAccumulatedContent,
    progressLog,
    sessionPatch,
    messagePatch: {
      content: nextAccumulatedContent,
      contentParts: buildContentParts(event, data, normalizedResult),
      isStreaming:
        (event.type !== StreamEventTypeValue.RESULT || (mode === 'task' && !terminalTaskResult)) &&
        event.type !== StreamEventTypeValue.ERROR &&
        event.type !== StreamEventTypeValue.WAITING_INPUT &&
        event.type !== StreamEventTypeValue.PENDING_APPROVAL &&
        event.type !== StreamEventTypeValue.HUMAN_CONTROL,
      metadata: {
        mode,
        showThinking:
          mode === 'task'
            ? true
            : typeof data?.thinking === 'boolean'
              ? data.thinking
              : undefined,
        taskStatus,
        executionId: asString(data?.executionId),
        executionStatus: asString(data?.status),
        resultType: asString(data?.resultType) || normalizedResult?.resultType,
        resultTitle: asString(data?.resultTitle) || normalizedResult?.title,
        usage: normalizeUsage(data?.usage),
        rateLimit: normalizeRateLimit(data?.rateLimit),
        finalSummary:
          event.type === StreamEventTypeValue.WAITING_INPUT ||
          event.type === StreamEventTypeValue.PENDING_APPROVAL ||
          event.type === StreamEventTypeValue.HUMAN_CONTROL ||
          event.type === StreamEventTypeValue.RESULT
            ? asString(data?.resultSummary) ||
              normalizedResult?.detailText ||
              normalizedResult?.summary ||
              normalizedResult?.body ||
              event.content
            : undefined,
        finalResult:
          event.type === StreamEventTypeValue.RESULT &&
          mode === 'task' &&
          terminalTaskResult &&
          !inferredFailureReason
            ? normalizedResult?.detailText ||
              normalizedResult?.body ||
              normalizedResult?.summary ||
              event.content
            : undefined,
        finalResultData:
          event.type === StreamEventTypeValue.RESULT && (mode !== 'task' || terminalTaskResult)
            ? normalizedResult?.structuredData ?? data?.result ?? data
            : undefined,
        errorMessage:
          event.type === StreamEventTypeValue.ERROR
            ? event.content
            : inferredFailureReason,
        failureReason:
          event.type === StreamEventTypeValue.ERROR
            ? asString(data?.failureReason) || event.content
            : inferredFailureReason
              ? inferredFailureReason
            : undefined,
        missingInputs: normalizeMissingInputs(data?.missingInputs),
        hasBusinessResult:
          !inferredFailureReason &&
          (normalizedResult?.hasBusinessResult === true || data?.hasBusinessResult === true),
        downloadUrl: asString(data?.downloadUrl) || normalizedResult?.downloadUrl,
        temporalLink: asString(data?.temporalLink) || normalizedResult?.temporalLink,
        artifacts: normalizeResultArtifacts(data?.artifacts) || normalizedResult?.artifacts,
        normalizedResult,
      },
    },
  };
};
