/**
 * ExecutionDetailPage
 * View execution details and steps
 * Phase 4: Portal Execution views
 */

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Tag, Button, Space, Typography, Spin, Alert, Table, Steps, Empty, Form, Input, InputNumber, Switch, Timeline, Image, Carousel, message } from 'antd';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import '../components/chat/ChatMessage.css';
import {
  ArrowLeftOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  UserOutlined,
  WarningOutlined,
  ThunderboltOutlined,
  DownOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { executionApi, ExecutionDto, ExecutionStepDto } from '../api/execution';
import { skillApi } from '../api/skill';
import { capabilityReleaseApi } from '../api/capabilities';
import { useAuthStore } from '../store/authStore';
import { replaceLocalhostWithCurrentHost } from '../utils/publicUrl';
import {
  EXECUTION_ACTIVE_POLLING_STATUSES,
  EXECUTION_STATUS_COLORS,
  EXECUTION_STATUS_LABELS_EN,
  EXECUTION_STATUS_LABELS_ZH,
} from '../utils/executionStatusMeta';
import {
  buildWaitingInputDisplayGroups,
  resolveWaitingInputDisplayLabel,
} from '../utils/waitingInputDisplay';

const { Title, Text } = Typography;

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

interface TimelineNodeCardProps {
  title: string;
  subtitle?: string;
  preview?: React.ReactNode;
  color?: 'green' | 'red' | 'processing' | 'gray' | 'blue';
  details?: React.ReactNode;
}

const statusColors = EXECUTION_STATUS_COLORS;

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

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
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

// 美化文本内容，处理连续换行
const beautifyText = (text: string, useDivider = true): string => {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n') // 统一换行符
    .replace(/[ \t]+\n/g, '\n') // 去除行尾空格
    .replace(/\n\s*\n\s*\n+/g, useDivider ? '\n\n---\n\n' : '\n\n') // 将3个及以上的连续换行替换为分割线
    .replace(/^[\s\n]+|[\s\n]+$/g, ''); // 去除首尾空白
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
  const [expanded, setExpanded] = React.useState(false);
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

const renderJsonValue = (value: unknown, path = 'root'): React.ReactNode => {
  if (typeof value === 'string') {
    return `"${value}"`;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return (
      <>
        [
        {value.length > 0 && (
          <div style={{ paddingLeft: 16 }}>
            {value.map((item, index) => (
              <div key={`${path}-${index}`}>
                {renderJsonValue(item, `${path}.${index}`)}
                {index < value.length - 1 ? ',' : ''}
              </div>
            ))}
          </div>
        )}
        ]
      </>
    );
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
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
                    <>
                      <a href={fixedLink} target="_blank" rel="noopener noreferrer">
                        {fixedLink}
                      </a>
                    </>
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

  return String(value);
};

const stepTypeLabels: Record<string, { zh: string; en: string }> = {
  input_collection: { zh: '输入采集', en: 'Input Collection' },
  approval: { zh: '审批', en: 'Approval' },
  activity: { zh: '活动', en: 'Activity' },
  skill: { zh: '技能', en: 'Skill' },
};

const stepStatusLabels: Record<string, { zh: string; en: string }> = {
  pending: { zh: '待执行', en: 'Pending' },
  running: { zh: '执行中', en: 'Running' },
  succeeded: { zh: '已成功', en: 'Succeeded' },
  failed: { zh: '失败', en: 'Failed' },
  skipped: { zh: '已跳过', en: 'Skipped' },
  waiting_input: { zh: '待补输入', en: 'Waiting Input' },
  pending_approval: { zh: '待审批', en: 'Pending Approval' },
  cancelled: { zh: '已取消', en: 'Cancelled' },
};

const stepStatusIcons: Record<string, React.ReactNode> = {
  pending: <ClockCircleOutlined />,
  running: <PlayCircleOutlined />,
  succeeded: <CheckCircleOutlined style={{ color: 'green' }} />,
  failed: <CloseCircleOutlined style={{ color: 'red' }} />,
  skipped: <PauseCircleOutlined />,
};

const renderSemanticGroupedMissing = (
  groupedMissing: NonNullable<ExecutionDto['semantic']>['groupedMissing'],
  labels: {
    group: string;
    field: string;
    blocking: string;
    previewOk: string;
  },
) => {
  if (!groupedMissing.length) {
    return null;
  }

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      {groupedMissing.map((group) => (
        <Card
          key={group.key}
          size="small"
          styles={{ body: { padding: 12 } }}
          style={{ borderRadius: 10, background: 'var(--bg-secondary)' }}
        >
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            <Space wrap>
              <Text strong>{group.label}</Text>
              <Tag color={group.kind === 'array_group' ? 'processing' : 'default'}>
                {group.kind === 'array_group' ? labels.group : labels.field}
              </Tag>
              <Tag color={group.blocking ? 'red' : 'gold'}>
                {group.blocking ? labels.blocking : labels.previewOk}
              </Tag>
            </Space>
            {group.description ? <Text type="secondary">{group.description}</Text> : null}
            <Text type="secondary">
              {group.missingFieldNames.join(', ')}
            </Text>
          </Space>
        </Card>
      ))}
    </Space>
  );
};

const getBrowserStepColor = (
  _stepResult: BrowserExecutionStepResult,
  index: number,
  stepCount: number,
  hasFailure: boolean,
): TimelineNodeCardProps['color'] => {
  if (hasFailure && index === stepCount - 1) {
    return 'red';
  }
  return 'green';
};

const ExecutionDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const { language } = useAuthStore();
  const isEnglish = language === 'en-US';
  const text = {
    loading: isEnglish ? 'Loading execution...' : '正在加载执行详情...',
    loadFailed: isEnglish ? 'Failed to load execution' : '加载执行详情失败',
    notFound: isEnglish ? 'Execution not found' : '未找到执行记录',
    backToExecutions: isEnglish ? 'Back to Executions' : '返回执行列表',
    enterTakeoverMode: isEnglish ? 'Enter Takeover Mode' : '进入接管模式',
    details: isEnglish ? 'Execution Details' : '执行详情',
    idLabel: isEnglish ? 'ID' : '执行单 ID',
    takeoverRequired: isEnglish ? 'Human Takeover Required' : '需要人工接管',
    takeoverDescDefault: isEnglish ? 'The execution requires human intervention.' : '该执行需要人工介入处理。',
    enterTakeoverWorkbench: isEnglish ? 'Enter Takeover Workbench' : '进入人工接管工作台',
    approvalRequired: isEnglish ? 'Approval Required' : '需要审批',
    approvalWaiting: isEnglish ? 'Execution is waiting for approval' : '执行正在等待审批',
    approvalStatusPrefix: isEnglish ? 'Current approval status:' : '当前审批状态：',
    approvalDescDefault: isEnglish ? 'Review the execution details and decide whether it can continue.' : '请先查看执行详情，再决定是否允许继续执行。',
    approveAndContinue: isEnglish ? 'Approve And Continue' : '批准并继续执行',
    rejectExecution: isEnglish ? 'Reject Execution' : '拒绝执行',
    missingInputRequired: isEnglish ? 'Missing Input Required' : '需要补充输入',
    waitingInput: isEnglish ? 'Execution is waiting for additional input' : '执行正在等待补充输入',
    waitingInputDesc: isEnglish ? 'Fill in the missing parameters below to resume execution.' : '请填写下面缺失的参数后恢复执行。',
    invalidJson: isEnglish ? 'Invalid JSON input' : 'JSON 输入格式无效',
    submitAndResume: isEnglish ? 'Submit And Resume' : '提交并恢复执行',
    reset: isEnglish ? 'Reset' : '重置',
    status: isEnglish ? 'Status' : '状态',
    skillId: isEnglish ? 'Skill ID' : '技能标识',
    runtimeType: isEnglish ? 'Runtime Type' : '运行时类型',
    riskLevel: isEnglish ? 'Risk Level' : '风险等级',
    approvalStatus: isEnglish ? 'Approval Status' : '审批状态',
    createdBy: isEnglish ? 'Created By' : '创建人',
    createdAt: isEnglish ? 'Created At' : '创建时间',
    startedAt: isEnglish ? 'Started At' : '开始时间',
    endedAt: isEnglish ? 'Ended At' : '结束时间',
    failureReason: isEnglish ? 'Failure Reason' : '失败原因',
    failureCode: isEnglish ? 'Failure Code' : '失败代码',
    inputOutput: isEnglish ? 'Input & Output' : '输入与输出',
    input: isEnglish ? 'Input' : '输入',
    result: isEnglish ? 'Result' : '结果',
    stepsProgress: isEnglish ? 'Steps Progress' : '步骤进度',
    stepsDetails: isEnglish ? 'Steps Details' : '步骤详情',
    noSteps: isEnglish ? 'No steps recorded' : '暂无步骤记录',
    inputSubmitted: isEnglish ? 'Input submitted and execution resumed' : '输入已提交，执行已恢复',
    submitInputFailed: isEnglish ? 'Failed to submit input' : '提交输入失败',
    executionApproved: isEnglish ? 'Execution approved' : '执行已批准',
    approveFailed: isEnglish ? 'Failed to approve execution' : '批准执行失败',
    executionRejected: isEnglish ? 'Execution rejected' : '执行已拒绝',
    rejectFailed: isEnglish ? 'Failed to reject execution' : '拒绝执行失败',
    provideField: isEnglish ? 'Please provide' : '请输入',
    enterJsonString: isEnglish ? 'Enter JSON string' : '请输入 JSON 字符串',
    enterField: isEnglish ? 'Enter' : '请输入',
    source: isEnglish ? 'Source' : '来源',
    step: isEnglish ? 'Step' : '步骤',
    name: isEnglish ? 'Name' : '名称',
    type: isEnglish ? 'Type' : '类型',
    action: isEnglish ? 'Action' : '动作',
    error: isEnglish ? 'Error' : '错误',
    duration: isEnglish ? 'Duration' : '耗时',
    browserExecutionResult: isEnglish ? 'Browser Execution Result' : '浏览器执行结果',
    browserRuntimeInfo: isEnglish ? 'Browser Runtime Info' : '浏览器运行信息',
    browserSteps: isEnglish ? 'Browser Steps' : '浏览器步骤结果',
    browserStepOutput: isEnglish ? 'Step Output' : '步骤输出',
    browserSnapshotId: isEnglish ? 'Snapshot ID' : '快照 ID',
    browserTarget: isEnglish ? 'Target' : '目标',
    browserBackend: isEnglish ? 'Backend' : '执行后端',
    browserRuntimeSessionId: isEnglish ? 'Runtime Session' : '运行会话',
    browserStepCount: isEnglish ? 'Step Count' : '步骤数',
    browserFailedStep: isEnglish ? 'Failed Step' : '失败步骤',
    browserFailedAction: isEnglish ? 'Failed Action' : '失败动作',
    browserNoOutput: isEnglish ? 'No structured output' : '暂无结构化输出',
    semanticOverview: isEnglish ? 'Semantic Overview' : '语义摘要',
    semanticMode: isEnglish ? 'Semantic Mode' : '语义模式',
    semanticSummary: isEnglish ? 'Semantic Summary' : '语义总结',
    previewReady: isEnglish ? 'Preview Ready' : '可预览',
    finalReady: isEnglish ? 'Final Ready' : '可正式生成',
    groupedMissing: isEnglish ? 'Missing Business Groups' : '缺失业务组',
    complexity: isEnglish ? 'Complexity' : '复杂度',
    missingFields: isEnglish ? 'Missing Fields' : '缺失字段数',
    arrayGroups: isEnglish ? 'Array Groups' : '数组组数',
    waitingInputSemanticHint: isEnglish ? 'Business-group hint' : '业务组提示',
    yes: isEnglish ? 'Yes' : '是',
    no: isEnglish ? 'No' : '否',
    groupLabel: isEnglish ? 'Group' : '分组',
    fieldLabel: isEnglish ? 'Field' : '字段',
    blockingLabel: isEnglish ? 'Blocking' : '阻塞',
    previewOkLabel: isEnglish ? 'Preview OK' : '可先预览',
  };
  const statusLabels = isEnglish ? EXECUTION_STATUS_LABELS_EN : EXECUTION_STATUS_LABELS_ZH;

  // Fetch execution details
  const { data: execution, isLoading: isLoadingExecution, error: errorExecution } = useQuery<ExecutionDto, Error>(
    ['execution', id],
    () => executionApi.getById(id!),
    {
      enabled: !!id,
      refetchInterval: (data) => {
        if (!data) return false;
        return EXECUTION_ACTIVE_POLLING_STATUSES.includes(data.status) ? 3000 : false;
      },
    }
  );

  // Fetch execution steps
  const { data: steps } = useQuery<ExecutionStepDto[], Error>(
    ['execution-steps', id],
    () => executionApi.getSteps(id!),
    {
      enabled: !!id,
      refetchInterval: () => {
        // 如果详情在轮询，步骤也一起轮询
        if (!execution) return false;
        return EXECUTION_ACTIVE_POLLING_STATUSES.includes(execution.status) ? 3000 : false;
      },
    }
  );

  const { data: skillsData } = useQuery(['execution-detail-skills-name-map'], () => skillApi.list());
  const { data: releasesData } = useQuery(
    ['execution-detail-published-skills-name-map'],
    () => capabilityReleaseApi.listReleaseCenter(),
  );

  const skillNameMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (releasesData?.releases || []).forEach((release) => {
      if (release.publishedSkillId) {
        map.set(
          release.publishedSkillId,
          release.sourceName || release.sourceId || release.publishedSkillId,
        );
      }
    });
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

  const submitInputMutation = useMutation(
    (values: Record<string, unknown>) => executionApi.submitInput(id!, {
      stepId: waitingInputStep!.id,
      input: values,
    }),
    {
      onSuccess: () => {
        void message.success(text.inputSubmitted);
        void queryClient.invalidateQueries(['execution', id]);
        void queryClient.invalidateQueries(['execution-steps', id]);
      },
      onError: (error: Error) => {
        void message.error(`${text.submitInputFailed}: ${error.message}`);
      },
    }
  );

  const approveMutation = useMutation(
    () => executionApi.approve(id!),
    {
      onSuccess: () => {
        void message.success(text.executionApproved);
        void queryClient.invalidateQueries(['execution', id]);
        void queryClient.invalidateQueries(['execution-steps', id]);
      },
      onError: (error: Error) => {
        void message.error(`${text.approveFailed}: ${error.message}`);
      },
    }
  );

  const rejectMutation = useMutation(
    () => executionApi.reject(id!),
    {
      onSuccess: () => {
        void message.success(text.executionRejected);
        void queryClient.invalidateQueries(['execution', id]);
        void queryClient.invalidateQueries(['execution-steps', id]);
      },
      onError: (error: Error) => {
        void message.error(`${text.rejectFailed}: ${error.message}`);
      },
    }
  );

  if (isLoadingExecution) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" tip={text.loading} />
      </div>
    );
  }

  if (errorExecution || !execution) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          type="error"
          message={text.loadFailed}
          description={errorExecution?.message || text.notFound}
          showIcon
          action={
            <Button onClick={() => navigate('/executions')}>
              {text.backToExecutions}
            </Button>
          }
        />
      </div>
    );
  }

  const getCurrentStepIndex = () => {
    if (!steps || !execution.currentStepId) return -1;
    return steps.findIndex(s => s.id === execution.currentStepId);
  };

  const waitingInputStep = execution.status === 'waiting_input'
    ? steps?.find((step) =>
      step.id === execution.currentStepId ||
      (step.type === 'input_collection' && step.status === 'running')
    )
    : undefined;

  const requiredInputs = Array.isArray(waitingInputStep?.inputJson?.requiredInputs)
    ? (waitingInputStep.inputJson.requiredInputs as unknown as RequiredInputField[])
    : [];
  const requiredInputGroups = React.useMemo(
    () => buildWaitingInputDisplayGroups(requiredInputs),
    [requiredInputs],
  );
  const semantic = execution.semantic;

  const handleSubmitInput = (values: Record<string, unknown>) => {
    submitInputMutation.mutate(values);
  };

  const renderInputField = (field: RequiredInputField) => {
    const normalizedType = field.type.toLowerCase();

    if (normalizedType === 'number' || normalizedType === 'integer') {
      return <InputNumber style={{ width: '100%' }} />;
    }

    if (normalizedType === 'boolean') {
      return <Switch />;
    }

    if (normalizedType === 'object' || normalizedType === 'json' || normalizedType === 'array') {
      return <Input.TextArea rows={4} placeholder={text.enterJsonString} />;
    }

    return <Input placeholder={field.description || `${text.enterField} ${field.name}`} />;
  };

  const normalizeSubmittedValues = (values: Record<string, unknown>) => {
    return requiredInputs.reduce<Record<string, unknown>>((acc, field) => {
      const rawValue = values[field.name];
      if (rawValue === undefined) {
        return acc;
      }

      if (
        (field.type.toLowerCase() === 'object'
          || field.type.toLowerCase() === 'json'
          || field.type.toLowerCase() === 'array')
        && typeof rawValue === 'string'
      ) {
        acc[field.name] = JSON.parse(rawValue) as unknown;
        return acc;
      }

      acc[field.name] = rawValue;
      return acc;
    }, {});
  };

  const stepColumns = [
    {
      title: text.step,
      dataIndex: 'stepIndex',
      key: 'stepIndex',
      width: 80,
      render: (index: number) => `${text.step} ${index + 1}`,
    },
    {
      title: text.name,
      dataIndex: 'name',
      key: 'name',
      width: 150,
    },
    {
      title: text.type,
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (type: string) => stepTypeLabels[type]?.[isEnglish ? 'en' : 'zh'] || type,
    },
    {
      title: text.status,
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => (
        <Space>{stepStatusIcons[status]} {stepStatusLabels[status]?.[isEnglish ? 'en' : 'zh'] || status}</Space>
      ),
    },
    {
      title: text.action,
      dataIndex: 'action',
      key: 'action',
      width: 100,
      render: (action?: string) => action || '-',
    },
    {
      title: text.error,
      dataIndex: 'errorMessage',
      key: 'errorMessage',
      render: (error?: string) => error ? <Text type="danger">{error}</Text> : '-',
    },
    {
      title: text.duration,
      key: 'duration',
      render: (_: unknown, record: ExecutionStepDto) => {
        if (record.startedAt && record.endedAt) {
          const duration = new Date(record.endedAt).getTime() - new Date(record.startedAt).getTime();
          return `${(duration / 1000).toFixed(1)}s`;
        }
        return '-';
      },
    },
  ];

  const parsedResult = tryParseJsonValue(execution.resultJson) as Record<string, unknown> | undefined;
  const browserExecutionResult = extractBrowserExecutionResult(execution.resultJson);
  const browserTimelineItems = browserExecutionResult
    ? [
        {
          color: 'gray' as const,
          children: (
            <TimelineNodeCard
              title={text.browserRuntimeInfo}
              subtitle={execution.endedAt ? new Date(execution.endedAt).toLocaleString() : undefined}
              color="gray"
              preview={renderSummaryChips([
                { label: text.browserBackend, value: browserExecutionResult.backend || '-', color: 'blue' },
                { label: text.browserStepCount, value: browserExecutionResult.stepResults.length, color: 'processing' },
                { label: text.status, value: statusLabels[execution.status], color: statusColors[execution.status] },
              ])}
              details={renderTimelineDetails([
                { label: text.browserRuntimeSessionId, value: browserExecutionResult.runtimeSessionId || '-' },
                { label: 'Runtime', value: {
                  backend: browserExecutionResult.backend,
                  runtimeSessionId: browserExecutionResult.runtimeSessionId,
                  stepCount: browserExecutionResult.stepResults.length,
                  failedStep: browserExecutionResult.failedStep,
                  failedAction: browserExecutionResult.failedAction,
                } },
              ])}
            />
          ),
        },
        ...browserExecutionResult.stepResults.map((stepResult, index) => {
          const outputDisplay = buildBrowserOutputDisplay(stepResult.output || null);
          const waitSeconds = resolveBrowserWaitSeconds(stepResult, stepResult.output || null);
          const isWaitStep = stepResult.action === 'wait';
          const imageSources = outputDisplay.imageSources.length > 0
            ? outputDisplay.imageSources
            : outputDisplay.imageSrc
              ? [outputDisplay.imageSrc]
              : [];

          return {
            color: getBrowserStepColor(
              stepResult,
              index,
              browserExecutionResult.stepResults.length,
              Boolean(browserExecutionResult.failedStep),
            ),
            children: (
              <TimelineNodeCard
                key={`${stepResult.stepId || stepResult.name || stepResult.action || 'browser-step'}-${index}`}
                title={`${text.step} ${index + 1}: ${isWaitStep && waitSeconds ? `wait ${waitSeconds}s` : stepResult.name || stepResult.action || '-'}`}
                subtitle={
                  isWaitStep
                    ? waitSeconds
                      ? `等待 ${waitSeconds} 秒`
                      : '等待'
                    : stepResult.target || outputDisplay.command || stepResult.stepId || '-'
                }
                color={getBrowserStepColor(
                  stepResult,
                  index,
                  browserExecutionResult.stepResults.length,
                  Boolean(browserExecutionResult.failedStep),
                )}
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
                          { label: text.action, value: stepResult.action || '-', color: 'processing' },
                          { label: text.browserTarget, value: stepResult.target || '-', color: 'blue' },
                          { label: text.browserSnapshotId, value: stepResult.snapshotId || '-', color: 'default' },
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
                          {previewText(outputDisplay.summary || text.browserNoOutput, 220)}
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
                  { label: text.browserStepOutput, value: outputDisplay.details || text.browserNoOutput },
                ])}
              />
            ),
          };
        }),
      ]
    : [];

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Space align="center" style={{ marginBottom: 16 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/executions')}>
            {text.backToExecutions}
          </Button>
          {execution.status === 'human_control' && (
            <Button
              type="primary"
              onClick={() => navigate(`/executions/${id}/takeover`)}
            >
              {text.enterTakeoverMode}
            </Button>
          )}
        </Space>
        <Title level={2}>{text.details}</Title>
        <Text type="secondary">{text.idLabel}: {execution.id}</Text>
      </div>

      {/* Takeover Alert */}
      {execution.status === 'human_control' && (
        <Alert
          type="warning"
          message={text.takeoverRequired}
          description={
            <div>
              <p>{execution.takeoverReason || text.takeoverDescDefault}</p>
              <Button
                type="primary"
                icon={<UserOutlined />}
                onClick={() => navigate(`/executions/${id}/takeover`)}
              >
                {text.enterTakeoverWorkbench}
              </Button>
            </div>
          }
          icon={<WarningOutlined />}
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}

      {execution.status === 'pending_approval' && (
        <Card title={text.approvalRequired} style={{ marginBottom: 16 }}>
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message={text.approvalWaiting}
            description={
              execution.approvalStatus
                ? `${text.approvalStatusPrefix} ${execution.approvalStatus}`
                : text.approvalDescDefault
            }
          />
          <Space>
            <Button type="primary" loading={approveMutation.isLoading} onClick={() => approveMutation.mutate()}>
              {text.approveAndContinue}
            </Button>
            <Button danger loading={rejectMutation.isLoading} onClick={() => rejectMutation.mutate()}>
              {text.rejectExecution}
            </Button>
          </Space>
        </Card>
      )}

      {execution.status === 'waiting_input' && waitingInputStep && (
        <Card title={text.missingInputRequired} style={{ marginBottom: 16 }}>
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message={text.waitingInput}
            description={
              <Space direction="vertical" size={8}>
                <Text>{text.waitingInputDesc}</Text>
                {semantic?.summary ? (
                  <Text type="secondary">{`${text.waitingInputSemanticHint}: ${semantic.summary}`}</Text>
                ) : null}
              </Space>
            }
          />
          <Form
            form={form}
            layout="vertical"
            initialValues={requiredInputs.reduce<Record<string, unknown>>((acc, field) => {
              acc[field.name] = field.value;
              return acc;
            }, {})}
            onFinish={(values: Record<string, unknown>) => {
              try {
                handleSubmitInput(normalizeSubmittedValues(values));
              } catch (error) {
                void message.error(error instanceof Error ? error.message : text.invalidJson);
              }
            }}
          >
            {requiredInputGroups.length > 0 ? (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                {requiredInputGroups.map((group) => (
                  <Card
                    key={group.label}
                    size="small"
                    title={group.label}
                    style={{ borderRadius: 12, background: 'var(--bg-card)' }}
                  >
                    {group.items.map((field) => (
                      <React.Fragment key={field.name}>
                        <Form.Item
                          name={field.name}
                        label={`${resolveWaitingInputDisplayLabel(field)} (${field.type})`}
                          extra={field.description || `${text.source}: ${field.source}`}
                          rules={[
                            {
                              required: field.required,
                              message: `${text.provideField} ${resolveWaitingInputDisplayLabel(field)}`,
                            },
                          ]}
                          valuePropName={field.type.toLowerCase() === 'boolean' ? 'checked' : 'value'}
                        >
                          {renderInputField(field)}
                        </Form.Item>
                        {field.needs_confirmation ? (
                          <Tag color="gold" style={{ marginBottom: 12 }}>待确认</Tag>
                        ) : null}
                      </React.Fragment>
                    ))}
                  </Card>
                ))}
              </Space>
            ) : requiredInputs.map((field) => (
              <React.Fragment key={field.name}>
                <Form.Item
                  name={field.name}
                  label={`${resolveWaitingInputDisplayLabel(field)} (${field.type})`}
                  extra={field.description || `${text.source}: ${field.source}`}
                  rules={[
                    {
                      required: field.required,
                      message: `${text.provideField} ${resolveWaitingInputDisplayLabel(field)}`,
                    },
                  ]}
                  valuePropName={field.type.toLowerCase() === 'boolean' ? 'checked' : 'value'}
                >
                  {renderInputField(field)}
                </Form.Item>
                {field.needs_confirmation ? (
                  <Tag color="gold" style={{ marginBottom: 12 }}>待确认</Tag>
                ) : null}
              </React.Fragment>
            ))}
            <Space>
              <Button type="primary" htmlType="submit" loading={submitInputMutation.isLoading}>
                {text.submitAndResume}
              </Button>
              <Button onClick={() => form.resetFields()}>
                {text.reset}
              </Button>
            </Space>
          </Form>
        </Card>
      )}

      {/* Execution Info */}
      <Card style={{ marginBottom: 16 }}>
        {(() => {
          const parsedResult = tryParseJsonValue(execution.resultJson) as any;
          const temporalLink = fixLocalhostLink(parsedResult?.temporalLink);
          if (!temporalLink) {
            return null;
          }

          return (
            <Descriptions column={2}>
              <Descriptions.Item label={text.status}>
                <Tag color={statusColors[execution.status]}>{statusLabels[execution.status]}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={isEnglish ? 'Skill' : '技能'}>
                <Space direction="vertical" size={0}>
                  <Text>{getSkillDisplayName(execution.skillId)}</Text>
                  {getSkillDisplayName(execution.skillId) !== execution.skillId ? (
                    <Text type="secondary">{`${text.skillId}: ${execution.skillId}`}</Text>
                  ) : null}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label={text.runtimeType}>{execution.runtimeType}</Descriptions.Item>
              <Descriptions.Item label={text.riskLevel}>{execution.riskLevel}</Descriptions.Item>
              <Descriptions.Item label={text.approvalStatus}>{execution.approvalStatus || '-'}</Descriptions.Item>
              <Descriptions.Item label={text.createdAt}>
                {new Date(execution.createdAt).toLocaleString()}
              </Descriptions.Item>
              {execution.startedAt && (
                <Descriptions.Item label={text.startedAt}>
                  {new Date(execution.startedAt).toLocaleString()}
                </Descriptions.Item>
              )}
              {execution.endedAt && (
                <Descriptions.Item label={text.endedAt}>
                  {new Date(execution.endedAt).toLocaleString()}
                </Descriptions.Item>
              )}
              {execution.failureReason && (
                <Descriptions.Item label={text.failureReason} span={2}>
                  <Text type="danger">{execution.failureReason}</Text>
                </Descriptions.Item>
              )}
              {execution.failureCode && (
                <Descriptions.Item label={text.failureCode}>
                  <Text type="danger">{execution.failureCode}</Text>
                </Descriptions.Item>
              )}
              <Descriptions.Item label={isEnglish ? 'Temporal Link' : 'Temporal 链接'} span={2}>
                <a href={temporalLink} target="_blank" rel="noopener noreferrer">
                  <Space>
                    <ThunderboltOutlined />
                    {temporalLink}
                  </Space>
                </a>
              </Descriptions.Item>
            </Descriptions>
          );
        })() || (
        <Descriptions column={2}>
          <Descriptions.Item label={text.status}>
            <Tag color={statusColors[execution.status]}>{statusLabels[execution.status]}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={isEnglish ? 'Skill' : '技能'}>
            <Space direction="vertical" size={0}>
              <Text>{getSkillDisplayName(execution.skillId)}</Text>
              {getSkillDisplayName(execution.skillId) !== execution.skillId ? (
                <Text type="secondary">{`${text.skillId}: ${execution.skillId}`}</Text>
              ) : null}
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label={text.runtimeType}>{execution.runtimeType}</Descriptions.Item>
          <Descriptions.Item label={text.riskLevel}>{execution.riskLevel}</Descriptions.Item>
          <Descriptions.Item label={text.approvalStatus}>{execution.approvalStatus || '-'}</Descriptions.Item>
          <Descriptions.Item label={text.createdAt}>
            {new Date(execution.createdAt).toLocaleString()}
          </Descriptions.Item>
          {execution.startedAt && (
            <Descriptions.Item label={text.startedAt}>
              {new Date(execution.startedAt).toLocaleString()}
            </Descriptions.Item>
          )}
          {execution.endedAt && (
            <Descriptions.Item label={text.endedAt}>
              {new Date(execution.endedAt).toLocaleString()}
            </Descriptions.Item>
          )}
          {execution.failureReason && (
            <Descriptions.Item label={text.failureReason} span={2}>
              <Text type="danger">{execution.failureReason}</Text>
            </Descriptions.Item>
          )}
          {execution.failureCode && (
            <Descriptions.Item label={text.failureCode}>
              <Text type="danger">{execution.failureCode}</Text>
            </Descriptions.Item>
          )}
        </Descriptions>
        )}
      </Card>

      {semantic ? (
        <Card title={text.semanticOverview} style={{ marginBottom: 16 }}>
          <Descriptions column={2} size="small" style={{ marginBottom: semantic.groupedMissing.length > 0 ? 16 : 0 }}>
            <Descriptions.Item label={text.semanticMode}>{semantic.mode}</Descriptions.Item>
            <Descriptions.Item label={text.complexity}>
              {semantic.complexity?.category || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={text.previewReady}>
              <Tag color={semantic.previewReady ? 'green' : 'gold'}>
                {semantic.previewReady ? text.yes : text.no}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label={text.finalReady}>
              <Tag color={semantic.finalReady ? 'green' : 'red'}>
                {semantic.finalReady ? text.yes : text.no}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label={text.missingFields}>
              {semantic.complexity?.missingFields ?? '-'}
            </Descriptions.Item>
            <Descriptions.Item label={text.arrayGroups}>
              {semantic.complexity?.arrayGroups ?? '-'}
            </Descriptions.Item>
            {semantic.summary ? (
              <Descriptions.Item label={text.semanticSummary} span={2}>
                {semantic.summary}
              </Descriptions.Item>
            ) : null}
          </Descriptions>
          {semantic.groupedMissing.length > 0 ? (
            <div>
              <Text strong style={{ display: 'block', marginBottom: 12 }}>{text.groupedMissing}</Text>
              {renderSemanticGroupedMissing(semantic.groupedMissing, {
                group: text.groupLabel,
                field: text.fieldLabel,
                blocking: text.blockingLabel,
                previewOk: text.previewOkLabel,
              })}
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* Output */}
      {browserExecutionResult && (
        <Card title={text.browserExecutionResult} style={{ marginBottom: 16 }}>
          {browserExecutionResult.runtimeSessionId ? (
            <div style={{ marginBottom: 12 }}>
              <Text copyable={{ text: browserExecutionResult.runtimeSessionId }}>
                {`${text.browserRuntimeSessionId}: ${browserExecutionResult.runtimeSessionId}`}
              </Text>
            </div>
          ) : null}
          <Timeline items={browserTimelineItems} />
        </Card>
      )}

      {execution.resultJson && !browserExecutionResult && (
        <Card title={text.inputOutput} style={{ marginBottom: 16 }}>
          {execution.resultJson && (
            <div>
              <Text strong>{text.result}:</Text>
              {(() => {
                const resultObj = parsedResult as any;
                const hasResult = resultObj && typeof resultObj === 'object' && 'result' in resultObj && typeof resultObj.result === 'string';

                const filteredResult = resultObj && typeof resultObj === 'object' && !Array.isArray(resultObj)
                  ? { ...resultObj }
                  : resultObj;
                const remainingKeys = filteredResult && typeof filteredResult === 'object' && !Array.isArray(filteredResult)
                  ? Object.keys(filteredResult)
                  : [];
                const onlyHasResultField = remainingKeys.length === 1 && remainingKeys[0] === 'result';

                if (hasResult && onlyHasResultField) {
                  return (
                    <div className="chat-message-markdown" style={{ 
                      background: 'var(--bg-secondary)', 
                      color: 'var(--text-primary)', 
                      border: '1px solid var(--bg-secondary)', 
                      padding: 12, 
                      borderRadius: 8, 
                      marginTop: 8,
                      lineHeight: '1.6'
                    }}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {beautifyText(resultObj.result)}
                      </ReactMarkdown>
                    </div>
                  );
                }

                return (
                  <pre style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--bg-secondary)', padding: 12, borderRadius: 8, overflow: 'auto', marginTop: 8, lineHeight: '1.6' }}>
                    {renderJsonValue(filteredResult)}
                  </pre>
                );
              })()}
            </div>
          )}
        </Card>
      )}

      {/* Steps Progress */}
      {steps && steps.length > 0 && (
        <Card title={text.stepsProgress} style={{ marginBottom: 16 }}>
          <Steps
            current={getCurrentStepIndex()}
            size="small"
            style={{ marginBottom: 24 }}
            items={steps.map((step, index) => ({
              title: step.name || `${text.step} ${index + 1}`,
              status: step.status as 'wait' | 'process' | 'finish' | 'error',
              description: stepStatusLabels[step.status]?.[isEnglish ? 'en' : 'zh'] || step.action,
            }))}
          />
        </Card>
      )}

      {/* Steps Table */}
      <Card title={text.stepsDetails}>
        {steps && steps.length > 0 ? (
          <Table
            columns={stepColumns}
            dataSource={steps}
            rowKey="id"
            pagination={false}
            size="small"
          />
        ) : (
          <Empty description={text.noSteps} />
        )}
      </Card>
    </div>
  );
};

export default ExecutionDetailPage;
