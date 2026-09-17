import {
  App,
  Card,
  Space,
  Tag,
  Typography,
} from "antd";
import type { ExecutionDto } from "@ops/user-core";
import { useWorkbenchInbox } from "../hooks/useWorkbenchInbox";
import { InboxList } from "./InboxList";
import styles from "../pages/DashboardPage.module.css";

interface InboxCardProps {
  priorityItems?: ExecutionDto[];
  onOpenExecution?: (executionId: string) => void;
  onViewAllExecutions?: () => void;
  onIgnoreAllPriorityItems?: () => void;
  onIgnorePriorityItem?: (executionId: string) => void;
  onLaunchAiAssistant?: (prompt: string) => void;
  getExecutionDisplayDescription?: (execution: ExecutionDto) => string;
  getExecutionDisplayTime?: (execution: ExecutionDto) => string;
  getSkillDisplayName?: (skillId?: string) => string;
  onTodoCreated?: () => void;
}

export function InboxCard({
  priorityItems = [],
  onOpenExecution,
  onViewAllExecutions,
  onIgnoreAllPriorityItems,
  onIgnorePriorityItem,
  onLaunchAiAssistant,
  getExecutionDisplayDescription,
  getExecutionDisplayTime,
  getSkillDisplayName,
  onTodoCreated,
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
    handleUnarchiveItem,
    handleDeleteItem,
    handleSyncEmail,
  } = useWorkbenchInbox({
    message,
    onTodoCreated,
    defaultFilter: priorityItems.length > 0 ? "intervention" : "unprocessed",
  });

  return (
    <Card
      className={`${styles["workbench-panel"]} ${styles["workbench-dual-card"]}`}
      styles={{ body: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0, padding: "14px 18px" } }}
      title={
        <div className={styles["workbench-panel-header"]}>
          <Typography.Text strong className={styles["workbench-panel-title"]}>
            GTD 收集箱
          </Typography.Text>
        </div>
      }
      extra={
        <Space size={6}>
          {priorityItems.length > 0 ? (
            <Tag
              color={inboxFilter === "intervention" ? "error" : "default"}
              bordered={false}
              style={{ cursor: "pointer" }}
              onClick={() => setInboxFilter("intervention")}
            >
              待介入 {priorityItems.length}
            </Tag>
          ) : null}
          {inboxSummary.unprocessed > 0 ? (
            <Tag
              color={inboxFilter === "unprocessed" ? "warning" : "default"}
              bordered={false}
              style={{ cursor: "pointer" }}
              onClick={() => setInboxFilter("unprocessed")}
            >
              待整理 {inboxSummary.unprocessed}
            </Tag>
          ) : null}
          <Tag
            color={inboxFilter === "clarified_archived" ? "cyan" : "default"}
            bordered={false}
            style={{ cursor: "pointer" }}
            onClick={() => setInboxFilter("clarified_archived")}
          >
            已厘清/归档 {inboxSummary.clarified + inboxSummary.archived}
          </Tag>
          <Tag
            color={inboxFilter === "all" ? "blue" : "default"}
            bordered={false}
            style={{ cursor: "pointer" }}
            onClick={() => setInboxFilter("all")}
          >
            全部 {inboxSummary.total}
          </Tag>
        </Space>
      }
    >
      <div className={styles["workbench-card-body-wrapper"]}>
        <InboxList
          inboxItems={inboxItems}
          inboxFilter={inboxFilter}
          inboxSummary={inboxSummary}
          inboxDraft={inboxDraft}
          clarifyingIds={clarifyingIds}
          isSyncingEmail={isSyncingEmail}
          priorityItems={priorityItems}
          onOpenExecution={onOpenExecution}
          onIgnorePriorityItem={onIgnorePriorityItem}
          onIgnoreAllPriorityItems={onIgnoreAllPriorityItems}
          onViewAllExecutions={onViewAllExecutions}
          onLaunchAiAssistant={onLaunchAiAssistant}
          getExecutionDisplayDescription={getExecutionDisplayDescription}
          getExecutionDisplayTime={getExecutionDisplayTime}
          getSkillDisplayName={getSkillDisplayName}
          onFilterChange={setInboxFilter}
          onDraftChange={setInboxDraft}
          onQuickIngest={handleQuickIngest}
          onSyncEmail={handleSyncEmail}
          onClarifyItem={handleClarifyItem}
          onConvertToTodo={(id) => handleConvertToTodo(id)}
          onArchiveItem={handleArchiveItem}
          onUnarchiveItem={handleUnarchiveItem}
          onDeleteItem={handleDeleteItem}
        />
      </div>
    </Card>
  );
}
