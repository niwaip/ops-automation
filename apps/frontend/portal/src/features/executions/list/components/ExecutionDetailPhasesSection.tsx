import {
  Alert,
  Button,
  Card,
  Collapse,
  Empty,
  Image,
  Space,
  Spin,
  Tag,
  Timeline,
  Typography,
} from "antd";
import {
  ExecutionDto,
  ExecutionPhaseDto,
  ExecutionStepDto,
} from "@/api/execution";
import { formatDateTime, getStepStatusColor, summarizeSteps } from "@/features/executions/list/listView";
import { getPhaseStatusColor } from "@/features/executions/shared/phase";
import {
  extractPhaseStepImageSources,
  extractPhaseStepUrl,
  extractWorkflowActivitySnapshotSources,
} from "@/features/executions/shared/artifacts";
import { StepOutputViewer } from "@/features/executions/shared/StepOutputViewer";
import { tryParseJsonValue } from "@/features/executions/shared/common";
import {
  detailPanelStyle,
  formatPhaseDisplayName,
  getPhaseArtifacts,
  getPhaseSteps,
  isBrowserWorkflowActivity,
  renderPanelLabel,
} from "./executionDetailDrawerHelpers";
import { UseMutationResult } from "react-query";

const { Text } = Typography;

export const buildExecutionDetailPhasesCollapseItem = ({
  execution,
  displaySelectedPhases,
  phaseTakeoverMutation,
}: {
  execution: ExecutionDto;
  displaySelectedPhases: ExecutionPhaseDto[];
  phaseTakeoverMutation: UseMutationResult<unknown, Error, ExecutionPhaseDto, unknown>;
}) => {
  return {
    key: "phases",
    label: renderPanelLabel(
      "阶段",
      displaySelectedPhases.length > 0
        ? `${displaySelectedPhases.length} 个阶段 / ${execution.currentPhaseKey || "已归档"}`
        : "暂无阶段记录"
    ),
    style: detailPanelStyle,
    children:
      displaySelectedPhases.length > 0 ? (
        <Collapse
          ghost
          expandIconPosition="end"
          items={displaySelectedPhases.map((phase: ExecutionPhaseDto) => {
            const phaseSteps = getPhaseSteps(phase);
            const phaseArtifacts = getPhaseArtifacts(phase);
            const isBrowserActivityPhase = isBrowserWorkflowActivity(phase);
            const phaseOutput = tryParseJsonValue(phase.output);
            const phaseOutputRecord =
              phaseOutput &&
              typeof phaseOutput === "object" &&
              !Array.isArray(phaseOutput)
                ? (phaseOutput as Record<string, unknown>)
                : undefined;

            return {
              key: phase.id,
              label: renderPanelLabel(
                formatPhaseDisplayName(phase),
                `${phase.status} / ${formatDateTime(phase.startedAt || phase.createdAt)}`
              ),
              style: {
                ...detailPanelStyle,
                marginBottom: 12,
              },
              children: (
                <Space
                  direction="vertical"
                  size={12}
                  style={{ width: "100%" }}
                >
                  <Space wrap size={[8, 4]}>
                    <Tag>{phase.phaseType}</Tag>
                    <Tag color={getPhaseStatusColor(phase.status)}>
                      {phase.status}
                    </Tag>
                    <Text type="secondary">{`Key: ${phase.phaseKey}`}</Text>
                    <Text type="secondary">{`尝试: ${phase.attempt}`}</Text>
                    {isBrowserActivityPhase && phase.runtimeSessionId ? (
                      <Text
                        copyable={{ text: phase.runtimeSessionId }}
                      >{`会话: ${phase.runtimeSessionId}`}</Text>
                    ) : null}
                  </Space>
                  <Space wrap>
                    {execution.status !== "human_control" &&
                    (phase.status === "running" ||
                      phase.status === "failed") ? (
                      <Button
                        size="small"
                        onClick={() => phaseTakeoverMutation.mutate(phase)}
                        loading={phaseTakeoverMutation.isLoading}
                      >
                        接管当前阶段
                      </Button>
                    ) : null}
                  </Space>
                  {phase.errorMessage ? (
                    <Alert
                      type="error"
                      showIcon
                      message={phase.errorCode || "阶段失败"}
                      description={phase.errorMessage}
                    />
                  ) : null}
                  {phaseOutputRecord ? (
                    <StepOutputViewer
                      outputJson={phaseOutputRecord}
                      defaultExpanded
                      showVisualEvidence={false}
                    />
                  ) : null}
                  {extractWorkflowActivitySnapshotSources(phase).length > 0 ? (
                    <Card
                      size="small"
                      title="截图画面"
                      styles={{ body: { padding: 12 } }}
                    >
                      <Space
                        direction="vertical"
                        size={10}
                        style={{ width: "100%" }}
                      >
                        <Space wrap size={[12, 4]}>
                          <Text type="secondary">{`步骤数: ${phaseSteps.length}`}</Text>
                          <Text type="secondary">{`截图: ${extractWorkflowActivitySnapshotSources(phase).length}`}</Text>
                        </Space>
                        <Image.PreviewGroup>
                          <Space wrap size={12}>
                            {extractWorkflowActivitySnapshotSources(
                              phase
                            ).map((src, index) => (
                              <Image
                                key={`${phase.id}-snapshot-${index + 1}`}
                                src={src}
                                alt={`${phase.phaseName || phase.phaseKey}-snapshot-${index + 1}`}
                                style={{
                                  width: 320,
                                  maxWidth: "100%",
                                  maxHeight: 320,
                                  objectFit: "contain",
                                  background: "var(--bg-secondary)",
                                  borderRadius: 8,
                                  border:
                                    "1px solid var(--bg-secondary)",
                                  padding: 6,
                                }}
                              />
                            ))}
                          </Space>
                        </Image.PreviewGroup>
                      </Space>
                    </Card>
                  ) : null}

                  {phaseSteps.length > 0 ? (
                    <Timeline
                      items={phaseSteps.map((step) => {
                        const stepUrl = extractPhaseStepUrl(step);
                        const stepImageSources =
                          extractPhaseStepImageSources(step, phaseArtifacts);
                        const isWaitStep = step.action === "wait";
                        const isNavigateStep = step.action === "navigate";
                        const isScreenshotStep =
                          step.action === "screenshot";

                        return {
                          color: getPhaseStatusColor(step.status),
                          children: isWaitStep ? (
                            <Space
                              wrap
                              style={{
                                width: "100%",
                                justifyContent: "space-between",
                              }}
                            >
                              <Space wrap>
                                <Text strong>等待</Text>
                                <Tag color={getPhaseStatusColor(step.status)}>
                                  {step.status}
                                </Tag>
                              </Space>
                              <Text type="secondary">
                                {formatDateTime(
                                  step.startedAt || step.createdAt
                                )}
                              </Text>
                            </Space>
                          ) : (
                            <Card size="small">
                              <Space
                                direction="vertical"
                                size={10}
                                style={{ width: "100%" }}
                              >
                                <Space
                                  wrap
                                  style={{
                                    width: "100%",
                                    justifyContent: "space-between",
                                  }}
                                >
                                  <Space wrap>
                                    <Text strong>
                                      {isNavigateStep
                                        ? "打开页面"
                                        : isScreenshotStep
                                          ? "截图"
                                          : step.action ||
                                            `步骤 ${step.stepIndex + 1}`}
                                    </Text>
                                    <Tag
                                      color={getPhaseStatusColor(
                                        step.status
                                      )}
                                    >
                                      {step.status}
                                    </Tag>
                                  </Space>
                                  <Text type="secondary">
                                    {formatDateTime(
                                      step.startedAt || step.createdAt
                                    )}
                                  </Text>
                                </Space>
                                {isNavigateStep ? (
                                  <Text
                                    copyable={
                                      stepUrl
                                        ? { text: stepUrl }
                                        : undefined
                                    }
                                  >
                                    {stepUrl || "-"}
                                  </Text>
                                ) : null}
                                {step.errorMessage ? (
                                  <Alert
                                    type="error"
                                    showIcon
                                    message="步骤执行失败"
                                    description={step.errorMessage}
                                  />
                                ) : null}
                                {stepImageSources.length > 0 ? (
                                  <Image.PreviewGroup>
                                    <Space wrap size={12}>
                                      {stepImageSources.map(
                                        (src, index) => (
                                          <Image
                                            key={`${src}-${index}`}
                                            src={src}
                                            alt={`${phase.phaseName || phase.phaseKey}-step-${index + 1}`}
                                            style={{
                                              width: 320,
                                              maxWidth: "100%",
                                              maxHeight: 320,
                                              objectFit: "contain",
                                              background:
                                                "var(--bg-secondary)",
                                              borderRadius: 8,
                                              border:
                                                "1px solid var(--bg-secondary)",
                                              padding: 6,
                                            }}
                                          />
                                        )
                                      )}
                                    </Space>
                                  </Image.PreviewGroup>
                                ) : null}
                              </Space>
                            </Card>
                          ),
                        };
                      })}
                    />
                  ) : null}
                </Space>
              ),
            };
          })}
        />
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无阶段记录"
        />
      ),
  };
};

export const buildExecutionDetailLegacyStepsCollapseItem = ({
  selectedSteps,
  isStepsLoading,
}: {
  selectedSteps?: ExecutionStepDto[];
  isStepsLoading: boolean;
}) => {
  return {
    key: "steps",
    label: renderPanelLabel(
      "步骤",
      summarizeSteps(selectedSteps, isStepsLoading)
    ),
    style: { ...detailPanelStyle, marginBottom: 0 },
    children: isStepsLoading ? (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          padding: "24px 0",
        }}
      >
        <Spin />
      </div>
    ) : selectedSteps && selectedSteps.length > 0 ? (
      <Timeline
        items={selectedSteps.map((step) => ({
          color: getStepStatusColor(step.status),
          children: (
            <Card
              size="small"
              style={{
                borderRadius: 12,
                border: "1px solid var(--bg-secondary)",
                background: "var(--bg-card)",
              }}
            >
              <Space direction="vertical" size={8} style={{ width: "100%" }}>
                <Space
                  style={{ width: "100%", justifyContent: "space-between" }}
                  wrap
                >
                  <Space wrap>
                    <Text strong>{`步骤 ${step.stepIndex + 1}`}</Text>
                    <Text>
                      {step.name || step.action || step.type || "-"}
                    </Text>
                  </Space>
                  <Tag color={getStepStatusColor(step.status)}>
                    {step.status}
                  </Tag>
                </Space>
                <Space wrap size={[8, 4]}>
                  <Text type="secondary">{`类型: ${step.type}`}</Text>
                  {step.action ? (
                    <Text type="secondary">{`动作: ${step.action}`}</Text>
                  ) : null}
                </Space>
                <Space direction="vertical" size={2}>
                  <Text type="secondary">{`开始: ${formatDateTime(step.startedAt || step.createdAt)}`}</Text>
                  <Text type="secondary">{`结束: ${formatDateTime(step.endedAt || undefined)}`}</Text>
                </Space>
                {step.errorMessage ? (
                  <Alert
                    type="error"
                    showIcon
                    message="步骤执行失败"
                    description={step.errorMessage}
                  />
                ) : null}
                {step.outputJson &&
                Object.keys(step.outputJson).length > 0 ? (
                  <Text type="secondary">{`输出字段: ${Object.keys(step.outputJson).slice(0, 4).join("、")}`}</Text>
                ) : null}
              </Space>
            </Card>
          ),
        }))}
      />
    ) : (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无步骤" />
    ),
  };
};
