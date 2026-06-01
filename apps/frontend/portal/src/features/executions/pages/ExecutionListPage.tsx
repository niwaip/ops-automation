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
  Form,
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
import '@/features/chat/ChatMessage.css';
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
import { ListSectionHeader } from '@/components/page/PageScaffold';
import LiveSessionPreviewCard from '@/components/runtime/LiveSessionPreviewCard';
import InlineRecoveryPanel from '@/features/executions/components/InlineRecoveryPanel';
import { RECOVERY_COPY } from '@/features/executions/components/recoveryOptions';
import {
  extractBrowserExecutionResult,
  hasBrowserExecutionEvidence,
} from '@/features/executions/lib/browser';
import {
  extractPhaseStepImageSources,
  extractPhaseStepUrl,
  extractWorkflowActivitySnapshotSources,
  getVisiblePhaseSteps,
} from '@/features/executions/lib/artifacts';
import { hasMeaningfulExecutionResult, tryParseJsonValue } from '@/features/executions/lib/common';
import { beautifyText } from '@/features/executions/lib/detailView';
import { normalizeRequiredInputValues, renderRequiredInputField, type RequiredInputField } from '@/features/executions/lib/inputFields';
import {
  buildAiResumeDraft,
  extractExecutionDisplayInput,
  extractDownloadUrl,
  summarizeExecutionListInput,
} from '@/features/executions/lib/listHelpers';
import {
  formatDateTime,
  formatDuration,
  formatListDateTime,
  getExecutionRowStyle,
  getRiskBadgeStyle,
  getStepStatusColor,
  summarizeSteps,
} from '@/features/executions/lib/listView';
import {
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
import { useAuthStore } from '@/shared/store/authStore';
import { replaceLocalhostWithCurrentHost } from '@/shared/lib/publicUrl';
import {
  EXECUTION_ACTIVE_POLLING_STATUSES,
  EXECUTION_STATUS_COLORS,
  EXECUTION_STATUS_LABELS_ZH,
} from '@/shared/lib/executionStatusMeta';
import {
  buildWaitingInputDisplayGroups,
  resolveWaitingInputDisplayLabel,
} from '@/shared/lib/waitingInputDisplay';
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

  return (phase.steps || []).some((step) => {
    if (step.snapshotId) {
      return true;
    }

    if (extractPhaseStepImageSources(step, phase.artifacts || []).length > 0) {
      return true;
    }

    const action = step.action?.trim().toLowerCase();
    return Boolean(action && BROWSER_ACTIVITY_ACTIONS.has(action));
  });
};

const renderExecutionPayloadContent = (
  value: unknown,
  options?: {
    emptyText?: string;
    treatSingleResultFieldAsMarkdown?: boolean;
  },
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
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {beautifyText(parsedValue)}
        </ReactMarkdown>
      </div>
    );
  }

  const resultRecord = (
    parsedValue && typeof parsedValue === 'object' && !Array.isArray(parsedValue)
      ? parsedValue as Record<string, unknown>
      : undefined
  );
  const resultText = typeof resultRecord?.result === 'string' ? resultRecord.result : undefined;
  const onlyHasResultField = options?.treatSingleResultFieldAsMarkdown && resultRecord
    ? Object.keys(resultRecord).length === 1
      && Object.prototype.hasOwnProperty.call(resultRecord, 'result')
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
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {beautifyText(resultText)}
        </ReactMarkdown>
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
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%' }}>
    <Text strong>{title}</Text>
    {summary ? <Text type="secondary">{summary}</Text> : null}
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
    value === null
    || value === undefined
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
    || Array.isArray(value)
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
  const [resumeForm] = Form.useForm<ResumeFormValues>();
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
  const selectedExecutionRuntimeSessionId = selectedExecution?.runtimeSessionId || selectedBrowserExecutionResult?.runtimeSessionId;
  const isSelectedBrowserExecution = useMemo(
    () => (
      hasBrowserExecutionEvidence({
        runtimeType: selectedExecution?.runtimeType,
        runtimeSessionId: selectedExecutionRuntimeSessionId,
        browserExecutionResult: selectedBrowserExecutionResult,
        phases: sortedSelectedExecutionPhases,
      })
      || sortedSelectedExecutionPhases.some((phase) => isBrowserWorkflowActivity(phase))
    ),
    [selectedBrowserExecutionResult, selectedExecution?.runtimeType, selectedExecutionRuntimeSessionId, sortedSelectedExecutionPhases],
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
  const { data: selectedRuntimeSession } = useQuery(
    ['execution-runtime-session', selectedExecutionRuntimeSessionId],
    () => runtimeSessionApi.getByIdOrExecutionId(selectedExecutionRuntimeSessionId!, selectedExecution?.id),
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
  const selectedExecutionInput = selectedExecution
    ? extractExecutionDisplayInput(selectedExecution)
    : undefined;

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
      requiredInputs.reduce<ResumeFormValues>((acc, field) => {
        acc[field.name] = toResumeFormValue(field.value);
        return acc;
      }, {} as ResumeFormValues)
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
      const payload = normalizeRequiredInputValues(values, requiredInputs, { treatArrayAsJson: true });

      if (openInAi) {
        openAiTaskMode(
          buildAiResumeDraft(selectedExecution, payload),
          selectedExecution.id,
        );
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
                onClick={() => {
                  void refetch();
                }}
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
            onClick: () => handleExecutionRowClick(record),
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
                                onClick={() => window.open(replaceLocalhostWithCurrentHost(stableSelectedRuntimeSessionNovncUrl), '_blank', 'noopener,noreferrer')}
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

            {isSelectedBrowserExecution && stableSelectedRuntimeSessionNovncUrl && (isSelectedExecutionActive || isPreviewRuntimeSessionState(selectedRuntimeSession?.state)) ? (
              <LiveSessionPreviewCard
                novncUrl={stableSelectedRuntimeSessionNovncUrl}
                title="实时画面"
                statusLabel={getRuntimeSessionStatusLabel(selectedRuntimeSession?.state)}
                height={360}
              />
            ) : null}

            {!isSelectedBrowserExecution ? (
              <Card title="输入与输出">
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
                      {renderExecutionPayloadContent(effectiveSelectedResultJson, {
                        emptyText: '该执行暂无结果输出。',
                        treatSingleResultFieldAsMarkdown: true,
                      })}
                    </div>
                  </div>
                </Space>
              </Card>
            ) : null}

            {isSelectedBrowserExecution && displaySelectedPhases.length > 0 ? (
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

            {(selectedExecution.status === 'waiting_input' && waitingInputStep) || isSelectedBrowserExecution ? (
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
                                      {renderRequiredInputField(field, { treatArrayAsJson: true })}
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
                                {renderRequiredInputField(field, { treatArrayAsJson: true })}
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
                  ...(isSelectedBrowserExecution ? [{
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
                        const isBrowserActivityPhase = isBrowserWorkflowActivity(phase);

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
                                {isBrowserActivityPhase && phase.runtimeSessionId ? (
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
                                isBrowserActivityPhase ? (
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
                                ) : (
                                  <Card size="small" title="Activity 输出" styles={{ body: { padding: 12 } }}>
                                    {renderExecutionPayloadContent(phase.output, {
                                      emptyText: '该 Activity 暂无输出内容。',
                                      treatSingleResultFieldAsMarkdown: true,
                                    })}
                                  </Card>
                                )
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
                  }] : []),
                  ...(isSelectedBrowserExecution && !displaySelectedPhases.length && shouldShowLegacySteps ? [{
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
