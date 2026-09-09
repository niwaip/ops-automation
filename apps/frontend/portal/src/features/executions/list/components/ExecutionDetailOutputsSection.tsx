import React from "react";
import {
  Card,
  Collapse,
  Space,
  Tag,
  Typography,
  Alert,
  Steps,
  Descriptions,
} from "antd";
import {
  ExecutionDto,
  ExecutionPhaseDto,
  ExecutionStepDto,
} from "@/api/execution";
import {
  EXECUTION_STATUS_COLORS,
  EXECUTION_STATUS_LABELS_ZH,
} from "@/shared/lib/executionStatusMeta";
import {
  formatDateTime,
  getStepStatusColor,
} from "@/features/executions/list/listView";
import {
  getPhaseStatusColor,
  getPhaseStepStatus,
} from "@/features/executions/shared/phase";
import { StepOutputViewer } from "@/features/executions/shared/StepOutputViewer";
import { ExpandableMarkdownContent } from "@/features/executions/shared/components/ExpandableMarkdownContent";
import { formatPhaseDisplayName } from "./executionDetailDrawerHelpers";
import { buildExecutionLoopSummary } from "@/features/executions/shared/executionSummary";

const { Text } = Typography;
const statusColors = EXECUTION_STATUS_COLORS;
const statusLabels = EXECUTION_STATUS_LABELS_ZH;

interface ExecutionDetailOutputsSectionProps {
  execution: ExecutionDto;
  isSelectedBrowserExecution: boolean;
  selectedSteps?: ExecutionStepDto[];
  displaySelectedPhases: ExecutionPhaseDto[];
  currentSelectedPhase?: ExecutionPhaseDto;
  currentSelectedStep?: ExecutionStepDto;
  shouldShowSelectedExecutionSummary: boolean | undefined;
  selectedCurrentPhaseIndex: number;
  selectedCompletedPhaseCount: number;
  selectedLoopCount: number;
  shouldShowSelectedCurrentPhaseInfo: boolean;
  selectedSummaryHeadline?: string;
  selectedLoopSummary?: ReturnType<typeof buildExecutionLoopSummary>;
}

export const ExecutionDetailOutputsSection: React.FC<ExecutionDetailOutputsSectionProps> = ({
  execution,
  isSelectedBrowserExecution,
  selectedSteps,
  displaySelectedPhases,
  currentSelectedPhase,
  currentSelectedStep,
  shouldShowSelectedExecutionSummary,
  selectedCurrentPhaseIndex,
  selectedCompletedPhaseCount,
  selectedLoopCount,
  shouldShowSelectedCurrentPhaseInfo,
  selectedSummaryHeadline,
  selectedLoopSummary,
}) => {
  return (
    <>
      {/* 中间步骤结果 - 默认收起 */}
      {!isSelectedBrowserExecution &&
      selectedSteps &&
      selectedSteps.length > 0 ? (
        <Collapse
          ghost
          size="small"
          defaultActiveKey={["step-outputs"]}
          style={{ marginTop: 0 }}
          items={[
            {
              key: "step-outputs",
              label: (
                <Text strong style={{ fontSize: 13 }}>
                  {`中间步骤结果（${selectedSteps.length} 步）`}
                </Text>
              ),
              children: (
                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                  {[...selectedSteps]
                    .sort((a, b) => a.stepIndex - b.stepIndex)
                    .map((step) => {
                      const hasOutput =
                        step.outputJson &&
                        Object.keys(step.outputJson).length > 0;
                      return (
                        <Card
                          key={step.id}
                          size="small"
                          style={{
                            borderRadius: 8,
                            border: "1px solid var(--bg-secondary)",
                            background: "var(--bg-card)",
                          }}
                        >
                          {/* 步骤头：序号 名称 状态 */}
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              flexWrap: "wrap",
                              gap: 8,
                              marginBottom: 6,
                            }}
                          >
                            <Space size={6} wrap>
                              <Text strong style={{ fontSize: 12 }}>
                                {`步骤 ${step.stepIndex + 1}`}
                              </Text>
                              <Text style={{ fontSize: 12 }}>
                                {step.name || step.action || step.type}
                              </Text>
                              {step.action && step.action !== step.name ? (
                                <Text
                                  type="secondary"
                                  style={{ fontSize: 11 }}
                                >
                                  [{step.action}]
                                </Text>
                              ) : null}
                            </Space>
                            <Tag
                              color={getStepStatusColor(step.status)}
                              style={{ fontSize: 11, marginInlineEnd: 0 }}
                            >
                              {step.status}
                            </Tag>
                          </div>

                          {/* 时间 */}
                          <Text
                            type="secondary"
                            style={{
                              fontSize: 11,
                              display: "block",
                              marginBottom: hasOutput ? 8 : 0,
                            }}
                          >
                            {`${step.startedAt ? new Date(step.startedAt).toLocaleString() : "-"} → ${step.endedAt ? new Date(step.endedAt).toLocaleString() : "-"}`}
                          </Text>

                          {/* 错误 */}
                          {step.errorMessage ? (
                            <Alert
                              type="error"
                              showIcon
                              message={step.errorMessage}
                              style={{ marginBottom: 8, fontSize: 12 }}
                            />
                          ) : null}

                          {/* 步骤输出：优先展示截图、正文与动作 */}
                          {hasOutput ? (
                            <StepOutputViewer
                              outputJson={step.outputJson}
                              stepName={step.name}
                              stepAction={step.action}
                            />
                          ) : null}
                        </Card>
                      );
                    })}
                </Space>
              ),
            },
          ]}
        />
      ) : null}

      {isSelectedBrowserExecution && displaySelectedPhases.length > 0 ? (
        <Card title="步骤进度">
          {!shouldShowSelectedExecutionSummary ? (
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <Card size="small" title="当前步骤">
                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                  <Space wrap size={[8, 8]}>
                    <Tag color={statusColors[execution.status]}>
                      {statusLabels[execution.status]}
                    </Tag>
                    {currentSelectedPhase ? (
                      <Tag color="processing">
                        {formatPhaseDisplayName(
                          currentSelectedPhase,
                          selectedCurrentPhaseIndex + 1
                        )}
                      </Tag>
                    ) : null}
                    {currentSelectedStep ? (
                      <Tag>{`步骤 ${currentSelectedStep.stepIndex + 1}`}</Tag>
                    ) : null}
                  </Space>
                  <div>
                    <Text strong style={{ fontSize: 16 }}>
                      {currentSelectedStep?.name ||
                        currentSelectedPhase?.phaseName ||
                        currentSelectedPhase?.phaseKey ||
                        "-"}
                    </Text>
                    <div style={{ marginTop: 6 }}>
                      <Text type="secondary">
                        {currentSelectedStep?.action ||
                          currentSelectedStep?.type ||
                          "展示当前正在执行的步骤。"}
                      </Text>
                    </div>
                  </div>
                  <Space wrap size={[12, 8]}>
                    <Text type="secondary">{`进度: ${selectedCurrentPhaseIndex + 1} / ${displaySelectedPhases.length}`}</Text>
                    <Text type="secondary">{`已完成: ${selectedCompletedPhaseCount}`}</Text>
                    {selectedLoopCount > 0 ? (
                      <Text type="secondary">{`轮次: ${selectedLoopCount}`}</Text>
                    ) : null}
                  </Space>
                  {shouldShowSelectedCurrentPhaseInfo && currentSelectedPhase ? (
                    <Alert
                      type={execution.status === "human_control" ? "warning" : "info"}
                      showIcon
                      message={`当前阶段：${currentSelectedPhase.phaseName || currentSelectedPhase.phaseKey}`}
                      description={
                        <Space wrap size={[12, 4]}>
                          <Text type="secondary">{`Key: ${currentSelectedPhase.phaseKey}`}</Text>
                          <Text type="secondary">
                            {formatDateTime(
                              currentSelectedPhase.startedAt || currentSelectedPhase.createdAt
                            )}
                          </Text>
                          {currentSelectedPhase.errorMessage ? (
                            <Text type="danger">{currentSelectedPhase.errorMessage}</Text>
                          ) : null}
                        </Space>
                      }
                    />
                  ) : null}
                </Space>
              </Card>
              <Steps
                current={selectedCurrentPhaseIndex}
                size="small"
                responsive
                items={displaySelectedPhases.map((phase, index) => ({
                  title: formatPhaseDisplayName(phase, index + 1),
                  status: getPhaseStepStatus(phase.status),
                  description: (
                    <Space wrap size={[8, 4]}>
                      <Tag color={getPhaseStatusColor(phase.status)}>{phase.status}</Tag>
                      {currentSelectedPhase?.id === phase.id ? (
                        <Tag color="processing">当前 Activity</Tag>
                      ) : null}
                    </Space>
                  ),
                }))}
              />
            </Space>
          ) : (
            <Card size="small" title="执行总结">
              <Space direction="vertical" size={12} style={{ width: "100%" }}>
                <Space wrap size={[8, 8]}>
                  <Tag color={statusColors[execution.status]}>
                    {statusLabels[execution.status]}
                  </Tag>
                  <Tag>{`总阶段数: ${displaySelectedPhases.length}`}</Tag>
                  <Tag color="green">{`已完成: ${selectedCompletedPhaseCount}`}</Tag>
                  {selectedLoopCount > 0 ? <Tag>{`轮次: ${selectedLoopCount}`}</Tag> : null}
                </Space>
                {selectedSummaryHeadline ? (
                  <div
                    style={{
                      background: "var(--bg-secondary, #fafafa)",
                      borderRadius: 8,
                      padding: "12px 14px",
                      border: "1px solid var(--border-color, #f0f0f0)",
                    }}
                  >
                    <ExpandableMarkdownContent text={selectedSummaryHeadline} />
                    <div style={{ marginTop: 8, display: "flex", gap: 12, flexWrap: "wrap" }}>
                      {execution.endedAt ? (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {`结束时间: ${formatDateTime(execution.endedAt)}`}
                        </Text>
                      ) : null}
                      {execution.failureReason ? (
                        <Text type="danger" style={{ fontSize: 12 }}>
                          {execution.failureReason}
                        </Text>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {selectedLoopSummary ? (
                  <Descriptions column={2} size="small">
                    <Descriptions.Item label="处理条数">
                      {selectedLoopSummary.totalItems}
                    </Descriptions.Item>
                    <Descriptions.Item label="人工介入">
                      {selectedLoopSummary.hasManualHandling ? "是" : "否"}
                    </Descriptions.Item>
                    <Descriptions.Item label="自动承认">
                      {`${selectedLoopSummary.autoApprovedCount} 条`}
                    </Descriptions.Item>
                    <Descriptions.Item label="人工处理">
                      {`${selectedLoopSummary.manualHandledCount} 条`}
                    </Descriptions.Item>
                  </Descriptions>
                ) : null}
              </Space>
            </Card>
          )}
        </Card>
      ) : null}
    </>
  );
};
