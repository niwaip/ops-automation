import type { ExecutionPhaseDto } from "../../types/execution.types.js";

export const getPhaseStatusColor = (status?: string) => {
  switch (status) {
    case "completed":
      return "green";
    case "running":
      return "blue";
    case "retrying":
      return "gold";
    case "waiting_takeover":
      return "orange";
    case "resumable":
      return "cyan";
    case "failed":
      return "red";
    case "aborted":
      return "default";
    default:
      return "default";
  }
};

export const getPhaseStatusLabel = (status: string | undefined, isEnglish: boolean) => {
  const labels: Record<string, string> = isEnglish
    ? {
        pending: "Pending",
        running: "Running",
        retrying: "Retrying",
        waiting_takeover: "Waiting Takeover",
        resumable: "Resumable",
        completed: "Completed",
        failed: "Failed",
        aborted: "Aborted",
      }
    : {
        pending: "待执行",
        running: "执行中",
        retrying: "重试中",
        waiting_takeover: "待接管",
        resumable: "可恢复",
        completed: "已完成",
        failed: "失败",
        aborted: "已中止",
      };

  return status ? (labels[status] || status) : "-";
};

export const getPhaseStepStatus = (status?: string): "wait" | "process" | "finish" | "error" => {
  switch (status) {
    case "completed":
      return "finish";
    case "running":
    case "retrying":
      return "process";
    case "failed":
    case "aborted":
      return "error";
    case "waiting_takeover":
    case "resumable":
    case "pending":
    default:
      return "wait";
  }
};

const extractPhaseSortMeta = (phase: ExecutionPhaseDto) => {
  const key = phase.phaseKey || "";
  const parentKey = key.split("__")[0] || key;
  const activityMatch = key.match(/__activity_(\d+)_/i);
  const systemIndexMatch = parentKey.match(/^phase_(\d+)_/i);
  return {
    parentKey,
    systemIndex: systemIndexMatch ? Number.parseInt(systemIndexMatch[1], 10) : Number.MAX_SAFE_INTEGER,
    isActivity: Boolean(activityMatch),
    activityIndex: activityMatch ? Number.parseInt(activityMatch[1], 10) : -1,
  };
};

export const compareExecutionPhases = (left: ExecutionPhaseDto, right: ExecutionPhaseDto) => {
  const leftMeta = extractPhaseSortMeta(left);
  const rightMeta = extractPhaseSortMeta(right);

  if (leftMeta.systemIndex !== rightMeta.systemIndex) {
    return leftMeta.systemIndex - rightMeta.systemIndex;
  }
  if (leftMeta.parentKey !== rightMeta.parentKey) {
    return leftMeta.parentKey.localeCompare(rightMeta.parentKey);
  }
  if (leftMeta.isActivity !== rightMeta.isActivity) {
    return leftMeta.isActivity ? 1 : -1;
  }
  if (leftMeta.activityIndex !== rightMeta.activityIndex) {
    return leftMeta.activityIndex - rightMeta.activityIndex;
  }

  const leftTime = new Date(left.startedAt || left.createdAt).getTime();
  const rightTime = new Date(right.startedAt || right.createdAt).getTime();
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  return left.phaseKey.localeCompare(right.phaseKey);
};
