import { ArrowRightOutlined, InfoCircleOutlined, PlusOutlined, RobotOutlined } from '@ant-design/icons';
import {
  App,
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Empty,
  Input,
  List,
  Popover,
  Row,
  Space,
  Tag,
  Typography,
} from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from 'react-query';
import { useNavigate } from 'react-router-dom';
import {
  StreamEventType,
  EXECUTION_STATUS_LABELS_ZH,
  type ChatRequest,
  type ExecutionDto,
  type ExecutionStatus,
} from '@ops/user-core';
import { authStore } from '@/adapters/auth/authStore';
import { browserStreamingTransport } from '@/adapters/streaming/browserStreamingTransport';
import { apiClient, chatApi, executionApi, scheduleApi, skillApi } from '../../../api';
import { useChatStore } from '../../chat';
import {
  loadWorkbenchTodos,
  saveWorkbenchTodos,
  type WorkbenchTodo,
} from '../lib/workbenchTodoStorage';
import {
  loadWorkbenchSummary,
  saveWorkbenchSummary,
  type WorkbenchSummaryPeriod,
} from '../lib/workbenchSummaryStorage';
import './DashboardPage.css';

const ACTIONABLE_STATUSES: ExecutionStatus[] = [
  'human_control',
  'pending_approval',
  'waiting_input',
  'failed',
];

const WORKBENCH_DATE_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const buildTodoId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `todo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const getExecutionDisplayTime = (execution: ExecutionDto): string =>
  execution.endedAt || execution.updatedAt || execution.startedAt || execution.createdAt;

const isWithinRecentDays = (value: string | undefined, days: number): boolean => {
  if (!value) {
    return false;
  }
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) {
    return false;
  }
  return Date.now() - time <= days * 24 * 60 * 60 * 1000;
};

const formatDateTime = (value?: string): string => {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return WORKBENCH_DATE_FORMATTER.format(date);
};

interface ScheduleSummary {
  id: string;
  name: string;
  skillId: string;
  cronExpression: string;
  timezone?: string;
  isActive: boolean;
  nextRunAt?: string;
}

interface SummaryGenerateState {
  status: 'idle' | 'running' | 'completed' | 'error';
  content: string;
  generatedAt?: string;
  error?: string;
}

const summarizeCronExpression = (cronExpression?: string) => {
  if (!cronExpression) {
    return '未设置';
  }

  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return cronExpression;
  }

  const [minute, hour, dayOfMonth, _month, dayOfWeek] = parts;
  const timeText = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  if (dayOfMonth === '*' && dayOfWeek === '1-5') {
    return `工作日 ${timeText}`;
  }

  if (dayOfMonth !== '*' && dayOfWeek === '*') {
    return `每月 ${dayOfMonth} 日 ${timeText}`;
  }

  if (dayOfMonth === '*' && dayOfWeek !== '*') {
    return `每周 ${dayOfWeek} ${timeText}`;
  }

  return cronExpression;
};

const compactText = (value: string, max = 42): string =>
  value.length > max ? `${value.slice(0, max).trim()}...` : value;

const sanitizeDisplayName = (value?: string): string => {
  if (!value) {
    return '';
  }
  return value.replace(/-[a-f0-9]{8}(?=(\s|$))/gi, '').trim();
};

const parseTodoDraftIntoTasks = (value: string): string[] => {
  const normalized = value
    .replace(/\r/g, '\n')
    .replace(/[；;]/g, '\n')
    .replace(/(?:^|\n)\s*\d+[.)、]\s*/g, '\n')
    .replace(/(?:^|\n)\s*[-*•]\s*/g, '\n');

  return Array.from(
    new Set(
      normalized
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
};

const formatSummaryTime = (value?: string): string => {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const createInitialSummaryState = (
  period: WorkbenchSummaryPeriod
): SummaryGenerateState => {
  const cached = loadWorkbenchSummary(period);
  if (!cached) {
    return { status: 'idle', content: '' };
  }
  return {
    status: 'completed',
    content: cached.content,
    generatedAt: cached.generatedAt,
  };
};

const getExecutionTitle = (execution: ExecutionDto): string => {
  const resultTitle = execution.normalizedResult?.title?.trim();
  if (resultTitle) {
    return resultTitle;
  }
  const resultSummary = execution.normalizedResult?.summary?.trim();
  if (resultSummary) {
    return resultSummary;
  }
  const semanticRecord =
    execution.semantic && typeof execution.semantic === 'object'
      ? (execution.semantic as unknown as Record<string, unknown>)
      : undefined;
  const semanticTitleCandidate = [
    semanticRecord?.title,
    semanticRecord?.summary,
    semanticRecord?.intent,
    semanticRecord?.task,
  ].find((item) => typeof item === 'string' && item.trim());
  if (typeof semanticTitleCandidate === 'string') {
    return semanticTitleCandidate;
  }
  const inputRecord =
    execution.normalizedInput && typeof execution.normalizedInput === 'object'
      ? (execution.normalizedInput as Record<string, unknown>)
      : undefined;
  const inputCandidate = [
    inputRecord?.user_input,
    inputRecord?.prompt,
    inputRecord?.task,
    inputRecord?.query,
    inputRecord?.goal,
    inputRecord?.url,
  ].find((item) => typeof item === 'string' && item.trim());
  if (typeof inputCandidate === 'string') {
    return inputCandidate;
  }
  return `执行单 ${execution.id.slice(0, 8)}`;
};

const sortByExecutionTimeDesc = (items: ExecutionDto[]): ExecutionDto[] =>
  [...items].sort(
    (left, right) =>
      new Date(getExecutionDisplayTime(right)).getTime() -
      new Date(getExecutionDisplayTime(left)).getTime()
  );

const buildExecutionSummaryLines = (items: ExecutionDto[]): string[] =>
  items.map(
    (item) =>
      `- ${getExecutionTitle(item)}｜状态：${EXECUTION_STATUS_LABELS_ZH[item.status]}｜时间：${formatDateTime(getExecutionDisplayTime(item))}${item.failureReason ? `｜说明：${item.failureReason}` : ''}`
  );

export function DashboardPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const openWithPrompt = useChatStore((state) => state.openWithPrompt);
  const [todos, setTodos] = useState<WorkbenchTodo[]>([]);
  const [todoDraft, setTodoDraft] = useState('');
  const autoGeneratedSummaryRef = useRef<Record<WorkbenchSummaryPeriod, boolean>>({
    daily: false,
    weekly: false,
  });
  const [summaryState, setSummaryState] = useState<Record<WorkbenchSummaryPeriod, SummaryGenerateState>>({
    daily: createInitialSummaryState('daily'),
    weekly: createInitialSummaryState('weekly'),
  });
  const executionsQuery = useQuery(['dashboard-executions'], () =>
    executionApi.list({ page: 1, pageSize: 100 }),
    {
      staleTime: 30000,
      keepPreviousData: true,
      refetchOnWindowFocus: false,
    }
  );
  const schedulesQuery = useQuery(
    ['dashboard-schedules'],
    async () => (await scheduleApi.list()) as ScheduleSummary[],
    {
      staleTime: 60000,
      keepPreviousData: true,
      refetchOnWindowFocus: false,
    }
  );
  const skillsQuery = useQuery(['dashboard-skills-name-map'], () => skillApi.list(), {
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    setTodos(loadWorkbenchTodos());
  }, []);

  useEffect(() => {
    saveWorkbenchTodos(todos);
  }, [todos]);

  const executions = useMemo(
    () => sortByExecutionTimeDesc(executionsQuery.data?.data || []),
    [executionsQuery.data]
  );
  const schedules = useMemo(
    () =>
      [...(schedulesQuery.data || [])].sort(
        (left, right) =>
          new Date(right.nextRunAt || right.id).getTime() - new Date(left.nextRunAt || left.id).getTime()
      ),
    [schedulesQuery.data]
  );
  const activeSchedules = useMemo(
    () =>
      [...schedules]
        .filter((item) => item.isActive)
        .sort(
          (left, right) =>
            new Date(left.nextRunAt || left.id).getTime() - new Date(right.nextRunAt || right.id).getTime()
        ),
    [schedules]
  );
  const upcomingSchedules = activeSchedules.slice(0, 3);
  const skillNameMap = useMemo(() => {
    const map = new Map<string, string>();
    (skillsQuery.data?.skills || []).forEach((skill) => {
      map.set(skill.id, skill.name);
    });
    return map;
  }, [skillsQuery.data?.skills]);
  const manualQueue = useMemo(
    () =>
      sortByExecutionTimeDesc(
        executions.filter((item) => ACTIONABLE_STATUSES.includes(item.status))
      ),
    [executions]
  );
  const recentSuccessfulExecutions = useMemo(
    () => executions.filter((item) => item.status === 'succeeded').slice(0, 5),
    [executions]
  );
  const todayCompletedExecutions = useMemo(
    () =>
      executions.filter(
        (item) => item.status === 'succeeded' && isWithinRecentDays(getExecutionDisplayTime(item), 1)
      ),
    [executions]
  );
  const weekCompletedExecutions = useMemo(
    () =>
      executions.filter(
        (item) => item.status === 'succeeded' && isWithinRecentDays(getExecutionDisplayTime(item), 7)
      ),
    [executions]
  );
  const todayFailedExecutions = useMemo(
    () =>
      executions.filter(
        (item) => item.status === 'failed' && isWithinRecentDays(getExecutionDisplayTime(item), 1)
      ),
    [executions]
  );
  const todoSummary = useMemo(
    () => ({
      total: todos.length,
      pending: todos.filter((item) => !item.completed).length,
      completed: todos.filter((item) => item.completed).length,
    }),
    [todos]
  );

  const getSkillDisplayName = (skillId?: string): string => {
    if (!skillId) {
      return '未关联技能';
    }
    return sanitizeDisplayName(skillNameMap.get(skillId)) || '未命名技能';
  };

  const getExecutionDisplayDescription = (execution: ExecutionDto): string => {
    if (execution.failureReason?.trim()) {
      return execution.failureReason;
    }
    if (execution.takeoverReason?.trim()) {
      return execution.takeoverReason;
    }
    if (execution.normalizedResult?.summary?.trim()) {
      return execution.normalizedResult.summary;
    }
    return `技能：${getSkillDisplayName(execution.skillId)}`;
  };

  const launchAiAssistant = useCallback((prompt: string) => {
    openWithPrompt(prompt, 'task');
    void message.success('已为你打开 AI 助手并填入提示词');
  }, [message, openWithPrompt]);

  const getAccessToken = useCallback(async (): Promise<string | null | undefined> => {
    return (await apiClient.ensureFreshAccessToken()) || authStore.getState().accessToken;
  }, []);

  const generateWorkbenchSummary = useCallback(
    async (
      period: WorkbenchSummaryPeriod,
      prompt: string,
      options?: { silent?: boolean }
    ): Promise<void> => {
      setSummaryState((current) => ({
        ...current,
        [period]: {
          ...current[period],
          status: 'running',
          error: undefined,
        },
      }));

      try {
        const token = await getAccessToken();
        if (!token) {
          throw new Error('当前登录态已失效，请重新登录后重试');
        }

        let finalContent = '';
        const request: ChatRequest = {
          message: prompt,
          config: {
            mode: 'task',
            thinking: true,
          },
        };

        await chatApi.stream(browserStreamingTransport, token, request, (event) => {
          const data = event.data || {};
          if (event.type === StreamEventType.RESULT) {
            finalContent =
              event.content ||
              (typeof data.resultSummary === 'string' ? data.resultSummary : '') ||
              (typeof data.resultTitle === 'string' ? data.resultTitle : '') ||
              finalContent;
            return;
          }

          if (event.type === StreamEventType.ERROR) {
            finalContent =
              (typeof data.failureReason === 'string' ? data.failureReason : '') ||
              event.content ||
              finalContent;
            return;
          }

          if (
            typeof data.resultSummary === 'string' &&
            data.resultSummary.trim() &&
            finalContent.trim().length === 0
          ) {
            finalContent = data.resultSummary;
          }
        });

        const normalizedContent = finalContent.trim();
        if (!normalizedContent) {
          throw new Error('AI 没有返回可展示的总结内容');
        }

        const generatedAt = new Date().toISOString();
        saveWorkbenchSummary(period, normalizedContent, generatedAt);
        setSummaryState((current) => ({
          ...current,
          [period]: {
            status: 'completed',
            content: normalizedContent,
            generatedAt,
          },
        }));
        if (!options?.silent) {
          void message.success(period === 'daily' ? '今日总结已生成' : '本周总结已生成');
        }
      } catch (error) {
        const nextError = error instanceof Error ? error.message : 'AI 总结生成失败';
        setSummaryState((current) => ({
          ...current,
          [period]: {
            ...current[period],
            status: 'error',
            error: nextError,
          },
        }));
        if (!options?.silent) {
          void message.error(nextError);
        }
      }
    },
    [getAccessToken, message]
  );

  const handleCreateTodo = () => {
    const nextTodos = parseTodoDraftIntoTasks(todoDraft);
    if (nextTodos.length === 0) {
      return;
    }
    const now = new Date().toISOString();
    setTodos((current) => [
      ...nextTodos.map((title) => ({
        id: buildTodoId(),
        title,
        completed: false,
        createdAt: now,
        updatedAt: now,
      })),
      ...current,
    ]);
    void message.success(nextTodos.length === 1 ? '已添加 1 条 Todo' : `已解析并添加 ${nextTodos.length} 条 Todo`);
    setTodoDraft('');
  };

  const handleToggleTodo = (id: string, completed: boolean) => {
    setTodos((current) =>
      current.map((item) =>
        item.id === id ? { ...item, completed, updatedAt: new Date().toISOString() } : item
      )
    );
  };

  const dailySummaryPrompt = useMemo((): string => {
    const completedLines = buildExecutionSummaryLines(todayCompletedExecutions.slice(0, 8));
    const pendingLines = buildExecutionSummaryLines(manualQueue.slice(0, 8));
    return [
      '请基于下面的工作台数据，帮我生成一份今天的个人工作总结。',
      '要求：',
      '1. 使用中文。',
      '2. 先总结今天完成了什么，再总结待处理风险与优先级。',
      '3. 输出格式包含：今日完成、风险提醒、下一步建议。',
      `4. 今日已完成 ${todayCompletedExecutions.length} 条，失败 ${todayFailedExecutions.length} 条，待人工处理 ${manualQueue.length} 条。`,
      '',
      '今日完成记录：',
      ...(completedLines.length ? completedLines : ['- 今日暂无完成记录']),
      '',
      '待处理与失败记录：',
      ...(pendingLines.length ? pendingLines : ['- 当前没有待人工处理记录']),
    ].join('\n');
  }, [manualQueue, todayCompletedExecutions, todayFailedExecutions]);

  const weeklySummaryPrompt = useMemo((): string => {
    const completedLines = buildExecutionSummaryLines(weekCompletedExecutions.slice(0, 10));
    const pendingLines = buildExecutionSummaryLines(manualQueue.slice(0, 10));
    return [
      '请基于下面的工作台数据，帮我生成一份本周工作回顾。',
      '要求：',
      '1. 使用中文。',
      '2. 给出本周完成情况、重复性问题、下周行动建议。',
      '3. 尽量提炼成适合用户汇报的自然语言，不要只罗列数据。',
      `4. 本周已完成 ${weekCompletedExecutions.length} 条，当前待人工处理 ${manualQueue.length} 条。`,
      '',
      '本周完成记录：',
      ...(completedLines.length ? completedLines : ['- 本周暂无完成记录']),
      '',
      '当前待处理记录：',
      ...(pendingLines.length ? pendingLines : ['- 当前没有待处理记录']),
    ].join('\n');
  }, [manualQueue, weekCompletedExecutions]);

  useEffect(() => {
    if (!executionsQuery.isSuccess) {
      return;
    }

    const pendingPeriods: Array<{ period: WorkbenchSummaryPeriod; prompt: string }> = [
      { period: 'daily', prompt: dailySummaryPrompt },
      { period: 'weekly', prompt: weeklySummaryPrompt },
    ];

    pendingPeriods.forEach(({ period, prompt }) => {
      const currentSummary = summaryState[period];
      if (currentSummary.content) {
        autoGeneratedSummaryRef.current[period] = true;
        return;
      }
      if (currentSummary.status !== 'idle' || autoGeneratedSummaryRef.current[period]) {
        return;
      }
      autoGeneratedSummaryRef.current[period] = true;
      void generateWorkbenchSummary(period, prompt, { silent: true });
    });
  }, [dailySummaryPrompt, executionsQuery.isSuccess, generateWorkbenchSummary, summaryState, weeklySummaryPrompt]);

  return (
    <div className="workbench-page">
      <Card className="workbench-hero" styles={{ body: { padding: 24 } }}>
        <div className="workbench-hero-content">
          <div className="workbench-hero-top">
            <Space direction="vertical" size={12} style={{ width: '100%', display: 'flex' }}>
              <div className="workbench-hero-heading">
                <Typography.Title level={2} className="workbench-hero-title">
                  今天的任务、执行与总结，一屏掌握
                </Typography.Title>
              </div>
              <div className="workbench-summary-strip">
                <div className="workbench-summary-item is-danger">
                  <span className="workbench-summary-key">待处理</span>
                  <span className="workbench-summary-number">{manualQueue.length}</span>
                </div>
                <div className="workbench-summary-item is-primary">
                  <span className="workbench-summary-key">今日完成</span>
                  <span className="workbench-summary-number">{todayCompletedExecutions.length}</span>
                </div>
                <div className="workbench-summary-item is-accent">
                  <span className="workbench-summary-key">本周完成</span>
                  <span className="workbench-summary-number">{weekCompletedExecutions.length}</span>
                </div>
                <div className="workbench-summary-item is-neutral">
                  <span className="workbench-summary-key-row">
                    <span className="workbench-summary-key">定期执行</span>
                    <Popover
                      trigger={['hover']}
                      placement="bottomLeft"
                      overlayClassName="workbench-summary-popover"
                      content={
                        upcomingSchedules.length === 0 ? (
                          <Typography.Text type="secondary">当前没有启用中的定期任务</Typography.Text>
                        ) : (
                          <div className="workbench-summary-popover-list">
                            {upcomingSchedules.map((item) => (
                              <div className="workbench-summary-popover-item" key={item.id}>
                                <Typography.Text strong>{sanitizeDisplayName(item.name)}</Typography.Text>
                                <Typography.Text type="secondary">
                                  {summarizeCronExpression(item.cronExpression)} · {formatDateTime(item.nextRunAt)}
                                </Typography.Text>
                              </div>
                            ))}
                          </div>
                        )
                      }
                    >
                      <InfoCircleOutlined className="workbench-summary-tip" />
                    </Popover>
                  </span>
                  <span className="workbench-summary-number">{activeSchedules.length}</span>
                </div>
                <div className="workbench-summary-item is-success">
                  <span className="workbench-summary-key">待办</span>
                  <span className="workbench-summary-number">{todoSummary.pending}</span>
                </div>
              </div>
            </Space>
          </div>
        </div>
      </Card>

      <Row gutter={[20, 20]} className="workbench-layout">
        <Col xs={24} md={12} className="workbench-column">
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            <Card
              className="workbench-panel"
              title={
                <div className="workbench-panel-header">
                  <Typography.Text strong className="workbench-panel-title">
                    优先处理
                  </Typography.Text>
                  <Typography.Text className="workbench-panel-subtitle">
                    先处理人工接管、审批阻塞与失败执行，减少链路积压。
                  </Typography.Text>
                </div>
              }
              extra={
                <Button type="link" className="workbench-action-button" onClick={() => navigate('/executions')}>
                  查看全部执行
                </Button>
              }
            >
              {manualQueue.length === 0 ? (
                <Empty description="当前没有待人工处理或失败记录" />
              ) : (
                <div className="workbench-queue-list">
                  {manualQueue.map((item) => (
                    <div
                      key={item.id}
                      className={`workbench-queue-item${item.status === 'human_control' || item.status === 'failed' ? ' is-priority' : ''}`}
                    >
                      <div className="workbench-queue-row">
                        <Typography.Paragraph className="workbench-queue-desc strong" style={{ margin: 0 }}>
                          {getExecutionDisplayDescription(item)}
                        </Typography.Paragraph>
                        <Button
                          type="primary"
                          className="workbench-action-button"
                          onClick={() => navigate(`/executions/${item.id}`)}
                        >
                          处理
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card
              className="workbench-panel"
              title={
                <div className="workbench-panel-header">
                  <Typography.Text strong className="workbench-panel-title">
                    最近完成
                  </Typography.Text>
                  <Typography.Text className="workbench-panel-subtitle">
                    查看最近正常处理完成的记录，快速回看结果与上下文。
                  </Typography.Text>
                </div>
              }
              extra={
                <Button type="link" className="workbench-action-button" onClick={() => navigate('/executions')}>
                  进入执行列表
                </Button>
              }
            >
              {recentSuccessfulExecutions.length === 0 ? (
                <Empty description="最近还没有正常完成的执行" />
              ) : (
                <div className="workbench-history-grid">
                  {recentSuccessfulExecutions.map((item) => (
                    <Popover
                      key={item.id}
                      trigger={['hover']}
                      placement="topLeft"
                      overlayClassName="workbench-history-popover"
                      content={
                        <Space direction="vertical" size={10} style={{ maxWidth: 360 }}>
                          <Typography.Text strong>{getExecutionTitle(item)}</Typography.Text>
                          <Typography.Paragraph style={{ margin: 0 }}>
                            {getExecutionDisplayDescription(item)}
                          </Typography.Paragraph>
                          <div className="workbench-history-meta">
                            {item.skillId ? (
                              <Tag bordered={false}>技能：{getSkillDisplayName(item.skillId)}</Tag>
                            ) : null}
                            <Tag bordered={false}>完成于 {formatDateTime(getExecutionDisplayTime(item))}</Tag>
                          </div>
                          <Button
                            type="link"
                            className="workbench-action-button"
                            icon={<ArrowRightOutlined />}
                            onClick={() => navigate(`/executions/${item.id}`)}
                            style={{ paddingInline: 0 }}
                          >
                            查看详情
                          </Button>
                        </Space>
                      }
                    >
                      <div className="workbench-history-tile">
                        <Typography.Text strong>{compactText(getExecutionTitle(item), 20)}</Typography.Text>
                        <div className="workbench-history-preview">
                          {compactText(getExecutionDisplayDescription(item), 32)}
                        </div>
                        <div className="workbench-history-meta compact">
                          <span>{formatDateTime(getExecutionDisplayTime(item))}</span>
                          <span>已完成</span>
                        </div>
                      </div>
                    </Popover>
                  ))}
                </div>
              )}
            </Card>
          </Space>
        </Col>

        <Col xs={24} md={12} className="workbench-column">
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            <Card
              className="workbench-panel"
              title={
                <div className="workbench-panel-header">
                  <Typography.Text strong className="workbench-panel-title">
                    Todo
                  </Typography.Text>
                  <Typography.Text className="workbench-panel-subtitle">
                    记录今天要做的事，并用 AI 快速整理优先级与行动建议。
                  </Typography.Text>
                </div>
              }
              extra={
                <Space>
                  <Tag color="blue">待办 {todoSummary.pending}</Tag>
                  <Tag color="success">已完成 {todoSummary.completed}</Tag>
                </Space>
              }
            >
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <div className="workbench-todo-form">
                  <Input.TextArea
                    value={todoDraft}
                    placeholder={'输入一段内容，系统会自动解析成任务\n例如：\n1. 今天 17:00 前处理人工接管执行单\n2. 跟进审批结果\n3. 整理今日总结'}
                    onChange={(event) => setTodoDraft(event.target.value)}
                    autoSize={{ minRows: 3, maxRows: 6 }}
                  />
                  <div className="workbench-todo-form-actions">
                    <Button
                      type="primary"
                      className="workbench-action-button"
                      icon={<PlusOutlined />}
                      onClick={handleCreateTodo}
                    >
                      添加
                    </Button>
                    <Button
                      className="workbench-action-button"
                      icon={<RobotOutlined />}
                      onClick={() =>
                        launchAiAssistant(
                          [
                            '请帮我整理今天的 Todo，按优先级排序并补充建议动作。',
                            'Todo 列表：',
                            ...(todos.length
                              ? todos.map(
                                  (item, index) =>
                                    `${index + 1}. [${item.completed ? '已完成' : '待处理'}] ${item.title}`
                                )
                              : ['暂无 Todo']),
                          ].join('\n')
                        )
                      }
                    >
                      ai添加
                    </Button>
                  </div>
                </div>
                {todos.length === 0 ? (
                  <Empty description="还没有 Todo，可以先添加一条或者让 AI 帮你规划" />
                ) : (
                  <List
                    dataSource={todos}
                    renderItem={(item) => (
                      <List.Item key={item.id} style={{ padding: 0, border: 'none' }}>
                        <div className="workbench-todo-item" style={{ width: '100%' }}>
                          <Space
                            direction="vertical"
                            size={12}
                            style={{ width: '100%', opacity: item.completed ? 0.72 : 1 }}
                          >
                            <Space className="workbench-todo-row" style={{ width: '100%', justifyContent: 'space-between' }}>
                              <Checkbox
                                checked={item.completed}
                                onChange={(event) => handleToggleTodo(item.id, event.target.checked)}
                              >
                                <Typography.Text delete={item.completed}>{item.title}</Typography.Text>
                              </Checkbox>
                              <Button
                                size="small"
                                className="workbench-action-button"
                                icon={<RobotOutlined />}
                                onClick={() =>
                                  launchAiAssistant(
                                    [
                                      '请帮我处理这个 Todo。',
                                      `Todo：${item.title}`,
                                      '请输出：优先级、拆解步骤、预计耗时、如果需要发给他人的简短说明。',
                                    ].join('\n')
                                  )
                                }
                              >
                                AI 处理
                              </Button>
                            </Space>
                            <div className="workbench-todo-meta">
                              <Tag bordered={false}>更新于 {formatDateTime(item.updatedAt)}</Tag>
                            </div>
                          </Space>
                        </div>
                      </List.Item>
                    )}
                  />
                )}
              </Space>
            </Card>

            <Card className="workbench-ai-summary-card">
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Tag color="purple" className="workbench-summary-tag">
                  AI 协同
                </Tag>
                <Typography.Title level={4} className="workbench-summary-heading">
                  让 AI 帮你整理今天和本周
                </Typography.Title>
                <Typography.Paragraph className="workbench-summary-description">
                  自动缓存当日与当周总结，适合用于复盘、同步进展或对外汇报。
                </Typography.Paragraph>
                {summaryState.daily.error ? (
                  <Alert type="error" showIcon message={summaryState.daily.error} />
                ) : null}
                {summaryState.weekly.error ? (
                  <Alert type="error" showIcon message={summaryState.weekly.error} />
                ) : null}
                <div className="workbench-summary-result-grid">
                  <div className="workbench-summary-result-card">
                    <div className="workbench-summary-result-head">
                      <div className="workbench-summary-result-title">
                        <Typography.Text strong>今日总结</Typography.Text>
                        {summaryState.daily.generatedAt ? (
                          <Typography.Text type="secondary">
                            {formatSummaryTime(summaryState.daily.generatedAt)}
                          </Typography.Text>
                        ) : null}
                      </div>
                      <Button
                        type="primary"
                        className="workbench-summary-button"
                        loading={summaryState.daily.status === 'running'}
                        onClick={() => void generateWorkbenchSummary('daily', dailySummaryPrompt)}
                      >
                        {summaryState.daily.status === 'running' ? '生成中' : '生成'}
                      </Button>
                    </div>
                    <Typography.Paragraph className="workbench-summary-result-content">
                      {summaryState.daily.content || '若未自动生成，可点击右侧按钮重新生成今日总结。'}
                    </Typography.Paragraph>
                  </div>
                  <div className="workbench-summary-result-card">
                    <div className="workbench-summary-result-head">
                      <div className="workbench-summary-result-title">
                        <Typography.Text strong>本周总结</Typography.Text>
                        {summaryState.weekly.generatedAt ? (
                          <Typography.Text type="secondary">
                            {formatSummaryTime(summaryState.weekly.generatedAt)}
                          </Typography.Text>
                        ) : null}
                      </div>
                      <Button
                        className="workbench-summary-button"
                        loading={summaryState.weekly.status === 'running'}
                        onClick={() => void generateWorkbenchSummary('weekly', weeklySummaryPrompt)}
                      >
                        {summaryState.weekly.status === 'running' ? '生成中' : '生成'}
                      </Button>
                    </div>
                    <Typography.Paragraph className="workbench-summary-result-content">
                      {summaryState.weekly.content || '若未自动生成，可点击右侧按钮重新生成本周总结。'}
                    </Typography.Paragraph>
                  </div>
                </div>
              </Space>
            </Card>
          </Space>
        </Col>
      </Row>
    </div>
  );
}
