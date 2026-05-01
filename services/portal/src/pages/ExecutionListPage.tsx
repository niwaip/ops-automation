/**
 * ExecutionListPage
 * List all executions with filtering and pagination
 * Phase 4: Portal Execution views
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  UserOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { executionApi, ExecutionDto, ExecutionStatus, ExecutionStepDto } from '../api/execution';
import { skillApi } from '../api/skill';
import { capabilityReleaseApi } from '../api/capability-release';
import { useChatStore } from '../components/chat';
import { ListSectionHeader, PageTitleBlock } from '../components/page/PageScaffold';
import { useAuthStore } from '../store/authStore';
import {
  EXECUTION_FINISHED_STATUSES,
  EXECUTION_STATUS_COLORS,
  EXECUTION_STATUS_LABELS_ZH,
  EXECUTION_STATUS_OPTIONS_ZH,
  EXECUTION_WAITING_STATUSES,
} from '../utils/executionStatusMeta';

const { Text } = Typography;
const statusColors = EXECUTION_STATUS_COLORS;
const statusLabels = EXECUTION_STATUS_LABELS_ZH;

const formatDateTime = (date?: string) => (date ? new Date(date).toLocaleString() : '-');

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

const renderJsonBlock = (value: unknown) => (
  <pre
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
    }}
  >
    {JSON.stringify(value, null, 2)}
  </pre>
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

const summarizeText = (value?: string, maxLength = 36) => {
  if (!value) {
    return '';
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
};

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

const summarizeExecutionInput = (execution: ExecutionDto) => {
  const prompt = typeof execution.input?.prompt === 'string' ? execution.input.prompt : undefined;
  const objective = typeof execution.normalizedInput?.objective === 'string'
    ? execution.normalizedInput.objective
    : undefined;
  const summaryText = summarizeText(prompt || objective);

  if (summaryText) {
    return summaryText;
  }

  if (execution.input && Object.keys(execution.input).length > 0) {
    const keys = Object.keys(execution.input);
    const preview = keys.slice(0, 3).join('、');
    return keys.length > 3 ? `${preview} 等 ${keys.length} 项` : preview;
  }

  return '暂无输入';
};

const summarizeExecutionResult = (result?: Record<string, unknown>) => {
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

const summarizeExecutionListInput = (record: ExecutionDto) => summarizeText(
  typeof record.input?.prompt === 'string'
    ? record.input.prompt
    : typeof record.normalizedInput?.objective === 'string'
      ? record.normalizedInput.objective
      : undefined,
  46,
) || (record.input && Object.keys(record.input).length > 0
  ? `${Object.keys(record.input).slice(0, 2).join('、')}${Object.keys(record.input).length > 2 ? ' 等' : ''}`
  : '暂无输入');

interface RequiredInputField {
  name: string;
  type: string;
  description?: string;
  required: boolean;
  value?: unknown;
  missing: boolean;
  source: 'user_input' | 'default' | 'unresolved';
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
  const originalContent =
    (typeof execution.input?.prompt === 'string' && execution.input.prompt)
    || (typeof execution.normalizedInput?.objective === 'string' && execution.normalizedInput.objective)
    || JSON.stringify(execution.input || {}, null, 2);

  const supplement = submittedInput && Object.keys(submittedInput).length > 0
    ? JSON.stringify(submittedInput, null, 2)
    : '无';

  return [
    `请继续处理这个任务，executionId=${execution.id}。`,
    '',
    '原始任务内容：',
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
  const [selectedExecutionId, setSelectedExecutionId] = useState<string>();
  const { theme } = useAuthStore();
  const isDarkTheme = theme === 'dark';

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

  const requiredInputs = Array.isArray(waitingInputStep?.input?.requiredInputs)
    ? waitingInputStep?.input?.requiredInputs as RequiredInputField[]
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
        record.createdBy,
        record.createdByName,
        record.riskLevel,
        record.status,
        JSON.stringify(record.input || {}),
      ]
        .filter(Boolean)
        .some((item) => String(item).toLowerCase().includes(keyword));
    });

    rows.sort((a, b) => getExecutionTime(b) - getExecutionTime(a));
    return rows;
  }, [data?.data, searchText, skillNameMap]);

  const executionOverviewStats = useMemo(() => {
    const rows = filteredAndSortedData;
    return {
      total: rows.length,
      running: rows.filter((item) => item.status === 'running').length,
      waiting: rows.filter((item) => EXECUTION_WAITING_STATUSES.includes(item.status)).length,
      finished: rows.filter((item) => EXECUTION_FINISHED_STATUSES.includes(item.status)).length,
    };
  }, [filteredAndSortedData]);

  const columns = [
    {
      title: '技能名称',
      key: 'execution',
      width: 280,
      render: (_: unknown, record: ExecutionDto) => (
        <Space direction="vertical" size={4}>
          <Space size={6} wrap>
            <Text strong style={{ fontSize: 16 }}>{getSkillDisplayName(record.skillId)}</Text>
            {record.currentStepId ? (
              <Text type="secondary" style={{ fontSize: 12 }}>
                当前步骤: {record.currentStepId}
              </Text>
            ) : null}
          </Space>
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
        <Space direction="vertical" size={0}>
          <Text>{formatDateTime(record.startedAt || record.createdAt)}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
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
      dataIndex: 'input',
      key: 'input',
      width: 320,
      ellipsis: true,
      render: (_input: Record<string, unknown> | undefined, record: ExecutionDto) => (
        <Space direction="vertical" size={2}>
          <Text>{summarizeExecutionListInput(record)}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.input && Object.keys(record.input).length > 0
              ? `${Object.keys(record.input).length} 个输入字段`
              : '无结构化参数'}
          </Text>
        </Space>
      ),
    },
    {
      title: '执行结果',
      key: 'result',
      width: 220,
      render: (_: unknown, record: ExecutionDto) => {
        const downloadUrl = extractDownloadUrl(record.result);
        return (
          <Space direction="vertical" size={4}>
            <Text>{summarizeExecutionResult(record.result)}</Text>
            {downloadUrl ? (
              <Button
                type="link"
                icon={<DownloadOutlined />}
                style={{ paddingInline: 0, fontWeight: 600, height: 'auto' }}
                onClick={(event) => {
                  event.stopPropagation();
                  window.open(downloadUrl, '_blank', 'noopener,noreferrer');
                }}
              >
                下载结果
              </Button>
            ) : (
              <Text type="secondary" style={{ fontSize: 12 }}>
                暂无可下载文件
              </Text>
            )}
          </Space>
        );
      },
    },
    {
      title: '执行人',
      dataIndex: 'createdBy',
      key: 'createdBy',
      width: 180,
      render: (_: string, record: ExecutionDto) => (
        <Space size={8}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: isDarkTheme ? 'rgba(99, 102, 241, 0.16)' : '#eef4ff',
              color: 'var(--primary-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {(record.createdByName || record.createdBy || 'U').slice(0, 1).toUpperCase()}
          </div>
          <Text>{record.createdByName || record.createdBy || '-'}</Text>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <PageTitleBlock
        title="执行历史"
        subtitle="查看、筛选并跟进所有技能执行记录"
      />

      {/* Filters */}
      <Card
        style={{
          marginBottom: 16,
          borderRadius: 16,
          border: '1px solid var(--bg-secondary)',
          boxShadow: 'var(--shadow-md)',
        }}
        styles={{ body: { padding: 20 } }}
      >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                flexWrap: 'wrap',
              }}
            >
              <Space direction="vertical" size={2}>
                <Text strong style={{ fontSize: 16 }}>执行记录总览</Text>
                <Text type="secondary">按状态和关键字快速筛选并进入执行详情</Text>
              </Space>
              <Space wrap>
                <Button size="large" icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching}>
                  刷新
                </Button>
                <Button size="large" type="primary" icon={<PlusOutlined />} onClick={() => navigate('/executions/new')}>
                  新建执行
                </Button>
              </Space>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'stretch',
                justifyContent: 'space-between',
                gap: 16,
                flexWrap: 'wrap',
              }}
            >
              <Space wrap size={12} style={{ flex: 1 }}>
              <Input
                size="large"
                placeholder="搜索执行单 ID、技能、执行人、状态或输入内容"
                prefix={<SearchOutlined />}
                variant="borderless"
                style={{
                  width: 360,
                  height: 44,
                  background: 'var(--bg-secondary)',
                  borderRadius: 12,
                }}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                allowClear
              />
              <Select
                size="large"
                placeholder="全部状态"
                variant="borderless"
                style={{
                  width: 180,
                  height: 44,
                  background: 'var(--bg-secondary)',
                  borderRadius: 12,
                }}
                allowClear
                value={statusFilter}
                onChange={setStatusFilter}
              >
                {EXECUTION_STATUS_OPTIONS_ZH.map((option) => (
                  <Select.Option key={option.value} value={option.value}>
                    {option.label}
                  </Select.Option>
                ))}
              </Select>
              </Space>

              <Space size={10} wrap style={{ justifyContent: 'flex-end' }}>
                {[
                  { label: '总记录', value: executionOverviewStats.total, color: 'var(--text-primary)' },
                  { label: '执行中', value: executionOverviewStats.running, color: 'var(--info-color)' },
                  { label: '待处理', value: executionOverviewStats.waiting, color: 'var(--warning-color)' },
                  { label: '已结束', value: executionOverviewStats.finished, color: 'var(--success-color)' },
                ].map((item) => (
                  <Card
                    key={item.label}
                    size="small"
                    style={{
                      minWidth: 108,
                      minHeight: 44,
                      borderRadius: 14,
                      border: '1px solid var(--bg-secondary)',
                      background: 'var(--bg-card)',
                      boxShadow: 'var(--shadow-sm)',
                    }}
                    styles={{ body: { padding: '10px 14px', textAlign: 'center' } }}
                  >
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>{item.label}</Text>
                      <Text style={{ fontSize: 22, fontWeight: 700, color: item.color, display: 'block' }}>{item.value}</Text>
                    </Space>
                  </Card>
                ))}
              </Space>
            </div>
          </div>
      </Card>

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
          title="执行记录列表"
          subtitle="按开始时间倒序展示，可点击任一行查看详情"
          extra={<Text type="secondary">当前展示 {filteredAndSortedData.length} 条</Text>}
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
          scroll={{ x: 1450 }}
          onRow={(record) => ({
            style: {
              cursor: 'pointer',
              transition: 'background 0.2s ease',
              ...getExecutionRowStyle(record.status, isDarkTheme),
            },
            onClick: () => setSelectedExecutionId(record.id),
          })}
        />
      </Card>

      <Drawer
        title="执行详情"
        placement="right"
        width={720}
        open={!!selectedExecutionId}
        onClose={() => setSelectedExecutionId(undefined)}
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
                    <UserOutlined style={{ color: 'var(--text-light)' }} />
                    <Text>{selectedExecution.createdByName || selectedExecution.createdBy || '-'}</Text>
                  </Space>
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
                      <Descriptions.Item label="执行人">
                        {selectedExecution.createdByName || selectedExecution.createdBy || '-'}
                      </Descriptions.Item>
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
                        {formatDateTime(selectedExecution.endedAt)}
                      </Descriptions.Item>
                      <Descriptions.Item label="失败原因">
                        {selectedExecution.failureReason || '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="下载地址">
                        {extractDownloadUrl(selectedExecution.result) ? (
                          <Button
                            type="link"
                            icon={<DownloadOutlined />}
                            style={{ paddingInline: 0 }}
                            onClick={() => window.open(extractDownloadUrl(selectedExecution.result), '_blank', 'noopener,noreferrer')}
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
                  key: 'input',
                  label: renderPanelLabel(
                    '用户输入',
                    summarizeExecutionInput(selectedExecution),
                  ),
                  style: detailPanelStyle,
                  children: selectedExecution.input ? (
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                        <Text type="secondary">已格式化显示原始输入 JSON</Text>
                        <Button
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => void handleCopyJson('用户输入', selectedExecution.input)}
                        >
                          复制 JSON
                        </Button>
                      </Space>
                      {renderJsonBlock(selectedExecution.input)}
                    </Space>
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无输入" />
                  ),
                },
                {
                  key: 'result',
                  label: renderPanelLabel(
                    '执行结果',
                    summarizeExecutionResult(selectedExecution.result),
                  ),
                  style: detailPanelStyle,
                  children: selectedExecution.result ? (
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                        <Text type="secondary">已格式化显示执行结果 JSON</Text>
                        <Space wrap>
                          {extractDownloadUrl(selectedExecution.result) ? (
                            <Button
                              size="small"
                              icon={<DownloadOutlined />}
                              onClick={() => window.open(extractDownloadUrl(selectedExecution.result), '_blank', 'noopener,noreferrer')}
                            >
                              下载
                            </Button>
                          ) : null}
                          <Button
                            size="small"
                            icon={<CopyOutlined />}
                            onClick={() => void handleCopyJson('执行结果', selectedExecution.result)}
                          >
                            复制 JSON
                          </Button>
                        </Space>
                      </Space>
                      {renderJsonBlock(selectedExecution.result)}
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
                                {step.retryCount > 0 ? <Text type="secondary">{`重试 ${step.retryCount} 次`}</Text> : null}
                              </Space>
                              <Space direction="vertical" size={2}>
                                <Text type="secondary">{`开始: ${formatDateTime(step.startedAt || step.createdAt)}`}</Text>
                                <Text type="secondary">{`结束: ${formatDateTime(step.endedAt)}`}</Text>
                              </Space>
                              {step.errorMessage ? (
                                <Alert
                                  type="error"
                                  showIcon
                                  message="步骤执行失败"
                                  description={step.errorMessage}
                                />
                              ) : null}
                              {step.output && Object.keys(step.output).length > 0 ? (
                                <Text type="secondary">{`输出字段: ${Object.keys(step.output).slice(0, 4).join('、')}`}</Text>
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
