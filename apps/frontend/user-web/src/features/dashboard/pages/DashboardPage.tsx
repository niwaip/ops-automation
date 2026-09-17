import {
  ArrowRightOutlined,
  CheckOutlined,
  ClearOutlined,
  InboxOutlined,
  InfoCircleOutlined,
  OrderedListOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Col,
  Popconfirm,
  Popover,
  Row,
  Typography,
} from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from 'react-query';
import {
  EXECUTION_STATUS_LABELS_ZH,
  type ExecutionDto,
} from '@ops/user-core';
import { workbenchInboxApi } from '@/api/workbenchInbox';
import { workbenchTodoApi } from '@/api/workbenchTodo';
import { executionApi } from '@/api/execution';
import { useChatStore } from '../../chat';
import { InboxCard } from '../components/InboxCard';
import { RecentExecutionsCard } from '../components/RecentExecutionsCard';
import { SummaryCard } from '../components/SummaryCard';
import { TodoCard } from '../components/TodoCard';
import { useWorkbenchExecutions } from '../hooks/useWorkbenchExecutions';
import { useWorkbenchSummary } from '../hooks/useWorkbenchSummary';
import { useWorkbenchTodos } from '../hooks/useWorkbenchTodos';
import {
  clearWorkbenchHandledExecutions,
  loadWorkbenchHandledExecutions,
  mergeHandledExecutions,
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

import { getExecutionTitle } from '../lib/executionTitle';

export function DashboardPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createSession = useChatStore((state) => state.createSession);
  const setOpen = useChatStore((state) => state.setOpen);
  const setChatMode = useChatStore((state) => state.setChatMode);
  const setDraftMessage = useChatStore((state) => state.setDraftMessage);
  const setDraftExecutionId = useChatStore((state) => state.setDraftExecutionId);
  const [isClearingData, setIsClearingData] = useState(false);
  const [handledExecutions, setHandledExecutions] = useState<WorkbenchHandledExecutionMap>(() =>
    loadWorkbenchHandledExecutions()
  );

  // 从云端同步已阅执行单映射（解决换设备或清缓存后已阅失效的问题）
  useQuery(
    ['workbench-handled-executions'],
    () => workbenchInboxApi.getHandledExecutions(),
    {
      staleTime: 60000,
      onSuccess: (remoteMap) => {
        if (remoteMap && typeof remoteMap === 'object' && Object.keys(remoteMap).length > 0) {
          setHandledExecutions((current) => {
            const merged = mergeHandledExecutions(current, remoteMap);
            saveWorkbenchHandledExecutions(merged);
            return merged;
          });
        }
      },
    }
  );

  const {
    activeTab,
    handleArchiveTodo,
    handleCreateTodo,
    handleDeleteTodo,
    handleExecuteTodo,
    handleRecallTodo,
    handleRemindTodo,
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
      saveWorkbenchHandledExecutions(next);
      void workbenchInboxApi.saveHandledExecutions(next);
      return next;
    });
    void message.success(`已全部标记已阅（${priorityQueueDisplay.length} 项）`);
  };

  const handleIgnorePriorityItem = useCallback((executionId: string) => {
    const handledAt = new Date().toISOString();
    setHandledExecutions((current) => {
      const next = {
        ...current,
        [executionId]: handledAt,
      };
      saveWorkbenchHandledExecutions(next);
      void workbenchInboxApi.saveHandledExecutions(next);
      return next;
    });
    void message.success('已标记已阅');
  }, [message]);

  const handleClearAllTestData = async () => {
    try {
      setIsClearingData(true);
      await Promise.allSettled([
        workbenchInboxApi.clearAll(true),
        workbenchTodoApi.clearAll(true),
        executionApi.cleanupBeforeDate({ beforeDate: '2099-01-01' }),
      ]);

      // 清除本地前端归档与已阅缓存
      localStorage.removeItem('ops_archived_inbox_ids');
      localStorage.removeItem('ops_archived_workbench_ids');
      clearWorkbenchHandledExecutions();
      setHandledExecutions({});

      // 刷新所有相关缓存
      await Promise.allSettled([
        queryClient.invalidateQueries(['workbench-inbox']),
        queryClient.invalidateQueries(['workbench-inbox-summary']),
        queryClient.invalidateQueries(['workbench-todos']),
        queryClient.invalidateQueries(['workbench-todos-summary']),
        queryClient.invalidateQueries(['workbench-coordination-sent-tasks']),
        queryClient.invalidateQueries(['workbench-handled-executions']),
        queryClient.invalidateQueries(['dashboard-executions']),
        queryClient.invalidateQueries(['dashboard-executions', 'summary']),
        queryClient.invalidateQueries(['executions']),
      ]);
      void message.success('GTD 收件箱、待办与待介入执行记录已全部清空，可开始全新测试');
    } catch (err: any) {
      void message.error(`清空失败: ${err?.message || '网络或接口异常'}`);
    } finally {
      setIsClearingData(false);
    }
  };

  return (
    <div className={styles['workbench-page']}>
      {/* 顶部工作台全景态势条 */}
      <Card className={styles['workbench-hero']} styles={{ body: { padding: '14px 20px' } }}>
        <div className={styles['workbench-hero-content']}>
          <div className={styles['workbench-hero-heading']}>
            <span className={styles['workbench-hero-title']}>工作台</span>
            <span className={styles['workbench-hero-subtitle']}>
              统一待办规划与任务协同中心
            </span>
            <div style={{ marginLeft: 'auto' }}>
              <Popconfirm
                title="清空测试数据"
                description="确定清空所有 GTD 收件箱与待办任务数据吗？此操作主要用于系统测试与数据重置。"
                okText="确定清空"
                cancelText="取消"
                okButtonProps={{ danger: true, loading: isClearingData }}
                onConfirm={handleClearAllTestData}
              >
                <Button
                  size="small"
                  danger
                  type="text"
                  icon={<ClearOutlined />}
                  loading={isClearingData}
                  style={{ fontSize: 12 }}
                >
                  清空测试数据
                </Button>
              </Popconfirm>
            </div>
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
                    <span className={styles['workbench-summary-key-row']}>
                      <span className={styles['workbench-summary-key']}>今日完成</span>
                      <Popover
                        trigger={['hover']}
                        placement="bottomLeft"
                        overlayClassName="workbench-summary-popover"
                        content={
                          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                            <div>待办任务完成：<strong>{todoSummary.completedToday ?? 0}</strong> 项</div>
                            <div>自动化执行完成：<strong>{todayCompletedExecutions.length}</strong> 次</div>
                          </div>
                        }
                      >
                        <InfoCircleOutlined className={styles['workbench-summary-tip']} />
                      </Popover>
                    </span>
                    <span className={styles['workbench-summary-number']}>
                      {(todoSummary.completedToday ?? 0) + todayCompletedExecutions.length}
                    </span>
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
            onIgnorePriorityItem={handleIgnorePriorityItem}
            onLaunchAiAssistant={launchAiAssistant}
            getExecutionDisplayDescription={getExecutionDisplayDescription}
            getExecutionDisplayTime={getExecutionDisplayTime}
            getSkillDisplayName={getSkillDisplayName}
            onTodoCreated={() => setActiveTab('pending')}
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
            onArchiveTodo={handleArchiveTodo}
            onRecallTodo={handleRecallTodo}
            onRemindTodo={handleRemindTodo}
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
