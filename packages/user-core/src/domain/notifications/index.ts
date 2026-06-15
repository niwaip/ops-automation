import {
  EXECUTION_STATUS_LABELS_EN,
  EXECUTION_STATUS_LABELS_ZH,
  EXECUTION_STATUS_VALUES,
} from "../../lib/execution-status-meta.js";
import type {
  AppNotification,
  NotificationSeverity,
} from "../../types/notification.types.js";
import type { ExecutionStatus } from "../../types/execution.types.js";

export interface NotificationContent {
  title: string;
  description: string;
  actionText: string;
}

export const isExecutionStatusValue = (value?: string): value is ExecutionStatus =>
  typeof value === "string" && EXECUTION_STATUS_VALUES.includes(value as ExecutionStatus);

export const getNotificationSeverityTagColor = (
  severity: NotificationSeverity,
): "success" | "error" | "warning" | "processing" => {
  switch (severity) {
    case "success":
      return "success";
    case "error":
      return "error";
    case "warning":
      return "warning";
    default:
      return "processing";
  }
};

export const getNotificationSeverityText = (
  severity: NotificationSeverity,
  language: "zh-CN" | "en-US" | "ja-JP",
): string => {
  const isEnglish = language === "en-US";
  switch (severity) {
    case "success":
      return isEnglish ? "Completed" : "已完成";
    case "error":
      return isEnglish ? "Attention" : "需处理";
    case "warning":
      return isEnglish ? "Pending" : "待处理";
    default:
      return isEnglish ? "Info" : "通知";
  }
};

export const buildNotificationContent = (
  item: AppNotification,
  language: "zh-CN" | "en-US" | "ja-JP",
): NotificationContent => {
  const isEnglish = language === "en-US";
  const statusLabels = isEnglish ? EXECUTION_STATUS_LABELS_EN : EXECUTION_STATUS_LABELS_ZH;
  const executionId = String(item.metadata?.executionId || item.sourceId);
  const failureReason = typeof item.metadata?.failureReason === "string" ? item.metadata.failureReason : undefined;
  const takeoverReason = typeof item.metadata?.takeoverReason === "string" ? item.metadata.takeoverReason : undefined;
  const approvalStatus = typeof item.metadata?.approvalStatus === "string" ? item.metadata.approvalStatus : undefined;
  const skillId = typeof item.metadata?.skillId === "string" ? item.metadata.skillId : item.sourceName;
  const resultTitle = typeof item.metadata?.resultTitle === "string" ? item.metadata.resultTitle : undefined;
  const resultSummary = typeof item.metadata?.resultSummary === "string" ? item.metadata.resultSummary : undefined;
  const businessSummary = [resultTitle, resultSummary]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(isEnglish ? " - " : "：");

  switch (item.category) {
    case "completed":
      return {
        title: isEnglish ? "Task Completed" : "任务已完成",
        description: businessSummary
          ? (isEnglish
            ? `Execution ${executionId} completed successfully. ${businessSummary}`
            : `执行单 ${executionId} 已成功完成。${businessSummary}`)
          : (isEnglish
            ? `Execution ${executionId} completed successfully.`
            : `执行单 ${executionId} 已成功完成。`),
        actionText: isEnglish ? "View Details" : "查看详情",
      };
    case "failed":
      return {
        title: isEnglish ? "Task Failed" : "任务执行失败",
        description: failureReason
          ? (isEnglish ? failureReason : `失败原因：${failureReason}`)
          : businessSummary
            ? (isEnglish
              ? `Execution ${executionId} failed. Latest result: ${businessSummary}`
              : `执行单 ${executionId} 执行失败。最近结果：${businessSummary}`)
          : (isEnglish
            ? `Execution ${executionId} failed and needs attention.`
            : `执行单 ${executionId} 执行失败，请尽快处理。`),
        actionText: isEnglish ? "View Details" : "查看详情",
      };
    case "cancelled":
      return {
        title: isEnglish ? "Task Interrupted" : "任务已中断",
        description: isEnglish
          ? `Execution ${executionId} was cancelled.`
          : `执行单 ${executionId} 已被中断或取消。`,
        actionText: isEnglish ? "View Details" : "查看详情",
      };
    case "human_control":
      return {
        title: isEnglish ? "Manual Intervention Required" : "需要人工介入",
        description: takeoverReason
          ? (isEnglish ? takeoverReason : `介入原因：${takeoverReason}`)
          : (isEnglish
            ? `Execution ${executionId} is waiting for manual takeover.`
            : `执行单 ${executionId} 正在等待人工接管。`),
        actionText: isEnglish ? "Open Execution" : "查看详情",
      };
    case "waiting_input":
      return {
        title: isEnglish ? "Input Required" : "需要补充输入",
        description: isEnglish
          ? `Execution ${executionId} is waiting for additional input.${businessSummary ? ` Context: ${businessSummary}` : ""}`
          : `执行单 ${executionId} 正在等待补充输入。${businessSummary ? `上下文：${businessSummary}` : ""}`,
        actionText: isEnglish ? "Open Execution" : "查看详情",
      };
    case "pending_approval":
      return {
        title: isEnglish ? "Approval Required" : "需要审批处理",
        description: approvalStatus
          ? (isEnglish
            ? `Current approval status: ${approvalStatus}.`
            : `当前审批状态：${approvalStatus}`)
          : (isEnglish
            ? `Execution ${executionId} is waiting for approval.${businessSummary ? ` Context: ${businessSummary}` : ""}`
            : `执行单 ${executionId} 正在等待审批。${businessSummary ? `上下文：${businessSummary}` : ""}`),
        actionText: isEnglish ? "Open Execution" : "查看详情",
      };
    default:
      return {
        title: isExecutionStatusValue(item.status)
          ? statusLabels[item.status]
          : (isEnglish ? "Status Updated" : "状态已更新"),
        description: isEnglish
          ? `Execution ${executionId} has a status update.${skillId ? ` Skill: ${skillId}.` : ""}`
          : `执行单 ${executionId} 有新的状态变更。${skillId ? ` 技能：${skillId}。` : ""}`,
        actionText: isEnglish ? "View Details" : "查看详情",
      };
  }
};
