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
  Steps,
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
  Modal,
  DatePicker,
} from 'antd';
import {
  SearchOutlined,
  PlusOutlined,
  ReloadOutlined,
  DownloadOutlined,
  PlayCircleOutlined,
  RobotOutlined,
  InfoCircleOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import {
  executionApi,
  ExecutionDto,
  ExecutionPhaseArtifactDto,
  ExecutionPhaseDto,
  ExecutionPhaseStepDto,
  ExecutionStatus,
  ExecutionStepDto,
} from '../api/execution';
import { runtimeSessionApi, RuntimeSessionDto } from '../api/runtimeSession';
import { skillApi } from '../api/skill';
import { capabilityReleaseApi } from '../api/capabilities';
import { useChatStore } from '../components/chat';
import { ListSectionHeader } from '../components/page/PageScaffold';
import LiveSessionPreviewCard from '../components/runtime/LiveSessionPreviewCard';
import InlineRecoveryPanel from '../components/execution/InlineRecoveryPanel';
import { RECOVERY_COPY } from '../components/execution/recoveryOptions';
import { runtimeConfig } from '../config/runtime';
import { useAuthStore } from '../store/authStore';
import { replaceLocalhostWithCurrentHost } from '../utils/publicUrl';
import {
  EXECUTION_ACTIVE_POLLING_STATUSES,
  EXECUTION_STATUS_COLORS,
  EXECUTION_STATUS_LABELS_ZH,
} from '../utils/executionStatusMeta';
import {
  buildWaitingInputDisplayGroups,
  resolveWaitingInputDisplayLabel,
} from '../utils/waitingInputDisplay';
import dayjs, { Dayjs } from 'dayjs';

const { Text } = Typography;
const statusColors = EXECUTION_STATUS_COLORS;
const statusLabels = EXECUTION_STATUS_LABELS_ZH;
const listStatusLabels: Partial<Record<ExecutionStatus, string>> = {
  running: '执行中',
  waiting_input: '补参',
  pending_approval: '审批',
  human_control: '接管',
  succeeded: '完成',
  failed: '失败',
  cancelled: '取消',
};
const getPhaseStatusColor = (status?: string) => {
  switch (status) {
    case 'completed':
      return 'green';
    case 'running':
      return 'blue';
    case 'retrying':
      return 'gold';
    case 'waiting_takeover':
      return 'orange';
    case 'resumable':
      return 'cyan';
    case 'failed':
      return 'red';
    case 'aborted':
      return 'default';
    default:
      return 'default';
  }
};

const getPhaseStepStatus = (status?: string): 'wait' | 'process' | 'finish' | 'error' => {
  switch (status) {
    case 'completed':
      return 'finish';
    case 'running':
    case 'retrying':
      return 'process';
    case 'failed':
    case 'aborted':
      return 'error';
    case 'waiting_takeover':
    case 'resumable':
    case 'pending':
    default:
      return 'wait';
  }
};
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
const formatListDateTime = (date?: string) => (date ? dayjs(date).format('MM-DD HH:mm') : '-');

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

const extractPhaseSortMeta = (phase: ExecutionPhaseDto) => {
  const key = phase.phaseKey || '';
  const parentKey = key.split('__')[0] || key;
  const activityMatch = key.match(/__activity_(\d+)_/i);
  const systemIndexMatch = parentKey.match(/^phase_(\d+)_/i);
  return {
    parentKey,
    systemIndex: systemIndexMatch ? Number.parseInt(systemIndexMatch[1], 10) : Number.MAX_SAFE_INTEGER,
    isActivity: Boolean(activityMatch),
    activityIndex: activityMatch ? Number.parseInt(activityMatch[1], 10) : -1,
  };
};

const compareExecutionPhases = (left: ExecutionPhaseDto, right: ExecutionPhaseDto) => {
  const leftMeta = extractPhaseSortMeta(left);
  const rightMeta = extractPhaseSortMeta(right);

  if (leftMeta.systemIndex !== rightMeta.systemIndex) {
    return leftMeta.systemIndex - rightMeta.systemIndex;
  }
  if (leftMeta.parentKey !== rightMeta.parentKey) {
    return leftMeta.parentKey.localeCompare(rightMeta.parentKey);
  }
  if (leftMeta.isActivity !== rightMeta.isActivity) {
    return leftMeta.isActivity ? 1 : -1;
  }
  if (leftMeta.activityIndex !== rightMeta.activityIndex) {
    return leftMeta.activityIndex - rightMeta.activityIndex;
  }

  const leftTime = new Date(left.startedAt || left.createdAt).getTime();
  const rightTime = new Date(right.startedAt || right.createdAt).getTime();
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  return left.phaseKey.localeCompare(right.phaseKey);
};

const hasMeaningfulExecutionResult = (value: unknown): boolean => {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }
  return true;
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

const isLiveRuntimeSessionState = (state?: string): boolean => state === 'busy' || state === 'ready' || state === 'frozen';
const isPreviewRuntimeSessionState = (state?: string): boolean =>
  state === 'allocating' || isLiveRuntimeSessionState(state);

const getRuntimeSessionNovncUrl = (runtimeSession?: RuntimeSessionDto): string | undefined => {
  return typeof runtimeSession?.connectionInfo?.novnc === 'string'
    ? runtimeSession.connectionInfo.novnc
    : undefined;
};

const getRuntimeSessionStatusLabel = (state?: string): string => {
  if (state === 'frozen') {
    return '人工接管';
  }
  if (state === 'ready') {
    return '已就绪';
  }
  if (state === 'busy') {
    return '执行中';
  }
  return '运行中';
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
  display_name?: string;
  group_label?: string;
  required: boolean;
  value?: unknown;
  missing: boolean;
  source: 'user_input' | 'default' | 'unresolved';
  needs_confirmation?: boolean;
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
    const rawStepResults = Array.isArray(candidate.stepResults)
      ? candidate.stepResults
      : Array.isArray(candidate.results)
        ? candidate.results
        : undefined;
    if (!Array.isArray(rawStepResults)) {
      continue;
    }

    const stepResults = rawStepResults
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
      .map((item) => ({
        stepId: typeof item.stepId === 'string' ? item.stepId : undefined,
        name: typeof item.name === 'string'
          ? item.name
          : typeof item.command === 'string'
            ? item.command
            : undefined,
        action: typeof item.action === 'string'
          ? item.action
          : typeof item.command === 'string'
            ? item.command
            : undefined,
        target: typeof item.target === 'string' ? item.target : null,
        snapshotId: typeof item.snapshotId === 'string'
          ? item.snapshotId
          : typeof asRecord(item.snapshot)?.id === 'string'
            ? (asRecord(item.snapshot)?.id as string)
            : null,
        output: asRecord(item.output) || item,
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

const getPhaseArtifactPayload = (artifact: ExecutionPhaseArtifactDto): Record<string, unknown> | undefined => {
  if (!artifact.payload || typeof artifact.payload !== 'object' || Array.isArray(artifact.payload)) {
    return undefined;
  }
  return artifact.payload;
};

const getPhaseArtifactPath = (artifact: ExecutionPhaseArtifactDto): string | undefined => {
  const payload = getPhaseArtifactPayload(artifact);
  if (typeof payload?.snapshotPath === 'string' && payload.snapshotPath.trim()) {
    return payload.snapshotPath;
  }
  if (typeof payload?.artifactPath === 'string' && payload.artifactPath.trim()) {
    return payload.artifactPath;
  }
  return undefined;
};

const getBrowserWorkerBaseUrl = (): string | undefined => {
  try {
    const runtimeUrl = new URL(runtimeConfig.recorderWsUrl);
    runtimeUrl.protocol = runtimeUrl.protocol === 'wss:' ? 'https:' : 'http:';
    runtimeUrl.pathname = '';
    runtimeUrl.search = '';
    runtimeUrl.hash = '';
    return runtimeUrl.toString().replace(/\/$/, '');
  } catch {
    return undefined;
  }
};

const buildBrowserWorkerArtifactUrl = (artifactPath?: string): string | undefined => {
  if (!artifactPath) {
    return undefined;
  }
  const trimmedPath = artifactPath.trim();
  if (!trimmedPath) {
    return undefined;
  }
  if (/^https?:\/\//i.test(trimmedPath) || trimmedPath.startsWith('data:')) {
    return trimmedPath;
  }

  const fileName = trimmedPath.split('/').filter(Boolean).pop();
  const browserWorkerBaseUrl = getBrowserWorkerBaseUrl();
  if (!fileName || !browserWorkerBaseUrl) {
    return undefined;
  }

  return `${browserWorkerBaseUrl}/browser/artifacts/${encodeURIComponent(fileName)}`;
};

const getPhaseArtifactPreviewSrc = (artifact: ExecutionPhaseArtifactDto): string | undefined => {
  const payload = getPhaseArtifactPayload(artifact);
  const payloadImageSrc = extractBrowserImageSrc(payload);
  if (payloadImageSrc) {
    return payloadImageSrc;
  }

  const artifactPath = getPhaseArtifactPath(artifact);
  if (!artifactPath || !/\.(png|jpe?g|gif|webp)$/i.test(artifactPath)) {
    return undefined;
  }

  return buildBrowserWorkerArtifactUrl(artifactPath);
};

const extractWorkflowActivitySnapshotSources = (phase: ExecutionPhaseDto): string[] => {
  const unique = new Set<string>();

  (phase.artifacts || [])
    .filter((artifact) => artifact.artifactType === 'snapshot')
    .forEach((artifact) => {
      const src = getPhaseArtifactPreviewSrc(artifact);
      if (src) {
        unique.add(src);
      }
    });

  return Array.from(unique);
};

const extractPhaseStepUrl = (step: ExecutionPhaseStepDto): string | undefined => {
  const output = asRecord(step.output);
  const input = asRecord(step.input);
  const candidates = [
    output?.pageUrl,
    output?.url,
    input?.pageUrl,
    input?.url,
    input?.targetUrl,
    input?.href,
  ];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return undefined;
};

const extractPhaseStepImageSources = (
  step: ExecutionPhaseStepDto,
  artifacts: ExecutionPhaseArtifactDto[],
): string[] => {
  const found = new Set<string>(extractBrowserImageSources(step.output));
  const output = asRecord(step.output);
  const artifactRecord = asRecord(output?.artifact);
  const snapshotRecord = asRecord(output?.snapshot);
  const candidatePaths = [
    typeof artifactRecord?.path === 'string' ? artifactRecord.path : undefined,
    typeof snapshotRecord?.path === 'string' ? snapshotRecord.path : undefined,
  ];

  for (const path of candidatePaths) {
    const src = buildBrowserWorkerArtifactUrl(path);
    if (src) {
      found.add(src);
    }
  }

  if (step.snapshotId) {
    const matchedArtifact = artifacts.find((artifact) => artifact.snapshotId === step.snapshotId);
    const artifactSrc = matchedArtifact ? getPhaseArtifactPreviewSrc(matchedArtifact) : undefined;
    if (artifactSrc) {
      found.add(artifactSrc);
    }
  }

  return Array.from(found);
};

const getVisiblePhaseSteps = (phase: ExecutionPhaseDto): ExecutionPhaseStepDto[] => {
  const steps = phase.steps || [];
  if (phase.status !== 'completed') {
    return steps;
  }

  const lastFailedIndex = steps.reduce((index, step, currentIndex) => (
    step.status === 'failed' ? currentIndex : index
  ), -1);

  if (lastFailedIndex < 0) {
    return steps;
  }

  const hasLaterCompletedStep = steps.slice(lastFailedIndex + 1).some((step) => step.status === 'completed');
  if (!hasLaterCompletedStep) {
    return steps;
  }

  return steps.filter((step, index) => !(step.status === 'failed' && index <= lastFailedIndex));
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
  const [clearBeforeDate, setClearBeforeDate] = useState<Dayjs>(() => dayjs().subtract(2, 'day'));
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
    {
      enabled: !!selectedExecutionId,
      refetchInterval: (data) => {
        if (!data) {
          return false;
        }
        return EXECUTION_ACTIVE_POLLING_STATUSES.includes(data.status) ? 3000 : false;
      },
    }
  );

  const { data: selectedSteps, isLoading: isStepsLoading } = useQuery<ExecutionStepDto[], Error>(
    ['execution-steps', selectedExecutionId],
    () => executionApi.getSteps(selectedExecutionId!),
    {
      enabled: !!selectedExecutionId,
      refetchInterval: () => {
        if (!selectedExecution) {
          return false;
        }
        return EXECUTION_ACTIVE_POLLING_STATUSES.includes(selectedExecution.status) ? 3000 : false;
      },
    }
  );
  const { data: selectedPhasesData } = useQuery<ExecutionPhaseDto[], Error>(
    ['execution-phases', selectedExecutionId],
    () => executionApi.getPhases(selectedExecutionId!),
    {
      enabled: !!selectedExecutionId,
      refetchInterval: () => {
        if (!selectedExecution) {
          return false;
        }
        return EXECUTION_ACTIVE_POLLING_STATUSES.includes(selectedExecution.status) ? 3000 : false;
      },
    }
  );
  const selectedExecutionPhases = selectedPhasesData || selectedExecution?.phases || [];
  const sortedSelectedExecutionPhases = useMemo(
    () => [...selectedExecutionPhases].sort(compareExecutionPhases),
    [selectedExecutionPhases],
  );
  const effectiveSelectedResultJson = useMemo(() => {
    const parsedTopLevelResult = tryParseJsonValue(selectedExecution?.resultJson);
    if (hasMeaningfulExecutionResult(parsedTopLevelResult)) {
      return parsedTopLevelResult;
    }
    const phaseWithOutput = [...sortedSelectedExecutionPhases]
      .reverse()
      .find((phase) => hasMeaningfulExecutionResult(tryParseJsonValue(phase.output)));
    return phaseWithOutput ? tryParseJsonValue(phaseWithOutput.output) : undefined;
  }, [selectedExecution?.resultJson, sortedSelectedExecutionPhases]);
  const selectedBrowserExecutionResult = useMemo(
    () => extractBrowserExecutionResult(selectedExecution?.resultJson) || extractBrowserExecutionResult(effectiveSelectedResultJson),
    [effectiveSelectedResultJson, selectedExecution?.resultJson],
  );
  const displaySelectedPhases = useMemo(() => {
    const activityPhases = sortedSelectedExecutionPhases.filter((phase) => phase.phaseType === 'workflow_activity');
    return activityPhases.length > 0 ? activityPhases : sortedSelectedExecutionPhases;
  }, [sortedSelectedExecutionPhases]);
  const hasSelectedWorkflowActivityPhases = useMemo(
    () => sortedSelectedExecutionPhases.some((phase) => phase.phaseType === 'workflow_activity'),
    [sortedSelectedExecutionPhases],
  );
  const isSelectedExecutionActive = Boolean(
    selectedExecution && EXECUTION_ACTIVE_POLLING_STATUSES.includes(selectedExecution.status),
  );
  const shouldShowLegacySteps = sortedSelectedExecutionPhases.length === 0;
  const currentSelectedPhase = useMemo(
    () => displaySelectedPhases.find((phase) => phase.phaseKey === selectedExecution?.currentPhaseKey)
      || displaySelectedPhases.find((phase) => phase.status === 'running')
      || displaySelectedPhases.find((phase) => ['waiting_takeover', 'resumable', 'pending'].includes(phase.status))
      || displaySelectedPhases[displaySelectedPhases.length - 1],
    [displaySelectedPhases, selectedExecution?.currentPhaseKey],
  );
  const shouldShowSelectedCurrentPhaseInfo = Boolean(
    selectedExecution && (
      selectedExecution.status === 'running'
      || selectedExecution.status === 'human_control'
      || selectedExecution.status === 'failed'
    ),
  );
  const selectedExecutionRuntimeSessionId = selectedExecution?.runtimeSessionId || selectedBrowserExecutionResult?.runtimeSessionId;
  const { data: selectedRuntimeSession } = useQuery(
    ['execution-runtime-session', selectedExecutionRuntimeSessionId],
    () => runtimeSessionApi.getById(selectedExecutionRuntimeSessionId!),
    {
      enabled: Boolean(selectedExecutionRuntimeSessionId),
      refetchInterval: (data) => {
        if (isLiveRuntimeSessionState(data?.state)) {
          return 3000;
        }
        return selectedExecution && EXECUTION_ACTIVE_POLLING_STATUSES.includes(selectedExecution.status)
          ? 3000
          : false;
      },
    }
  );
  const selectedRuntimeSessionNovncUrl = getRuntimeSessionNovncUrl(selectedRuntimeSession);
  const lastKnownSelectedRuntimeSessionNovncUrlRef = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    if (selectedRuntimeSessionNovncUrl) {
      lastKnownSelectedRuntimeSessionNovncUrlRef.current = selectedRuntimeSessionNovncUrl;
    }
  }, [selectedRuntimeSessionNovncUrl]);
  const stableSelectedRuntimeSessionNovncUrl =
    selectedRuntimeSessionNovncUrl || lastKnownSelectedRuntimeSessionNovncUrlRef.current;

  const waitingInputStep = selectedExecution?.status === 'waiting_input'
    ? selectedSteps?.find((step) =>
      step.id === selectedExecution.currentStepId
      || (step.type === 'input_collection' && step.status === 'running')
    )
    : undefined;

  const requiredInputs = Array.isArray(waitingInputStep?.inputJson?.requiredInputs)
    ? (waitingInputStep?.inputJson?.requiredInputs as unknown as RequiredInputField[])
    : [];
  const requiredInputGroups = useMemo(
    () => buildWaitingInputDisplayGroups(requiredInputs),
    [requiredInputs],
  );

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
        void message.error(`${RECOVERY_COPY.resumeErrorPrefix}：${error.message}`);
      },
    }
  );

  const cleanupExecutionsMutation = useMutation(
    async ({ beforeDate }: { beforeDate: string }) => {
      const response = await executionApi.cleanupBeforeDate({ beforeDate });
      return {
        beforeDate,
        deletedCount: response.deletedCount,
      };
    },
    {
      onSuccess: async ({ beforeDate, deletedCount }) => {
        const cutoff = new Date(`${beforeDate}T00:00:00`).getTime();
        const selectedExecutionCreatedAt = selectedExecution?.createdAt
          ? new Date(selectedExecution.createdAt).getTime()
          : Number.NaN;

        if (selectedExecutionId && Number.isFinite(selectedExecutionCreatedAt) && selectedExecutionCreatedAt < cutoff) {
          const nextSearchParams = new URLSearchParams(searchParams);
          nextSearchParams.delete('executionId');
          setSearchParams(nextSearchParams, { replace: true });
        }

        await Promise.all([
          queryClient.invalidateQueries(['executions']),
          queryClient.invalidateQueries(['dashboard-executions-recent']),
          queryClient.invalidateQueries(['execution']),
          queryClient.invalidateQueries(['execution-steps']),
        ]);

        void message.success(
          deletedCount > 0
            ? `已清理 ${beforeDate} 之前的 ${deletedCount} 条执行记录`
            : `没有找到 ${beforeDate} 之前可清理的执行记录`,
        );
      },
      onError: (error: Error) => {
        void message.error(`清理执行记录失败：${error.message}`);
      },
    }
  );

  const phaseTakeoverMutation = useMutation(
    async (phase: ExecutionPhaseDto) => {
      if (!selectedExecutionId) {
        throw new Error('未选择执行记录');
      }
      return executionApi.takeoverPhase(selectedExecutionId, phase.phaseKey, {
        reason: phase.errorMessage || phase.errorCode || phase.phaseName || phase.phaseKey,
      });
    },
    {
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries(['executions']),
          queryClient.invalidateQueries(['execution', selectedExecutionId]),
          queryClient.invalidateQueries(['execution-steps', selectedExecutionId]),
        ]);
        void message.success(RECOVERY_COPY.successTakeover);
      },
      onError: (error: Error) => {
        void message.error(`${RECOVERY_COPY.takeoverErrorPrefix}：${error.message}`);
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
      width: 220,
      render: (_: unknown, record: ExecutionDto) => (
        <Space direction="vertical" size={4}>
          <Text
            strong
            ellipsis={{ tooltip: getSkillDisplayName(record.skillId) }}
            style={{ display: 'block', maxWidth: 200, fontSize: 16 }}
          >
            {getSkillDisplayName(record.skillId)}
          </Text>
        </Space>
      ),
    },
    {
      title: '开始时间',
      dataIndex: 'startedAt',
      key: 'startedAt',
      width: 140,
      defaultSortOrder: 'descend' as const,
      sorter: (a: ExecutionDto, b: ExecutionDto) => getExecutionTime(a) - getExecutionTime(b),
      render: (_: string | undefined, record: ExecutionDto) => (
        <Space direction="vertical" size={0}>
          <Text>{formatListDateTime(record.startedAt || record.createdAt)}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {formatDuration(record)}
          </Text>
        </Space>
      ),
    },
    {
      title: '状态',
      key: 'status',
      width: 88,
      render: (_: unknown, record: ExecutionDto) => (
        <Tag
          color={statusColors[record.status]}
          style={{ marginInlineEnd: 0, width: 'fit-content', paddingInline: 10, borderRadius: 999, fontWeight: 600 }}
        >
          {listStatusLabels[record.status] || statusLabels[record.status]}
        </Tag>
      ),
    },
    {
      title: '风险',
      dataIndex: 'riskLevel',
      key: 'riskLevel',
      width: 64,
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
      width: 260,
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

  const updateExecutionSelection = (executionId?: string) => {
    const nextSearchParams = new URLSearchParams(searchParams);
    if (executionId) {
      nextSearchParams.set('executionId', executionId);
    } else {
      nextSearchParams.delete('executionId');
    }
    setSearchParams(nextSearchParams, { replace: true });
  };

  const handleCleanupBeforeDate = () => {
    if (!clearBeforeDate) {
      void message.info('请先选择清理日期');
      return;
    }

    const beforeDate = clearBeforeDate.format('YYYY-MM-DD');
    Modal.confirm({
      title: '清理指定日期之前的执行记录？',
      content: `将删除 ${beforeDate} 之前创建的执行记录，默认仅清理当前用户自己的记录，此操作不可恢复。`,
      okText: '确认清理',
      cancelText: '取消',
      okButtonProps: {
        danger: true,
        loading: cleanupExecutionsMutation.isLoading,
      },
      onOk: async () => {
        await cleanupExecutionsMutation.mutateAsync({ beforeDate });
      },
    });
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
              <DatePicker
                size="middle"
                value={clearBeforeDate}
                onChange={(value) => setClearBeforeDate(value ?? dayjs().subtract(2, 'day'))}
                allowClear={false}
                format="YYYY-MM-DD"
                style={{ minWidth: 150 }}
              />
              <Button
                size="middle"
                danger
                icon={<DeleteOutlined />}
                onClick={handleCleanupBeforeDate}
                loading={cleanupExecutionsMutation.isLoading}
                className="btn-pill"
              >
                清理日期前
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
            <Collapse
              ghost
              defaultActiveKey={['summary']}
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
                      {shouldShowSelectedCurrentPhaseInfo ? (
                        <Descriptions.Item label="当前阶段">
                          <Space direction="vertical" size={0}>
                            <Text>{selectedExecution.currentPhaseKey || '-'}</Text>
                            <Text type="secondary">{selectedExecution.currentPhaseStatus || '未开始'}</Text>
                          </Space>
                        </Descriptions.Item>
                      ) : null}
                      <Descriptions.Item label="浏览器会话">
                        {selectedExecutionRuntimeSessionId ? (
                          <Space wrap>
                            <Text copyable={{ text: selectedExecutionRuntimeSessionId }}>
                              {selectedExecutionRuntimeSessionId}
                            </Text>
                            {stableSelectedRuntimeSessionNovncUrl ? (
                              <Button
                                type="link"
                                style={{ paddingInline: 0 }}
                                onClick={() => window.open(fixLocalhostLink(stableSelectedRuntimeSessionNovncUrl), '_blank', 'noopener,noreferrer')}
                              >
                                打开实时画面
                              </Button>
                            ) : (
                              <Button
                                type="link"
                                style={{ paddingInline: 0 }}
                                onClick={() => navigate(`/executions/${selectedExecution.id}`)}
                              >
                                打开详情页
                              </Button>
                            )}
                          </Space>
                        ) : (
                          '-'
                        )}
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
              ]}
            />

            {stableSelectedRuntimeSessionNovncUrl && (isSelectedExecutionActive || isPreviewRuntimeSessionState(selectedRuntimeSession?.state)) ? (
              <LiveSessionPreviewCard
                novncUrl={stableSelectedRuntimeSessionNovncUrl}
                title="实时画面"
                statusLabel={getRuntimeSessionStatusLabel(selectedRuntimeSession?.state)}
                height={360}
              />
            ) : null}

            {displaySelectedPhases.length > 0 ? (
              <Card title="步骤进度">
                <Steps
                  current={Math.max(displaySelectedPhases.findIndex((phase) => phase.phaseKey === currentSelectedPhase?.phaseKey), 0)}
                  size="small"
                  responsive
                  style={{ marginBottom: 16 }}
                  items={displaySelectedPhases.map((phase, index) => {
                    const isCurrentActivity = currentSelectedPhase?.phaseKey === phase.phaseKey;
                    return {
                      title: phase.phaseName || phase.phaseKey || `步骤 ${index + 1}`,
                      status: getPhaseStepStatus(phase.status),
                      description: (
                        <Space direction="vertical" size={4}>
                          <Space wrap size={[8, 4]}>
                            <Tag color={getPhaseStatusColor(phase.status)}>{phase.status}</Tag>
                            <Tag>{phase.phaseType}</Tag>
                            {isCurrentActivity ? <Tag color="processing">当前 Activity</Tag> : null}
                          </Space>
                          <Space wrap size={[12, 0]}>
                            <Text type="secondary">{`尝试: ${phase.attempt}`}</Text>
                            <Text type="secondary">{`步骤数: ${phase.steps?.length || 0}`}</Text>
                          </Space>
                          {phase.errorMessage ? <Text type="danger">{phase.errorMessage}</Text> : null}
                        </Space>
                      ),
                    };
                  })}
                />
                {shouldShowSelectedCurrentPhaseInfo && currentSelectedPhase ? (
                  <Alert
                    type="info"
                    showIcon
                    message={`当前阶段：${currentSelectedPhase.phaseName || currentSelectedPhase.phaseKey}`}
                    description={
                      <Space wrap size={[12, 4]}>
                        <Text type="secondary">{`Key: ${currentSelectedPhase.phaseKey}`}</Text>
                        <Text type="secondary">{formatDateTime(currentSelectedPhase.startedAt || currentSelectedPhase.createdAt)}</Text>
                      </Space>
                    }
                  />
                ) : null}
              </Card>
            ) : null}

            <InlineRecoveryPanel
              executionId={selectedExecution.id}
              executionStatus={selectedExecution.status}
              currentStepId={selectedExecution.currentStepId}
              phase={currentSelectedPhase}
            />

            <Collapse
              ghost
              expandIconPosition="end"
              items={[
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
                        message={RECOVERY_COPY.waitingInputTitle}
                        description={RECOVERY_COPY.waitingInputDesc}
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
                          {requiredInputGroups.length > 0 ? requiredInputGroups.map((group) => (
                            <div
                              key={group.label}
                              style={{
                                padding: 14,
                                borderRadius: 14,
                                border: '1px solid var(--bg-secondary)',
                                background: 'var(--bg-card)',
                                boxShadow: 'var(--shadow-sm)',
                              }}
                            >
                              <Text strong style={{ display: 'block', marginBottom: 12 }}>
                                {group.label}
                              </Text>
                              <div
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                                  gap: 12,
                                }}
                              >
                                {group.items.map((field) => (
                                  <div
                                    key={field.name}
                                    style={{
                                      padding: 14,
                                      borderRadius: 12,
                                      border: '1px solid var(--bg-secondary)',
                                      background: 'var(--bg-primary)',
                                    }}
                                  >
                                    <Space size={[6, 6]} wrap style={{ marginBottom: 8 }}>
                                      <Text strong>{resolveWaitingInputDisplayLabel(field)}</Text>
                                      <Tag style={{ marginInlineEnd: 0 }}>{field.type}</Tag>
                                      <Tag
                                        color={field.required ? 'error' : 'default'}
                                        style={{ marginInlineEnd: 0 }}
                                      >
                                        {field.required ? '必填' : '可选'}
                                      </Tag>
                                      {field.needs_confirmation ? (
                                        <Tag color="gold" style={{ marginInlineEnd: 0 }}>待确认</Tag>
                                      ) : null}
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
                                          message: `请输入 ${resolveWaitingInputDisplayLabel(field)}`,
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
                            </div>
                          )) : requiredInputs.map((field) => (
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
                                <Text strong>{resolveWaitingInputDisplayLabel(field)}</Text>
                                <Tag style={{ marginInlineEnd: 0 }}>{field.type}</Tag>
                                <Tag
                                  color={field.required ? 'error' : 'default'}
                                  style={{ marginInlineEnd: 0 }}
                                >
                                  {field.required ? '必填' : '可选'}
                                </Tag>
                                {field.needs_confirmation ? (
                                  <Tag color="gold" style={{ marginInlineEnd: 0 }}>待确认</Tag>
                                ) : null}
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
                                    message: `请输入 ${resolveWaitingInputDisplayLabel(field)}`,
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
                            {RECOVERY_COPY.waitingInputContinue}
                          </Button>
                          <Button
                            icon={<RobotOutlined />}
                            loading={submitInputMutation.isLoading}
                            onClick={() => void handleResumeExecution(true)}
                          >
                            {RECOVERY_COPY.waitingInputToAi}
                          </Button>
                        </Space>
                      </Form>
                    </>
                  ),
                }] : []),
                {
                  key: 'phases',
                  label: renderPanelLabel(
                    '阶段',
                    displaySelectedPhases.length > 0
                      ? `${displaySelectedPhases.length} 个阶段 / ${selectedExecution.currentPhaseKey || '已归档'}`
                      : '暂无阶段记录',
                  ),
                  style: detailPanelStyle,
                  children: displaySelectedPhases.length > 0 ? (
                    hasSelectedWorkflowActivityPhases && isSelectedExecutionActive ? (
                      <Alert
                        type="info"
                        showIcon
                        message="执行进行中"
                        description="执行中以上方 3 个 Activity 进度为主视图，这里先不展开阶段内部明细；执行完成后再展示截图与补充结果。"
                      />
                    ) : (
                    <Collapse
                      ghost
                      expandIconPosition="end"
                      items={displaySelectedPhases.map((phase: ExecutionPhaseDto) => {
                        const visiblePhaseSteps = getVisiblePhaseSteps(phase);

                        return {
                          key: phase.id,
                          label: renderPanelLabel(
                            phase.phaseName || phase.phaseKey,
                            `${phase.status} / ${formatDateTime(phase.startedAt || phase.createdAt)}`,
                          ),
                          style: {
                            ...detailPanelStyle,
                            marginBottom: 12,
                          },
                          children: (
                            <Space direction="vertical" size={12} style={{ width: '100%' }}>
                              <Space wrap size={[8, 4]}>
                                <Tag>{phase.phaseType}</Tag>
                                <Tag color={getPhaseStatusColor(phase.status)}>{phase.status}</Tag>
                                <Text type="secondary">{`Key: ${phase.phaseKey}`}</Text>
                                <Text type="secondary">{`尝试: ${phase.attempt}`}</Text>
                                {phase.runtimeSessionId ? (
                                  <Text copyable={{ text: phase.runtimeSessionId }}>{`会话: ${phase.runtimeSessionId}`}</Text>
                                ) : null}
                              </Space>
                              <Space wrap>
                                {selectedExecution.status !== 'human_control' && (phase.status === 'running' || phase.status === 'failed') ? (
                                  <Button
                                    size="small"
                                    onClick={() => phaseTakeoverMutation.mutate(phase)}
                                    loading={phaseTakeoverMutation.isLoading}
                                  >
                                    接管当前阶段
                                  </Button>
                                ) : null}
                              </Space>
                              {phase.errorMessage ? (
                                <Alert
                                  type="error"
                                  showIcon
                                  message={phase.errorCode || '阶段失败'}
                                  description={phase.errorMessage}
                                />
                              ) : null}
                              {phase.phaseType === 'workflow_activity' ? (
                                <Card size="small" title="Activity 结果" styles={{ body: { padding: 12 } }}>
                                  <Space direction="vertical" size={10} style={{ width: '100%' }}>
                                    <Space wrap size={[12, 4]}>
                                      <Text type="secondary">{`步骤数: ${phase.steps?.length || 0}`}</Text>
                                      <Text type="secondary">{`截图: ${extractWorkflowActivitySnapshotSources(phase).length}`}</Text>
                                    </Space>
                                    {extractWorkflowActivitySnapshotSources(phase).length > 0 ? (
                                      <Image.PreviewGroup>
                                        <Space wrap size={12}>
                                          {extractWorkflowActivitySnapshotSources(phase).map((src, index) => (
                                            <Image
                                              key={`${phase.id}-snapshot-${index + 1}`}
                                              src={src}
                                              alt={`${phase.phaseName || phase.phaseKey}-snapshot-${index + 1}`}
                                              style={{
                                                width: 320,
                                                maxWidth: '100%',
                                                maxHeight: 320,
                                                objectFit: 'contain',
                                                background: 'var(--bg-secondary)',
                                                borderRadius: 8,
                                                border: '1px solid var(--bg-secondary)',
                                                padding: 6,
                                              }}
                                            />
                                          ))}
                                        </Space>
                                      </Image.PreviewGroup>
                                    ) : (
                                      <Text type="secondary">该 Activity 暂无可展示截图。</Text>
                                    )}
                                  </Space>
                                </Card>
                              ) : phase.steps && phase.steps.length > 0 ? (
                                <Timeline
                                  items={visiblePhaseSteps.map((step) => {
                                    const stepUrl = extractPhaseStepUrl(step);
                                    const stepImageSources = extractPhaseStepImageSources(step, phase.artifacts || []);
                                    const isWaitStep = step.action === 'wait';
                                    const isNavigateStep = step.action === 'navigate';
                                    const isScreenshotStep = step.action === 'screenshot';

                                    return {
                                      color: getPhaseStatusColor(step.status),
                                      children: (
                                        isWaitStep ? (
                                          <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
                                            <Space wrap>
                                              <Text strong>等待</Text>
                                              <Tag color={getPhaseStatusColor(step.status)}>{step.status}</Tag>
                                            </Space>
                                            <Text type="secondary">{formatDateTime(step.startedAt || step.createdAt)}</Text>
                                          </Space>
                                        ) : (
                                          <Card size="small">
                                            <Space direction="vertical" size={10} style={{ width: '100%' }}>
                                              <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
                                                <Space wrap>
                                                  <Text strong>
                                                    {isNavigateStep ? '打开页面' : isScreenshotStep ? '截图' : step.action || `步骤 ${step.stepIndex + 1}`}
                                                  </Text>
                                                  <Tag color={getPhaseStatusColor(step.status)}>{step.status}</Tag>
                                                </Space>
                                                <Text type="secondary">{formatDateTime(step.startedAt || step.createdAt)}</Text>
                                              </Space>
                                              {isNavigateStep ? (
                                                <Text copyable={stepUrl ? { text: stepUrl } : undefined}>
                                                  {stepUrl || '-'}
                                                </Text>
                                              ) : null}
                                              {step.errorMessage ? (
                                                <Alert
                                                  type="error"
                                                  showIcon
                                                  message="步骤执行失败"
                                                  description={step.errorMessage}
                                                />
                                              ) : null}
                                              {stepImageSources.length > 0 ? (
                                                <Image.PreviewGroup>
                                                  <Space wrap size={12}>
                                                    {stepImageSources.map((src, index) => (
                                                      <Image
                                                        key={`${src}-${index}`}
                                                        src={src}
                                                        alt={`${phase.phaseName || phase.phaseKey}-step-${index + 1}`}
                                                        style={{
                                                          width: 320,
                                                          maxWidth: '100%',
                                                          maxHeight: 320,
                                                          objectFit: 'contain',
                                                          background: 'var(--bg-secondary)',
                                                          borderRadius: 8,
                                                          border: '1px solid var(--bg-secondary)',
                                                          padding: 6,
                                                        }}
                                                      />
                                                    ))}
                                                  </Space>
                                                </Image.PreviewGroup>
                                              ) : null}
                                            </Space>
                                          </Card>
                                        )
                                      ),
                                    };
                                  })}
                                />
                              ) : null}
                            </Space>
                          ),
                        };
                      })}
                    />
                    )
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无阶段记录" />
                  ),
                },
                ...(!displaySelectedPhases.length && shouldShowLegacySteps ? [{
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
                }] : []),
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
