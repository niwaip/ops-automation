import {
  ArrowRightOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  InfoCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import {
  App,
  Card,
  Col,
  Popover,
  Row,
  Space,
  Typography,
} from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  EXECUTION_STATUS_LABELS_ZH,
  type ExecutionDto,
} from '@ops/user-core';
import { useChatStore } from '../../chat';
import { PriorityQueueCard } from '../components/PriorityQueueCard';
import { RecentExecutionsCard } from '../components/RecentExecutionsCard';
import { SummaryCard } from '../components/SummaryCard';
import { TodoCard } from '../components/TodoCard';
import { useWorkbenchExecutions } from '../hooks/useWorkbenchExecutions';
import { useWorkbenchSummary } from '../hooks/useWorkbenchSummary';
import { useWorkbenchTodos } from '../hooks/useWorkbenchTodos';
import {
  loadWorkbenchHandledExecutions,
  saveWorkbenchHandledExecutions,
  type WorkbenchHandledExecutionMap,
} from '../lib/workbenchHandledExecutionStorage';
import { formatMonthDayTime } from '@/shared/utils/dateText';
import { summarizeCronExpression } from '@/shared/utils/scheduleText';
import './DashboardPage.css';

const sanitizeDisplayName = (value?: string): string => {
  if (!value) {
    return '';
  }
  return value.replace(/-[a-f0-9]{8}(?=(\s|$))/gi, '').trim();
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

export function DashboardPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const createSession = useChatStore((state) => state.createSession);
  const setOpen = useChatStore((state) => state.setOpen);
  const setChatMode = useChatStore((state) => state.setChatMode);
  const setDraftMessage = useChatStore((state) => state.setDraftMessage);
  const setDraftExecutionId = useChatStore((state) => state.setDraftExecutionId);
  const [handledExecutions, setHandledExecutions] = useState<WorkbenchHandledExecutionMap>(() =>
    loadWorkbenchHandledExecutions()
  );
  const { handleCreateTodo, handleToggleTodo, setTodoDraft, todoDraft, todoSummary, todos } =
    useWorkbenchTodos({ message });
  const {
    activeSchedules,
    executionsReady,
    getExecutionDisplayDescription,
    getExecutionDisplayTime,
    getSkillDisplayName,
    manualQueue,
    priorityQueueDisplay,
    recentSuccessfulExecutions,
    todayCompletedExecutions,
    todayFailedExecutions,
    upcomingSchedules,
    weekCompletedExecutions,
  } = useWorkbenchExecutions({
    handledExecutions,
  });

  useEffect(() => {
    saveWorkbenchHandledExecutions(handledExecutions);
  }, [handledExecutions]);

  const launchAiAssistant = useCallback((prompt: string) => {
    createSession();
    setChatMode('task');
    setDraftMessage(prompt);
    setDraftExecutionId(null);
    setOpen(true);
    void message.success('已为你打开 AI 助手并填入提示词');
  }, [createSession, message, setChatMode, setDraftExecutionId, setDraftMessage, setOpen]);
  const toSummaryExecutionItem = useCallback(
    (item: ExecutionDto) => ({
      title: getExecutionTitle(item),
      statusLabel: EXECUTION_STATUS_LABELS_ZH[item.status] || item.status,
      displayTime: getExecutionDisplayTime(item),
      failureReason: item.failureReason,
    }),
    []
  );
  const { dailySummaryPrompt, formatSummaryTime, generateWorkbenchSummary, summaryState, weeklySummaryPrompt } =
    useWorkbenchSummary({
      executionsReady,
      manualQueue: manualQueue.map(toSummaryExecutionItem),
      todayCompletedExecutions: todayCompletedExecutions.map(toSummaryExecutionItem),
      todayFailedExecutionsCount: todayFailedExecutions.length,
      weekCompletedExecutions: weekCompletedExecutions.map(toSummaryExecutionItem),
      message,
    });

  const handleIgnorePriorityItem = (executionId: string) => {
    const handledAt = new Date().toISOString();
    setHandledExecutions((current) => ({
      ...current,
      [executionId]: handledAt,
    }));
    void message.success('已标记为已处理');
  };

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
                  <div className="workbench-summary-icon">
                    <ClockCircleOutlined />
                  </div>
                  <div className="workbench-summary-body">
                    <span className="workbench-summary-key">待处理</span>
                    <span className="workbench-summary-number">{manualQueue.length}</span>
                  </div>
                </div>
                <div className="workbench-summary-item is-primary">
                  <div className="workbench-summary-icon">
                    <CheckOutlined />
                  </div>
                  <div className="workbench-summary-body">
                    <span className="workbench-summary-key">今日完成</span>
                    <span className="workbench-summary-number">{todayCompletedExecutions.length}</span>
                  </div>
                </div>
                <div className="workbench-summary-item is-accent">
                  <div className="workbench-summary-icon">
                    <ArrowRightOutlined />
                  </div>
                  <div className="workbench-summary-body">
                    <span className="workbench-summary-key">本周完成</span>
                    <span className="workbench-summary-number">{weekCompletedExecutions.length}</span>
                  </div>
                </div>
                <div className="workbench-summary-item is-neutral">
                  <div className="workbench-summary-icon">
                    <PlayCircleOutlined />
                  </div>
                  <div className="workbench-summary-body">
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
                                    {summarizeCronExpression(item.cronExpression, { workdaysLabel: '工作日' })} · {formatMonthDayTime(item.nextRunAt)}
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
                </div>
                <div className="workbench-summary-item is-success">
                  <div className="workbench-summary-icon">
                    <PlusOutlined />
                  </div>
                  <div className="workbench-summary-body">
                    <span className="workbench-summary-key">待办</span>
                    <span className="workbench-summary-number">{todoSummary.pending}</span>
                  </div>
                </div>
              </div>
            </Space>
          </div>
        </div>
      </Card>

      <Row gutter={[20, 20]} className="workbench-layout">
        <Col xs={24} md={10} className="workbench-column">
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            <PriorityQueueCard
              items={priorityQueueDisplay}
              getExecutionDisplayDescription={getExecutionDisplayDescription}
              getExecutionDisplayTime={getExecutionDisplayTime}
              getSkillDisplayName={getSkillDisplayName}
              onIgnoreItem={handleIgnorePriorityItem}
              onOpenExecution={(executionId) => navigate(`/executions/${executionId}`)}
              onViewAll={() => navigate('/executions')}
            />

            <RecentExecutionsCard
              items={recentSuccessfulExecutions}
              getExecutionDisplayDescription={getExecutionDisplayDescription}
              getExecutionDisplayTime={getExecutionDisplayTime}
              onOpenExecution={(executionId) => navigate(`/executions/${executionId}`)}
              onViewAll={() => navigate('/executions')}
            />
          </Space>
        </Col>

        <Col xs={24} md={14} className="workbench-column">
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            <TodoCard
              todoDraft={todoDraft}
              todoSummary={todoSummary}
              todos={todos}
              onCreateTodo={handleCreateTodo}
              onDraftChange={setTodoDraft}
              onLaunchAiAssistant={launchAiAssistant}
              onOpenNewExecution={() => navigate('/executions/new')}
              onToggleTodo={handleToggleTodo}
            />

            <SummaryCard
              dailySummaryPrompt={dailySummaryPrompt}
              formatSummaryTime={formatSummaryTime}
              generateWorkbenchSummary={generateWorkbenchSummary}
              summaryState={summaryState}
              weeklySummaryPrompt={weeklySummaryPrompt}
            />
          </Space>
        </Col>
      </Row>
    </div>
  );
}
