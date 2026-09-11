import type {
  TemplateStepExecutionPolicy,
} from '@/api/template';
import type { RecorderPatchStep } from '@/services/recorder.service';
import type {
  BrowserCommandExecutionResponse,
  BrowserCommandExecutionResult,
  CommandHistoryEntry,
  LoopScope,
  MCPCommand,
  PredefinedCommand,
  RecorderLoopDraft,
  RecorderLoopState,
  RecorderOutcomeKind,
  RecorderOutcomeStatus,
  RecorderVerification,
  TakeoverUiState,
} from './AIControls.types';

export const getFailedExecutionMessage = (payload?: BrowserCommandExecutionResponse): string => {
  const firstFailedResult = payload?.results?.find((item) => item.status === 'error');
  return firstFailedResult?.message || payload?.message || '页面操作执行失败';
};

export const isExecutionFailed = (payload?: BrowserCommandExecutionResponse): boolean => {
  if (!payload) {
    return true;
  }
  if (payload.success === false) {
    return true;
  }
  if (Array.isArray(payload.results) && payload.results.length > 0) {
    return payload.results.some((item) => item.status === 'error');
  }
  return false;
};

export const buildCompactAiReply = (
  reply?: string,
  resultPayload?: {
    execution?: BrowserCommandExecutionResponse | Record<string, unknown>;
    outcome?: {
      summary?: {
        compact?: string;
        userVisible?: string;
      };
      status?: RecorderOutcomeStatus;
      verification?: RecorderVerification;
    };
  }
): string => {
  const replyText = String(reply || '');
  const outcomeSummary =
    resultPayload?.outcome?.summary?.compact ||
    resultPayload?.outcome?.summary?.userVisible;

  if (outcomeSummary && outcomeSummary.trim().length > 0) {
    return outcomeSummary.trim();
  }

  const hasBrowserExecutionPayload = Boolean(
    resultPayload &&
      typeof resultPayload === 'object' &&
      'execution' in resultPayload &&
      Boolean(resultPayload.execution)
  );

  const looksLikeVerboseExecutionReply =
    replyText.includes('已执行') ||
    replyText.includes('成功') ||
    replyText.includes('失败') ||
    replyText.includes('执行完成');

  if (hasBrowserExecutionPayload && looksLikeVerboseExecutionReply) {
    const execution = resultPayload?.execution as BrowserCommandExecutionResponse | undefined;
    if (isExecutionFailed(execution)) {
      const reason = getFailedExecutionMessage(execution);
      return `执行遇到问题：${reason}`;
    }
    return '页面操作已执行';
  }

  if (replyText.length > 180) {
    return `${replyText.slice(0, 180)}...`;
  }
  return replyText;
};

export const buildCompactHistoryBubbleText = (entry: CommandHistoryEntry): string => {
  if (entry.type === 'user') {
    return entry.content;
  }

  const hasExecutionLikeResult = Boolean(
    entry.result &&
      (entry.result.execution ||
        entry.result.outcome ||
        (Array.isArray(entry.commands) && entry.commands.length > 0))
  );

  if (hasExecutionLikeResult && entry.result) {
    if (entry.result.outcome?.summary?.compact) {
      return entry.result.outcome.summary.compact;
    }
    const execution = entry.result?.execution as BrowserCommandExecutionResponse | undefined;
    if (isExecutionFailed(execution)) {
      const reason = getFailedExecutionMessage(execution);
      return `执行失败：${reason}`;
    }
    if (entry.result.outcome) {
      const outcome = entry.result.outcome;
      const statusText = getOutcomeStatusMeta(outcome.status).label;
      const verification = outcome.verification;
      const confText = verification?.confidence ? `置信度 ${formatRecorderConfidence(verification.confidence)}` : '';
      const verifText = verification?.success !== undefined ? (verification.success ? '验证通过' : '验证未通过') : '';
      const details = [statusText, verifText, confText].filter(Boolean).join(' · ');
      return outcome.summary?.userVisible || details || '已完成执行并验证';
    }
  }

  const compacted = buildCompactAiReply(entry.content, {
    execution: entry.result?.execution,
    outcome: entry.result?.outcome
      ? {
          summary: entry.result.outcome.summary,
          status: entry.result.outcome.status,
          verification: entry.result.outcome.verification,
        }
      : undefined,
  });

  const text = String(compacted || '').trim();
  if (text.length > 0) {
    return text;
  }
  if (Array.isArray(entry.commands) && entry.commands.length > 0) {
    return `执行了 ${entry.commands.length} 个步骤`;
  }
  if (entry.result?.screenshot) {
    return '已更新页面状态并捕获截图';
  }
  return entry.content || '已执行操作';
};

export const getLoopScopeLabel = (scope?: LoopScope): string => {
  switch (scope) {
    case 'current_table':
      return '表格行';
    case 'current_cards':
      return '卡片列表';
    case 'current_list':
    default:
      return '列表项';
  }
};

export const buildLoopSummaryText = (
  loopDraft?: RecorderLoopDraft,
  loopState?: RecorderLoopState
): string => {
  if (!loopDraft && !loopState?.hasLoopStart && !loopState?.isLoopCaptureActive) {
    return '';
  }

  const parts: string[] = [];
  const scope = loopState?.loopTargetScope || loopDraft?.target?.scope;
  if (scope) {
    parts.push(`目标: ${getLoopScopeLabel(scope)}`);
  }

  if (loopDraft?.stopWhen?.description) {
    parts.push(`终止: ${loopDraft.stopWhen.description}`);
  }

  if (typeof loopDraft?.maxIterations === 'number') {
    parts.push(`上限: ${loopDraft.maxIterations} 次`);
  }

  if (loopDraft?.eachIteration?.stepCount) {
    parts.push(`单轮步骤: ${loopDraft.eachIteration.stepCount}`);
  }

  return parts.join(' | ');
};

export const getOutcomeStatusMeta = (
  status?: RecorderOutcomeStatus
): { label: string; color: string } => {
  switch (status) {
    case 'succeeded':
      return { label: '成功', color: 'success' };
    case 'partial':
      return { label: '部分完成', color: 'warning' };
    case 'blocked':
      return { label: '阻断', color: 'error' };
    case 'failed':
      return { label: '失败', color: 'error' };
    case 'unknown':
    default:
      return { label: '未明确', color: 'default' };
  }
};

export const getOutcomeKindLabel = (kind?: RecorderOutcomeKind): string => {
  switch (kind) {
    case 'action':
      return '动作执行';
    case 'answer':
      return '信息回答';
    case 'question':
      return '需要澄清';
    default:
      return '结果反馈';
  }
};

export const getVerificationMeta = (
  success?: RecorderVerification['success']
): { color: string; label: string } => {
  if (success === true) {
    return { color: 'success', label: '验证通过' };
  }
  if (success === false) {
    return { color: 'error', label: '验证失败' };
  }
  if (success === 'partial') {
    return { color: 'processing', label: '部分验证' };
  }
  return { color: 'default', label: '验证未知' };
};

export const formatRecorderConfidence = (value?: number): string => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-';
  }
  return `${Math.round(value * 100)}%`;
};

export const createRuntimeSessionId = () =>
  `recorder-ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const resolveErrorMessage = (error: unknown, fallback = '未知错误'): string => {
  if (!error) {
    return fallback;
  }
  if (typeof error === 'string') {
    return error;
  }
  const errorRecord = error as {
    response?: {
      data?: {
        message?: string;
        error?: string;
      };
    };
    message?: string;
  };
  return (
    errorRecord.response?.data?.message ||
    errorRecord.response?.data?.error ||
    errorRecord.message ||
    fallback
  );
};

export const getPrimaryExecutionResult = (
  payload: BrowserCommandExecutionResponse,
  fallbackMessage: string
): BrowserCommandExecutionResult => {
  const failedResult = payload.results?.find((item) => item.status === 'error');
  if (failedResult) {
    return failedResult;
  }
  const firstResult = payload.results?.[0];
  if (firstResult) {
    return firstResult;
  }
  return {
    status: payload.success === false ? 'error' : 'success',
    message: payload.message || fallbackMessage,
  };
};

export const createIdleTakeoverState = (): TakeoverUiState => ({
  mode: 'idle',
  originalCommands: [],
  patchSteps: [],
  resumeCommands: [],
});

export const describeTakeoverCommand = (command: MCPCommand): string => {
  const params = command.params || {};
  const target = [
    command.locator?.value,
    command.locator?.name,
    params.text,
    params.url,
    params.value,
  ]
    .filter(Boolean)
    .join(' ');
  return [command.tool, target].filter(Boolean).join(' - ') || '未命名步骤';
};

export const describePatchStep = (step: RecorderPatchStep): string => {
  const params = step.params || {};
  const target = [
    step.locator?.value,
    step.locator?.name,
    params.text,
    params.url,
    params.value,
    params.selector,
  ]
    .filter(Boolean)
    .join(' ');
  return [step.action, target].filter(Boolean).join(' - ') || '人工动作';
};

export const pickFailedCommand = (commands: MCPCommand[]): MCPCommand | undefined => {
  return commands[commands.length - 1] || commands[0];
};

export const getStringParam = (params: Record<string, unknown>, key: string): string | undefined => {
  const value = params[key];
  return typeof value === 'string' ? value : undefined;
};

export const getNumberParam = (params: Record<string, unknown>, key: string): number | undefined => {
  const value = params[key];
  return typeof value === 'number' ? value : undefined;
};

export const TEMPLATE_STEP_POLICY_OPTIONS: Array<{
  value: TemplateStepExecutionPolicy;
  label: string;
  color: string;
  description: string;
}> = [
  {
    value: 'auto_execute',
    label: '自动执行',
    color: 'green',
    description: '回放时默认自动执行该步骤',
  },
  {
    value: 'require_confirmation',
    label: '需确认',
    color: 'gold',
    description: '回放时停下来，要求人工确认后再继续',
  },
  {
    value: 'require_takeover',
    label: '人工接管',
    color: 'orange',
    description: '回放时在该步骤切换为人工接管',
  },
  {
    value: 'forbid_in_replay',
    label: '禁止回放',
    color: 'red',
    description: '模板中保留该步骤，但回放时不允许自动执行',
  },
];

export const normalizeTemplateStepExecutionPolicy = (
  value: unknown
): TemplateStepExecutionPolicy | undefined => {
  if (
    value === 'auto_execute' ||
    value === 'require_confirmation' ||
    value === 'require_takeover' ||
    value === 'forbid_in_replay'
  ) {
    return value;
  }
  return undefined;
};

export const PREDEFINED_COMMANDS: PredefinedCommand[] = [
  {
    value: 'navigate',
    label: '打开',
    prefix: '打开 ',
    placeholder: '输入网址，如：百度、google.com',
  },
  {
    value: 'click',
    label: '点击',
    prefix: '点击 ',
    placeholder: '输入目标元素描述，如：搜索按钮、登录链接',
  },
  {
    value: 'fill',
    label: '填充',
    prefix: '填充 ',
    placeholder: '输入内容和目标，如：用户名输入框填写 admin',
  },
  {
    value: 'search',
    label: '搜索',
    prefix: '在搜索框输入 ',
    placeholder: '输入关键词，如：笔记本电脑',
  },
  {
    value: 'smart_search',
    label: '智搜',
    prefix: '智能搜索 ',
    placeholder: '输入搜索内容，AI将自动识别并执行搜索',
  },
  {
    value: 'press',
    label: '按键',
    prefix: '按键 ',
    placeholder: '输入按键名称，如：Enter, Tab, Escape',
  },
  {
    value: 'hover',
    label: '悬停',
    prefix: '悬停在 ',
    placeholder: '输入目标元素描述，如：导航菜单项',
  },
];

export interface HistoryEntryExecutionStatusMeta {
  type: 'success' | 'failed' | 'blocked' | 'info';
  label: string;
  defaultOpen: boolean;
}

export const getHistoryEntryExecutionStatusMeta = (
  entry: CommandHistoryEntry
): HistoryEntryExecutionStatusMeta => {
  const isExplicitFailure = Boolean(
    entry.result?.outcome?.status === 'failed' ||
      entry.result?.status === 'error' ||
      entry.result?.execution?.success === false
  );

  if (isExplicitFailure) {
    const label =
      entry.result?.outcome?.verification?.failureReason ||
      entry.result?.message ||
      '执行失败';
    return {
      type: 'failed',
      label,
      defaultOpen: true,
    };
  }

  const isBlocked = Boolean(entry.result?.outcome?.status === 'blocked');
  const hasCommands = Array.isArray(entry.commands) && entry.commands.length > 0;

  if (isBlocked && !hasCommands) {
    const label =
      entry.result?.outcome?.verification?.failureReason ||
      entry.result?.outcome?.summary?.nextHint ||
      '操作受阻 / 未执行';
    return {
      type: 'blocked',
      label,
      defaultOpen: true,
    };
  }

  if (hasCommands) {
    const executedTools = entry.commands!.map((cmd) => cmd.tool).join(' / ');
    return {
      type: 'success',
      label: `已执行: ${executedTools}`,
      defaultOpen: false,
    };
  }

  if (entry.result?.status === 'answer' || entry.result?.status === 'question') {
    return {
      type: 'info',
      label: 'AI 建议 / 页面分析',
      defaultOpen: false,
    };
  }

  return {
    type: 'info',
    label: entry.result?.message || '已响应',
    defaultOpen: false,
  };
};

