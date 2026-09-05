import {
  Alert,
  App,
  Button,
  Card,
  Space,
  Tag,
  Typography,
} from "antd";
import {
  CheckOutlined,
  ExclamationCircleOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import type { ExecutionDto } from "@ops/user-core";
import { useWorkbenchInbox } from "../hooks/useWorkbenchInbox";
import { InboxList } from "./InboxList";
import styles from "../pages/DashboardPage.module.css";

interface InboxCardProps {
  priorityItems?: ExecutionDto[];
  onOpenExecution?: (executionId: string) => void;
  onViewAllExecutions?: () => void;
  onIgnoreAllPriorityItems?: () => void;
}

export function InboxCard({
  priorityItems = [],
  onOpenExecution,
  onViewAllExecutions,
  onIgnoreAllPriorityItems,
}: InboxCardProps) {
  const { message } = App.useApp();

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
  });

  return (
    <Card
      className={`${styles["workbench-panel"]} ${styles["workbench-dual-card"]}`}
      styles={{ body: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0, padding: "16px 20px" } }}
      title={
        <div className={styles["workbench-panel-header"]}>
          <Space size={12} align="center">
            <Typography.Text strong className={styles["workbench-panel-title"]}>
              GTD 收集箱
            </Typography.Text>
          </Space>
          <Typography.Text type="secondary" className={styles["workbench-panel-desc"]}>
            统一接入外部邮件、灵感便签与异常事件；支持 AI 深度整理并一键沉淀为待办。
          </Typography.Text>
        </div>
      }
      extra={
        <Space size={6}>
          {inboxSummary.unprocessed > 0 ? (
            <Tag color="warning">待整理 {inboxSummary.unprocessed}</Tag>
          ) : null}
          <Tag color="cyan">已厘清 {inboxSummary.clarified}</Tag>
          <Tag color="default">总计 {inboxSummary.total}</Tag>
        </Space>
      }
    >
      <div className={styles["workbench-card-body-wrapper"]}>
        {/* 异常与待人工介入单据合并提醒（优先处理收敛） */}
        {priorityItems.length > 0 ? (
          <Alert
            message={
              <Space size={8} wrap align="center">
                <span style={{ fontWeight: 600 }}>
                  发现 {priorityItems.length} 项需人工介入或失败的任务单
                </span>
                <span style={{ fontSize: 12, opacity: 0.85 }}>
                  建议前往核对，或通过 AI 整理为后续待办
                </span>
              </Space>
            }
            type="warning"
            showIcon
            icon={<ExclamationCircleOutlined />}
            action={
              <Space size={4}>
                {onOpenExecution && priorityItems[0] ? (
                  <Button
                    size="small"
                    type="link"
                    icon={<EyeOutlined />}
                    onClick={() => onOpenExecution(priorityItems[0].id)}
                  >
                    处理最近单据
                  </Button>
                ) : null}
                {onIgnoreAllPriorityItems ? (
                  <Button
                    size="small"
                    type="link"
                    icon={<CheckOutlined />}
                    onClick={onIgnoreAllPriorityItems}
                  >
                    全部已阅
                  </Button>
                ) : null}
                {onViewAllExecutions ? (
                  <Button size="small" type="link" onClick={onViewAllExecutions}>
                    查看全部
                  </Button>
                ) : null}
              </Space>
            }
            style={{ borderRadius: 12, border: "1px solid rgba(250, 173, 20, 0.3)" }}
          />
        ) : null}

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
      </div>
    </Card>
  );
}
