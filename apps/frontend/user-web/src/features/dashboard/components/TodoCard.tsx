import {
  BellOutlined,
  CheckCircleFilled,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  CloseCircleFilled,
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  FileWordOutlined,
  InboxOutlined,
  LoadingOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  RobotOutlined,
  RollbackOutlined,
  SendOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Checkbox,
  Empty,
  Input,
  List,
  Popconfirm,
  Segmented,
  Space,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import { useState, useMemo } from "react";
import { useQueryClient } from "react-query";
import type { WorkbenchTodoItem } from "../../../api/workbenchTodo";
import { workbenchCoordinationApi } from "../../../api/workbenchCoordination";
import {
  getContractComparisonPair,
  triggerContractComparisonInAi,
} from "../lib/contractComparisonHelper";
import { formatMonthDayTime } from "@/shared/utils/dateText";
import {
  PARAM_LABEL_MAP,
  formatParamValue,
} from "./CoordinationActionModal";
import { InboxTaskDetailModal } from "./InboxTaskDetailModal";
import { replaceLocalhostWithCurrentHost } from "@/shared/utils/publicUrl";
import { useAuthStore } from "@/shared/store/authStore";
import { useChatStore } from "../../chat/chatStore";
import { isItemInitiatedByMe, type WorkbenchTodoTab } from "../hooks/useWorkbenchTodos";
import { classifyWorkflowNode, extractRollbackReason, extractApprovalComment } from "../lib/coordinationNodeClassifier";
import { applyOptimisticCoordinationSend } from "../lib/coordinationOptimistic";
import styles from "../pages/DashboardPage.module.css";

interface TodoCardProps {
  todoDraft: string;
  todoSummary: {
    total: number;
    pending: number;
    completed?: number;
    today?: number;
    sent?: number;
    ended?: number;
    overdue?: number;
  };
  todos: WorkbenchTodoItem[];
  activeTab?: WorkbenchTodoTab;
  onTabChange?: (tab: WorkbenchTodoTab) => void;
  onCreateTodo: () => void;
  onDraftChange: (value: string) => void;
  onLaunchAiAssistant: (prompt: string) => void;
  onOpenNewExecution: () => void;
  onToggleTodo: (id: string, completed: boolean) => void;
  onExecuteTodo?: (id: string) => void;
  onDeleteTodo?: (id: string) => void;
  onArchiveTodo?: (id: string) => void;
  onRecallTodo?: (item: WorkbenchTodoItem) => void;
  onRemindTodo?: (item: WorkbenchTodoItem) => void;
}

export function TodoCard({
  todoDraft,
  todoSummary,
  todos,
  activeTab = "pending",
  onTabChange,
  onCreateTodo,
  onDraftChange,
  onLaunchAiAssistant,
  onOpenNewExecution,
  onToggleTodo,
  onExecuteTodo: _onExecuteTodo,
  onDeleteTodo: _onDeleteTodo,
  onArchiveTodo,
  onRecallTodo,
  onRemindTodo,
}: TodoCardProps) {
  const { user } = useAuthStore();
  const currentUsername = user?.username || "";
  const currentUserId = user?.id;

  const queryClient = useQueryClient();
  const [quickSendingId, setQuickSendingId] = useState<string | null>(null);
  const [detailModalTodo, setDetailModalTodo] = useState<WorkbenchTodoItem | null>(null);

  const detailModalInboxItem = useMemo(() => {
    if (!detailModalTodo) return null;
    const contextData = (detailModalTodo.contextData as any) || {};
    const unifiedPayload = contextData.unifiedPayload || {};
    const isInitiated = isItemInitiatedByMe(detailModalTodo, currentUsername, currentUserId);
    const initiator =
      unifiedPayload.initiator ||
      contextData.initiator ||
      (isInitiated ? { username: currentUsername, id: currentUserId } : undefined) ||
      (contextData.sourceSender ? { username: contextData.sourceSender } : undefined) ||
      (contextData.initiatorName ? { username: contextData.initiatorName } : undefined);
    const assignee =
      unifiedPayload.assignee ||
      contextData.assignee ||
      (contextData.assigneeName ? { username: contextData.assigneeName } : undefined);

    return {
      id:
        contextData.inboxItemId ||
        detailModalTodo.sourceRefId ||
        detailModalTodo.id,
      userId: currentUserId || '',
      title: detailModalTodo.title,
      description: detailModalTodo.description,
      rawContent: detailModalTodo.description || contextData.rawContent || '',
      sourceType: detailModalTodo.sourceType as any,
      sourceRefId:
        detailModalTodo.sourceRefId ||
        contextData.taskId ||
        detailModalTodo.id,
      sourceTitle: detailModalTodo.sourceTitle || detailModalTodo.title,
      sourceSender: initiator?.username || contextData.sourceSender || (isInitiated ? currentUsername : undefined),
      status: (detailModalTodo.status === 'completed' || detailModalTodo.status === 'cancelled')
        ? 'archived'
        : (contextData.inboxStatus || 'unprocessed'),
      confidence: 1.0,
      unifiedPayload: {
        kind: 'coordination',
        taskId:
          detailModalTodo.sourceRefId ||
          contextData.taskId ||
          unifiedPayload.taskId ||
          detailModalTodo.id,
        workflowId:
          detailModalTodo.boundWorkflowId ||
          contextData.workflowId ||
          unifiedPayload.workflowId,
        taskType:
          unifiedPayload.taskType ||
          contextData.taskType ||
          'approval',
        status:
          (detailModalTodo.status === 'completed' || detailModalTodo.status === 'cancelled')
            ? 'archived'
            : (unifiedPayload.status ||
               contextData.status ||
               (detailModalTodo.title?.includes('[需重修]') || detailModalTodo.title?.includes('已驳回')
                 ? 'revision_required'
                 : 'pending')),
        rollbackReason:
          unifiedPayload.rollbackReason ||
          unifiedPayload.metadata?.rollbackReason ||
          contextData.rollbackReason,
        parameters:
          unifiedPayload.parameters ||
          contextData.parameters ||
          contextData ||
          {},
        attachments:
          unifiedPayload.attachments ||
          contextData.attachments ||
          [],
        actions:
          unifiedPayload.actions ||
          contextData.actions ||
          [],
        metadata: {
          rollbackReason:
            unifiedPayload.metadata?.rollbackReason ||
            unifiedPayload.rollbackReason ||
            contextData.rollbackReason,
          ...(unifiedPayload.metadata || {}),
          ...(contextData.metadata || {}),
        },
        currentStage:
          unifiedPayload.currentStage ||
          contextData.currentStage,
        initiator,
        assignee,
        ...unifiedPayload,
      },
      createdAt: detailModalTodo.createdAt,
    } as any;
  }, [detailModalTodo, currentUserId, currentUsername]);

  const handleQuickAction = async (item: WorkbenchTodoItem) => {
    try {
      setQuickSendingId(item.id);
      const contextData = (item.contextData || {}) as Record<string, any>;
      const coordPayload = (contextData.unifiedPayload || {}) as Record<string, any>;
      const taskId =
        coordPayload.taskId ||
        contextData.taskId ||
        (item.id.startsWith('coord_') ? item.id.replace('coord_', '') : null) ||
        item.sourceRefId ||
        item.id;
      const nodeSemantics = classifyWorkflowNode(
        {
          id: taskId,
          title: item.title,
          sourceSender: contextData.sourceSender,
          unifiedPayload: coordPayload,
        } as any,
        currentUsername,
        currentUserId
      );

      if (nodeSemantics.cardActionType === 'archive') {
        await workbenchCoordinationApi.submitAction(taskId, {
          action: 'approve',
          comment: '协同回执已阅并归档。',
        }).catch(() => {});
        void message.success(`已归档「${nodeSemantics.displayTitle || item.title}」，可在「已结束」中查阅`);
        void queryClient.invalidateQueries(['workbench-todos']);
        void queryClient.invalidateQueries(['workbench-todos-summary']);
        void queryClient.invalidateQueries(['workbench-coordination-sent-tasks']);
        void queryClient.invalidateQueries(['workbench-inbox']);
        void queryClient.invalidateQueries(['workbench-inbox-summary-for-todos']);
        return;
      }

      const actionType =
        nodeSemantics.cardActionType === 'send'
          ? 'approve'
          : nodeSemantics.isApprovalNode
          ? 'approve'
          : 'complete';

      if (nodeSemantics.cardActionType === 'send') {
        const inboxItemLike = {
          id: contextData.inboxItemId || taskId,
          title: item.title,
          sourceTitle: item.sourceTitle,
          rawContent: item.description,
          unifiedPayload: coordPayload,
          status: 'unprocessed',
        };
        applyOptimisticCoordinationSend(queryClient, inboxItemLike as any, {
          id: currentUserId,
          username: currentUsername,
        });
      }

      await workbenchCoordinationApi.submitAction(taskId, {
        action: actionType,
        comment:
          nodeSemantics.cardActionText === '重新发送'
            ? '已重新核验材料，重新提交发送后台审查。'
            : nodeSemantics.cardActionType === 'send'
            ? '初稿已核对无误，快捷发送提交流转。'
            : nodeSemantics.isApprovalNode
            ? '审核通过，快捷流转至下一节点。'
            : '事项已完成，快捷提交流转。',
      });

      void message.success(
        nodeSemantics.cardActionType === 'send'
          ? `已成功提交送审！系统正在进行智能合规诊断与风险复核，通过后将自动流转至法务审批。`
          : `已成功流转「${nodeSemantics.displayTitle || item.title}」，流程已进入下一阶段！`
      );

      const triggerRefresh = () => {
        void queryClient.invalidateQueries(['workbench-todos']);
        void queryClient.invalidateQueries(['workbench-todos-summary']);
        void queryClient.invalidateQueries(['workbench-coordination-sent-tasks']);
        void queryClient.invalidateQueries(['workbench-inbox']);
        void queryClient.invalidateQueries(['workbench-inbox-summary-for-todos']);
        void queryClient.invalidateQueries(['workbench-stats']);
      };
      triggerRefresh();
      setTimeout(triggerRefresh, 1500);
      setTimeout(triggerRefresh, 4000);
      setTimeout(triggerRefresh, 8000);
    } catch (err: any) {
      if (err?.message?.includes('未找到协同任务') || err?.response?.status === 404) {
        void message.warning('该协同任务已在其他环节流转或已更新，已为您自动刷新最新状态');
        void queryClient.invalidateQueries(['workbench-todos']);
        void queryClient.invalidateQueries(['workbench-todos-summary']);
        void queryClient.invalidateQueries(['workbench-inbox']);
        void queryClient.invalidateQueries(['workbench-coordination-sent-tasks']);
        return;
      }
      void message.error(err?.message || '快捷发送失败，您可点击「详细」进行处理');
    } finally {
      setQuickSendingId(null);
    }
  };

  const renderPriorityTag = (priority: string) => {
    switch (priority) {
      case "urgent":
        return <Tag color="error">紧急</Tag>;
      case "high":
        return <Tag color="warning">高</Tag>;
      case "medium":
        return <Tag color="processing">中</Tag>;
      case "low":
        return <Tag color="default">低</Tag>;
      default:
        return null;
    }
  };

  const renderSourceTag = (sourceType: string) => {
    switch (sourceType) {
      case "chat":
        return <Tag color="cyan">智能协同</Tag>;
      case "email":
        return <Tag color="gold">邮件</Tag>;
      case "schedule":
        return <Tag color="geekblue">定时任务</Tag>;
      case "im_channel":
        return <Tag color="purple">IM 消息</Tag>;
      case "workflow":
        return <Tag color="blue">工作流</Tag>;
      default:
        return null;
    }
  };

  const renderDueDateTag = (dueDateStr?: string | null, isCompleted?: boolean) => {
    if (!dueDateStr) return null;
    const dueTime = new Date(dueDateStr).getTime();
    const isOverdue = dueTime < Date.now() && !isCompleted;
    return (
      <Tag
        color={isOverdue ? "volcano" : "default"}
        icon={<ClockCircleOutlined />}
        bordered={false}
      >
        {isOverdue ? `逾期: ${formatMonthDayTime(dueDateStr)}` : `截止: ${formatMonthDayTime(dueDateStr)}`}
      </Tag>
    );
  };

  return (
    <Card
      className={`${styles["workbench-panel"]} ${styles["workbench-dual-card"]}`}
      styles={{ body: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0, padding: "14px 18px" } }}
      title={
        <div className={styles["workbench-panel-header"]}>
          <Typography.Text strong className={styles["workbench-panel-title"]}>
            行动待办看板
          </Typography.Text>
        </div>
      }
      extra={
        <Space size={6}>
          <Tag color="blue" bordered={false}>待办 {todoSummary.pending}</Tag>
          {todoSummary.overdue ? <Tag color="error" bordered={false}>逾期 {todoSummary.overdue}</Tag> : null}
          <Tag color="success" bordered={false}>已完成 {todoSummary.completed}</Tag>
        </Space>
      }
    >
      <div className={styles["workbench-card-body-wrapper"]}>
        <div className={styles["workbench-card-content-stack"]}>
          {/* 待办输入栏 */}
          <div className={styles["workbench-compact-form"]}>
            <div className={styles["workbench-compact-input-wrap"]}>
              <Input.TextArea
                value={todoDraft}
                placeholder="添加新待办（Enter 创建，支持批量粘贴）..."
                onChange={(event) => onDraftChange(event.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && todoDraft.trim()) {
                    e.preventDefault();
                    onCreateTodo();
                  }
                }}
                autoSize={{ minRows: 1, maxRows: 3 }}
              />
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                onClick={onCreateTodo}
                disabled={!todoDraft.trim()}
                className={styles["workbench-compact-btn-primary"]}
              >
                添加
              </Button>
            </div>
            <div className={styles["workbench-compact-actions"]}>
              <Tooltip title="让 AI 帮你按优先级和紧急度规划当前待办">
                <Button
                  size="small"
                  icon={<RobotOutlined />}
                  onClick={() =>
                    onLaunchAiAssistant(
                      [
                        "请帮我规划并整理待办任务，按优先级（高/中/低）与紧急程度排序，并给出自动化执行建议。",
                        "待办列表：",
                        ...(todos.length
                          ? todos.map(
                              (item, index) =>
                                `${index + 1}. [${item.status === "completed" ? "已完成" : "待处理"} | 优先级: ${item.priority}] ${item.title}`
                            )
                          : ["暂无待办任务"]),
                      ].join("\n")
                    )
                  }
                  className={styles["workbench-compact-btn-subtle"]}
                >
                  AI 规划
                </Button>
              </Tooltip>
              <Tooltip title="发起新的自动化执行单">
                <Button
                  size="small"
                  icon={<PlayCircleOutlined />}
                  onClick={onOpenNewExecution}
                  className={styles["workbench-compact-btn-subtle"]}
                >
                  新建执行
                </Button>
              </Tooltip>
            </div>
          </div>

          {/* 状态标签切换 */}
          {onTabChange ? (
            <Segmented
              value={activeTab}
              onChange={(val) => onTabChange(val as any)}
              size="small"
              className={styles["workbench-segmented-filter"]}
              options={[
                { label: `待办 (${todoSummary.pending ?? 0})`, value: "pending" },
                { label: `已发事项 (${todoSummary.sent ?? 0})`, value: "sent" },
                ...(todoSummary.overdue ? [{ label: `逾期 (${todoSummary.overdue})`, value: "overdue" }] : []),
                { label: `已结束 (${todoSummary.ended ?? 0})`, value: "ended" },
                { label: `全部 (${todoSummary.total ?? 0})`, value: "all" },
              ]}
            />
          ) : null}

          {/* 待办列表 (可滚动区域) */}
          <div className={styles["workbench-card-scroll-area"]}>
            {todos.length === 0 ? (
              <Empty description="暂无匹配待办，可在上方输入添加，或在左侧「GTD 收集箱」将邮件或便签一键转为待办" />
            ) : (
              <List
                dataSource={todos}
                renderItem={(item) => {
                  const contextData = (item.contextData || {}) as Record<string, any>;
                  const coordPayload = (contextData.unifiedPayload || {}) as Record<string, any>;
                  const extSync = coordPayload.externalSyncResult || (item as any).externalSyncResult || {};
                  const isArchived = Boolean(
                    item.status === "cancelled" ||
                    contextData.isArchived ||
                    coordPayload.status === "archived"
                  );
                  const isCompleted =
                    item.status === "completed" ||
                    isArchived ||
                    coordPayload.status === "completed" ||
                    Boolean(extSync.trackingNumber) ||
                    Boolean(extSync.detail?.archiveId) ||
                    coordPayload.currentStage === "final_receipt";
                  const isCoordination =
                    (item.sourceType as string) === "chat" ||
                    (item.sourceType as string) === "workflow" ||
                    Boolean(contextData.sourceSender) ||
                    Boolean(contextData.taskId) ||
                    Boolean(contextData.inboxItemId) ||
                    coordPayload.kind === "coordination";
                  const isReceipt = Boolean(
                    coordPayload.isReceipt ||
                    coordPayload.taskType === "receipt" ||
                    item.title?.startsWith("[协同回执]")
                  );
                  const isRejectReceipt = isReceipt && (coordPayload.receiptAction === "reject" || item.title?.includes("已驳回"));
                  const isApproveReceipt = isReceipt && (coordPayload.receiptAction === "approve" || item.title?.includes("已同意"));
                  const coordParams = coordPayload.parameters || {};
                  const hasCoordParams = Object.keys(coordParams).length > 0;
                  const isLeaveCoord =
                    coordPayload.workflowId === "hr.leave.request" || Boolean(coordParams.leaveType);

                  const isInitiatedByMe = isItemInitiatedByMe(item, currentUsername, currentUserId);
                  const isSentInTransit = Boolean(
                    coordPayload.inTransit ||
                    coordPayload.isSent ||
                    coordPayload.asyncExecution?.status === 'running' ||
                    coordPayload.currentStage === 'contract_review_execution'
                  );
                  const assigneeName = isSentInTransit
                    ? "系统智能审查 / 法务审核"
                    : coordPayload.assignee?.username || "处理担当";
                  const isAssignedToOther = Boolean(
                    !isCompleted &&
                    isInitiatedByMe &&
                    ((coordPayload.assignee?.username && coordPayload.assignee.username !== currentUsername) || isSentInTransit)
                  );
                  // 仅在「已发事项」或「全部」Tab中展示外发流转给他人等待办理的撤回与催办
                  // 在未完成/今日待办/收件箱中属于「自己的作业」，绝不展示撤回催办
                  const isWaitingForOther = Boolean(
                    (activeTab === 'sent' || activeTab === 'all') && isAssignedToOther
                  );
                  // 运用统一的协同节点语义分类器，精确区分 发起/初稿确认节点、审批承认节点、办结节点
                  const nodeSemantics = classifyWorkflowNode(
                    {
                      id: item.sourceRefId || item.id,
                      title: item.title,
                      sourceSender: (item.contextData as any)?.sourceSender,
                      unifiedPayload: coordPayload,
                      status: isCompleted ? 'processed' : 'unprocessed',
                    } as any,
                    currentUsername,
                    currentUserId
                  );
                  const rollbackReason = nodeSemantics.isRevisionRequired
                    ? (nodeSemantics.rollbackReason || extractRollbackReason(item, coordPayload))
                    : undefined;
                  const approvalComment = !nodeSemantics.isRevisionRequired
                    ? (nodeSemantics.approvalComment || extractApprovalComment(item, coordPayload))
                    : undefined;

                  const comparisonPair = getContractComparisonPair(
                    coordPayload.attachments,
                    undefined,
                    coordPayload.parameters
                  );

                  return (
                    <List.Item key={item.id} style={{ padding: "8px 0", border: "none" }}>
                      <div
                        className={styles["workbench-todo-item"]}
                        style={{
                          width: "100%",
                          borderLeft:
                            item.priority === "urgent"
                              ? "3px solid #ff4d4f"
                              : item.priority === "high"
                              ? "3px solid #fa8c16"
                              : isReceipt
                              ? isRejectReceipt
                                ? "3px solid #ff4d4f"
                                : "3px solid #52c41a"
                              : isCoordination
                              ? "3px solid #722ed1"
                              : undefined,
                        }}
                      >
                        <Space
                          direction="vertical"
                          size={6}
                          style={{ width: "100%" }}
                        >
                          <div className={styles["workbench-todo-item-row"]}>
                            {nodeSemantics.isProcessTask || isCoordination || isReceipt ? (
                              <div
                                className={styles["workbench-todo-checkbox"]}
                                style={{ cursor: "default" }}
                              >
                                {/* 任务主分类：流程任务 */}
                                <Tag
                                  color="blue"
                                  bordered={false}
                                  style={{
                                    marginRight: 4,
                                    fontWeight: 600,
                                    fontSize: 11,
                                    borderRadius: 4,
                                  }}
                                >
                                  流程任务
                                </Tag>

                                {isReceipt ? (
                                  <Tag
                                    color={isRejectReceipt ? "error" : isApproveReceipt ? "success" : "cyan"}
                                    style={{ marginRight: 4 }}
                                  >
                                    {isRejectReceipt ? "已驳回" : isApproveReceipt ? "已通过" : "已办结"}
                                  </Tag>
                                ) : isSentInTransit ? (
                                  <Tag color="processing" icon={<LoadingOutlined spin />} style={{ marginRight: 4 }}>
                                    智能审查中
                                  </Tag>
                                ) : (isCompleted && Boolean(extSync.trackingNumber || extSync.detail?.archiveId)) ? (
                                  <Tag color="green" style={{ marginRight: 4 }}>
                                    已办结
                                  </Tag>
                                ) : isArchived ? (
                                  <Tag color="default" style={{ marginRight: 4 }}>
                                    已归档
                                  </Tag>
                                ) : isCompleted ? (
                                  <Tag color="success" style={{ marginRight: 4 }}>
                                    已完成
                                  </Tag>
                                ) : (
                                  <Tag color={nodeSemantics.categoryTagColor} style={{ marginRight: 4 }}>
                                    {nodeSemantics.categoryTagText}
                                  </Tag>
                                )}
                                <Typography.Text
                                  strong={!isCompleted}
                                  className={styles["workbench-todo-title"]}
                                >
                                  {nodeSemantics.displayTitle || item.title}
                                </Typography.Text>
                              </div>
                            ) : (
                              <Checkbox
                                checked={isCompleted}
                                onChange={(e) => onToggleTodo(item.id, e.target.checked)}
                                className={styles["workbench-todo-checkbox"]}
                              >
                                {/* 任务主分类：普通任务 */}
                                <Tag
                                  color="default"
                                  bordered={false}
                                  style={{
                                    marginRight: 4,
                                    fontWeight: 600,
                                    fontSize: 11,
                                    borderRadius: 4,
                                  }}
                                >
                                  普通任务
                                </Tag>

                                {isArchived ? (
                                  <Tag color="default" style={{ marginRight: 4 }}>
                                    已归档
                                  </Tag>
                                ) : isCompleted ? (
                                  <Tag color="success" style={{ marginRight: 4 }}>
                                    已完成
                                  </Tag>
                                ) : null}

                                <Typography.Text
                                  delete={isCompleted}
                                  strong={!isCompleted}
                                  className={styles["workbench-todo-title"]}
                                >
                                  {nodeSemantics.displayTitle || item.title}
                                </Typography.Text>
                              </Checkbox>
                            )}

                            <Space size={6} className={styles["workbench-todo-actions"]}>
                              {/* 比较合同快捷入口：存在 2 个及以上文档版本时呈现 */}
                              {comparisonPair ? (
                                <Tooltip title="将新旧版本合同载入 AI 窗口进行智能比对与红线审查">
                                  <Button
                                    size="small"
                                    icon={<SwapOutlined style={{ fontSize: 12, color: '#722ed1' }} />}
                                    style={{
                                      borderColor: '#722ed1',
                                      color: '#722ed1',
                                      borderRadius: 6,
                                      fontSize: 12,
                                      height: 26,
                                      padding: '0 8px',
                                      backgroundColor: 'rgba(114, 46, 209, 0.04)',
                                    }}
                                    onClick={() => {
                                      triggerContractComparisonInAi({
                                        taskId: item.id,
                                        taskTitle: item.title,
                                        baseDoc: comparisonPair.baseDoc,
                                        latestDoc: comparisonPair.latestDoc,
                                        parameters: coordPayload.parameters,
                                      });
                                    }}
                                  >
                                    比较合同
                                  </Button>
                                </Tooltip>
                              ) : null}

                              {/* 1. 需重修/已驳回状态任务：展示醒目的「重新编辑并发送」按钮 (已结束任务仅允许查看详情) */}
                              {nodeSemantics.isRevisionRequired && !isCompleted ? (
                                <Tooltip title="当前任务已被驳回或需重修，请打开详情修改业务要件或追加新版本附件后再重新提交">
                                  <Button
                                    size="small"
                                    type="primary"
                                    danger
                                    icon={<EditOutlined style={{ fontSize: 12 }} />}
                                    style={{
                                      fontWeight: 500,
                                      borderRadius: 6,
                                      height: 26,
                                      padding: '0 10px',
                                    }}
                                    onClick={() => {
                                      setDetailModalTodo(item);
                                    }}
                                  >
                                    重新编辑并发送
                                  </Button>
                                </Tooltip>
                              ) : isWaitingForOther && !isCompleted ? (
                                /* 2. 发起人且当前流转在他人手中：在已发事项/全部中显示撤回、催办与详细 */
                                <>
                                  <Popconfirm
                                    title="确定撤回此发起事项？"
                                    description="撤回后将终止后续流转，并将事项退回至您的「待办」，您可重新编辑并再次发送。"
                                    onConfirm={() => onRecallTodo?.(item)}
                                    okText="确认撤回"
                                    cancelText="取消"
                                  >
                                    <Button
                                      size="small"
                                      icon={<RollbackOutlined style={{ fontSize: 12 }} />}
                                      className={styles['workbench-todo-recall-btn']}
                                    >
                                      撤回
                                    </Button>
                                  </Popconfirm>
                                  {!isSentInTransit ? (
                                    <Tooltip title={`向当前处理担当 @${assigneeName} 发送催办提醒`}>
                                      <Button
                                        size="small"
                                        icon={<BellOutlined style={{ fontSize: 12 }} />}
                                        className={styles['workbench-todo-remind-btn']}
                                        onClick={() => onRemindTodo?.(item)}
                                      >
                                        催办
                                      </Button>
                                    </Tooltip>
                                  ) : null}
                                  <Tooltip title="查看流转进度与要件详情">
                                    <Button
                                      size="small"
                                      className={styles['workbench-todo-action-btn']}
                                      icon={<EyeOutlined style={{ fontSize: 12 }} />}
                                      onClick={() => {
                                        setDetailModalTodo(item);
                                      }}
                                    >
                                      详细
                                    </Button>
                                  </Tooltip>
                                </>
                              ) : (nodeSemantics.isProcessTask || isReceipt || isCoordination) ? (
                                /* 3. 自己的流程作业或回执（待我发送/审批/办理/查阅）：显示快捷动作、详细，仅在允许驳回时显示驳回 */
                                <>
                                  {!isReceipt && !isCompleted ? (
                                    <Popconfirm
                                      title={
                                        nodeSemantics.cardActionType === 'send'
                                          ? "确认提交合同并送审？"
                                          : nodeSemantics.isApprovalNode
                                          ? "确认审批通过并流转？"
                                          : "确认办理完成并提交流转？"
                                      }
                                      description={
                                        nodeSemantics.cardActionType === 'send'
                                          ? "提交后系统将开展智能合规审查与风险诊断，并通过后自动流转至法务专员/下一环节审批。您可在「已发事项」中跟踪最新流转进度。"
                                          : nodeSemantics.isApprovalNode
                                          ? "审批通过后将自动流转至下一节点继续流转，审批意见与协同记录将同步归档。"
                                          : "办理完成后将提交流转至后续处理或归档节点。"
                                      }
                                      okText={nodeSemantics.cardActionText}
                                      cancelText="取消"
                                      onConfirm={() => handleQuickAction(item)}
                                      disabled={quickSendingId === item.id}
                                    >
                                      <Tooltip
                                        title={
                                          nodeSemantics.cardActionType === 'send'
                                            ? "快捷指令：一键确认初稿并发送至下一节点"
                                            : nodeSemantics.isApprovalNode
                                            ? "快捷指令：一键审核通过并流转至下一节点"
                                            : "快捷指令：一键办结并提交流转"
                                        }
                                      >
                                        <Button
                                          size="small"
                                          type="primary"
                                          loading={quickSendingId === item.id}
                                          className={
                                            nodeSemantics.cardActionType === 'send'
                                              ? styles['workbench-todo-send-btn']
                                              : styles['workbench-todo-flow-btn']
                                          }
                                          icon={
                                            nodeSemantics.cardActionType === 'send' ? (
                                              <SendOutlined style={{ fontSize: 12 }} />
                                            ) : (
                                              <CheckCircleOutlined style={{ fontSize: 12 }} />
                                            )
                                          }
                                        >
                                          {nodeSemantics.cardActionText}
                                        </Button>
                                      </Tooltip>
                                    </Popconfirm>
                                  ) : null}

                                  <Tooltip title="查看要件详情、查验文档或进行详细处理与流转">
                                    <Button
                                      size="small"
                                      className={styles['workbench-todo-action-btn']}
                                      icon={<EyeOutlined style={{ fontSize: 12 }} />}
                                      onClick={() => {
                                        setDetailModalTodo(item);
                                      }}
                                    >
                                      详细
                                    </Button>
                                  </Tooltip>

                                  {!isCompleted && nodeSemantics.allowReject ? (
                                    <Tooltip title="查看详情并进行驳回退回">
                                      <Button
                                        size="small"
                                        danger
                                        className={styles['workbench-todo-reject-btn']}
                                        icon={<CloseCircleOutlined style={{ fontSize: 12 }} />}
                                        onClick={() => {
                                          setDetailModalTodo(item);
                                        }}
                                      >
                                        驳回
                                      </Button>
                                    </Tooltip>
                                  ) : null}
                                </>
                              ) : null}

                              {/* 不能删除，只能归档 */}
                              {onArchiveTodo && !isCompleted ? (
                                <Popconfirm
                                  title="确定将此事项归档？"
                                  description="归档后此事项将被标记为已结束，可在「已结束」标签中查阅。"
                                  onConfirm={() => onArchiveTodo(item.id)}
                                  okText="归档"
                                  cancelText="取消"
                                >
                                  <Tooltip title="归档此事项">
                                    <Button
                                      size="small"
                                      type="text"
                                      className={styles['workbench-todo-archive-btn']}
                                      icon={<InboxOutlined style={{ fontSize: 14 }} />}
                                    />
                                  </Tooltip>
                                </Popconfirm>
                              ) : null}
                            </Space>
                          </div>

                      {/* 需重修 / 驳回理由提示 */}
                      {nodeSemantics.isRevisionRequired && rollbackReason ? (
                        <div
                          style={{
                            margin: "2px 0 6px 24px",
                            padding: "6px 10px",
                            borderRadius: 6,
                            background: "rgba(255, 77, 79, 0.08)",
                            border: "1px solid rgba(255, 77, 79, 0.28)",
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 8,
                          }}
                        >
                          <CloseCircleFilled style={{ color: "#ff4d4f", fontSize: 13, marginTop: 3, flexShrink: 0 }} />
                          <div style={{ fontSize: 12, lineHeight: 1.5, minWidth: 0, flex: 1 }}>
                            <span style={{ color: "#cf1322", fontWeight: 600 }}>驳回批注与修改意见：</span>
                            <span style={{ color: "var(--text-primary, #1f1f1f)", fontWeight: 500, wordBreak: "break-word" }}>
                              {rollbackReason}
                            </span>
                          </div>
                        </div>
                      ) : null}

                      {/* 审批通过 / 办结批注提示 */}
                      {!nodeSemantics.isRevisionRequired && approvalComment ? (
                        <div
                          style={{
                            margin: "2px 0 6px 24px",
                            padding: "6px 10px",
                            borderRadius: 6,
                            background: "rgba(82, 196, 26, 0.08)",
                            border: "1px solid rgba(82, 196, 26, 0.28)",
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 8,
                          }}
                        >
                          <CheckCircleFilled style={{ color: "#52c41a", fontSize: 13, marginTop: 3, flexShrink: 0 }} />
                          <div style={{ fontSize: 12, lineHeight: 1.5, minWidth: 0, flex: 1 }}>
                            <span style={{ color: "#389e0d", fontWeight: 600 }}>审批通过批注 / 流转说明：</span>
                            <span style={{ color: "var(--text-primary, #1f1f1f)", fontWeight: 500, wordBreak: "break-word" }}>
                              {approvalComment}
                            </span>
                          </div>
                        </div>
                      ) : null}

                      {hasCoordParams ? (
                        <div
                          style={{
                            margin: "2px 0 4px 24px",
                            background: "var(--bg-secondary, rgba(148, 163, 184, 0.08))",
                            padding: "6px 10px",
                            borderRadius: 6,
                            border: "1px solid var(--border-color, rgba(148, 163, 184, 0.16))",
                            fontSize: 12,
                            color: "var(--text-primary)",
                          }}
                        >
                          {isLeaveCoord ? (
                            <Space direction="vertical" size={2} style={{ width: "100%" }}>
                              <div>
                                <Tag color="blue">{coordParams.leaveType || "请假"}</Tag>
                                <span>时长：<strong>{coordParams.durationHours || 4} 小时</strong></span>
                              </div>
                              <div>起止：{coordParams.startTime} ~ {coordParams.endTime}</div>
                              <div>事由：{coordParams.reason}</div>
                            </Space>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, lineHeight: 1.5 }}>
                              {coordParams.counterpartyName ? (
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                                  <span style={{ color: 'var(--text-secondary)' }}>相对方：</span>
                                  <span style={{ fontWeight: 600 }}>{coordParams.counterpartyName}</span>
                                  {coordParams.counterpartyRole ? (
                                    <Tag color="cyan" style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px' }}>
                                      {coordParams.counterpartyRole}
                                    </Tag>
                                  ) : null}
                                </div>
                              ) : null}
                              {coordParams.ourParty || coordParams.ourRole ? (
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                  <span style={{ color: 'var(--text-secondary)' }}>我方：</span>
                                  <span>
                                    <strong>{coordParams.ourParty || '我方'}</strong>
                                    {coordParams.ourRole ? (
                                      <Tag color="blue" style={{ marginLeft: 6, fontSize: 10, padding: '0 3px', lineHeight: '16px' }}>
                                        {coordParams.ourRole}
                                      </Tag>
                                    ) : null}
                                  </span>
                                </div>
                              ) : null}
                              {coordParams.cooperationSubject && coordParams.cooperationSubject !== '商业拓展与业务技术合作' ? (
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                  <span style={{ color: 'var(--text-secondary)' }}>合作事项：</span>
                                  <span>{coordParams.cooperationSubject}</span>
                                </div>
                              ) : null}
                              {coordParams.signDate ? (
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                  <span style={{ color: 'var(--text-secondary)' }}>签署日期：</span>
                                  <span>{coordParams.signDate}</span>
                                </div>
                              ) : null}
                              {coordParams.penaltyAmount !== undefined || coordParams.contractAmount !== undefined || coordParams.amount !== undefined ? (
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                  <span style={{ color: 'var(--text-secondary)' }}>
                                    {coordParams.penaltyAmount !== undefined ? '违约金：' : '涉及金额：'}
                                  </span>
                                  <span style={{ color: '#d4380d', fontWeight: 600 }}>
                                    ¥{Number(coordParams.penaltyAmount ?? coordParams.contractAmount ?? coordParams.amount).toLocaleString()} 元
                                  </span>
                                </div>
                              ) : null}
                              {coordParams.myPosition && ['seller', 'neutral'].includes(coordParams.myPosition) ? (
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                  <span style={{ color: 'var(--text-secondary)' }}>合同立场：</span>
                                  <span>{formatParamValue('myPosition', coordParams.myPosition)}</span>
                                </div>
                              ) : null}
                              {Object.entries(coordParams)
                                .filter(([k]) => ![
                                  'downloadUrl', 'fileUrl', 'contractUrl', 'fileName', 'contractFileName',
                                  'executionId', 'remarks', 'contractTitle', 'contractType', 'currentStage',
                                  'myPosition', 'durationYears', 'counterpartyName', 'counterpartyAddress',
                                  'counterpartyRole', 'ourParty', 'ourRole', 'cooperationSubject',
                                  'signDate', 'penaltyAmount', 'contractAmount', 'amount', 'isDraftReplaced',
                                  'originalDraftUrl', 'originalDraftFileName', 'originalDraftSize', 'rawContent', 'text'
                                ].includes(k))
                                .map(([k, v]) => (
                                  <div key={k} style={{ display: 'flex', gap: 6 }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>{PARAM_LABEL_MAP[k] || k}：</span>
                                    <span>{formatParamValue(k, v)}</span>
                                  </div>
                                ))}
                            </div>
                          )}

                          {(() => {
                            const attachments = ((coordPayload.attachments || []) as Array<{ name: string; url?: string }>);
                            const directUrl =
                              coordParams.downloadUrl ||
                              coordParams.fileUrl ||
                              (contextData as any)?.generatedDocUrl;
                            const effectiveDownloadUrl =
                              attachments.find((a) => a.url)?.url ||
                              directUrl ||
                              undefined;
                            const effectiveDocName =
                              attachments[0]?.name ||
                              coordParams.fileName ||
                              (coordParams.contractTitle ? `${coordParams.contractTitle}.docx` : '保密合同初稿.docx');

                            if (!effectiveDownloadUrl) return null;

                            return (
                              <div
                                style={{
                                  marginTop: 8,
                                  padding: '8px 12px',
                                  background: 'linear-gradient(135deg, rgba(22, 119, 255, 0.06) 0%, rgba(99, 102, 241, 0.04) 100%)',
                                  borderRadius: 8,
                                  border: '1px solid rgba(22, 119, 255, 0.18)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: 10,
                                }}
                              >
                                <Space size={8} style={{ minWidth: 0, flex: 1 }}>
                                  <div
                                    style={{
                                      width: 24,
                                      height: 24,
                                      borderRadius: 6,
                                      background: 'rgba(22, 119, 255, 0.12)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      flexShrink: 0,
                                    }}
                                  >
                                    <FileWordOutlined style={{ color: '#1677ff', fontSize: 13 }} />
                                  </div>
                                  <span
                                    style={{
                                      fontWeight: 600,
                                      fontSize: 12,
                                      color: 'var(--text-primary, #1e293b)',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {effectiveDocName}
                                  </span>
                                </Space>
                                <Button
                                  size="small"
                                  type="primary"
                                  icon={<DownloadOutlined style={{ fontSize: 12 }} />}
                                  href={replaceLocalhostWithCurrentHost(effectiveDownloadUrl)}
                                  target="_blank"
                                  download={effectiveDocName}
                                  onClick={(e) => e.stopPropagation()}
                                  className={styles['workbench-todo-download-btn']}
                                >
                                  下载
                                </Button>
                              </div>
                            );
                          })()}
                        </div>
                      ) : null}

                      {item.description ? (
                        <Typography.Paragraph
                          type="secondary"
                          style={{ margin: "2px 0 4px 24px", fontSize: 13 }}
                          ellipsis={{ rows: 2 }}
                        >
                          {item.description}
                        </Typography.Paragraph>
                      ) : null}

                      <div style={{ marginLeft: 24 }}>
                        <Space size={[6, 6]} wrap>
                          {renderPriorityTag(item.priority)}
                          {renderSourceTag(item.sourceType)}
                          {(() => {
                            const sender = (item.contextData as any)?.sourceSender;
                            const isSelf =
                              isInitiatedByMe ||
                              (sender && sender.toLowerCase() === currentUsername.toLowerCase()) ||
                              (user?.username && sender && sender.toLowerCase() === user.username.toLowerCase());
                            if (isSelf) {
                              return <Tag color="green">来自自己</Tag>;
                            }
                            if (sender) {
                              return <Tag color="purple">来自 @{sender}</Tag>;
                            }
                            return null;
                          })()}
                          {renderDueDateTag(item.dueDate, isCompleted)}
                        </Space>
                      </div>
                    </Space>
                  </div>
                </List.Item>
              );
            }}
          />
        )}
      </div>
    </div>
  </div>

  {detailModalTodo ? (
    <InboxTaskDetailModal
      open={Boolean(detailModalTodo)}
      item={detailModalInboxItem}
      onClose={() => setDetailModalTodo(null)}
      onOpenInAi={(item) => {
        const cData = (item.unifiedPayload || {}) as Record<string, any>;
        useChatStore.getState().openWithTaskContext({
          taskId: item.id,
          taskTitle: item.title,
          workflowId: cData.workflowId,
          taskContent: item.rawContent,
          parameters: cData.parameters,
          attachments: cData.attachments,
        });
        setDetailModalTodo(null);
      }}
      onRecall={(_inboxItem) => {
        if (detailModalTodo) {
          onRecallTodo?.(detailModalTodo);
          setDetailModalTodo(null);
        }
      }}
      onRemind={(_inboxItem) => {
        if (detailModalTodo) {
          onRemindTodo?.(detailModalTodo);
        }
      }}
      onSuccess={() => {
        setDetailModalTodo(null);
        void queryClient.invalidateQueries(['workbench-todos']);
        void queryClient.invalidateQueries(['workbench-todos-summary']);
        void queryClient.invalidateQueries(['workbench-coordination-sent-tasks']);
        void queryClient.invalidateQueries(['workbench-inbox']);
        void queryClient.invalidateQueries(['workbench-inbox-summary-for-todos']);
      }}
    />
  ) : null}
</Card>
);
}
