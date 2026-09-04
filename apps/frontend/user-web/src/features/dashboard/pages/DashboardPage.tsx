import {
  ArrowRightOutlined,
  CheckOutlined,
  InboxOutlined,
  InfoCircleOutlined,
  OrderedListOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import {
  App,
  Card,
  Col,
  Popover,
  Row,
  Typography,
} from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from 'react-query';
import {
  EXECUTION_STATUS_LABELS_ZH,
  type ExecutionDto,
} from '@ops/user-core';
import { workbenchInboxApi } from '@/api/workbenchInbox';
import { useChatStore } from '../../chat';
import { InboxCard } from '../components/InboxCard';
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
import styles from './DashboardPage.module.css';

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

  const {
    activeTab,
    handleCreateTodo,
    handleDeleteTodo,
    handleExecuteTodo,
    handleToggleTodo,
    setActiveTab,
    setTodoDraft,
    todoDraft,
    todoSummary,
    todos,
  } = useWorkbenchTodos({ message });

  const {
    activeSchedules,
    executionsReady,
    getExecutionDisplayDescription,
    getExecutionDisplayTime,
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

  // 顶部获取收件箱待整理数量
  const { data: inboxSummaryData } = useQuery(
    ['workbench-inbox-summary'],
    () => workbenchInboxApi.list({ pageSize: 100 }),
    {
      staleTime: 15000,
    }
  );

  const inboxUnprocessedCount = useMemo(
    () => (inboxSummaryData?.items || []).filter((i) => i.status === 'unprocessed').length,
    [inboxSummaryData]
  );

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
    [getExecutionDisplayTime]
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

  const handleIgnoreAllPriorityItems = () => {
    if (priorityQueueDisplay.length === 0) return;
    const handledAt = new Date().toISOString();
    setHandledExecutions((current) => {
      const next = { ...current };
      for (const item of priorityQueueDisplay) {
        next[item.id] = handledAt;
      }
      return next;
    });
    void message.success(`已全部标记已阅（${priorityQueueDisplay.length} 项）`);
  };

  return (
    <div className={styles['workbench-page']}>
      {/* 顶部工作台全景态势条 */}
      <Card className={styles['workbench-hero']} styles={{ body: { padding: '12px 20px' } }}>
        <div className={styles['workbench-hero-content']}>
          <div className={styles['workbench-hero-heading']}>
            <span className={styles['workbench-hero-title']}>办公与任务工作台</span>
            <span className={styles['workbench-hero-subtitle']}>
              左侧收集与厘清，右侧规划与执行；双核驱动个人高效工作流。
            </span>
          </div>

          <div className={styles['workbench-summary-strip']}>
                {/* 1. 收集箱待整理 */}
                <div className={`${styles['workbench-summary-item']} ${styles['is-danger']}`}>
                  <div className={styles['workbench-summary-icon']}>
                    <InboxOutlined />
                  </div>
                  <div className={styles['workbench-summary-body']}>
                    <span className={styles['workbench-summary-key']}>收集箱待整理</span>
                    <span className={styles['workbench-summary-number']}>{inboxUnprocessedCount}</span>
                  </div>
                </div>

                {/* 2. 行动待办 */}
                <div className={`${styles['workbench-summary-item']} ${styles['is-primary']}`}>
                  <div className={styles['workbench-summary-icon']}>
                    <OrderedListOutlined />
                  </div>
                  <div className={styles['workbench-summary-body']}>
                    <span className={styles['workbench-summary-key']}>待办任务</span>
                    <span className={styles['workbench-summary-number']}>{todoSummary.pending}</span>
                  </div>
                </div>

                {/* 3. 今日完成 */}
                <div className={`${styles['workbench-summary-item']} ${styles['is-success']}`}>
                  <div className={styles['workbench-summary-icon']}>
                    <CheckOutlined />
                  </div>
                  <div className={styles['workbench-summary-body']}>
                    <span className={styles['workbench-summary-key']}>今日完成</span>
                    <span className={styles['workbench-summary-number']}>{todayCompletedExecutions.length}</span>
                  </div>
                </div>

                {/* 4. 本周完成 */}
                <div className={`${styles['workbench-summary-item']} ${styles['is-accent']}`}>
                  <div className={styles['workbench-summary-icon']}>
                    <ArrowRightOutlined />
                  </div>
                  <div className={styles['workbench-summary-body']}>
                    <span className={styles['workbench-summary-key']}>本周完成</span>
                    <span className={styles['workbench-summary-number']}>{weekCompletedExecutions.length}</span>
                  </div>
                </div>

                {/* 5. 定期自动化执行 */}
                <div className={`${styles['workbench-summary-item']} ${styles['is-neutral']}`}>
                  <div className={styles['workbench-summary-icon']}>
                    <PlayCircleOutlined />
                  </div>
                  <div className={styles['workbench-summary-body']}>
                    <span className={styles['workbench-summary-key-row']}>
                      <span className={styles['workbench-summary-key']}>定时任务</span>
                      <Popover
                        trigger={['hover']}
                        placement="bottomLeft"
                        overlayClassName="workbench-summary-popover"
                        content={
                          upcomingSchedules.length === 0 ? (
                            <Typography.Text type="secondary">当前没有启用中的定期任务</Typography.Text>
                          ) : (
                            <div className={styles['workbench-summary-popover-list']}>
                              {upcomingSchedules.map((item) => (
                                <div className={styles['workbench-summary-popover-item']} key={item.id}>
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
                        <InfoCircleOutlined className={styles['workbench-summary-tip']} />
                      </Popover>
                    </span>
                    <span className={styles['workbench-summary-number']}>{activeSchedules.length}</span>
                  </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 核心双核工作台：左侧收集箱，右侧任务待办看板 */}
      <Row gutter={[20, 20]} className={styles['workbench-layout']}>
        {/* 左侧：GTD 收集箱 */}
        <Col xs={24} lg={12} className={styles['workbench-column']}>
          <InboxCard
            priorityItems={priorityQueueDisplay}
            onOpenExecution={(executionId) => navigate(`/executions/${executionId}`)}
            onViewAllExecutions={() => navigate('/executions')}
            onIgnoreAllPriorityItems={handleIgnoreAllPriorityItems}
          />
        </Col>

        {/* 右侧：行动待办看板 */}
        <Col xs={24} lg={12} className={styles['workbench-column']}>
          <TodoCard
            todoDraft={todoDraft}
            todoSummary={todoSummary}
            todos={todos}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onCreateTodo={handleCreateTodo}
            onDraftChange={setTodoDraft}
            onLaunchAiAssistant={launchAiAssistant}
            onOpenNewExecution={() => navigate('/executions/new')}
            onToggleTodo={handleToggleTodo}
            onExecuteTodo={handleExecuteTodo}
            onDeleteTodo={handleDeleteTodo}
          />
        </Col>
      </Row>

      {/* 辅助与回顾区域：左侧自动化执行，右侧 AI 工作总结 */}
      <Row gutter={[20, 20]} style={{ marginTop: 4 }}>
        <Col xs={24} lg={12} className={styles['workbench-column']}>
          <RecentExecutionsCard
            items={recentSuccessfulExecutions}
            getExecutionDisplayDescription={getExecutionDisplayDescription}
            getExecutionDisplayTime={getExecutionDisplayTime}
            onOpenExecution={(executionId) => navigate(`/executions/${executionId}`)}
            onViewAll={() => navigate('/executions')}
          />
        </Col>

        <Col xs={24} lg={12} className={styles['workbench-column']}>
          <SummaryCard
            dailySummaryPrompt={dailySummaryPrompt}
            formatSummaryTime={formatSummaryTime}
            generateWorkbenchSummary={generateWorkbenchSummary}
            summaryState={summaryState}
            weeklySummaryPrompt={weeklySummaryPrompt}
          />
        </Col>
      </Row>
    </div>
  );
}
