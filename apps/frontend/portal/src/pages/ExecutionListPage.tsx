/**
 * ExecutionListPage
 * List all executions with filtering and pagination
 * Phase 4: Portal Execution views
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card,
  Collapse,
  Timeline,
  Table,
  Tag,
  Button,
  Space,
  Typography,
  Select,
  Input,
  Drawer,
  Descriptions,
  Empty,
  Spin,
  Form,
  InputNumber,
  Switch,
  Alert,
  message,
  Tooltip,
  Image,
  Carousel,
} from 'antd';
import {
  SearchOutlined,
  PlusOutlined,
  ReloadOutlined,
  DownloadOutlined,
  PlayCircleOutlined,
  RobotOutlined,
  CopyOutlined,
  ClockCircleOutlined,
  InfoCircleOutlined,
  DownOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { executionApi, ExecutionDto, ExecutionStatus, ExecutionStepDto } from '../api/execution';
import { skillApi } from '../api/skill';
import { capabilityReleaseApi } from '../api/capabilities';
import { useChatStore } from '../components/chat';
import { ListSectionHeader } from '../components/page/PageScaffold';
import { useAuthStore } from '../store/authStore';
import { replaceLocalhostWithCurrentHost } from '../utils/publicUrl';
import {
  EXECUTION_STATUS_COLORS,
  EXECUTION_STATUS_LABELS_ZH,
} from '../utils/executionStatusMeta';

const { Text } = Typography;
const statusColors = EXECUTION_STATUS_COLORS;
const statusLabels = EXECUTION_STATUS_LABELS_ZH;
const EXECUTION_STATUS_FILTER_OPTIONS: Array<{ value?: ExecutionStatus; label: string }> = [
  { value: undefined, label: '全部状态' },
  { value: 'running', label: '执行中' },
  { value: 'waiting_input', label: '待补输入' },
  { value: 'pending_approval', label: '待审批' },
  { value: 'human_control', label: '人工接管' },
  { value: 'succeeded', label: '已完成' },
  { value: 'failed', label: '失败' },
  { value: 'cancelled', label: '已取消' },
];

const formatDateTime = (date?: string) => (date ? new Date(date).toLocaleString() : '-');

const summarizeText = (value?: string, maxLength = 64) => {
  if (!value) {
    return '';
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
};

const getExecutionTime = (record: ExecutionDto) => {
  const source = record.startedAt || record.createdAt;
  return source ? new Date(source).getTime() : 0;
};

const formatDuration = (record: ExecutionDto) => {
  const start = record.startedAt || record.createdAt;
  const end = record.endedAt;
  if (!start) {
    return '未开始';
  }

  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  const diff = Math.max(endTime - startTime, 0);
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m`;
  }

  const seconds = Math.max(Math.floor(diff / 1000), 1);
  return `${seconds}s`;
};

const fixLocalhostLink = (url?: string): string | undefined => replaceLocalhostWithCurrentHost(url);

const tryParseJsonValue = (value: unknown): unknown => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return value;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const renderJsonValue = (value: unknown, path = 'root'): React.ReactNode => {
  const parsedValue = tryParseJsonValue(value);

  if (typeof parsedValue === 'string') {
    return `"${parsedValue}"`;
  }

  if (typeof parsedValue === 'number' || typeof parsedValue === 'boolean') {
    return String(parsedValue);
  }

  if (parsedValue === null) {
    return 'null';
  }

  if (Array.isArray(parsedValue)) {
    return (
      <>
        [
        {parsedValue.length > 0 && (
          <div style={{ paddingLeft: 16 }}>
            {parsedValue.map((item, index) => (
              <div key={`${path}.${index}`}>
                {renderJsonValue(item, `${path}.${index}`)}
                {index < parsedValue.length - 1 ? ',' : ''}
              </div>
            ))}
          </div>
        )}
        ]
      </>
    );
  }

  if (parsedValue && typeof parsedValue === 'object') {
    const entries = Object.entries(parsedValue as Record<string, unknown>);
    return (
      <>
        {'{'}
        {entries.length > 0 && (
          <div style={{ paddingLeft: 16 }}>
            {entries.map(([key, item], index) => {
              const isTemporalLink = key === 'temporalLink' && typeof item === 'string';
              const fixedLink = isTemporalLink ? fixLocalhostLink(item) : undefined;

              return (
                <div key={`${path}.${key}`}>
                  <span>"{key}": </span>
                  {fixedLink ? (
                    <a href={fixedLink} target="_blank" rel="noopener noreferrer">
                      {fixedLink}
                    </a>
                  ) : (
                    renderJsonValue(item, `${path}.${key}`)
                  )}
                  {index < entries.length - 1 ? ',' : ''}
                </div>
              );
            })}
          </div>
        )}
        {'}'}
      </>
    );
  }

  return String(parsedValue);
};

const renderJsonBlock = (value: unknown) => (
  <div
    style={{
      margin: 0,
      padding: 14,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      maxHeight: 320,
      overflow: 'auto',
      background: 'var(--bg-secondary)',
      color: 'var(--text-primary)',
      border: '1px solid var(--bg-secondary)',
      borderRadius: 12,
      fontFamily: 'ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.6,
    }}
  >
    {renderJsonValue(value)}
  </div>
);

const detailPanelStyle = {
  marginBottom: 12,
  background: 'var(--bg-card)',
  border: '1px solid var(--bg-secondary)',
  borderRadius: 14,
  boxShadow: 'var(--shadow-sm)',
};

const renderPanelLabel = (title: string, summary?: string) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%' }}>
    <Text strong>{title}</Text>
    {summary ? <Text type="secondary">{summary}</Text> : null}
  </div>
);

const safeJsonStringify = (value: unknown) => JSON.stringify(value, null, 2);

const extractResultFileName = (value?: Record<string, unknown>): string | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  if (typeof value.fileName === 'string' && value.fileName.trim()) {
    return value.fileName;
  }

  const raw = value.raw;
  if (raw && typeof raw === 'object' && raw !== null) {
    const rawFileName = (raw as Record<string, unknown>).fileName;
    if (typeof rawFileName === 'string' && rawFileName.trim()) {
      return rawFileName;
    }
  }

  const nestedResult = value.result;
  if (nestedResult && typeof nestedResult === 'object') {
    return extractResultFileName(nestedResult as Record<string, unknown>);
  }

  return undefined;
};

const summarizeExecutionResult = (result?: Record<string, unknown> | null) => {
  if (!result || Object.keys(result).length === 0) {
    return '暂无结果';
  }

  const fileName = extractResultFileName(result);
  if (fileName) {
    return fileName;
  }

  const downloadUrl = extractDownloadUrl(result);
  if (downloadUrl) {
    return '可下载结果';
  }

  if (typeof result.status === 'string' && result.status.trim()) {
    return `状态: ${result.status}`;
  }

  const keys = Object.keys(result);
  const preview = keys.slice(0, 3).join('、');
  return keys.length > 3 ? `${preview} 等 ${keys.length} 项` : preview;
};

const getStepStatusColor = (status?: string) => {
  switch (status) {
    case 'succeeded':
      return 'green';
    case 'failed':
      return 'red';
    case 'running':
      return 'blue';
    case 'waiting_input':
      return 'orange';
    case 'pending_approval':
      return 'gold';
    case 'cancelled':
      return 'gray';
    default:
      return 'gray';
  }
};

const summarizeSteps = (steps?: ExecutionStepDto[], isLoading?: boolean) => {
  if (isLoading) {
    return '加载中...';
  }

  if (!steps || steps.length === 0) {
    return '暂无步骤';
  }

  const activeStep = steps.find((step) => ['running', 'waiting_input', 'pending_approval'].includes(step.status));
  if (activeStep) {
    return `${steps.length} 个步骤 / ${activeStep.name || `步骤 ${activeStep.stepIndex + 1}`}`;
  }

  return `${steps.length} 个步骤`;
};

const getRiskBadgeStyle = (riskLevel?: string) => {
  switch ((riskLevel || '').toUpperCase()) {
    case 'L1':
      return { background: 'rgba(245, 158, 11, 0.16)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.32)' };
    case 'L2':
      return { background: 'rgba(239, 68, 68, 0.16)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.32)' };
    case 'L3':
      return { background: 'rgba(16, 185, 129, 0.16)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.32)' };
    default:
      return { background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--bg-secondary)' };
  }
};

const getExecutionRowStyle = (status: ExecutionStatus, isDarkTheme: boolean) => {
  switch (status) {
    case 'failed':
      return { background: isDarkTheme ? 'rgba(239, 68, 68, 0.08)' : '#fffafa' };
    case 'waiting_input':
    case 'pending_approval':
      return { background: isDarkTheme ? 'rgba(245, 158, 11, 0.08)' : '#fffdf5' };
    case 'running':
      return { background: isDarkTheme ? 'rgba(59, 130, 246, 0.08)' : '#f8fbff' };
    default:
      return { background: 'var(--bg-card)' };
  }
};

const INPUT_TEXT_CANDIDATE_KEYS = ['user_input', 'prompt', 'task', 'goal', 'instruction', 'query', 'url'] as const;

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
};

const extractInputText = (value?: Record<string, unknown>): string | undefined => {
  if (!value) {
    return undefined;
  }

  for (const key of INPUT_TEXT_CANDIDATE_KEYS) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return undefined;
};

const summarizeInputShape = (value?: Record<string, unknown>) => {
  if (!value || Object.keys(value).length === 0) {
    return '';
  }

  const keys = Object.keys(value).filter((key) => !key.startsWith('__') && key !== 'promptDebug');
  if (keys.length === 0) {
    return '';
  }

  const preview = keys.slice(0, 3).join('、');
  return keys.length > 3 ? `${preview} 等 ${keys.length} 项` : preview;
};

const summarizeExecutionListInput = (record: ExecutionDto) => {
  const normalizedInput = asRecord(record.normalizedInput);
  const nestedNormalizedInput = asRecord(normalizedInput?.input);

  const summary = summarizeText(
    extractInputText(asRecord(record.input))
      || (typeof normalizedInput?.objective === 'string' ? normalizedInput.objective : undefined)
      || extractInputText(nestedNormalizedInput),
    72,
  );

  if (summary) {
    return summary;
  }

  return (
    summarizeInputShape(asRecord(record.input))
    || summarizeInputShape(nestedNormalizedInput)
    || summarizeInputShape(normalizedInput)
    || '暂无输入'
  );
};

interface RequiredInputField {
  name: string;
  type: string;
  description?: string;
  required: boolean;
  value?: unknown;
  missing: boolean;
  source: 'user_input' | 'default' | 'unresolved';
}

interface BrowserExecutionStepResult {
  stepId?: string;
  name?: string;
  action?: string;
  target?: string | null;
  snapshotId?: string | null;
  output?: Record<string, unknown> | null;
}

interface BrowserExecutionResultViewModel {
  runtimeSessionId?: string;
  backend?: string;
  stepResults: BrowserExecutionStepResult[];
  failedStep?: string;
  failedAction?: string;
  snapshotId?: string | null;
}

interface TimelineNodeCardProps {
  title: string;
  subtitle?: string;
  preview?: React.ReactNode;
  color?: 'green' | 'red' | 'processing' | 'gray' | 'blue';
  details?: React.ReactNode;
}

const renderInputField = (field: RequiredInputField) => {
  const normalizedType = field.type.toLowerCase();

  if (normalizedType === 'number' || normalizedType === 'integer') {
    return <InputNumber style={{ width: '100%' }} />;
  }

  if (normalizedType === 'boolean') {
    return <Switch />;
  }

  if (normalizedType === 'object' || normalizedType === 'json') {
    return <Input.TextArea rows={4} placeholder="请输入 JSON 字符串" />;
  }

  return <Input placeholder={field.description || `请输入 ${field.name}`} />;
};

const normalizeSubmittedValues = (
  values: Record<string, unknown>,
  requiredInputs: RequiredInputField[],
) => {
  return requiredInputs.reduce<Record<string, unknown>>((acc, field) => {
    const rawValue = values[field.name];
    if (rawValue === undefined) {
      return acc;
    }

    if ((field.type.toLowerCase() === 'object' || field.type.toLowerCase() === 'json') && typeof rawValue === 'string') {
      acc[field.name] = JSON.parse(rawValue);
      return acc;
    }

    acc[field.name] = rawValue;
    return acc;
  }, {});
};

const extractBrowserExecutionResult = (value: unknown): BrowserExecutionResultViewModel | null => {
  const parsed = tryParseJsonValue(value);
  const candidates = [
    asRecord(parsed),
    asRecord(asRecord(parsed)?.result),
    asRecord(asRecord(parsed)?.output),
  ].filter((item): item is Record<string, unknown> => Boolean(item));

  for (const candidate of candidates) {
    const rawStepResults = candidate.stepResults;
    if (!Array.isArray(rawStepResults)) {
      continue;
    }

    const stepResults = rawStepResults
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
      .map((item) => ({
        stepId: typeof item.stepId === 'string' ? item.stepId : undefined,
        name: typeof item.name === 'string' ? item.name : undefined,
        action: typeof item.action === 'string' ? item.action : undefined,
        target: typeof item.target === 'string' ? item.target : null,
        snapshotId: typeof item.snapshotId === 'string' ? item.snapshotId : null,
        output: asRecord(item.output) || null,
      }));

    return {
      runtimeSessionId: typeof candidate.runtimeSessionId === 'string' ? candidate.runtimeSessionId : undefined,
      backend: typeof candidate.backend === 'string' ? candidate.backend : undefined,
      stepResults,
      failedStep: typeof candidate.failedStep === 'string' ? candidate.failedStep : undefined,
      failedAction: typeof candidate.failedAction === 'string' ? candidate.failedAction : undefined,
      snapshotId: typeof candidate.snapshotId === 'string' ? candidate.snapshotId : null,
    };
  }

  return null;
};

const previewText = (value: unknown, maxLength = 180) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

const sanitizeBrowserOutputForDisplay = (value: unknown): unknown => {
  if (typeof value === 'string') {
    if (value.length > 400 && /^[A-Za-z0-9+/=]+$/.test(value)) {
      return `[omitted large base64 string, length=${value.length}]`;
    }
    return value.length > 1200 ? `${value.slice(0, 1200)}...` : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeBrowserOutputForDisplay(item));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, current]) => {
      if (key.toLowerCase().includes('base64') && typeof current === 'string') {
        acc[key] = `[omitted base64 payload, length=${current.length}]`;
        return acc;
      }
      acc[key] = sanitizeBrowserOutputForDisplay(current);
      return acc;
    }, {});
  }
  return value;
};

const parseBrowserStdoutResult = (stdout: string | undefined): unknown => {
  if (!stdout) {
    return undefined;
  }
  const marker = '### Result';
  const codeMarker = '### Ran Playwright code';
  const startIndex = stdout.indexOf(marker);
  if (startIndex < 0) {
    return undefined;
  }

  const contentStart = startIndex + marker.length;
  const codeIndex = stdout.indexOf(codeMarker, contentStart);
  const rawResult = stdout.slice(contentStart, codeIndex >= 0 ? codeIndex : undefined).trim();
  if (!rawResult) {
    return undefined;
  }

  try {
    return JSON.parse(rawResult);
  } catch {
    return rawResult;
  }
};

const isLikelyImageUrl = (value: string) => /^https?:\/\/.+\.(png|jpg|jpeg|gif|webp)(\?.*)?$/i.test(value);

const isLikelyBase64ImagePayload = (value: string) => (
  value.length > 200
  && /^[A-Za-z0-9+/=]+$/.test(value)
);

const extractBrowserImageSrc = (value: unknown, hint?: string): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('data:image/')) {
      return trimmed;
    }
    if (isLikelyImageUrl(trimmed)) {
      return trimmed;
    }
    if (hint && /(screenshot|image|img|base64)/i.test(hint) && isLikelyBase64ImagePayload(trimmed)) {
      return `data:image/png;base64,${trimmed}`;
    }
    return undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractBrowserImageSrc(item, hint);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  if (value && typeof value === 'object') {
    for (const [key, current] of Object.entries(value as Record<string, unknown>)) {
      const found = extractBrowserImageSrc(current, key);
      if (found) {
        return found;
      }
    }
  }

  return undefined;
};

const extractBrowserImageSources = (value: unknown, hint?: string): string[] => {
  const found = new Set<string>();

  const visit = (current: unknown, currentHint?: string) => {
    const single = extractBrowserImageSrc(current, currentHint);
    if (single) {
      found.add(single);
    }

    if (Array.isArray(current)) {
      current.forEach((item) => visit(item, currentHint));
      return;
    }

    if (current && typeof current === 'object') {
      Object.entries(current as Record<string, unknown>).forEach(([key, item]) => {
        visit(item, key);
      });
    }
  };

  visit(value, hint);
  return Array.from(found);
};

const formatWaitSeconds = (durationMs: number | undefined): string | undefined => {
  if (typeof durationMs !== 'number' || Number.isNaN(durationMs) || durationMs < 0) {
    return undefined;
  }
  const seconds = durationMs / 1000;
  return Number.isInteger(seconds) ? `${seconds}` : seconds.toFixed(1);
};

const resolveBrowserWaitSeconds = (
  stepResult: BrowserExecutionStepResult,
  output: Record<string, unknown> | null | undefined,
): string | undefined => {
  if (stepResult.action !== 'wait') {
    return undefined;
  }
  const outputRecord = asRecord(output) || {};
  const data = asRecord(outputRecord.data) || {};
  const rawDuration = data.duration;
  return typeof rawDuration === 'number' ? formatWaitSeconds(rawDuration) : undefined;
};

const buildBrowserOutputDisplay = (output: Record<string, unknown> | null | undefined) => {
  if (!output) {
    return {
      summary: undefined as unknown,
      imageSrc: undefined as string | undefined,
      imageSources: [] as string[],
      details: undefined as unknown,
      status: undefined as string | undefined,
      command: undefined as string | undefined,
    };
  }

  const sanitized = asRecord(sanitizeBrowserOutputForDisplay(output)) || {};
  const status = typeof sanitized.status === 'string' ? sanitized.status : undefined;
  const command = typeof sanitized.command === 'string' ? sanitized.command : undefined;
  const data = asRecord(sanitized.data);
  const stdout = typeof sanitized.stdout === 'string' ? sanitized.stdout : undefined;
  const stderr = typeof sanitized.stderr === 'string' && sanitized.stderr.trim() ? sanitized.stderr : undefined;
  const parsedStdoutResult = parseBrowserStdoutResult(stdout);
  const imageSrc = extractBrowserImageSrc(output);
  const imageSources = extractBrowserImageSources(output);
  const summary = data || parsedStdoutResult || {
    ...(status ? { status } : {}),
    ...(command ? { command } : {}),
  };

  return {
    summary,
    imageSrc,
    imageSources,
    details: {
      ...(status ? { status } : {}),
      ...(command ? { command } : {}),
      ...(data ? { data } : {}),
      ...(!data && parsedStdoutResult !== undefined ? { result: parsedStdoutResult } : {}),
      ...(stderr ? { stderr } : {}),
    },
    status,
    command,
  };
};

const renderSummaryChips = (
  items: Array<{ label: string; value: React.ReactNode; color?: string }>,
) => {
  const visibleItems = items.filter((item) => item.value !== undefined && item.value !== null && item.value !== '');
  if (!visibleItems.length) {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        justifyContent: 'flex-start',
      }}
    >
      {visibleItems.map((item) => (
        <Tag
          key={`${item.label}-${String(item.value)}`}
          color={item.color}
          style={{
            marginInlineEnd: 0,
            paddingInline: 10,
            paddingBlock: 4,
            borderRadius: 999,
          }}
        >
          <Space size={4}>
            <Text type="secondary">{item.label}</Text>
            <Text strong>{item.value}</Text>
          </Space>
        </Tag>
      ))}
    </div>
  );
};

const renderTimelineDetails = (
  sections: Array<{ label: string; value: unknown }>,
) => {
  const visibleSections = sections.filter((section) => {
    if (section.value === undefined || section.value === null) {
      return false;
    }
    if (typeof section.value === 'string') {
      return section.value.trim().length > 0;
    }
    if (Array.isArray(section.value)) {
      return section.value.length > 0;
    }
    if (typeof section.value === 'object') {
      return Object.keys(section.value as Record<string, unknown>).length > 0;
    }
    return true;
  });

  if (!visibleSections.length) {
    return null;
  }

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {visibleSections.map((section) => (
        <div key={section.label}>
          <Text strong>{section.label}</Text>
          <pre style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 320, overflow: 'auto' }}>
            {typeof section.value === 'string' ? section.value : JSON.stringify(section.value, null, 2)}
          </pre>
        </div>
      ))}
    </Space>
  );
};

const getTimelineCardTone = (color?: TimelineNodeCardProps['color']) => {
  switch (color) {
    case 'green':
      return {
        borderColor: 'rgba(16, 185, 129, 0.28)',
        background: 'linear-gradient(180deg, rgba(16, 185, 129, 0.12) 0%, var(--bg-card) 100%)',
        accent: 'var(--success-color)',
      };
    case 'red':
      return {
        borderColor: 'rgba(239, 68, 68, 0.28)',
        background: 'linear-gradient(180deg, rgba(239, 68, 68, 0.12) 0%, var(--bg-card) 100%)',
        accent: 'var(--error-color)',
      };
    case 'processing':
      return {
        borderColor: 'rgba(59, 130, 246, 0.28)',
        background: 'linear-gradient(180deg, rgba(59, 130, 246, 0.12) 0%, var(--bg-card) 100%)',
        accent: 'var(--info-color)',
      };
    case 'gray':
      return {
        borderColor: 'var(--border-color)',
        background: 'linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg-card) 100%)',
        accent: 'var(--text-light)',
      };
    case 'blue':
    default:
      return {
        borderColor: 'rgba(99, 102, 241, 0.28)',
        background: 'linear-gradient(180deg, rgba(99, 102, 241, 0.12) 0%, var(--bg-card) 100%)',
        accent: 'var(--primary-color)',
      };
  }
};

const TimelineNodeCard: React.FC<TimelineNodeCardProps> = ({
  title,
  subtitle,
  preview,
  color,
  details,
}) => {
  const [expanded, setExpanded] = useState(false);
  const canToggle = Boolean(details);
  const tone = getTimelineCardTone(color);

  const toggleExpanded = () => {
    if (!canToggle) {
      return;
    }
    setExpanded((value) => !value);
  };

  return (
    <Card
      size="small"
      styles={{ body: { padding: 12 } }}
      style={{
        borderRadius: 12,
        borderColor: tone.borderColor,
        background: tone.background,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <div
          onClick={toggleExpanded}
          onKeyDown={(event) => {
            if ((event.key === 'Enter' || event.key === ' ') && canToggle) {
              event.preventDefault();
              toggleExpanded();
            }
          }}
          role={canToggle ? 'button' : undefined}
          tabIndex={canToggle ? 0 : undefined}
          style={{
            width: '100%',
            cursor: canToggle ? 'pointer' : 'default',
            borderRadius: 10,
            padding: 6,
          }}
        >
          <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start">
            <Space direction="vertical" size={2} style={{ minWidth: 0, flex: 1, alignItems: 'flex-start', textAlign: 'left' }}>
              <div
                style={{
                  width: '100%',
                  height: 3,
                  borderRadius: 999,
                  background: tone.accent,
                  opacity: 0.18,
                  marginBottom: 6,
                }}
              />
              <Text strong style={{ width: '100%', textAlign: 'left' }}>{title}</Text>
              {subtitle ? <Text type="secondary" style={{ width: '100%', textAlign: 'left' }}>{subtitle}</Text> : null}
            </Space>
            {details ? (
              <Button
                type="text"
                size="small"
                icon={expanded ? <DownOutlined /> : <RightOutlined />}
                style={{
                  color: tone.accent,
                  background: 'var(--bg-card)',
                  borderRadius: 999,
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleExpanded();
                }}
              />
            ) : null}
          </Space>
        </div>
        {preview ? <div style={{ paddingTop: 4 }}>{preview}</div> : null}
        {expanded && details ? <div style={{ paddingTop: 4 }}>{details}</div> : null}
      </Space>
    </Card>
  );
};

const extractDownloadUrl = (result?: Record<string, unknown>): string | undefined => {
  if (!result || typeof result !== 'object') {
    return undefined;
  }

  if (typeof result.downloadUrl === 'string' && result.downloadUrl.trim()) {
    return result.downloadUrl;
  }

  const raw = result.raw;
  if (raw && typeof raw === 'object' && raw !== null && 'downloadUrl' in raw) {
    const rawDownloadUrl = (raw as Record<string, unknown>).downloadUrl;
    if (typeof rawDownloadUrl === 'string' && rawDownloadUrl.trim()) {
      return rawDownloadUrl;
    }
  }

  const nestedResult = result.result;
  if (nestedResult && typeof nestedResult === 'object') {
    return extractDownloadUrl(nestedResult as Record<string, unknown>);
  }

  return undefined;
};

const buildAiResumeDraft = (
  execution: ExecutionDto,
  submittedInput?: Record<string, unknown>,
) => {
  const originalContent = summarizeExecutionListInput(execution);

  const supplement = submittedInput && Object.keys(submittedInput).length > 0
    ? JSON.stringify(submittedInput, null, 2)
    : '无';

  return [
    `请继续处理这个任务，executionId=${execution.id}。`,
    '',
    '任务 ID：',
    String(originalContent),
    '',
    '我刚补充的输入参数：',
    supplement,
    '',
    '请回到任务模式继续跟进，并基于当前执行状态给出下一步处理。',
  ].join('\n');
};

const ExecutionListPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [resumeForm] = Form.useForm();
  const {
    currentSession,
    createSession,
    setOpen,
    setChatMode,
    setDraftMessage,
    setDraftExecutionId,
  } = useChatStore();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState<ExecutionStatus | undefined>();
  const [searchText, setSearchText] = useState('');
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | undefined>(
    searchParams.get('executionId') || undefined,
  );
  const { theme } = useAuthStore();
  const isDarkTheme = theme === 'dark';

  useEffect(() => {
    const executionId = searchParams.get('executionId') || undefined;
    setSelectedExecutionId(executionId);
  }, [searchParams]);

  // Fetch executions
  const { data, isLoading, isFetching, refetch } = useQuery(
    ['executions', page, pageSize, statusFilter],
    () => executionApi.list({ page, pageSize, status: statusFilter }),
    { keepPreviousData: true }
  );

  const { data: skillsData } = useQuery(['skills-name-map'], () => skillApi.list());
  const { data: releasesData } = useQuery(['published-skills-name-map'], () => capabilityReleaseApi.listReleaseCenter());

  const { data: selectedExecution, isLoading: isDetailLoading } = useQuery<ExecutionDto, Error>(
    ['execution', selectedExecutionId],
    () => executionApi.getById(selectedExecutionId!),
    { enabled: !!selectedExecutionId }
  );

  const { data: selectedSteps, isLoading: isStepsLoading } = useQuery<ExecutionStepDto[], Error>(
    ['execution-steps', selectedExecutionId],
    () => executionApi.getSteps(selectedExecutionId!),
    { enabled: !!selectedExecutionId }
  );

  const waitingInputStep = selectedExecution?.status === 'waiting_input'
    ? selectedSteps?.find((step) =>
      step.id === selectedExecution.currentStepId
      || (step.type === 'input_collection' && step.status === 'running')
    )
    : undefined;

  const requiredInputs = Array.isArray(waitingInputStep?.inputJson?.requiredInputs)
    ? (waitingInputStep?.inputJson?.requiredInputs as unknown as RequiredInputField[])
    : [];

  const skillNameMap = useMemo(() => {
    const map = new Map<string, string>();
    // 优先使用 published 的来源名称
    (releasesData?.releases || []).forEach((release) => {
      if (release.publishedSkillId) {
        map.set(release.publishedSkillId, release.sourceName || release.sourceId || release.publishedSkillId);
      }
    });
    // 兜底使用基础技能名称
    (skillsData?.skills || []).forEach((skill) => {
      if (!map.has(skill.id)) {
        map.set(skill.id, skill.name);
      }
    });
    return map;
  }, [releasesData?.releases, skillsData?.skills]);

  const getSkillDisplayName = (skillId?: string) => {
    if (!skillId) {
      return '-';
    }
    return skillNameMap.get(skillId) || skillId;
  };

  useEffect(() => {
    if (requiredInputs.length === 0) {
      resumeForm.resetFields();
      return;
    }

    resumeForm.setFieldsValue(
      requiredInputs.reduce<Record<string, unknown>>((acc, field) => {
        acc[field.name] = field.value;
        return acc;
      }, {})
    );
  }, [requiredInputs, resumeForm, selectedExecutionId]);

  const handleCopyJson = async (label: string, value: unknown) => {
    try {
      await navigator.clipboard.writeText(safeJsonStringify(value));
      message.success(`已复制${label} JSON`);
    } catch {
      message.error(`复制${label} JSON失败`);
    }
  };

  const openAiTaskMode = (draft: string, executionId: string) => {
    if (!currentSession) {
      createSession();
    }
    setChatMode('task');
    setDraftMessage(draft);
    setDraftExecutionId(executionId);
    setOpen(true);
    setSelectedExecutionId(undefined);
  };

  const submitInputMutation = useMutation(
    async ({ payload }: { payload: Record<string, unknown> }) => {
      if (!selectedExecutionId || !waitingInputStep) {
        throw new Error('当前执行不处于待补参状态');
      }

      return executionApi.submitInput(selectedExecutionId, {
        stepId: waitingInputStep.id,
        input: payload,
      });
    },
    {
      onSuccess: async () => {
        void message.success('已补充输入，执行继续进行中');
        await Promise.all([
          queryClient.invalidateQueries(['executions']),
          queryClient.invalidateQueries(['execution', selectedExecutionId]),
          queryClient.invalidateQueries(['execution-steps', selectedExecutionId]),
          queryClient.invalidateQueries(['dashboard-executions-recent']),
        ]);
      },
      onError: (error: Error) => {
        void message.error(`恢复执行失败：${error.message}`);
      },
    }
  );

  const handleResumeExecution = async (openInAi: boolean) => {
    if (!selectedExecution || !waitingInputStep) {
      return;
    }

    try {
      const values = await resumeForm.validateFields();
      const payload = normalizeSubmittedValues(values, requiredInputs);

      if (openInAi) {
        openAiTaskMode(
          buildAiResumeDraft(selectedExecution, payload),
          selectedExecution.id,
        );
        message.success('已切换到 AI 任务模式，待你发送后再继续处理');
        return;
      }

      submitInputMutation.mutate({ payload });
    } catch (error) {
      if (error instanceof Error) {
        message.error(error.message);
      }
    }
  };

  const filteredAndSortedData = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    const rows = [...(data?.data || [])].filter((record) => {
      if (!keyword) {
        return true;
      }

      return [
        record.id,
        record.skillId,
        getSkillDisplayName(record.skillId),
        record.riskLevel,
        record.status,
        summarizeExecutionListInput(record),
      ]
        .filter(Boolean)
        .some((item) => String(item).toLowerCase().includes(keyword));
    });

    rows.sort((a, b) => getExecutionTime(b) - getExecutionTime(a));
    return rows;
  }, [data?.data, searchText, skillNameMap]);

  const columns = [
    {
      title: '技能名称',
      key: 'execution',
      width: 280,
      render: (_: unknown, record: ExecutionDto) => (
        <Space direction="vertical" size={4}>
          <Text strong style={{ fontSize: 16 }}>{getSkillDisplayName(record.skillId)}</Text>
        </Space>
      ),
    },
    {
      title: '开始时间',
      dataIndex: 'startedAt',
      key: 'startedAt',
      width: 190,
      defaultSortOrder: 'descend' as const,
      sorter: (a: ExecutionDto, b: ExecutionDto) => getExecutionTime(a) - getExecutionTime(b),
      render: (_: string | undefined, record: ExecutionDto) => (
        <Space size={8} wrap={false}>
          <Text>{formatDateTime(record.startedAt || record.createdAt)}</Text>
          <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
            {record.endedAt ? `耗时 ${formatDuration(record)}` : `已运行 ${formatDuration(record)}`}
          </Text>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: ExecutionStatus) => (
        <Tag
          color={statusColors[status]}
          style={{ marginInlineEnd: 0, paddingInline: 10, borderRadius: 999, fontWeight: 600 }}
        >
          {statusLabels[status]}
        </Tag>
      ),
    },
    {
      title: '风险',
      dataIndex: 'riskLevel',
      key: 'riskLevel',
      width: 80,
      render: (riskLevel?: string) => (
        riskLevel ? (
          <span
            style={{
              ...getRiskBadgeStyle(riskLevel),
              display: 'inline-block',
              padding: '2px 10px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {riskLevel}
          </span>
        ) : '-'
      ),
    },
    {
      title: '用户输入',
      key: 'input',
      width: 320,
      ellipsis: true,
      render: (_: unknown, record: ExecutionDto) => (
        <Text
          style={{
            display: 'block',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {summarizeExecutionListInput(record)}
        </Text>
      ),
    },
  ];

  const selectedBrowserExecutionResult = extractBrowserExecutionResult(selectedExecution?.resultJson);
  const selectedBrowserTimelineItems = selectedBrowserExecutionResult
    ? [
        {
          color: 'gray' as const,
          children: (
            <TimelineNodeCard
              title="浏览器运行信息"
              subtitle={formatDateTime(selectedExecution?.endedAt || selectedExecution?.updatedAt)}
              color="gray"
              preview={renderSummaryChips([
                { label: '后端', value: selectedBrowserExecutionResult.backend || '-', color: 'blue' },
                { label: '步骤数', value: selectedBrowserExecutionResult.stepResults.length, color: 'processing' },
                { label: '状态', value: selectedExecution ? statusLabels[selectedExecution.status] : '-', color: selectedExecution ? statusColors[selectedExecution.status] : 'default' },
              ])}
              details={renderTimelineDetails([
                { label: 'Runtime Session', value: selectedBrowserExecutionResult.runtimeSessionId || '-' },
                { label: 'Runtime', value: {
                  backend: selectedBrowserExecutionResult.backend,
                  runtimeSessionId: selectedBrowserExecutionResult.runtimeSessionId,
                  stepCount: selectedBrowserExecutionResult.stepResults.length,
                  failedStep: selectedBrowserExecutionResult.failedStep,
                  failedAction: selectedBrowserExecutionResult.failedAction,
                } },
              ])}
            />
          ),
        },
        ...selectedBrowserExecutionResult.stepResults.map((stepResult, index) => {
          const outputDisplay = buildBrowserOutputDisplay(stepResult.output || null);
          const waitSeconds = resolveBrowserWaitSeconds(stepResult, stepResult.output || null);
          const isWaitStep = stepResult.action === 'wait';
          const imageSources = outputDisplay.imageSources.length > 0
            ? outputDisplay.imageSources
            : outputDisplay.imageSrc
              ? [outputDisplay.imageSrc]
              : [];
          const stepColor: TimelineNodeCardProps['color'] =
            selectedBrowserExecutionResult.failedStep && index === selectedBrowserExecutionResult.stepResults.length - 1
            ? 'red'
            : 'green';

          return {
            color: stepColor,
            children: (
              <TimelineNodeCard
                key={`${stepResult.stepId || stepResult.name || stepResult.action || 'browser-step'}-${index}`}
                title={`步骤 ${index + 1}: ${isWaitStep && waitSeconds ? `wait ${waitSeconds}s` : stepResult.name || stepResult.action || '-'}`}
                subtitle={
                  isWaitStep
                    ? waitSeconds
                      ? `等待 ${waitSeconds} 秒`
                      : '等待'
                    : stepResult.target || outputDisplay.command || stepResult.stepId || '-'
                }
                color={stepColor}
                preview={
                  <Space direction="vertical" size={10} style={{ width: '100%' }}>
                    {isWaitStep ? (
                      renderSummaryChips([
                        { label: '等待', value: waitSeconds ? `${waitSeconds} 秒` : '-', color: 'processing' },
                        {
                          label: 'status',
                          value: outputDisplay.status || '-',
                          color: outputDisplay.status === 'success' ? 'green' : 'default',
                        },
                      ])
                    ) : (
                      <>
                        {renderSummaryChips([
                          { label: '动作', value: stepResult.action || '-', color: 'processing' },
                          { label: '目标', value: stepResult.target || '-', color: 'blue' },
                          { label: '快照', value: stepResult.snapshotId || '-', color: 'default' },
                          {
                            label: 'status',
                            value: outputDisplay.status || '-',
                            color: outputDisplay.status === 'success' ? 'green' : 'default',
                          },
                        ])}
                        <Text
                          type="secondary"
                          style={{
                            display: 'block',
                            textAlign: 'left',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            lineHeight: 1.6,
                          }}
                        >
                          {previewText(outputDisplay.summary || '暂无结构化输出', 220)}
                        </Text>
                      </>
                    )}
                    {imageSources.length > 0 ? (
                      <div
                        style={{
                          marginTop: 4,
                          borderRadius: 12,
                          overflow: 'hidden',
                          border: '1px solid var(--bg-secondary)',
                          background: 'var(--bg-card)',
                          padding: 12,
                        }}
                      >
                        <Image.PreviewGroup>
                          {imageSources.length === 1 ? (
                            <Image
                              src={imageSources[0]}
                              alt={stepResult.name || stepResult.action || 'browser screenshot'}
                              style={{
                                width: '100%',
                                maxHeight: 280,
                                objectFit: 'contain',
                                background: 'var(--bg-secondary)',
                                borderRadius: 8,
                              }}
                            />
                          ) : (
                            <Carousel dots>
                              {imageSources.map((src, imageIndex) => (
                                <div key={`${src}-${imageIndex}`}>
                                  <div
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'center',
                                      background: 'var(--bg-secondary)',
                                      borderRadius: 8,
                                      padding: 8,
                                    }}
                                  >
                                    <Image
                                      src={src}
                                      alt={`${stepResult.name || stepResult.action || 'browser screenshot'}-${imageIndex + 1}`}
                                      style={{
                                        maxHeight: 280,
                                        objectFit: 'contain',
                                        borderRadius: 8,
                                      }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </Carousel>
                          )}
                        </Image.PreviewGroup>
                      </div>
                    ) : null}
                  </Space>
                }
                details={renderTimelineDetails([
                  { label: 'Step', value: {
                    stepId: stepResult.stepId,
                    name: stepResult.name,
                    action: stepResult.action,
                    target: stepResult.target,
                    snapshotId: stepResult.snapshotId,
                  } },
                  { label: '步骤输出', value: outputDisplay.details || '暂无结构化输出' },
                ])}
              />
            ),
          };
        }),
      ]
    : [];

  const updateExecutionSelection = (executionId?: string) => {
    const nextSearchParams = new URLSearchParams(searchParams);
    if (executionId) {
      nextSearchParams.set('executionId', executionId);
    } else {
      nextSearchParams.delete('executionId');
    }
    setSearchParams(nextSearchParams, { replace: true });
  };

  return (
    <div style={{ padding: 24 }}>
      {/* Table */}
      <Card
        style={{
          borderRadius: 16,
          border: '1px solid var(--bg-secondary)',
          boxShadow: 'var(--shadow-md)',
        }}
        styles={{ body: { padding: 12 } }}
      >
        <ListSectionHeader
          title={(
            <Space size={16}>
              <Text strong style={{ fontSize: 16 }}>执行记录列表</Text>
              <Input
                className="execution-search-input"
                size="small"
                placeholder="内容过滤"
                prefix={<SearchOutlined />}
                variant="borderless"
                style={{
                  width: 200,
                  background: 'var(--bg-secondary)',
                  borderRadius: 6,
                  fontSize: 12,
                }}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                allowClear
              />
              <Select
                className="execution-status-filter"
                size="small"
                placeholder="全部状态"
                variant="borderless"
                style={{
                  width: 110,
                  background: 'var(--bg-secondary)',
                  borderRadius: 6,
                  fontSize: 12,
                }}
                allowClear
                value={statusFilter}
                onChange={(value) => setStatusFilter(value)}
                popupMatchSelectWidth={false}
              >
                {EXECUTION_STATUS_FILTER_OPTIONS.map((option) => (
                  <Select.Option key={option.value ?? 'all'} value={option.value}>
                    {option.label}
                  </Select.Option>
                ))}
              </Select>
            </Space>
          )}
          tip={(
            <Tooltip title="按开始时间倒序展示，可点击任一行查看详情">
              <InfoCircleOutlined style={{ color: 'var(--text-secondary)', fontSize: 14 }} />
            </Tooltip>
          )}
          extra={(
            <Space wrap size={8} style={{ justifyContent: 'flex-end' }}>
              <Text type="secondary" style={{ fontSize: 13 }}>共 {filteredAndSortedData.length} 条</Text>
              <Button
                size="middle"
                icon={<ReloadOutlined />}
                onClick={() => refetch()}
                loading={isFetching}
                className="btn-pill"
              >
                刷新
              </Button>
              <Button
                size="middle"
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => navigate('/executions/new')}
                className="btn-pill"
                style={{
                  boxShadow: '0 10px 24px rgba(99, 102, 241, 0.24)',
                }}
              >
                新建执行
              </Button>
            </Space>
          )}
        />
        <Table
          columns={columns}
          dataSource={filteredAndSortedData}
          rowKey="id"
          size="middle"
          loading={isLoading}
          locale={{ emptyText: '暂无执行记录' }}
          showSorterTooltip={false}
          pagination={{
            current: page,
            pageSize: pageSize,
            total: data?.total || 0,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条执行记录`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
          scroll={{ x: 1260 }}
          onRow={(record) => ({
            style: {
              cursor: 'pointer',
              transition: 'background 0.2s ease',
              ...getExecutionRowStyle(record.status, isDarkTheme),
            },
            onClick: () => updateExecutionSelection(record.id),
          })}
        />
      </Card>

      <Drawer
        title="执行详情"
        placement="right"
        width={720}
        open={!!selectedExecutionId}
        onClose={() => updateExecutionSelection(undefined)}
        styles={{ body: { background: 'var(--bg-primary)' } }}
      >
        {isDetailLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
            <Spin />
          </div>
        ) : selectedExecution ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card
              size="small"
              style={{
                borderRadius: 20,
                border: '1px solid var(--bg-secondary)',
                boxShadow: 'var(--shadow-lg)',
                background: selectedExecution.status === 'failed'
                  ? isDarkTheme
                    ? 'linear-gradient(180deg, rgba(127, 29, 29, 0.35) 0%, var(--bg-card) 100%)'
                    : 'linear-gradient(180deg, #fff7f7 0%, #ffffff 100%)'
                  : isDarkTheme
                    ? 'linear-gradient(180deg, #243244 0%, var(--bg-card) 100%)'
                    : 'linear-gradient(180deg, #ffffff 0%, #f7fbff 100%)',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                  gap: 16,
                  alignItems: 'start',
                }}
              >
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Space wrap size={8}>
                    <Text type="secondary">执行单</Text>
                    <Text
                      code
                      style={{
                        padding: '4px 10px',
                        borderRadius: 999,
                        background: 'var(--bg-secondary)',
                      }}
                    >
                      {selectedExecution.id}
                    </Text>
                  </Space>
                  <Space wrap size={[10, 10]}>
                    <Tag
                      color={statusColors[selectedExecution.status]}
                      style={{ marginInlineEnd: 0, paddingInline: 12, borderRadius: 999 }}
                    >
                      {statusLabels[selectedExecution.status]}
                    </Tag>
                    {selectedExecution.riskLevel ? (
                      <span
                        style={{
                          ...getRiskBadgeStyle(selectedExecution.riskLevel),
                          padding: '2px 10px',
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {selectedExecution.riskLevel}
                      </span>
                    ) : null}
                  </Space>
                </Space>

                <Space direction="vertical" size={10} style={{ alignItems: 'flex-end' }}>
                  <Space size={6}>
                    <ClockCircleOutlined style={{ color: 'var(--text-light)' }} />
                    <Text type="secondary">{formatDateTime(selectedExecution.startedAt || selectedExecution.createdAt)}</Text>
                  </Space>
                </Space>
              </div>
            </Card>

            <Collapse
              ghost
              expandIconPosition="end"
              items={[
                {
                  key: 'summary',
                  label: renderPanelLabel(
                    '基本信息',
                    `${getSkillDisplayName(selectedExecution.skillId)} / ${statusLabels[selectedExecution.status]}`,
                  ),
                  style: detailPanelStyle,
                  children: (
                    <Descriptions column={1} size="small" bordered>
                      <Descriptions.Item label="ID">{selectedExecution.id}</Descriptions.Item>
                      <Descriptions.Item label="状态">
                        <Tag color={statusColors[selectedExecution.status]}>
                          {statusLabels[selectedExecution.status]}
                        </Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="风险">{selectedExecution.riskLevel || '-'}</Descriptions.Item>
                      <Descriptions.Item label="技能">
                        <Space direction="vertical" size={0}>
                          <Text>{getSkillDisplayName(selectedExecution.skillId)}</Text>
                          {getSkillDisplayName(selectedExecution.skillId) !== selectedExecution.skillId ? (
                            <Text type="secondary">ID: {selectedExecution.skillId}</Text>
                          ) : null}
                        </Space>
                      </Descriptions.Item>
                      <Descriptions.Item label="开始时间">
                        {formatDateTime(selectedExecution.startedAt || selectedExecution.createdAt)}
                      </Descriptions.Item>
                      <Descriptions.Item label="结束时间">
                        {formatDateTime(selectedExecution.endedAt || undefined)}
                      </Descriptions.Item>
                      <Descriptions.Item label="失败原因">
                        {selectedExecution.failureReason || '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="下载地址">
                        {extractDownloadUrl(selectedExecution.resultJson || undefined) ? (
                          <Button
                            type="link"
                            icon={<DownloadOutlined />}
                            style={{ paddingInline: 0 }}
                            onClick={() => window.open(extractDownloadUrl(selectedExecution.resultJson || undefined), '_blank', 'noopener,noreferrer')}
                          >
                            下载结果
                          </Button>
                        ) : '-'}
                      </Descriptions.Item>
                    </Descriptions>
                  ),
                },
                ...(selectedExecution.status === 'waiting_input' && waitingInputStep ? [{
                  key: 'resume',
                  label: renderPanelLabel(
                    '继续 / 恢复执行',
                    `待补 ${requiredInputs.length} 个参数`,
                  ),
                  style: detailPanelStyle,
                  children: (
                    <>
                      <Alert
                        type="warning"
                        showIcon
                        style={{ marginBottom: 16 }}
                        message="该执行正在等待补充输入"
                        description="补齐下面参数后可以直接恢复当前执行；也可以先带着参数回到 AI 任务模式，确认后再继续处理。"
                      />
                      <Form form={resumeForm} layout="vertical">
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                            gap: 12,
                            marginBottom: 16,
                          }}
                        >
                          {requiredInputs.map((field) => (
                            <div
                              key={field.name}
                              style={{
                                padding: 14,
                                borderRadius: 14,
                                border: '1px solid var(--bg-secondary)',
                                background: 'var(--bg-card)',
                                boxShadow: 'var(--shadow-sm)',
                              }}
                            >
                              <Space size={[6, 6]} wrap style={{ marginBottom: 8 }}>
                                <Text strong>{field.name}</Text>
                                <Tag style={{ marginInlineEnd: 0 }}>{field.type}</Tag>
                                <Tag
                                  color={field.required ? 'error' : 'default'}
                                  style={{ marginInlineEnd: 0 }}
                                >
                                  {field.required ? '必填' : '可选'}
                                </Tag>
                              </Space>
                              <Text
                                type="secondary"
                                style={{
                                  display: 'block',
                                  fontSize: 12,
                                  minHeight: 36,
                                  marginBottom: 10,
                                }}
                              >
                                {field.description || `来源: ${field.source}`}
                              </Text>
                              <Form.Item
                                name={field.name}
                                style={{ marginBottom: 8 }}
                                rules={[
                                  {
                                    required: field.required,
                                    message: `请输入 ${field.name}`,
                                  },
                                ]}
                                valuePropName={field.type.toLowerCase() === 'boolean' ? 'checked' : 'value'}
                              >
                                {renderInputField(field)}
                              </Form.Item>
                              <Text type="secondary" style={{ fontSize: 11 }}>
                                来源: {field.source}
                              </Text>
                            </div>
                          ))}
                        </div>
                        <Space wrap>
                          <Button
                            type="primary"
                            icon={<PlayCircleOutlined />}
                            loading={submitInputMutation.isLoading}
                            onClick={() => void handleResumeExecution(false)}
                          >
                            补参并继续执行
                          </Button>
                          <Button
                            icon={<RobotOutlined />}
                            loading={submitInputMutation.isLoading}
                            onClick={() => void handleResumeExecution(true)}
                          >
                            补参后转 AI 任务模式
                          </Button>
                        </Space>
                      </Form>
                    </>
                  ),
                }] : []),
                {
                  key: 'result',
                  label: renderPanelLabel(
                    '执行结果',
                    summarizeExecutionResult(selectedExecution.resultJson || null),
                  ),
                  style: detailPanelStyle,
                  children: selectedExecution.resultJson ? (
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                        <Text type="secondary">
                          {selectedBrowserExecutionResult ? '已按浏览器步骤时间线显示执行结果' : '已格式化显示执行结果 JSON'}
                        </Text>
                        <Space wrap>
                          {extractDownloadUrl(selectedExecution.resultJson) ? (
                            <Button
                              size="small"
                              icon={<DownloadOutlined />}
                              onClick={() => window.open(extractDownloadUrl(selectedExecution.resultJson!), '_blank', 'noopener,noreferrer')}
                            >
                              下载
                            </Button>
                          ) : null}
                          <Button
                            size="small"
                            icon={<CopyOutlined />}
                            onClick={() => void handleCopyJson('执行结果', selectedExecution.resultJson)}
                          >
                            复制 JSON
                          </Button>
                        </Space>
                      </Space>
                      {selectedBrowserExecutionResult ? (
                        <>
                          {selectedBrowserExecutionResult.runtimeSessionId ? (
                            <Text copyable={{ text: selectedBrowserExecutionResult.runtimeSessionId }}>
                              {`运行会话: ${selectedBrowserExecutionResult.runtimeSessionId}`}
                            </Text>
                          ) : null}
                          <Timeline items={selectedBrowserTimelineItems} />
                        </>
                      ) : (
                        renderJsonBlock(selectedExecution.resultJson)
                      )}
                    </Space>
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无结果" />
                  ),
                },
                {
                  key: 'steps',
                  label: renderPanelLabel(
                    '步骤',
                    summarizeSteps(selectedSteps, isStepsLoading),
                  ),
                  style: { ...detailPanelStyle, marginBottom: 0 },
                  children: isStepsLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
                      <Spin />
                    </div>
                  ) : selectedSteps && selectedSteps.length > 0 ? (
                    <Timeline
                      items={selectedSteps.map((step) => ({
                        color: getStepStatusColor(step.status),
                        children: (
                          <Card
                            size="small"
                            style={{
                              borderRadius: 12,
                              border: '1px solid var(--bg-secondary)',
                              background: 'var(--bg-card)',
                            }}
                          >
                            <Space direction="vertical" size={8} style={{ width: '100%' }}>
                              <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                                <Space wrap>
                                  <Text strong>{`步骤 ${step.stepIndex + 1}`}</Text>
                                  <Text>{step.name || step.action || step.type || '-'}</Text>
                                </Space>
                                <Tag color={getStepStatusColor(step.status)}>{step.status}</Tag>
                              </Space>
                              <Space wrap size={[8, 4]}>
                                <Text type="secondary">{`类型: ${step.type}`}</Text>
                                {step.action ? <Text type="secondary">{`动作: ${step.action}`}</Text> : null}
                              </Space>
                              <Space direction="vertical" size={2}>
                                <Text type="secondary">{`开始: ${formatDateTime(step.startedAt || step.createdAt)}`}</Text>
                                <Text type="secondary">{`结束: ${formatDateTime(step.endedAt || undefined)}`}</Text>
                              </Space>
                              {step.errorMessage ? (
                                <Alert
                                  type="error"
                                  showIcon
                                  message="步骤执行失败"
                                  description={step.errorMessage}
                                />
                              ) : null}
                              {step.outputJson && Object.keys(step.outputJson).length > 0 ? (
                                <Text type="secondary">{`输出字段: ${Object.keys(step.outputJson).slice(0, 4).join('、')}`}</Text>
                              ) : null}
                            </Space>
                          </Card>
                        ),
                      }))}
                    />
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无步骤" />
                  ),
                },
              ]}
            />
          </Space>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请选择一条执行记录" />
        )}
      </Drawer>
    </div>
  );
};

export default ExecutionListPage;
