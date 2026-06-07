import type { ExecutionDto, ExecutionStatus, ExecutionStepDto } from "../../types/execution.types.js";

const padNumber = (value: number): string => String(value).padStart(2, "0");

export const formatDateTime = (date?: string) => (date ? new Date(date).toLocaleString() : "-");

export const formatListDateTime = (date?: string) => {
  if (!date) {
    return "-";
  }

  const nextDate = new Date(date);
  if (Number.isNaN(nextDate.getTime())) {
    return "-";
  }

  return `${padNumber(nextDate.getMonth() + 1)}-${padNumber(nextDate.getDate())} ${padNumber(nextDate.getHours())}:${padNumber(nextDate.getMinutes())}`;
};

export const formatDuration = (record: ExecutionDto) => {
  const start = record.startedAt || record.createdAt;
  const end = record.endedAt;
  if (!start) {
    return "未开始";
  }

  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  const diff = Math.max(endTime - startTime, 0);
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m`;
  }

  const seconds = Math.max(Math.floor(diff / 1000), 1);
  return `${seconds}s`;
};

export const getStepStatusColor = (status?: string) => {
  switch (status) {
    case "succeeded":
      return "green";
    case "failed":
      return "red";
    case "running":
      return "blue";
    case "waiting_input":
      return "orange";
    case "pending_approval":
      return "gold";
    case "cancelled":
      return "gray";
    default:
      return "gray";
  }
};

export const summarizeSteps = (steps?: ExecutionStepDto[], isLoading?: boolean) => {
  if (isLoading) {
    return "加载中...";
  }

  if (!steps || steps.length === 0) {
    return "暂无步骤";
  }

  const activeStep = steps.find((step) => ["running", "waiting_input", "pending_approval"].includes(step.status));
  if (activeStep) {
    return `${steps.length} 个步骤 / ${activeStep.name || `步骤 ${activeStep.stepIndex + 1}`}`;
  }

  return `${steps.length} 个步骤`;
};

export const getRiskBadgeStyle = (riskLevel?: string) => {
  switch ((riskLevel || "").toUpperCase()) {
    case "L1":
      return { background: "rgba(245, 158, 11, 0.16)", color: "#fbbf24", border: "1px solid rgba(245, 158, 11, 0.32)" };
    case "L2":
      return { background: "rgba(239, 68, 68, 0.16)", color: "#f87171", border: "1px solid rgba(239, 68, 68, 0.32)" };
    case "L3":
      return { background: "rgba(16, 185, 129, 0.16)", color: "#34d399", border: "1px solid rgba(16, 185, 129, 0.32)" };
    default:
      return { background: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--bg-secondary)" };
  }
};

export const getExecutionRowStyle = (status: ExecutionStatus, isDarkTheme: boolean) => {
  switch (status) {
    case "failed":
      return { background: isDarkTheme ? "rgba(239, 68, 68, 0.08)" : "#fffafa" };
    case "waiting_input":
    case "pending_approval":
      return { background: isDarkTheme ? "rgba(245, 158, 11, 0.08)" : "#fffdf5" };
    case "running":
      return { background: isDarkTheme ? "rgba(59, 130, 246, 0.08)" : "#f8fbff" };
    default:
      return { background: "var(--bg-card)" };
  }
};
