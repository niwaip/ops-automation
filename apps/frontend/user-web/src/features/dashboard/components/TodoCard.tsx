import { useState } from "react";
import {
  ClockCircleOutlined,
  DeleteOutlined,
  EyeOutlined,
  InboxOutlined,
  OrderedListOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  RobotOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import {
  App,
  Badge,
  Button,
  Card,
  Checkbox,
  Empty,
  Input,
  List,
  Popconfirm,
  Radio,
  Segmented,
  Space,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { useNavigate } from "react-router-dom";
import type { WorkbenchTodoItem } from "@/api/workbenchTodo";
import { formatMonthDayTime } from "@/shared/utils/dateText";
import styles from "../pages/DashboardPage.module.css";
import { useWorkbenchInbox } from "../hooks/useWorkbenchInbox";
import { InboxList } from "./InboxList";

interface TodoCardProps {
  todoDraft: string;
  todoSummary: {
    total: number;
    pending: number;
    completed: number;
    overdue?: number;
  };
  todos: WorkbenchTodoItem[];
  activeTab?: "all" | "today" | "pending" | "completed" | "overdue";
  onTabChange?: (tab: "all" | "today" | "pending" | "completed" | "overdue") => void;
  onCreateTodo: () => void;
  onDraftChange: (value: string) => void;
  onLaunchAiAssistant: (prompt: string) => void;
  onOpenNewExecution: () => void;
  onToggleTodo: (id: string, completed: boolean) => void;
  onExecuteTodo?: (id: string) => void;
  onDeleteTodo?: (id: string) => void;
}

export function TodoCard({
  todoDraft,
  todoSummary,
  todos,
  activeTab = "all",
  onTabChange,
  onCreateTodo,
  onDraftChange,
  onLaunchAiAssistant,
  onOpenNewExecution,
  onToggleTodo,
  onExecuteTodo,
  onDeleteTodo,
}: TodoCardProps) {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [gtdMode, setGtdMode] = useState<"todos" | "inbox">("todos");

  const {
    inboxDraft,
    setInboxDraft,
    inboxFilter,
    setInboxFilter,
    inboxItems,
    inboxSummary,
    clarifyingIds,
    isSyncingEmail,
    handleQuickIngest,
    handleClarifyItem,
    handleConvertToTodo,
    handleArchiveItem,
    handleDeleteItem,
    handleSyncEmail,
  } = useWorkbenchInbox({
    message,
    onTodoCreated: () => {
      setGtdMode("todos");
    },
  });

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
        return <Tag color="cyan">AI 对话</Tag>;
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
      className={styles["workbench-panel"]}
      title={
        <div className={styles["workbench-panel-header"]}>
          <Space size={12} align="center">
            <Typography.Text strong className={styles["workbench-panel-title"]}>
              {gtdMode === "todos" ? "行动看板 (Actions)" : "GTD 收件箱 (Inbox)"}
            </Typography.Text>
            <Segmented
              value={gtdMode}
              onChange={(val) => setGtdMode(val as "todos" | "inbox")}
              options={[
                {
                  label: (
                    <Space size={4}>
                      <OrderedListOutlined />
                      <span>待办看板</span>
                      {todoSummary.pending > 0 ? (
                        <Badge count={todoSummary.pending} size="small" />
                      ) : null}
                    </Space>
                  ),
                  value: "todos",
                },
                {
                  label: (
                    <Space size={4}>
                      <InboxOutlined />
                      <span>GTD 收件箱</span>
                      {inboxSummary.unprocessed > 0 ? (
                        <Badge
                          count={inboxSummary.unprocessed}
                          size="small"
                          style={{ backgroundColor: "#faad14" }}
                        />
                      ) : null}
                    </Space>
                  ),
                  value: "inbox",
                },
              ]}
            />
          </Space>
          <Typography.Text className={styles["workbench-panel-subtitle"]}>
            {gtdMode === "todos"
              ? "规划与执行任务，支持 5W1H 智能识别与自动化工作流调用。"
              : "统一接入邮件、对话与工作流内容；置信度不足时支持 AI 深度整理与转待办。"}
          </Typography.Text>
        </div>
      }
      extra={
        gtdMode === "todos" ? (
          <Space>
            <Tag color="blue">待办 {todoSummary.pending}</Tag>
            {todoSummary.overdue ? <Tag color="error">逾期 {todoSummary.overdue}</Tag> : null}
            <Tag color="success">已完成 {todoSummary.completed}</Tag>
          </Space>
        ) : (
          <Space>
            <Tag color="warning">待整理 {inboxSummary.unprocessed}</Tag>
            <Tag color="cyan">已厘清 {inboxSummary.clarified}</Tag>
            <Tag color="default">总计 {inboxSummary.total}</Tag>
          </Space>
        )
      }
    >
      {gtdMode === "inbox" ? (
        <InboxList
          inboxItems={inboxItems}
          inboxFilter={inboxFilter}
          inboxSummary={inboxSummary}
          inboxDraft={inboxDraft}
          clarifyingIds={clarifyingIds}
          isSyncingEmail={isSyncingEmail}
          onFilterChange={setInboxFilter}
          onDraftChange={setInboxDraft}
          onQuickIngest={handleQuickIngest}
          onSyncEmail={handleSyncEmail}
          onClarifyItem={handleClarifyItem}
          onConvertToTodo={(id) => handleConvertToTodo(id)}
          onArchiveItem={handleArchiveItem}
          onDeleteItem={handleDeleteItem}
        />
      ) : (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          {/* 顶部标签切换 */}
          {onTabChange ? (
            <Radio.Group
              value={activeTab}
              onChange={(e) => onTabChange(e.target.value)}
              size="small"
              buttonStyle="solid"
            >
              <Radio.Button value="all">全部 ({todoSummary.total})</Radio.Button>
              <Radio.Button value="today">今日待办</Radio.Button>
              <Radio.Button value="pending">未完成 ({todoSummary.pending})</Radio.Button>
              {todoSummary.overdue ? (
                <Radio.Button value="overdue">逾期 ({todoSummary.overdue})</Radio.Button>
              ) : null}
              <Radio.Button value="completed">已完成 ({todoSummary.completed})</Radio.Button>
            </Radio.Group>
          ) : null}

          {/* 待办输入栏 */}
          <div className={styles["workbench-todo-form"]}>
            <Input.TextArea
              value={todoDraft}
              placeholder={
                "输入一段任务描述，支持回车批量解析\n例如：\n1. 今天 17:00 前处理故障接管单\n2. 审核数据库备份工作流\n3. 导出月度运维报表"
              }
              onChange={(event) => onDraftChange(event.target.value)}
              autoSize={{ minRows: 2, maxRows: 5 }}
            />
            <div className={styles["workbench-todo-form-actions"]}>
              <Button
                type="primary"
                className={`${styles["workbench-action-button"]} ${styles["workbench-todo-toolbar-button"]} ${styles["is-create"]}`}
                icon={<PlusOutlined />}
                onClick={onCreateTodo}
              >
                添加
              </Button>
              <Button
                className={`${styles["workbench-action-button"]} ${styles["workbench-todo-toolbar-button"]} ${styles["is-ai"]}`}
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
              >
                AI 规划
              </Button>
              <Button
                className={`${styles["workbench-action-button"]} ${styles["workbench-todo-toolbar-button"]} ${styles["is-run"]}`}
                icon={<PlayCircleOutlined />}
                onClick={onOpenNewExecution}
              >
                新建执行
              </Button>
            </div>
          </div>

          {/* 待办列表 */}
          {todos.length === 0 ? (
            <Empty description="暂无匹配的待办任务，可在上方添加，或在「GTD 收件箱」中将外部条目转为待办" />
          ) : (
            <List
              dataSource={todos}
              renderItem={(item) => {
                const isCompleted = item.status === "completed";
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
                            : undefined,
                      }}
                    >
                      <Space
                        direction="vertical"
                        size={8}
                        style={{ width: "100%", opacity: isCompleted ? 0.72 : 1 }}
                      >
                        <Space
                          className={styles["workbench-todo-row"]}
                          style={{
                            width: "100%",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                          }}
                        >
                          <Space style={{ alignItems: "flex-start" }}>
                            <Checkbox
                              checked={isCompleted}
                              onChange={(event) => onToggleTodo(item.id, event.target.checked)}
                              style={{ marginTop: 2 }}
                            />
                            <div>
                              <Space wrap size={6}>
                                {renderPriorityTag(item.priority)}
                                {renderSourceTag(item.sourceType)}
                                <Typography.Text
                                  delete={isCompleted}
                                  strong={item.priority === "high" || item.priority === "urgent"}
                                >
                                  {item.title}
                                </Typography.Text>
                              </Space>
                              {item.description ? (
                                <Typography.Paragraph
                                  type="secondary"
                                  ellipsis={{ rows: 2, expandable: true, symbol: "展开" }}
                                  style={{ margin: "4px 0 0", fontSize: 12 }}
                                >
                                  {item.description}
                                </Typography.Paragraph>
                              ) : null}
                            </div>
                          </Space>

                          {/* 右侧动作按钮组 */}
                          <Space size={4}>
                            {item.boundWorkflowId && !isCompleted ? (
                              <Tooltip title="触发绑定工作流一键执行">
                                <Button
                                  size="small"
                                  type="primary"
                                  icon={<ThunderboltOutlined />}
                                  onClick={() => onExecuteTodo && onExecuteTodo(item.id)}
                                >
                                  执行
                                </Button>
                              </Tooltip>
                            ) : null}

                            {item.executionId ? (
                              <Tooltip title="查看对应自动化执行详情">
                                <Button
                                  size="small"
                                  icon={<EyeOutlined />}
                                  onClick={() => navigate(`/executions/${item.executionId}`)}
                                >
                                  执行详情
                                </Button>
                              </Tooltip>
                            ) : null}

                            <Button
                              size="small"
                              className={styles["workbench-action-button"]}
                              icon={<RobotOutlined />}
                              onClick={() =>
                                onLaunchAiAssistant(
                                  [
                                    "请帮我处理这个待办任务。",
                                    `任务：${item.title}`,
                                    item.description ? `说明：${item.description}` : "",
                                    "请输出：任务拆解步骤、自动化执行建议、所需参数或通知草稿。",
                                  ]
                                    .filter(Boolean)
                                    .join("\n")
                                )
                              }
                            >
                              AI 处理
                            </Button>

                            {onDeleteTodo ? (
                              <Popconfirm
                                title="确定删除此待办吗？"
                                onConfirm={() => onDeleteTodo(item.id)}
                                okText="删除"
                                cancelText="取消"
                              >
                                <Button
                                  size="small"
                                  type="text"
                                  danger
                                  icon={<DeleteOutlined />}
                                />
                              </Popconfirm>
                            ) : null}
                          </Space>
                        </Space>

                        {/* 底部元数据 */}
                        <div className={styles["workbench-todo-meta"]}>
                          <Space size={8} wrap>
                            {renderDueDateTag(item.dueDate, isCompleted)}
                            <Tag bordered={false}>
                              更新于 {formatMonthDayTime(item.updatedAt)}
                            </Tag>
                            {item.sourceTitle ? (
                              <Tag bordered={false}>
                                来源: {item.sourceTitle}
                              </Tag>
                            ) : null}
                          </Space>
                        </div>
                      </Space>
                    </div>
                  </List.Item>
                );
              }}
            />
          )}
        </Space>
      )}
    </Card>
  );
}
