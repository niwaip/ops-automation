import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  EyeOutlined,
  RobotOutlined,
} from "@ant-design/icons";
import { App, Button, Empty, List, Space, Tag, Tooltip, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "react-query";
import {
  EXECUTION_STATUS_LABELS_ZH,
  type ExecutionDto,
  type ExecutionStatus,
} from "@ops/user-core";
import { getExecutionTitle } from "../lib/executionTitle";
import { workbenchTodoApi } from "@/api/workbenchTodo";
import { executionApi } from "@/api/execution";
import { useChatStore } from "../../chat";
import { formatMonthDayTime } from "../../../shared/utils/dateText";
import styles from "../pages/DashboardPage.module.css";
import inboxStyles from "./InboxList.module.css";

const WORKBENCH_EXECUTION_TAG_COLORS: Partial<Record<ExecutionStatus, string>> = {
  human_control: "gold",
  pending_approval: "warning",
  waiting_input: "orange",
  failed: "error",
  running: "processing",
};

export interface InterventionListProps {
  priorityItems: ExecutionDto[];
  onOpenExecution?: (executionId: string) => void;
  onIgnorePriorityItem?: (executionId: string) => void;
  onIgnoreAllPriorityItems?: () => void;
  onViewAllExecutions?: () => void;
  onLaunchAiAssistant?: (prompt: string) => void;
  getExecutionDisplayDescription?: (execution: ExecutionDto) => string;
  getExecutionDisplayTime?: (execution: ExecutionDto) => string;
  getSkillDisplayName?: (skillId?: string) => string;
}

export function InterventionList({
  priorityItems,
  onOpenExecution,
  onIgnorePriorityItem,
  onIgnoreAllPriorityItems,
  onViewAllExecutions,
  onLaunchAiAssistant,
  getExecutionDisplayDescription,
  getExecutionDisplayTime,
  getSkillDisplayName,
}: InterventionListProps) {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();

  const handleConvertExecutionToTodo = async (item: ExecutionDto) => {
    try {
      const title = getExecutionTitle(item);
      const desc =
        getExecutionDisplayDescription?.(item) ||
        item.failureReason ||
        item.takeoverReason ||
        "";
      await workbenchTodoApi.create({
        title: `[待介入] ${title}`,
        description: desc ? `执行异常/接管详情：${desc}` : undefined,
        priority: "high",
        sourceType: "manual",
        sourceRefId: item.id,
        sourceTitle: title,
        contextData: { executionId: item.id },
      });
      onIgnorePriorityItem?.(item.id);
      void queryClient.invalidateQueries(["workbench-todos"]);
      void queryClient.invalidateQueries(["workbench-todos-summary"]);
      void message.success(`已将「${title}」转为待办任务并沉淀入待办看板！`);
    } catch (err: any) {
      void message.error(`转为待办失败: ${err?.message || "未知错误"}`);
    }
  };

  const handleAiAssistExecution = (item: ExecutionDto) => {
    const title = getExecutionTitle(item);
    const desc =
      getExecutionDisplayDescription?.(item) ||
      item.failureReason ||
      item.takeoverReason ||
      "";
    const skillName = getSkillDisplayName?.(item.skillId) || item.skillId;
    const prompt = [
      `请协助我排查并处理以下异常执行任务单：`,
      `任务名称: ${title}`,
      `执行单ID: ${item.id}`,
      `关联技能: ${skillName}`,
      `当前状态: ${EXECUTION_STATUS_LABELS_ZH[item.status] || item.status}`,
      desc ? `异常或介入原因: ${desc}` : "",
      `请分析具体失败根因，并给出后续补救与恢复建议。`,
    ]
      .filter(Boolean)
      .join("\n");

    if (onLaunchAiAssistant) {
      onLaunchAiAssistant(prompt);
    } else {
      useChatStore.getState().createSession();
      useChatStore.getState().setChatMode("task");
      useChatStore.getState().setDraftMessage(prompt);
      useChatStore.getState().setDraftExecutionId(item.id);
      useChatStore.getState().setOpen(true);
      void message.success("已为你打开 AI 助手并填入提示词");
    }
  };

  const handleApproveExecution = async (executionId: string) => {
    try {
      let finalEffectId: string | undefined;
      let finalHash: string | undefined;
      try {
        const currentExec = await executionApi.get(executionId);
        const firstPending = currentExec?.pendingOutboundEffects?.[0];
        if (firstPending) {
          finalEffectId = firstPending.effectId;
          finalHash = firstPending.payloadHash;
        }
      } catch {}
      await executionApi.approve(executionId, {
        ...(finalEffectId ? { effectId: finalEffectId } : {}),
        ...(finalHash ? { approvedPayloadHash: finalHash } : {}),
      });
      void message.success("已审批通过！");
      void queryClient.invalidateQueries(["dashboard-executions"]);
      void queryClient.invalidateQueries(["workbench-executions"]);
    } catch (err: any) {
      void message.error(`审批失败: ${err?.message || "未知错误"}`);
    }
  };

  const handleRejectExecution = async (executionId: string) => {
    try {
      await executionApi.reject(executionId);
      void message.success("已驳回执行！");
      void queryClient.invalidateQueries(["dashboard-executions"]);
      void queryClient.invalidateQueries(["workbench-executions"]);
    } catch (err: any) {
      void message.error(`驳回失败: ${err?.message || "未知错误"}`);
    }
  };

  if (priorityItems.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="暂无待人工介入或失败的任务单 (All Clear)"
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* 工具栏：统计与快捷入口 */}
      <div className={styles["workbench-intervention-toolbar"]}>
        <Space size={6} align="center">
          <ExclamationCircleOutlined style={{ color: "#faad14" }} />
          <span>
            发现 <strong>{priorityItems.length}</strong> 项需人工介入或失败的任务单
          </span>
        </Space>
        <Space size={8}>
          {onIgnoreAllPriorityItems ? (
            <Button
              type="link"
              size="small"
              style={{ padding: 0, fontSize: 12 }}
              onClick={onIgnoreAllPriorityItems}
            >
              全部已阅
            </Button>
          ) : null}
          {onViewAllExecutions ? (
            <Button
              type="link"
              size="small"
              style={{ padding: 0, fontSize: 12 }}
              onClick={onViewAllExecutions}
            >
              执行管理
            </Button>
          ) : null}
        </Space>
      </div>

      {/* 待介入任务列表 */}
      <List
        dataSource={priorityItems}
        renderItem={(item) => {
          const title = getExecutionTitle(item);
          const reason =
            getExecutionDisplayDescription?.(item) ||
            item.failureReason ||
            item.takeoverReason ||
            "";
          const timeText = getExecutionDisplayTime
            ? formatMonthDayTime(getExecutionDisplayTime(item))
            : "";
          const skillName = getSkillDisplayName?.(item.skillId);
          const isTakeover =
            item.status === "human_control" ||
            item.status === "waiting_input" ||
            item.status === "pending_approval";

          return (
            <List.Item key={item.id} style={{ padding: "6px 0", border: "none" }}>
              <div
                className={styles["workbench-todo-item"]}
                style={{
                  width: "100%",
                  borderLeft:
                    item.status === "failed"
                      ? "3px solid #ff4d4f"
                      : item.status === "human_control" || item.status === "waiting_input"
                      ? "3px solid #faad14"
                      : item.status === "pending_approval"
                      ? "3px solid #faad14"
                      : "3px solid #1677ff",
                }}
              >
                <div className={inboxStyles["inbox-item-container"]}>
                  {/* 顶部标题与状态 */}
                  <div className={inboxStyles["inbox-item-header"]}>
                    <div className={inboxStyles["inbox-item-title-wrapper"]}>
                      <Tag color={WORKBENCH_EXECUTION_TAG_COLORS[item.status] || "default"}>
                        {EXECUTION_STATUS_LABELS_ZH[item.status] || item.status}
                      </Tag>
                      {skillName ? (
                        <Tag color="default" style={{ marginRight: 4 }}>
                          {skillName}
                        </Tag>
                      ) : null}
                      <Typography.Text strong className={inboxStyles["inbox-item-title"]}>
                        {title}
                      </Typography.Text>
                    </div>

                    {/* 操作按钮区 */}
                    <Space size={4} wrap className={inboxStyles["inbox-item-actions"]}>
                      {/* 审批型任务快捷批准/驳回 */}
                      {item.status === "pending_approval" ? (
                        <>
                          <Button
                            size="small"
                            type="primary"
                            style={{ backgroundColor: "#52c41a", borderColor: "#52c41a" }}
                            icon={<CheckCircleOutlined />}
                            onClick={() => handleApproveExecution(item.id)}
                          >
                            批准
                          </Button>
                          <Button
                            size="small"
                            danger
                            icon={<CloseCircleOutlined />}
                            onClick={() => handleRejectExecution(item.id)}
                          >
                            驳回
                          </Button>
                        </>
                      ) : null}

                      {/* 前往处理 */}
                      <Button
                        size="small"
                        type="primary"
                        icon={<EyeOutlined />}
                        onClick={() => {
                          if (onOpenExecution) {
                            onOpenExecution(item.id);
                          } else {
                            navigate(`/executions/${item.id}`);
                          }
                        }}
                      >
                        前往处理
                      </Button>

                      {/* 转为待办 */}
                      <Tooltip title="将此异常任务转入待办看板，制定后续跟进与修复">
                        <Button
                          size="small"
                          icon={<ArrowRightOutlined />}
                          onClick={() => handleConvertExecutionToTodo(item)}
                        >
                          转为待办
                        </Button>
                      </Tooltip>

                      {/* AI协助 */}
                      <Tooltip title="让 AI 助手分析异常日志并提供恢复建议">
                        <Button
                          size="small"
                          icon={<RobotOutlined />}
                          onClick={() => handleAiAssistExecution(item)}
                        >
                          AI协助
                        </Button>
                      </Tooltip>

                      {/* 已阅 */}
                      {onIgnorePriorityItem ? (
                        <Tooltip title="从待介入队列移除（标记为已阅）">
                          <Button
                            size="small"
                            icon={<CheckOutlined />}
                            onClick={() => onIgnorePriorityItem(item.id)}
                          >
                            已阅
                          </Button>
                        </Tooltip>
                      ) : null}
                    </Space>
                  </div>

                  {/* 异常/介入原因说明 */}
                  {reason ? (
                    <div
                      className={`${styles["workbench-priority-reason-box"]}${
                        isTakeover ? ` ${styles["is-takeover"]}` : ""
                      }`}
                    >
                      <ExclamationCircleOutlined
                        style={{
                          color: isTakeover ? "#d97706" : "#dc2626",
                          marginTop: 2,
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <Typography.Paragraph
                          style={{ margin: 0 }}
                          ellipsis={{ rows: 2, tooltip: reason }}
                        >
                          {reason}
                        </Typography.Paragraph>
                      </div>
                    </div>
                  ) : null}

                  {/* 底部元数据 */}
                  <div className={inboxStyles["inbox-item-footer"]}>
                    <Space size={8} split={<span style={{ opacity: 0.3 }}>|</span>}>
                      <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                        单号: #{item.id.slice(0, 8)}
                      </span>
                      {timeText ? (
                        <Space size={4} style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                          <ClockCircleOutlined />
                          <span>{timeText}</span>
                        </Space>
                      ) : null}
                    </Space>
                  </div>
                </div>
              </div>
            </List.Item>
          );
        }}
      />
    </div>
  );
}
