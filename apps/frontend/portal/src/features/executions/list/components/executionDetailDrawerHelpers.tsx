import { Collapse, Typography } from "antd";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ExecutionPhaseDto } from "@/api/execution";
import { renderJsonValue } from "@/features/executions/shared/json";
import { beautifyText } from "@/features/executions/detail/detailView";
import {
  extractPhaseStepImageSources,
  extractWorkflowActivitySnapshotSources,
  sortExecutionPhaseArtifactsByTime,
  sortExecutionPhaseStepsByTime,
} from "@/features/executions/shared/artifacts";
import { extractBrowserExecutionResult } from "@/features/executions/shared/browser";
import { tryParseJsonValue } from "@/features/executions/shared/common";

const { Text } = Typography;

export const detailPanelStyle = {
  marginBottom: 12,
  background: "var(--bg-card)",
  border: "1px solid var(--bg-secondary)",
  borderRadius: 14,
  boxShadow: "var(--shadow-sm)",
};

export const BROWSER_ACTIVITY_ACTIONS = new Set([
  "navigate",
  "click",
  "fill",
  "type",
  "press",
  "select",
  "hover",
  "scroll",
  "wait",
  "screenshot",
  "upload",
  "drag",
]);

export const getPhaseSteps = (phase: ExecutionPhaseDto) =>
  sortExecutionPhaseStepsByTime(phase.steps || []);

export const getPhaseArtifacts = (phase: ExecutionPhaseDto) =>
  sortExecutionPhaseArtifactsByTime(phase.artifacts || []);

export const isBrowserWorkflowActivity = (phase: ExecutionPhaseDto): boolean => {
  const phaseType = typeof phase.phaseType === "string" ? phase.phaseType.trim().toLowerCase() : "";
  if (
    phaseType === "browser" ||
    phaseType === "browser_recording" ||
    phaseType === "browser_step"
  ) {
    return true;
  }
  if (phase.phaseType !== "workflow_activity") {
    return false;
  }

  if (extractWorkflowActivitySnapshotSources(phase).length > 0) {
    return true;
  }

  if (extractBrowserExecutionResult(phase.output)) {
    return true;
  }

  return getPhaseSteps(phase).some((step) => {
    if (step.snapshotId) {
      return true;
    }

    if (extractPhaseStepImageSources(step, getPhaseArtifacts(phase)).length > 0) {
      return true;
    }

    const action = step.action?.trim().toLowerCase();
    return Boolean(action && BROWSER_ACTIVITY_ACTIONS.has(action));
  });
};

export const getPhaseLoopIteration = (phase: ExecutionPhaseDto): number | undefined => {
  const phaseInput = tryParseJsonValue(phase.input);
  const loopIteration =
    phaseInput && typeof phaseInput === "object" && !Array.isArray(phaseInput)
      ? (phaseInput as Record<string, unknown>).loopIteration
      : undefined;

  if (typeof loopIteration === "number" && Number.isInteger(loopIteration) && loopIteration > 0) {
    return loopIteration;
  }
  if (typeof loopIteration === "string" && loopIteration.trim()) {
    const parsed = Number(loopIteration);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
};

export const formatPhaseDisplayName = (phase: ExecutionPhaseDto, fallbackIndex?: number): string => {
  const baseName = phase.phaseName || phase.phaseKey || `步骤 ${fallbackIndex ?? 0}`;
  const loopIteration = getPhaseLoopIteration(phase);
  return loopIteration ? `${baseName} · 第 ${loopIteration} 轮` : baseName;
};

export const renderExecutionPayloadContent = (
  value: unknown,
  options?: {
    emptyText?: string;
    treatSingleResultFieldAsMarkdown?: boolean;
  }
) => {
  const parsedValue = tryParseJsonValue(value);
  const emptyText = options?.emptyText || "暂无内容。";

  if (parsedValue === undefined || parsedValue === null || parsedValue === "") {
    return <Text type="secondary">{emptyText}</Text>;
  }

  if (typeof parsedValue === "string") {
    return (
      <div
        className="chat-message-markdown"
        style={{
          background: "var(--bg-secondary)",
          color: "var(--text-primary)",
          border: "1px solid var(--bg-secondary)",
          padding: 12,
          borderRadius: 8,
          lineHeight: "1.6",
        }}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{beautifyText(parsedValue)}</ReactMarkdown>
      </div>
    );
  }

  const resultRecord =
    parsedValue && typeof parsedValue === "object" && !Array.isArray(parsedValue)
      ? (parsedValue as Record<string, unknown>)
      : undefined;
  const resultText = typeof resultRecord?.result === "string" ? resultRecord.result : undefined;
  const onlyHasResultField =
    options?.treatSingleResultFieldAsMarkdown && resultRecord
      ? Object.keys(resultRecord).length === 1 &&
        Object.prototype.hasOwnProperty.call(resultRecord, "result")
      : false;

  if (resultText && onlyHasResultField) {
    return (
      <div
        className="chat-message-markdown"
        style={{
          background: "var(--bg-secondary)",
          color: "var(--text-primary)",
          border: "1px solid var(--bg-secondary)",
          padding: 12,
          borderRadius: 8,
          lineHeight: "1.6",
        }}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{beautifyText(resultText)}</ReactMarkdown>
      </div>
    );
  }

  return (
    <Collapse
      ghost
      size="small"
      defaultActiveKey={[]}
      items={[
        {
          key: "raw-payload",
          label: (
            <Text type="secondary" style={{ fontSize: 13 }}>
              查看原始数据 / 上游输入
            </Text>
          ),
          children: (
            <pre
              style={{
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
                border: "1px solid var(--bg-secondary)",
                padding: 12,
                borderRadius: 8,
                overflow: "auto",
                margin: 0,
                lineHeight: "1.6",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {renderJsonValue(parsedValue)}
            </pre>
          ),
        },
      ]}
    />
  );
};

export const renderPanelLabel = (title: string, summary?: string) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      width: "100%",
    }}
  >
    <Text strong>{title}</Text>
    {summary ? <Text type="secondary">{summary}</Text> : null}
  </div>
);

export type ResumeFormValue =
  | string
  | number
  | boolean
  | Record<string, unknown>
  | unknown[]
  | null
  | undefined;

export type ResumeFormValues = Record<string, ResumeFormValue>;

export const toResumeFormValue = (value: unknown): ResumeFormValue => {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    Array.isArray(value)
  ) {
    return value;
  }

  if (typeof value === "object") {
    return value as Record<string, unknown>;
  }

  return undefined;
};
