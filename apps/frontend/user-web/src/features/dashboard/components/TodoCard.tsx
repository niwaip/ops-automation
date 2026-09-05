import {
  ClockCircleOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  RobotOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Checkbox,
  Empty,
  Input,
  List,
  Popconfirm,
  Radio,
  Space,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { useNavigate } from "react-router-dom";
import type { WorkbenchTodoItem } from "@/api/workbenchTodo";
import { formatMonthDayTime } from "@/shared/utils/dateText";
import styles from "../pages/DashboardPage.module.css";

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
      styles={{ body: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0, padding: "16px 20px" } }}
      title={
        <div className={styles["workbench-panel-header"]}>
          <Space size={12} align="center">
            <Typography.Text strong className={styles["workbench-panel-title"]}>
              行动待办看板
            </Typography.Text>
          </Space>
          <Typography.Text type="secondary" className={styles["workbench-panel-desc"]}>
            规划与执行个人核心日常任务；支持 5W1H 智能识别与自动化工作流直接调度。
          </Typography.Text>
        </div>
      }
      extra={
        <Space size={6}>
          <Tag color="blue">待办 {todoSummary.pending}</Tag>
          {todoSummary.overdue ? <Tag color="error">逾期 {todoSummary.overdue}</Tag> : null}
          <Tag color="success">已完成 {todoSummary.completed}</Tag>
        </Space>
      }
    >
      <div className={styles["workbench-card-body-wrapper"]}>
        <div className={styles["workbench-card-content-stack"]}>
          {/* 待办输入栏 */}
          <div className={styles["workbench-todo-form"]}>
            <Input.TextArea
              value={todoDraft}
              placeholder={
                "输入待办任务描述，支持回车批量解析：\n1. 今天 17:00 前处理异常接管单\n2. 审核邮件归纳与自动化执行记录\n3. 导出月度运维报表"
              }
              onChange={(event) => onDraftChange(event.target.value)}
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
            <div className={styles["workbench-todo-form-actions"]}>
              <Button
                type="primary"
                className={`${styles["workbench-action-button"]} ${styles["workbench-todo-toolbar-button"]} ${styles["is-create"]}`}
                icon={<PlusOutlined />}
                onClick={onCreateTodo}
              >
                添加任务
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

          {/* 状态标签切换 */}
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

          {/* 待办列表 (可滚动区域) */}
          <div className={styles["workbench-card-scroll-area"]}>
            {todos.length === 0 ? (
              <Empty description="暂无匹配待办，可在上方输入添加，或在左侧「GTD 收集箱」将邮件或便签一键转为待办" />
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
                      size={6}
                      style={{ width: "100%" }}
                    >
                      <div className={styles["workbench-todo-item-row"]}>
                        <Checkbox
                          checked={isCompleted}
                          onChange={(e) => onToggleTodo(item.id, e.target.checked)}
                          className={styles["workbench-todo-checkbox"]}
                        >
                          <Typography.Text
                            delete={isCompleted}
                            strong={!isCompleted}
                            className={styles["workbench-todo-title"]}
                          >
                            {item.title}
                          </Typography.Text>
                        </Checkbox>

                        <Space size={6} className={styles["workbench-todo-actions"]}>
                          {item.boundWorkflowId ? (
                            <Tooltip title="一键执行关联工作流">
                              <Button
                                size="small"
                                type="text"
                                icon={<ThunderboltOutlined style={{ color: "#722ed1" }} />}
                                onClick={() =>
                                  onExecuteTodo
                                    ? onExecuteTodo(item.id)
                                    : navigate(`/executions/new?workflowId=${item.boundWorkflowId}`)
                                }
                              >
                                执行工作流
                              </Button>
                            </Tooltip>
                          ) : null}

                          {onDeleteTodo ? (
                            <Popconfirm
                              title="确定删除此待办？"
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
                      </div>

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
    </Card>
  );
}
