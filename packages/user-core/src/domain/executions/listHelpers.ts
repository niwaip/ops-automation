import type { ExecutionDto } from "../../types/execution.types.js";
import { asRecord } from "./common.js";
import { resolveExecutionNormalizedResult } from "./result.js";

const INPUT_TEXT_CANDIDATE_KEYS = ["user_input", "prompt", "task", "goal", "instruction", "query", "url"] as const;
const HIDDEN_INPUT_KEYS = new Set(["promptDebug"]);

const summarizeText = (value?: string, maxLength = 64) => {
  if (!value) {
    return "";
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
};

const extractInputText = (value?: Record<string, unknown>): string | undefined => {
  if (!value) {
    return undefined;
  }

  for (const key of INPUT_TEXT_CANDIDATE_KEYS) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return undefined;
};

const summarizeInputShape = (value?: Record<string, unknown>) => {
  if (!value || Object.keys(value).length === 0) {
    return "";
  }

  const keys = Object.keys(value).filter((key) => !key.startsWith("__") && !HIDDEN_INPUT_KEYS.has(key));
  if (keys.length === 0) {
    return "";
  }

  const preview = keys.slice(0, 3).join("、");
  return keys.length > 3 ? `${preview} 等 ${keys.length} 项` : preview;
};

export const extractExecutionDisplayInput = (record: ExecutionDto): Record<string, unknown> | undefined => {
  const normalizedInput = asRecord(record.normalizedInput);
  const normalizedUserInput = asRecord(normalizedInput?.input);
  const rawInput = asRecord(record.input);
  const source = normalizedUserInput && Object.keys(normalizedUserInput).length > 0
    ? normalizedUserInput
    : rawInput;

  if (!source) {
    return undefined;
  }

  const filteredEntries = Object.entries(source).filter(([key, value]) => {
    if (!key || key.startsWith("__") || HIDDEN_INPUT_KEYS.has(key)) {
      return false;
    }
    return value !== undefined;
  });

  return filteredEntries.length > 0
    ? Object.fromEntries(filteredEntries)
    : undefined;
};

export const summarizeExecutionListInput = (record: ExecutionDto) => {
  const visibleInput = extractExecutionDisplayInput(record);
  const normalizedInput = asRecord(record.normalizedInput);

  const summary = summarizeText(
    extractInputText(visibleInput)
      || extractInputText(asRecord(record.input))
      || (typeof normalizedInput?.objective === "string" ? normalizedInput.objective : undefined),
    72,
  );

  if (summary) {
    return summary;
  }

  return (
    summarizeInputShape(visibleInput)
    || summarizeInputShape(asRecord(record.input))
    || "暂无输入"
  );
};

export const summarizeExecutionListResult = (record: ExecutionDto) => {
  const normalizedResult = resolveExecutionNormalizedResult(record);
  const summary = summarizeText(
    normalizedResult?.detailText
      || normalizedResult?.summary
      || normalizedResult?.body
      || normalizedResult?.title,
    72,
  );

  if (summary) {
    return summary;
  }

  if (normalizedResult?.artifacts.length) {
    return normalizedResult.artifacts[0]?.label || normalizedResult.artifacts[0]?.name || "已生成结果产物";
  }

  return "暂无结果";
};

export const extractDownloadUrl = (result: unknown): string | undefined => {
  const resultRecord = asRecord(result);
  if (!resultRecord) {
    return undefined;
  }

  if (typeof resultRecord.downloadUrl === "string" && resultRecord.downloadUrl.trim()) {
    return resultRecord.downloadUrl;
  }

  const rawDownloadUrl = asRecord(resultRecord.raw)?.downloadUrl;
  if (typeof rawDownloadUrl === "string" && rawDownloadUrl.trim()) {
    return rawDownloadUrl;
  }

  return extractDownloadUrl(resultRecord.result);
};

export const extractExecutionDownloadUrl = (record: ExecutionDto): string | undefined => {
  const normalizedResult = resolveExecutionNormalizedResult(record);
  if (normalizedResult?.downloadUrl) {
    return normalizedResult.downloadUrl;
  }

  return extractDownloadUrl(record.resultJson || record.result || undefined);
};

export const buildAiResumeDraft = (
  execution: ExecutionDto,
  submittedInput?: Record<string, unknown>,
) => {
  const originalContent = summarizeExecutionListInput(execution);

  const supplement = submittedInput && Object.keys(submittedInput).length > 0
    ? JSON.stringify(submittedInput, null, 2)
    : "无";

  return [
    `请继续处理这个任务，executionId=${execution.id}。`,
    "",
    "任务 ID：",
    String(originalContent),
    "",
    "我刚补充的输入参数：",
    supplement,
    "",
    "请回到任务模式继续跟进，并基于当前执行状态给出下一步处理。",
  ].join("\n");
};
