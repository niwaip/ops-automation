/**
 * ExecutionListPage
 * List all executions with filtering and pagination
 * Phase 4: Portal Execution views
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
  Alert,
  message,
  Image,
  Modal,
  DatePicker,
} from 'antd';
import type { FormInstance } from 'antd/es/form';
import {
  SearchOutlined,
  PlusOutlined,
  ReloadOutlined,
  DownloadOutlined,
  RobotOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  AppstoreOutlined,
  HourglassOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import '@/features/chat/ChatMessage.css';
import { resolveExecutionNormalizedResult } from '@ops/user-core';
import { extractExecutionDownloadUrl, summarizeExecutionListResult } from '@ops/user-core';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import {
  executionApi,
  ExecutionDto,
  ExecutionPhaseDto,
  ExecutionStatus,
  ExecutionStepDto,
} from '@/api/execution';
import { runtimeSessionApi } from '@/api/runtimeSession';
import { skillApi } from '@/api/skill';
import { capabilityReleaseApi } from '@/api/capabilities';
import { useChatStore } from '@/features/chat';
import LiveSessionPreviewCard from '@/components/runtime/LiveSessionPreviewCard';
import InlineRecoveryPanel from '@/features/executions/components/InlineRecoveryPanel';
import WaitingInputActionPanel from '@/features/executions/components/WaitingInputActionPanel';
import { RECOVERY_COPY } from '@/features/executions/components/recoveryOptions';
import {
  extractBrowserExecutionResult,
  hasBrowserExecutionEvidence,
} from '@/features/executions/lib/browser';
import {
  extractPhaseStepImageSources,
  extractPhaseStepUrl,
  extractWorkflowActivitySnapshotSources,
  sortExecutionPhaseArtifactsByTime,
  sortExecutionPhaseStepsByTime,
} from '@/features/executions/lib/artifacts';
import { hasMeaningfulExecutionResult, tryParseJsonValue } from '@/features/executions/lib/common';
import { beautifyText } from '@/features/executions/lib/detailView';
import {
  normalizeRequiredInputValues,
  type RequiredInputField,
} from '@/features/executions/lib/inputFields';
import {
  buildAiResumeDraft,
  extractExecutionDisplayInput,
  summarizeExecutionListInput,
} from '@/features/executions/lib/listHelpers';
import { buildExecutionLoopSummary } from '@/features/executions/lib/executionSummary';
import {
  formatDateTime,
  formatDuration,
  getExecutionRowStyle,
  getStepStatusColor,
  summarizeSteps,
} from '@/features/executions/lib/listView';
import {
  compareExecutionPhasesByTime,
  compareExecutionPhases,
  getPhaseStatusColor,
  getPhaseStepStatus,
} from '@/features/executions/lib/phase';
import { renderJsonValue } from '@/features/executions/lib/json';
import {
  getRuntimeSessionNovncUrl,
  getRuntimeSessionStatusLabel,
  isLiveRuntimeSessionState,
  isPreviewRuntimeSessionState,
} from '@/features/executions/lib/runtimeSession';
import { replaceLocalhostWithCurrentHost } from '@/shared/lib/publicUrl';
import {
  EXECUTION_ACTIVE_POLLING_STATUSES,
  EXECUTION_STATUS_COLORS,
  EXECUTION_STATUS_LABELS_ZH,
} from '@/shared/lib/executionStatusMeta';
import {
  buildWaitingInputDisplayGroups,
} from '@/shared/lib/waitingInputDisplay';
import { usePreferencesStore } from '@/shared/store/preferencesStore';
import dayjs, { Dayjs } from 'dayjs';
import './ExecutionListPage.css';

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
const getExecutionTime = (record: ExecutionDto) => {
  const source = record.startedAt || record.createdAt;
  return source ? new Date(source).getTime() : 0;
};

const padTimePart = (value: number) => String(value).padStart(2, '0');

const formatCompactExecutionTime = (date?: string) => {
  if (!date) {
    return '-';
  }

  const targetDate = new Date(date);
  if (Number.isNaN(targetDate.getTime())) {
    return '-';
  }

  const now = new Date();
  const timeLabel = `${padTimePart(targetDate.getHours())}:${padTimePart(targetDate.getMinutes())}`;

  if (
    targetDate.getFullYear() === now.getFullYear() &&
    targetDate.getMonth() === now.getMonth() &&
    targetDate.getDate() === now.getDate()
  ) {
    return timeLabel;
  }

  if (targetDate.getFullYear() === now.getFullYear()) {
    return `${padTimePart(targetDate.getMonth() + 1)}/${padTimePart(targetDate.getDate())} ${timeLabel}`;
  }

  return `${String(targetDate.getFullYear()).slice(-2)}/${padTimePart(targetDate.getMonth() + 1)}/${padTimePart(targetDate.getDate())}`;
};

const detailPanelStyle = {
  marginBottom: 12,
  background: 'var(--bg-card)',
  border: '1px solid var(--bg-secondary)',
  borderRadius: 14,
  boxShadow: 'var(--shadow-sm)',
};

const BROWSER_ACTIVITY_ACTIONS = new Set([
  'navigate',
  'click',
  'fill',
  'type',
  'press',
  'select',
  'hover',
  'scroll',
  'wait',
  'screenshot',
  'upload',
  'drag',
]);

const isBrowserWorkflowActivity = (phase: ExecutionPhaseDto): boolean => {
  if (phase.phaseType !== 'workflow_activity') {
    return false;
  }

  if (extractWorkflowActivitySnapshotSources(phase).length > 0) {
    return true;
  }

  if (extractBrowserExecutionResult(phase.output)) {
    return true;
  }

  return getPhaseSteps(phase).some((step) => {
    if (step.snapshotId) {
      return true;
    }

    if (extractPhaseStepImageSources(step, getPhaseArtifacts(phase)).length > 0) {
      return true;
    }

    const action = step.action?.trim().toLowerCase();
    return Boolean(action && BROWSER_ACTIVITY_ACTIONS.has(action));
  });
};

const getPhaseLoopIteration = (phase: ExecutionPhaseDto): number | undefined => {
  const phaseInput = tryParseJsonValue(phase.input);
  const loopIteration =
    phaseInput && typeof phaseInput === 'object' && !Array.isArray(phaseInput)
      ? (phaseInput as Record<string, unknown>).loopIteration
      : undefined;

  if (typeof loopIteration === 'number' && Number.isInteger(loopIteration) && loopIteration > 0) {
    return loopIteration;
  }
  if (typeof loopIteration === 'string' && loopIteration.trim()) {
    const parsed = Number(loopIteration);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
};

const formatPhaseDisplayName = (phase: ExecutionPhaseDto, fallbackIndex?: number): string => {
  const baseName = phase.phaseName || phase.phaseKey || `步骤 ${fallbackIndex ?? 0}`;
  const loopIteration = getPhaseLoopIteration(phase);
  return loopIteration ? `${baseName} · 第 ${loopIteration} 轮` : baseName;
};

const getPhaseSteps = (phase: ExecutionPhaseDto) => sortExecutionPhaseStepsByTime(phase.steps || []);

const getPhaseArtifacts = (phase: ExecutionPhaseDto) =>
  sortExecutionPhaseArtifactsByTime(phase.artifacts || []);

const renderExecutionPayloadContent = (
  value: unknown,
  options?: {
    emptyText?: string;
    treatSingleResultFieldAsMarkdown?: boolean;
  }
) => {
  const parsedValue = tryParseJsonValue(value);
  const emptyText = options?.emptyText || '暂无内容。';

  if (parsedValue === undefined || parsedValue === null || parsedValue === '') {
    return <Text type="secondary">{emptyText}</Text>;
  }

  if (typeof parsedValue === 'string') {
    return (
      <div
        className="chat-message-markdown"
        style={{
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--bg-secondary)',
          padding: 12,
          borderRadius: 8,
          lineHeight: '1.6',
        }}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{beautifyText(parsedValue)}</ReactMarkdown>
      </div>
    );
  }

  const resultRecord =
    parsedValue && typeof parsedValue === 'object' && !Array.isArray(parsedValue)
      ? (parsedValue as Record<string, unknown>)
      : undefined;
  const resultText = typeof resultRecord?.result === 'string' ? resultRecord.result : undefined;
  const onlyHasResultField =
    options?.treatSingleResultFieldAsMarkdown && resultRecord
      ? Object.keys(resultRecord).length === 1 &&
        Object.prototype.hasOwnProperty.call(resultRecord, 'result')
      : false;

  if (resultText && onlyHasResultField) {
    return (
      <div
        className="chat-message-markdown"
        style={{
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--bg-secondary)',
          padding: 12,
          borderRadius: 8,
          lineHeight: '1.6',
        }}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{beautifyText(resultText)}</ReactMarkdown>
      </div>
    );
  }

  return (
    <pre
      style={{
        background: 'var(--bg-secondary)',
        color: 'var(--text-primary)',
        border: '1px solid var(--bg-secondary)',
        padding: 12,
        borderRadius: 8,
        overflow: 'auto',
        margin: 0,
        lineHeight: '1.6',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {renderJsonValue(parsedValue)}
    </pre>
  );
};

const renderPanelLabel = (title: string, summary?: string) => (
  <div className="execution-detail-panel-label">
    <Text strong className="execution-detail-panel-title">{title}</Text>
    {summary ? (
      <Text type="secondary" className="execution-detail-panel-summary">
        {summary}
      </Text>
    ) : null}
  </div>
);

type ResumeFormValue =
  | string
  | number
  | boolean
  | Record<string, unknown>
  | unknown[]
  | null
  | undefined;

type ResumeFormValues = Record<string, ResumeFormValue>;

const toResumeFormValue = (value: unknown): ResumeFormValue => {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    Array.isArray(value)
  ) {
    return value;
  }

  if (typeof value === 'object') {
    return value as Record<string, unknown>;
  }

  return undefined;
};

const ExecutionListPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const {
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
    searchParams.get('executionId') || undefined
  );
  const theme = usePreferencesStore((state) => state.theme);
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
  const { data: releasesData } = useQuery(['published-skills-name-map'], () =>
    capabilityReleaseApi.listReleaseCenter()
  );

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
    [selectedExecutionPhases]
  );
  const timeSortedSelectedExecutionPhases = useMemo(
    () => [...selectedExecutionPhases].sort(compareExecutionPhasesByTime),
    [selectedExecutionPhases]
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
    () =>
      extractBrowserExecutionResult(selectedExecution?.resultJson) ||
      extractBrowserExecutionResult(effectiveSelectedResultJson),
    [effectiveSelectedResultJson, selectedExecution?.resultJson]
  );
  const selectedExecutionRuntimeSessionId =
    selectedExecution?.runtimeSessionId || selectedBrowserExecutionResult?.runtimeSessionId;
  const isSelectedBrowserExecution = useMemo(
    () =>
      hasBrowserExecutionEvidence({
        runtimeType: selectedExecution?.runtimeType,
        runtimeSessionId: selectedExecutionRuntimeSessionId,
        browserExecutionResult: selectedBrowserExecutionResult,
        phases: sortedSelectedExecutionPhases,
      }) || sortedSelectedExecutionPhases.some((phase) => isBrowserWorkflowActivity(phase)),
    [
      selectedBrowserExecutionResult,
      selectedExecution?.runtimeType,
      selectedExecutionRuntimeSessionId,
      sortedSelectedExecutionPhases,
    ]
  );
  const displaySelectedPhases = useMemo(
    () => timeSortedSelectedExecutionPhases,
    [timeSortedSelectedExecutionPhases]
  );
  const isSelectedExecutionActive = Boolean(
    selectedExecution && EXECUTION_ACTIVE_POLLING_STATUSES.includes(selectedExecution.status)
  );
  const shouldShowLegacySteps = sortedSelectedExecutionPhases.length === 0;
  const currentSelectedPhase = useMemo(() => {
    const latestPhases = [...displaySelectedPhases].reverse();
    return (
      latestPhases.find(
        (phase) =>
          phase.phaseKey === selectedExecution?.currentPhaseKey &&
          ['running', 'retrying', 'waiting_takeover', 'resumable', 'pending'].includes(
            phase.status
          )
      ) ||
      latestPhases.find((phase) => phase.phaseKey === selectedExecution?.currentPhaseKey) ||
      latestPhases.find((phase) => ['running', 'retrying'].includes(phase.status)) ||
      latestPhases.find((phase) =>
        ['waiting_takeover', 'resumable', 'pending'].includes(phase.status)
      ) ||
      latestPhases[0]
    );
  }, [displaySelectedPhases, selectedExecution?.currentPhaseKey]);
  const shouldShowSelectedCurrentPhaseInfo = Boolean(
    selectedExecution &&
    (selectedExecution.status === 'running' ||
      selectedExecution.status === 'human_control' ||
      selectedExecution.status === 'failed')
  );
  const { data: selectedRuntimeSession } = useQuery(
    ['execution-runtime-session', selectedExecutionRuntimeSessionId],
    () =>
      runtimeSessionApi.getByIdOrExecutionId(
        selectedExecutionRuntimeSessionId!,
        selectedExecution?.id
      ),
    {
      enabled: Boolean(selectedExecutionRuntimeSessionId),
      refetchInterval: (data) => {
        if (isLiveRuntimeSessionState(data?.state)) {
          return 3000;
        }
        return selectedExecution &&
          EXECUTION_ACTIVE_POLLING_STATUSES.includes(selectedExecution.status)
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
  const selectedExecutionInput = selectedExecution
    ? extractExecutionDisplayInput(selectedExecution)
    : undefined;
  const selectedExecutionNormalizedResult = selectedExecution
    ? resolveExecutionNormalizedResult(selectedExecution)
    : undefined;

  const waitingInputStep =
    selectedExecution?.status === 'waiting_input'
      ? selectedSteps?.find(
          (step) =>
            step.id === selectedExecution.currentStepId ||
            (step.type === 'input_collection' && step.status === 'running')
        )
      : undefined;
  const currentSelectedStep = selectedExecution?.currentStepId
    ? selectedSteps?.find((step) => step.id === selectedExecution.currentStepId)
    : undefined;
  const selectedCompletedPhaseCount = displaySelectedPhases.filter(
    (phase) => phase.status === 'completed'
  ).length;
  const selectedLoopCount = displaySelectedPhases.reduce((maxLoop, phase) => {
    const loopIteration = getPhaseLoopIteration(phase);
    return loopIteration && loopIteration > maxLoop ? loopIteration : maxLoop;
  }, 0);
  const shouldShowSelectedExecutionSummary =
    selectedExecution &&
    ['succeeded', 'failed', 'cancelled'].includes(selectedExecution.status);
  const selectedCurrentPhaseIndex = Math.max(
    displaySelectedPhases.findIndex((phase) => phase.id === currentSelectedPhase?.id),
    0
  );
  const selectedSummaryHeadline =
    selectedExecutionNormalizedResult?.summary ||
    selectedExecutionNormalizedResult?.body ||
    selectedExecutionNormalizedResult?.title ||
    buildExecutionLoopSummary(displaySelectedPhases, false)?.summaryText ||
    selectedExecution?.failureReason ||
    selectedExecution?.takeoverReason ||
    '暂无总结信息';
  const selectedLoopSummary = buildExecutionLoopSummary(displaySelectedPhases, false);

  const requiredInputs = Array.isArray(waitingInputStep?.inputJson?.requiredInputs)
    ? (waitingInputStep?.inputJson?.requiredInputs as unknown as RequiredInputField[])
    : [];
  const requiredInputGroups = useMemo(
    () => buildWaitingInputDisplayGroups(requiredInputs),
    [requiredInputs]
  );

  const skillNameMap = useMemo(() => {
    const map = new Map<string, string>();
    // 优先使用 published 的来源名称
    (releasesData?.releases || []).forEach((release) => {
      if (release.publishedSkillId) {
        map.set(
          release.publishedSkillId,
          release.sourceName || release.sourceId || release.publishedSkillId
        );
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

  const openAiTaskMode = (draft: string, executionId: string) => {
    createSession();
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

        if (
          selectedExecutionId &&
          Number.isFinite(selectedExecutionCreatedAt) &&
          selectedExecutionCreatedAt < cutoff
        ) {
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
            : `没有找到 ${beforeDate} 之前可清理的执行记录`
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

  const handleResumeExecution = async (
    openInAi: boolean,
    form?: FormInstance<ResumeFormValues>
  ) => {
    if (!selectedExecution || !waitingInputStep) {
      return;
    }

    try {
      const values =
        (await form?.validateFields()) ||
        requiredInputs.reduce<ResumeFormValues>((acc, field) => {
          acc[field.name] = toResumeFormValue(field.value);
          return acc;
        }, {} as ResumeFormValues);
      const payload = normalizeRequiredInputValues(values, requiredInputs, {
        treatArrayAsJson: true,
      });

      if (openInAi) {
        openAiTaskMode(buildAiResumeDraft(selectedExecution, payload), selectedExecution.id);
        void message.success('已切换到 AI 任务模式，待你发送后再继续处理');
        return;
      }

      submitInputMutation.mutate({ payload });
    } catch (error) {
      if (error instanceof Error) {
        void message.error(error.message);
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
        summarizeExecutionListResult(record),
      ]
        .filter(Boolean)
        .some((item) => String(item).toLowerCase().includes(keyword));
    });

    rows.sort((a, b) => getExecutionTime(b) - getExecutionTime(a));
    return rows;
  }, [data?.data, searchText, skillNameMap]);

  const overviewItems = useMemo(
    () => [
      {
        key: 'visible',
        label: '当前结果',
        value: filteredAndSortedData.length,
        accentClassName: 'is-primary',
        icon: <AppstoreOutlined />,
      },
      {
        key: 'running',
        label: '进行中',
        value: filteredAndSortedData.filter((record) =>
          ['running', 'waiting_input', 'pending_approval'].includes(record.status)
        ).length,
        accentClassName: 'is-accent',
        icon: <HourglassOutlined />,
      },
      {
        key: 'attention',
        label: '需关注',
        value: filteredAndSortedData.filter((record) =>
          ['failed', 'human_control', 'pending_approval', 'waiting_input'].includes(record.status)
        ).length,
        accentClassName: 'is-danger',
        icon: <WarningOutlined />,
      },
      {
        key: 'completed',
        label: '已完成',
        value: filteredAndSortedData.filter((record) => record.status === 'succeeded').length,
        accentClassName: 'is-success',
        icon: <CheckCircleOutlined />,
      },
      {
        key: 'skills',
        label: '技能覆盖',
        value: new Set(filteredAndSortedData.map((record) => record.skillId)).size,
        accentClassName: 'is-neutral',
        icon: <RobotOutlined />,
      },
    ],
    [filteredAndSortedData]
  );

  const hasActiveFilters = Boolean(searchText.trim() || statusFilter);

  const emptyStateDescription = hasActiveFilters
    ? '没有找到符合当前筛选条件的执行记录，可以调整关键词或状态后再试。'
    : '当前账号还没有执行记录，可以从新建执行开始体验。';

  const columns = [
    {
      title: '技能名称',
      key: 'execution',
      width: 188,
      render: (_: unknown, record: ExecutionDto) => (
        <div className="execution-list-skill-cell">
          <Text
            strong
            ellipsis={{ tooltip: getSkillDisplayName(record.skillId) }}
            className="execution-list-skill-name"
          >
            {getSkillDisplayName(record.skillId)}
          </Text>
        </div>
      ),
    },
    {
      title: '开始时间',
      dataIndex: 'startedAt',
      key: 'startedAt',
      width: 144,
      defaultSortOrder: 'descend' as const,
      sorter: (a: ExecutionDto, b: ExecutionDto) => getExecutionTime(a) - getExecutionTime(b),
      render: (_: string | undefined, record: ExecutionDto) => (
        <div className="execution-list-time-cell">
          <Text className="execution-list-time-value">
            {formatCompactExecutionTime(record.startedAt || record.createdAt)}
          </Text>
          <Text type="secondary" className="execution-list-time-duration">
            {formatDuration(record)}
          </Text>
        </div>
      ),
    },
    {
      title: '状态',
      key: 'status',
      width: 76,
      render: (_: unknown, record: ExecutionDto) => (
        <Tag
          color={statusColors[record.status]}
          style={{
            marginInlineEnd: 0,
            width: 'fit-content',
            paddingInline: 8,
            borderRadius: 999,
            fontWeight: 600,
            fontSize: 12,
            lineHeight: '18px',
          }}
        >
          {listStatusLabels[record.status] || statusLabels[record.status]}
        </Tag>
      ),
    },
    {
      title: '用户输入',
      key: 'input',
      width: 292,
      ellipsis: true,
      render: (_: unknown, record: ExecutionDto) => (
        <div className="execution-list-summary-cell">
          <Text className="execution-list-summary-text">{summarizeExecutionListInput(record)}</Text>
        </div>
      ),
    },
    {
      title: '结果摘要',
      key: 'result',
      width: 292,
      ellipsis: true,
      render: (_: unknown, record: ExecutionDto) => (
        <div className="execution-list-summary-cell is-result">
          <Text className="execution-list-summary-text">{summarizeExecutionListResult(record)}</Text>
        </div>
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

  const handleExecutionRowClick = (record: ExecutionDto) => {
    if (record.status === 'human_control') {
      navigate(`/executions/${record.id}`);
      return;
    }

    updateExecutionSelection(record.id);
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
    <div className="execution-list-page">
      <div className="execution-list-summary-strip">
        {overviewItems.map((item) => (
          <div
            key={item.key}
            className={`execution-list-summary-item ${item.accentClassName}`}
          >
            <div className="execution-list-summary-icon">{item.icon}</div>
            <div className="execution-list-summary-body">
              <span className="execution-list-summary-key">{item.label}</span>
              <span className="execution-list-summary-value">{item.value}</span>
            </div>
          </div>
        ))}
      </div>

      <Card className="execution-list-card" styles={{ body: { padding: 0 } }}>
        <div className="execution-list-toolbar">
          <div className="execution-list-toolbar-heading">
            <Text strong className="execution-list-toolbar-title">
              执行记录
            </Text>
            <Text type="secondary" className="execution-list-toolbar-subtitle">
              当前筛选后显示 {filteredAndSortedData.length} 条，本页总计 {data?.total || 0} 条记录。
            </Text>
          </div>
          <div className="execution-list-toolbar-row">
            <div className="execution-list-toolbar-main">
              <div className="execution-list-toolbar-controls">
                <Input
                  className="execution-search-input execution-list-filter-control"
                  size="middle"
                  placeholder="搜索技能、输入内容或结果摘要"
                  prefix={<SearchOutlined />}
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  allowClear
                />
                <Select
                  className="execution-status-filter execution-list-filter-control"
                  size="middle"
                  placeholder="全部状态"
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
                {hasActiveFilters ? (
                  <Button
                    size="small"
                    type="text"
                    className="execution-list-clear-chip"
                    onClick={() => {
                      setSearchText('');
                      setStatusFilter(undefined);
                    }}
                  >
                    清空筛选
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="execution-list-toolbar-actions">
              <Button
                size="middle"
                icon={<ReloadOutlined />}
                onClick={() => {
                  void refetch();
                }}
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
              >
                新建
              </Button>
              <DatePicker
                size="middle"
                value={clearBeforeDate}
                onChange={(value) => setClearBeforeDate(value ?? dayjs().subtract(2, 'day'))}
                allowClear={false}
                format="YYYY-MM-DD"
                className="execution-list-date-picker"
              />
              <Button
                size="middle"
                danger
                icon={<DeleteOutlined />}
                onClick={handleCleanupBeforeDate}
                loading={cleanupExecutionsMutation.isLoading}
                className="btn-pill"
              >
                清理
              </Button>
            </div>
          </div>
        </div>
        <Table
          className="execution-list-table"
          columns={columns}
          dataSource={filteredAndSortedData}
          rowKey="id"
          size="middle"
          loading={isLoading}
          locale={{
            emptyText: (
              <div className="execution-list-empty-state">
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyStateDescription}>
                  <Space wrap size={12} style={{ justifyContent: 'center' }}>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => navigate('/executions/new')}
                    >
                      去新建执行
                    </Button>
                    <Button onClick={() => navigate('/published-skills')}>查看已发布技能</Button>
                    {hasActiveFilters ? (
                      <Button
                        type="link"
                        onClick={() => {
                          setSearchText('');
                          setStatusFilter(undefined);
                        }}
                      >
                        清空筛选条件
                      </Button>
                    ) : null}
                  </Space>
                </Empty>
              </div>
            ),
          }}
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
          rowClassName={() => 'execution-list-table-row'}
          onRow={(record) => ({
            style: {
              cursor: 'pointer',
              transition: 'background 0.2s ease',
              ...getExecutionRowStyle(record.status, isDarkTheme),
            },
            onClick: () => handleExecutionRowClick(record),
          })}
        />
      </Card>

      <Drawer
        className="execution-detail-drawer"
        title="执行详情"
        placement="right"
        width={720}
        open={!!selectedExecutionId}
        onClose={() => updateExecutionSelection(undefined)}
        styles={{ body: { background: 'var(--bg-primary)' } }}
      >
        {isDetailLoading ? (
          <div className="execution-detail-loading">
            <Spin />
          </div>
        ) : selectedExecution ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }} className="execution-detail-content">
            <Collapse
              className="execution-detail-sections"
              ghost
              defaultActiveKey={['summary']}
              expandIconPosition="end"
              items={[
                {
                  key: 'summary',
                  label: renderPanelLabel(
                    '基本信息',
                    `${getSkillDisplayName(selectedExecution.skillId)} / ${statusLabels[selectedExecution.status]}`
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
                      <Descriptions.Item label="风险">
                        {selectedExecution.riskLevel || '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="技能">
                        <Space direction="vertical" size={0}>
                          <Text>{getSkillDisplayName(selectedExecution.skillId)}</Text>
                          {getSkillDisplayName(selectedExecution.skillId) !==
                          selectedExecution.skillId ? (
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
                            <Text type="secondary">
                              {selectedExecution.currentPhaseStatus || '未开始'}
                            </Text>
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
                                onClick={() =>
                                  window.open(
                                    replaceLocalhostWithCurrentHost(
                                      stableSelectedRuntimeSessionNovncUrl
                                    ),
                                    '_blank',
                                    'noopener,noreferrer'
                                  )
                                }
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
                      {!isSelectedBrowserExecution ? (
                        <Descriptions.Item label="下载地址">
                          {extractExecutionDownloadUrl(selectedExecution) ? (
                            <Button
                              type="link"
                              icon={<DownloadOutlined />}
                              style={{ paddingInline: 0 }}
                              onClick={() =>
                                window.open(
                                  extractExecutionDownloadUrl(selectedExecution),
                                  '_blank',
                                  'noopener,noreferrer'
                                )
                              }
                            >
                              下载结果
                            </Button>
                          ) : (
                            '-'
                          )}
                        </Descriptions.Item>
                      ) : null}
                    </Descriptions>
                  ),
                },
              ]}
            />

            {isSelectedBrowserExecution &&
            stableSelectedRuntimeSessionNovncUrl &&
            (isSelectedExecutionActive ||
              isPreviewRuntimeSessionState(selectedRuntimeSession?.state)) ? (
              <div className="execution-detail-live-card">
                <LiveSessionPreviewCard
                  novncUrl={stableSelectedRuntimeSessionNovncUrl}
                  title="实时画面"
                  statusLabel={getRuntimeSessionStatusLabel(selectedRuntimeSession?.state)}
                  height={360}
                />
              </div>
            ) : null}

            {!isSelectedBrowserExecution ? (
              <Card title="输入与输出" className="execution-detail-section-card">
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <div>
                    <Text strong>输入：</Text>
                    <div style={{ marginTop: 8 }}>
                      {renderExecutionPayloadContent(selectedExecutionInput, {
                        emptyText: '该执行暂无输入内容。',
                      })}
                    </div>
                  </div>
                  <div>
                    <Text strong>结果：</Text>
                    <div style={{ marginTop: 8 }}>
                      {selectedExecutionNormalizedResult?.hasBusinessResult ? (
                        <Space direction="vertical" size={12} style={{ width: '100%' }}>
                          {selectedExecutionNormalizedResult.title ? (
                            <Space wrap size={[8, 8]}>
                              <Text strong>{selectedExecutionNormalizedResult.title}</Text>
                              {selectedExecutionNormalizedResult.resultType ? (
                                <Tag>{selectedExecutionNormalizedResult.resultType}</Tag>
                              ) : null}
                            </Space>
                          ) : null}
                          {selectedExecutionNormalizedResult.summary ||
                          selectedExecutionNormalizedResult.body ? (
                            <Text style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                              {selectedExecutionNormalizedResult.summary ||
                                selectedExecutionNormalizedResult.body}
                            </Text>
                          ) : null}
                          {selectedExecutionNormalizedResult.artifacts.length > 0 ? (
                            <Space wrap>
                              {selectedExecutionNormalizedResult.artifacts.map(
                                (artifact, index) => {
                                  const href = replaceLocalhostWithCurrentHost(
                                    artifact.downloadUrl || artifact.url
                                  );
                                  if (!href) {
                                    return null;
                                  }
                                  return (
                                    <Button
                                      key={`${href}-${index}`}
                                      type="link"
                                      href={href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{ paddingInline: 0 }}
                                    >
                                      {artifact.label || artifact.name || `结果产物 ${index + 1}`}
                                    </Button>
                                  );
                                }
                              )}
                            </Space>
                          ) : null}
                          {selectedExecutionNormalizedResult.temporalLink ? (
                            <Button
                              type="link"
                              href={replaceLocalhostWithCurrentHost(
                                selectedExecutionNormalizedResult.temporalLink
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ paddingInline: 0, width: 'fit-content' }}
                            >
                              打开 Temporal 执行链路
                            </Button>
                          ) : null}
                          {renderExecutionPayloadContent(
                            selectedExecutionNormalizedResult.structuredData ??
                              selectedExecutionNormalizedResult.envelope,
                            {
                              emptyText: '该执行暂无结构化结果。',
                            }
                          )}
                        </Space>
                      ) : (
                        renderExecutionPayloadContent(effectiveSelectedResultJson, {
                          emptyText: '该执行暂无结果输出。',
                          treatSingleResultFieldAsMarkdown: true,
                        })
                      )}
                    </div>
                  </div>
                </Space>
              </Card>
            ) : null}

            {isSelectedBrowserExecution && displaySelectedPhases.length > 0 ? (
              <Card title="步骤进度" className="execution-detail-section-card">
                {!shouldShowSelectedExecutionSummary ? (
                  <Space direction="vertical" size={16} style={{ width: '100%' }}>
                    <Card size="small" title="当前步骤" className="execution-detail-section-card">
                      <Space direction="vertical" size={12} style={{ width: '100%' }}>
                        <Space wrap size={[8, 8]}>
                          <Tag color={statusColors[selectedExecution.status]}>
                            {statusLabels[selectedExecution.status]}
                          </Tag>
                          {currentSelectedPhase ? (
                            <Tag color="processing">
                              {formatPhaseDisplayName(
                                currentSelectedPhase,
                                selectedCurrentPhaseIndex + 1
                              )}
                            </Tag>
                          ) : null}
                          {currentSelectedStep ? (
                            <Tag>{`步骤 ${currentSelectedStep.stepIndex + 1}`}</Tag>
                          ) : null}
                        </Space>
                        <div>
                          <Text strong style={{ fontSize: 16 }}>
                            {currentSelectedStep?.name ||
                              currentSelectedPhase?.phaseName ||
                              currentSelectedPhase?.phaseKey ||
                              '-'}
                          </Text>
                          <div style={{ marginTop: 6 }}>
                            <Text type="secondary">
                              {currentSelectedStep?.action || currentSelectedStep?.type || '展示当前正在执行的步骤。'}
                            </Text>
                          </div>
                        </div>
                        <Space wrap size={[12, 8]}>
                          <Text type="secondary">{`进度: ${selectedCurrentPhaseIndex + 1} / ${displaySelectedPhases.length}`}</Text>
                          <Text type="secondary">{`已完成: ${selectedCompletedPhaseCount}`}</Text>
                          {selectedLoopCount > 0 ? (
                            <Text type="secondary">{`轮次: ${selectedLoopCount}`}</Text>
                          ) : null}
                        </Space>
                        {shouldShowSelectedCurrentPhaseInfo && currentSelectedPhase ? (
                          <Alert
                            type={selectedExecution.status === 'human_control' ? 'warning' : 'info'}
                            showIcon
                            message={`当前阶段：${
                              currentSelectedPhase.phaseName || currentSelectedPhase.phaseKey || '-'
                            }`}
                            description={
                              <Space wrap size={[12, 4]}>
                                <Text type="secondary">{`Key: ${currentSelectedPhase.phaseKey}`}</Text>
                                <Text type="secondary">
                                  {formatDateTime(
                                    currentSelectedPhase.startedAt || currentSelectedPhase.createdAt
                                  )}
                                </Text>
                                {currentSelectedPhase.errorMessage ? (
                                  <Text type="danger">{currentSelectedPhase.errorMessage}</Text>
                                ) : null}
                              </Space>
                            }
                          />
                        ) : null}
                      </Space>
                    </Card>
                    <Steps
                      current={selectedCurrentPhaseIndex}
                      size="small"
                      responsive
                      items={displaySelectedPhases.map((phase, index) => ({
                        title: formatPhaseDisplayName(phase, index + 1),
                        status: getPhaseStepStatus(phase.status),
                        description: (
                          <Space wrap size={[8, 4]}>
                            <Tag color={getPhaseStatusColor(phase.status)}>{phase.status}</Tag>
                            {currentSelectedPhase?.id === phase.id ? (
                              <Tag color="processing">当前 Activity</Tag>
                            ) : null}
                          </Space>
                        ),
                      }))}
                    />
                  </Space>
                ) : (
                  <Card size="small" title="执行总结" className="execution-detail-section-card">
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      <Space wrap size={[8, 8]}>
                        <Tag color={statusColors[selectedExecution.status]}>
                          {statusLabels[selectedExecution.status]}
                        </Tag>
                        <Tag>{`总阶段数: ${displaySelectedPhases.length}`}</Tag>
                        <Tag color="green">{`已完成: ${selectedCompletedPhaseCount}`}</Tag>
                        {selectedLoopCount > 0 ? <Tag>{`轮次: ${selectedLoopCount}`}</Tag> : null}
                      </Space>
                      <Alert
                        type={
                          selectedExecution.status === 'succeeded'
                            ? 'success'
                            : selectedExecution.status === 'failed'
                              ? 'error'
                              : 'warning'
                        }
                        showIcon
                        message={selectedSummaryHeadline}
                        description={
                          <Space wrap size={[12, 8]}>
                            {selectedExecution.endedAt ? (
                              <Text type="secondary">{`结束时间: ${formatDateTime(selectedExecution.endedAt)}`}</Text>
                            ) : null}
                            {selectedExecution.failureReason ? (
                              <Text type="danger">{selectedExecution.failureReason}</Text>
                            ) : null}
                          </Space>
                        }
                      />
                      {selectedLoopSummary ? (
                        <Descriptions column={2} size="small">
                          <Descriptions.Item label="处理条数">
                            {selectedLoopSummary.totalItems}
                          </Descriptions.Item>
                          <Descriptions.Item label="人工介入">
                            {selectedLoopSummary.hasManualHandling ? '是' : '否'}
                          </Descriptions.Item>
                          <Descriptions.Item label="自动承认">
                            {`${selectedLoopSummary.autoApprovedCount} 条`}
                          </Descriptions.Item>
                          <Descriptions.Item label="人工处理">
                            {`${selectedLoopSummary.manualHandledCount} 条`}
                          </Descriptions.Item>
                        </Descriptions>
                      ) : null}
                    </Space>
                  </Card>
                )}
              </Card>
            ) : null}

            <InlineRecoveryPanel
              executionId={selectedExecution.id}
              executionStatus={selectedExecution.status}
              currentStepId={selectedExecution.currentStepId}
              phase={currentSelectedPhase}
            />

            {(selectedExecution.status === 'waiting_input' && waitingInputStep) ||
            isSelectedBrowserExecution ? (
              <Collapse
                ghost
                expandIconPosition="end"
                items={[
                  ...(selectedExecution.status === 'waiting_input' && waitingInputStep
                    ? [
                        {
                          key: 'resume',
                          label: renderPanelLabel(
                            '继续 / 恢复执行',
                            `待补 ${requiredInputs.length} 个参数`
                          ),
                          style: detailPanelStyle,
                          children: (
                            <WaitingInputActionPanel
                              title={RECOVERY_COPY.waitingInputTitle}
                              summaryText={RECOVERY_COPY.waitingInputDesc}
                              requiredInputs={requiredInputs}
                              requiredInputGroups={requiredInputGroups}
                              submitLoading={submitInputMutation.isLoading}
                              onSubmit={(values) => {
                                try {
                                  const payload = normalizeRequiredInputValues(
                                    values,
                                    requiredInputs,
                                    { treatArrayAsJson: true }
                                  );
                                  submitInputMutation.mutate({ payload });
                                } catch (error) {
                                  void message.error(
                                    error instanceof Error
                                      ? error.message
                                      : RECOVERY_COPY.resumeErrorPrefix
                                  );
                                }
                              }}
                              submitLabel={RECOVERY_COPY.waitingInputContinue}
                              resetLabel="重置"
                              provideFieldPrefix="请输入"
                              sourceLabel="来源"
                              enterJsonString="请输入 JSON 字符串"
                              enterFieldPrefix="请输入"
                              confirmTagLabel="待确认"
                              extraActions={(form) => (
                                <Button
                                  icon={<RobotOutlined />}
                                  loading={submitInputMutation.isLoading}
                                  onClick={() => void handleResumeExecution(true, form)}
                                >
                                  {RECOVERY_COPY.waitingInputToAi}
                                </Button>
                              )}
                            />
                          ),
                        },
                      ]
                    : []),
                  ...(isSelectedBrowserExecution
                    ? [
                        {
                          key: 'phases',
                          label: renderPanelLabel(
                            '阶段',
                            displaySelectedPhases.length > 0
                              ? `${displaySelectedPhases.length} 个阶段 / ${selectedExecution.currentPhaseKey || '已归档'}`
                              : '暂无阶段记录'
                          ),
                          style: detailPanelStyle,
                          children:
                            displaySelectedPhases.length > 0 ? (
                              <Collapse
                                ghost
                                expandIconPosition="end"
                                items={displaySelectedPhases.map((phase: ExecutionPhaseDto) => {
                                  const phaseSteps = getPhaseSteps(phase);
                                  const phaseArtifacts = getPhaseArtifacts(phase);
                                  const isBrowserActivityPhase = isBrowserWorkflowActivity(phase);

                                  return {
                                    key: phase.id,
                                    label: renderPanelLabel(
                                      formatPhaseDisplayName(phase),
                                      `${phase.status} / ${formatDateTime(phase.startedAt || phase.createdAt)}`
                                    ),
                                    style: {
                                      ...detailPanelStyle,
                                      marginBottom: 12,
                                    },
                                    children: (
                                      <Space
                                        direction="vertical"
                                        size={12}
                                        style={{ width: '100%' }}
                                      >
                                          <Space wrap size={[8, 4]}>
                                            <Tag>{phase.phaseType}</Tag>
                                            <Tag color={getPhaseStatusColor(phase.status)}>
                                              {phase.status}
                                            </Tag>
                                            <Text type="secondary">{`Key: ${phase.phaseKey}`}</Text>
                                            <Text type="secondary">{`尝试: ${phase.attempt}`}</Text>
                                            {isBrowserActivityPhase && phase.runtimeSessionId ? (
                                              <Text
                                                copyable={{ text: phase.runtimeSessionId }}
                                              >{`会话: ${phase.runtimeSessionId}`}</Text>
                                            ) : null}
                                          </Space>
                                          <Space wrap>
                                            {selectedExecution.status !== 'human_control' &&
                                            (phase.status === 'running' ||
                                              phase.status === 'failed') ? (
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
                                            isBrowserActivityPhase ? (
                                              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                                                <Card
                                                  size="small"
                                                  title="Activity 结果"
                                                  className="execution-detail-section-card"
                                                  styles={{ body: { padding: 12 } }}
                                                >
                                                  <Space
                                                    direction="vertical"
                                                    size={10}
                                                    style={{ width: '100%' }}
                                                  >
                                                    <Space wrap size={[12, 4]}>
                                                      <Text type="secondary">{`步骤数: ${phaseSteps.length}`}</Text>
                                                      <Text type="secondary">{`截图: ${extractWorkflowActivitySnapshotSources(phase).length}`}</Text>
                                                    </Space>
                                                    {extractWorkflowActivitySnapshotSources(phase)
                                                      .length > 0 ? (
                                                      <Image.PreviewGroup>
                                                        <Space wrap size={12}>
                                                          {extractWorkflowActivitySnapshotSources(
                                                            phase
                                                          ).map((src, index) => (
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
                                                                border:
                                                                  '1px solid var(--bg-secondary)',
                                                                padding: 6,
                                                              }}
                                                            />
                                                          ))}
                                                        </Space>
                                                      </Image.PreviewGroup>
                                                    ) : (
                                                      <Text type="secondary">
                                                        该 Activity 暂无可展示截图。
                                                      </Text>
                                                    )}
                                                  </Space>
                                                </Card>
                                                {phaseSteps.length > 0 ? (
                                                  <Timeline
                                                    items={phaseSteps.map((step) => {
                                                      const stepUrl = extractPhaseStepUrl(step);
                                                      const stepImageSources =
                                                        extractPhaseStepImageSources(step, phaseArtifacts);
                                                      const isWaitStep = step.action === 'wait';
                                                      const isNavigateStep = step.action === 'navigate';
                                                      const isScreenshotStep =
                                                        step.action === 'screenshot';

                                                      return {
                                                        color: getPhaseStatusColor(step.status),
                                                        children: isWaitStep ? (
                                                          <Space
                                                            wrap
                                                            style={{
                                                              width: '100%',
                                                              justifyContent: 'space-between',
                                                            }}
                                                          >
                                                            <Space wrap>
                                                              <Text strong>等待</Text>
                                                              <Tag color={getPhaseStatusColor(step.status)}>
                                                                {step.status}
                                                              </Tag>
                                                            </Space>
                                                            <Text type="secondary">
                                                              {formatDateTime(
                                                                step.startedAt || step.createdAt
                                                              )}
                                                            </Text>
                                                          </Space>
                                                        ) : (
                                                          <Card size="small" className="execution-detail-timeline-card">
                                                            <Space
                                                              direction="vertical"
                                                              size={10}
                                                              style={{ width: '100%' }}
                                                            >
                                                              <Space
                                                                wrap
                                                                style={{
                                                                  width: '100%',
                                                                  justifyContent: 'space-between',
                                                                }}
                                                              >
                                                                <Space wrap>
                                                                  <Text strong>
                                                                    {isNavigateStep
                                                                      ? '打开页面'
                                                                      : isScreenshotStep
                                                                        ? '截图'
                                                                        : step.action ||
                                                                          `步骤 ${step.stepIndex + 1}`}
                                                                  </Text>
                                                                  <Tag
                                                                    color={getPhaseStatusColor(
                                                                      step.status
                                                                    )}
                                                                  >
                                                                    {step.status}
                                                                  </Tag>
                                                                </Space>
                                                                <Text type="secondary">
                                                                  {formatDateTime(
                                                                    step.startedAt || step.createdAt
                                                                  )}
                                                                </Text>
                                                              </Space>
                                                              {isNavigateStep ? (
                                                                <Text
                                                                  copyable={
                                                                    stepUrl
                                                                      ? { text: stepUrl }
                                                                      : undefined
                                                                  }
                                                                >
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
                                                                    {stepImageSources.map(
                                                                      (src, index) => (
                                                                        <Image
                                                                          key={`${src}-${index}`}
                                                                          src={src}
                                                                          alt={`${phase.phaseName || phase.phaseKey}-step-${index + 1}`}
                                                                          style={{
                                                                            width: 320,
                                                                            maxWidth: '100%',
                                                                            maxHeight: 320,
                                                                            objectFit: 'contain',
                                                                            background:
                                                                              'var(--bg-secondary)',
                                                                            borderRadius: 8,
                                                                            border:
                                                                              '1px solid var(--bg-secondary)',
                                                                            padding: 6,
                                                                          }}
                                                                        />
                                                                      )
                                                                    )}
                                                                  </Space>
                                                                </Image.PreviewGroup>
                                                              ) : null}
                                                            </Space>
                                                          </Card>
                                                        ),
                                                      };
                                                    })}
                                                  />
                                                ) : null}
                                              </Space>
                                            ) : (
                                              <Card
                                                size="small"
                                                title="Activity 输出"
                                                className="execution-detail-section-card"
                                                styles={{ body: { padding: 12 } }}
                                              >
                                                {renderExecutionPayloadContent(phase.output, {
                                                  emptyText: '该 Activity 暂无输出内容。',
                                                  treatSingleResultFieldAsMarkdown: true,
                                                })}
                                              </Card>
                                            )
                                          ) : phaseSteps.length > 0 ? (
                                            <Timeline
                                              items={phaseSteps.map((step) => {
                                                const stepUrl = extractPhaseStepUrl(step);
                                                const stepImageSources =
                                                  extractPhaseStepImageSources(step, phaseArtifacts);
                                                const isWaitStep = step.action === 'wait';
                                                const isNavigateStep = step.action === 'navigate';
                                                const isScreenshotStep =
                                                  step.action === 'screenshot';

                                                return {
                                                  color: getPhaseStatusColor(step.status),
                                                  children: isWaitStep ? (
                                                    <Space
                                                      wrap
                                                      style={{
                                                        width: '100%',
                                                        justifyContent: 'space-between',
                                                      }}
                                                    >
                                                      <Space wrap>
                                                        <Text strong>等待</Text>
                                                        <Tag
                                                          color={getPhaseStatusColor(step.status)}
                                                        >
                                                          {step.status}
                                                        </Tag>
                                                      </Space>
                                                      <Text type="secondary">
                                                        {formatDateTime(
                                                          step.startedAt || step.createdAt
                                                        )}
                                                      </Text>
                                                    </Space>
                                                  ) : (
                                                    <Card size="small" className="execution-detail-timeline-card">
                                                      <Space
                                                        direction="vertical"
                                                        size={10}
                                                        style={{ width: '100%' }}
                                                      >
                                                        <Space
                                                          wrap
                                                          style={{
                                                            width: '100%',
                                                            justifyContent: 'space-between',
                                                          }}
                                                        >
                                                          <Space wrap>
                                                            <Text strong>
                                                              {isNavigateStep
                                                                ? '打开页面'
                                                                : isScreenshotStep
                                                                  ? '截图'
                                                                  : step.action ||
                                                                    `步骤 ${step.stepIndex + 1}`}
                                                            </Text>
                                                            <Tag
                                                              color={getPhaseStatusColor(
                                                                step.status
                                                              )}
                                                            >
                                                              {step.status}
                                                            </Tag>
                                                          </Space>
                                                          <Text type="secondary">
                                                            {formatDateTime(
                                                              step.startedAt || step.createdAt
                                                            )}
                                                          </Text>
                                                        </Space>
                                                        {isNavigateStep ? (
                                                          <Text
                                                            copyable={
                                                              stepUrl
                                                                ? { text: stepUrl }
                                                                : undefined
                                                            }
                                                          >
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
                                                              {stepImageSources.map(
                                                                (src, index) => (
                                                                  <Image
                                                                    key={`${src}-${index}`}
                                                                    src={src}
                                                                    alt={`${phase.phaseName || phase.phaseKey}-step-${index + 1}`}
                                                                    style={{
                                                                      width: 320,
                                                                      maxWidth: '100%',
                                                                      maxHeight: 320,
                                                                      objectFit: 'contain',
                                                                      background:
                                                                        'var(--bg-secondary)',
                                                                      borderRadius: 8,
                                                                      border:
                                                                        '1px solid var(--bg-secondary)',
                                                                      padding: 6,
                                                                    }}
                                                                  />
                                                                )
                                                              )}
                                                            </Space>
                                                          </Image.PreviewGroup>
                                                        ) : null}
                                                      </Space>
                                                    </Card>
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
                            ) : (
                              <Empty
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description="暂无阶段记录"
                              />
                            ),
                        },
                      ]
                    : []),
                  ...(isSelectedBrowserExecution &&
                  !displaySelectedPhases.length &&
                  shouldShowLegacySteps
                    ? [
                        {
                          key: 'steps',
                          label: renderPanelLabel(
                            '步骤',
                            summarizeSteps(selectedSteps, isStepsLoading)
                          ),
                          style: { ...detailPanelStyle, marginBottom: 0 },
                          children: isStepsLoading ? (
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'center',
                                padding: '24px 0',
                              }}
                            >
                              <Spin />
                            </div>
                          ) : selectedSteps && selectedSteps.length > 0 ? (
                            <Timeline
                              items={selectedSteps.map((step) => ({
                                color: getStepStatusColor(step.status),
                                children: (
                                  <Card
                                    size="small"
                                    className="execution-detail-timeline-card"
                                    style={{
                                      borderRadius: 12,
                                      border: '1px solid var(--bg-secondary)',
                                      background: 'var(--bg-card)',
                                    }}
                                  >
                                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                      <Space
                                        style={{ width: '100%', justifyContent: 'space-between' }}
                                        wrap
                                      >
                                        <Space wrap>
                                          <Text strong>{`步骤 ${step.stepIndex + 1}`}</Text>
                                          <Text>
                                            {step.name || step.action || step.type || '-'}
                                          </Text>
                                        </Space>
                                        <Tag color={getStepStatusColor(step.status)}>
                                          {step.status}
                                        </Tag>
                                      </Space>
                                      <Space wrap size={[8, 4]}>
                                        <Text type="secondary">{`类型: ${step.type}`}</Text>
                                        {step.action ? (
                                          <Text type="secondary">{`动作: ${step.action}`}</Text>
                                        ) : null}
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
                                      {step.outputJson &&
                                      Object.keys(step.outputJson).length > 0 ? (
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
                      ]
                    : []),
                ]}
              />
            ) : null}
          </Space>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请选择一条执行记录" />
        )}
      </Drawer>
    </div>
  );
};

export default ExecutionListPage;
