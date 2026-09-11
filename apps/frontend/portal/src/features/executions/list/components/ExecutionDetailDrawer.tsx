import React, { useEffect } from "react";
import { Button, Collapse, Drawer, Empty, Form, message, Space, Spin, Tag, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import { BranchesOutlined, ExportOutlined } from "@ant-design/icons";
import { useMutation, useQueryClient } from "react-query";
import {
  executionApi,
  ExecutionPhaseDto,
} from "@/api/execution";
import LiveSessionPreviewCard from "@/components/runtime/LiveSessionPreviewCard";
import InlineRecoveryPanel from "@/features/executions/shared/InlineRecoveryPanel";
import { ExecutionTraceTab } from "../../detail/components/ExecutionTraceTab";
import { RECOVERY_COPY } from "@/features/executions/shared/recoveryOptions";
import {
  getRuntimeSessionStatusLabel,
  isPreviewRuntimeSessionState,
} from "@/features/executions/shared/runtimeSession";
import {
  normalizeRequiredInputValues,
} from "@/features/executions/create/inputFields";
import {
  buildAiResumeDraft,
} from "@/features/executions/list/listHelpers";
import {
  ResumeFormValues,
  toResumeFormValue,
} from "./executionDetailDrawerHelpers";
import { ExecutionDetailSummarySection } from "./ExecutionDetailSummarySection";
import { ExecutionDetailOutputsSection } from "./ExecutionDetailOutputsSection";
import { ExecutionDetailResumeSection } from "./ExecutionDetailResumeSection";
import { ExecutionStatusBanner } from "./ExecutionStatusBanner";
import {
  buildExecutionDetailLegacyStepsCollapseItem,
  buildExecutionDetailPhasesCollapseItem,
} from "./ExecutionDetailPhasesSection";
import { useExecutionDetailDrawerData } from "../hooks/useExecutionDetailDrawerData";
import {
  EXECUTION_STATUS_COLORS,
  EXECUTION_STATUS_LABELS_ZH,
} from "@/shared/lib/executionStatusMeta";

const { Text } = Typography;

interface ExecutionDetailDrawerProps {
  open: boolean;
  executionId?: string;
  onClose: () => void;
  skillNameMap: Map<string, string>;
  onOpenAiTask?: (draft: string, executionId: string) => void;
}

export const ExecutionDetailDrawer: React.FC<ExecutionDetailDrawerProps> = ({
  open,
  executionId,
  onClose,
  skillNameMap,
  onOpenAiTask,
}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [resumeForm] = Form.useForm<ResumeFormValues>();

  const {
    selectedExecution,
    isDetailLoading,
    selectedSteps,
    isStepsLoading,
    displaySelectedPhases,
    currentSelectedPhase,
    currentSelectedStep,
    effectiveSelectedResultJson,
    isSelectedBrowserExecution,
    isSelectedExecutionActive,
    shouldShowLegacySteps,
    selectedRuntimeSession,
    stableSelectedRuntimeSessionNovncUrl,
    selectedExecutionInput,
    selectedExecutionNormalizedResult,
    waitingInputStep,
    requiredInputs,
    requiredInputGroups,
    selectedCompletedPhaseCount,
    selectedLoopCount,
    shouldShowSelectedExecutionSummary,
    selectedCurrentPhaseIndex,
    selectedSummaryHeadline,
    selectedLoopSummary,
    shouldShowSelectedCurrentPhaseInfo,
    getSkillDisplayName,
  } = useExecutionDetailDrawerData({
    open,
    executionId,
    skillNameMap,
  });

  useEffect(() => {
    if (requiredInputs.length === 0) {
      resumeForm.resetFields();
      return;
    }

    resumeForm.setFieldsValue(
      requiredInputs.reduce<ResumeFormValues>((acc, field) => {
        acc[field.name] = toResumeFormValue(field.value);
        return acc;
      }, {} as ResumeFormValues)
    );
  }, [requiredInputs, resumeForm, executionId]);

  const submitInputMutation = useMutation(
    async ({ payload }: { payload: Record<string, unknown> }) => {
      if (!executionId || !waitingInputStep) {
        throw new Error("当前执行不处于待补参状态");
      }

      return executionApi.submitInput(executionId, {
        stepId: waitingInputStep.id,
        input: payload,
      });
    },
    {
      onSuccess: async () => {
        void message.success("已补充输入，执行继续进行中");
        await Promise.all([
          queryClient.invalidateQueries(["executions"]),
          queryClient.invalidateQueries(["execution", executionId]),
          queryClient.invalidateQueries(["execution-steps", executionId]),
          queryClient.invalidateQueries(["dashboard-executions-recent"]),
        ]);
      },
      onError: (error: Error) => {
        void message.error(`${RECOVERY_COPY.resumeErrorPrefix}：${error.message}`);
      },
    }
  );

  const phaseTakeoverMutation = useMutation(
    async (phase: ExecutionPhaseDto) => {
      if (!executionId) {
        throw new Error("未选择执行记录");
      }
      return executionApi.takeoverPhase(executionId, phase.phaseKey, {
        reason:
          phase.errorMessage ||
          phase.errorCode ||
          phase.phaseName ||
          phase.phaseKey,
      });
    },
    {
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries(["executions"]),
          queryClient.invalidateQueries(["execution", executionId]),
          queryClient.invalidateQueries(["execution-steps", executionId]),
        ]);
        void message.success(RECOVERY_COPY.successTakeover);
      },
      onError: (error: Error) => {
        void message.error(`${RECOVERY_COPY.takeoverErrorPrefix}：${error.message}`);
      },
    }
  );

  const handleResumeExecution = async (openInAi: boolean) => {
    if (!selectedExecution || !waitingInputStep) {
      return;
    }

    try {
      const values = await resumeForm.validateFields();
      const payload = normalizeRequiredInputValues(values, requiredInputs, {
        treatArrayAsJson: true,
      });

      if (openInAi) {
        if (onOpenAiTask) {
          onOpenAiTask(
            buildAiResumeDraft(selectedExecution, payload),
            selectedExecution.id
          );
        }
        void message.success("已切换到 AI 任务模式，待你发送后再继续处理");
        return;
      }

      submitInputMutation.mutate({ payload });
    } catch (error) {
      if (error instanceof Error) {
        void message.error(error.message);
      }
    }
  };

  const skillTitle = selectedExecution
    ? getSkillDisplayName(selectedExecution.skillId)
    : "任务执行详情";

  return (
    <Drawer
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Text strong style={{ fontSize: 16 }}>{skillTitle}</Text>
          {selectedExecution && (
            <Tag color={EXECUTION_STATUS_COLORS[selectedExecution.status] || "default"}>
              {EXECUTION_STATUS_LABELS_ZH[selectedExecution.status] || selectedExecution.status}
            </Tag>
          )}
        </div>
      }
      extra={
        selectedExecution ? (
          <Space>
            <Button
              size="small"
              icon={<BranchesOutlined />}
              onClick={() => {
                onClose();
                navigate(`/executions/${selectedExecution.id}?tab=trace`);
              }}
            >
              链路视图
            </Button>
            <Button
              size="small"
              type="primary"
              ghost
              icon={<ExportOutlined />}
              onClick={() => {
                onClose();
                navigate(`/executions/${selectedExecution.id}`);
              }}
            >
              完整详情页
            </Button>
          </Space>
        ) : null
      }
      placement="right"
      width={760}
      open={open}
      onClose={onClose}
      styles={{ body: { background: "var(--bg-primary)", padding: "20px 24px" } }}
    >
      {isDetailLoading ? (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "48px 0",
          }}
        >
          <Spin size="large" tip="加载执行现场与步骤流..." />
        </div>
      ) : selectedExecution ? (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          {/* 1. 顶部高优先级状态与排障 Banner */}
          <ExecutionStatusBanner
            execution={selectedExecution}
            skillDisplayName={skillTitle}
            currentStep={currentSelectedStep}
            onOpenAiTask={onOpenAiTask}
            requiredInputCount={requiredInputs.length}
          />

          {/* 2. 待补参优先置顶表单：若任务挂起等待入参，立即置顶呈现 */}
          {selectedExecution.status === "waiting_input" && waitingInputStep && (
            <div
              style={{
                borderRadius: 12,
                border: "1px solid rgba(250, 140, 22, 0.4)",
                background: "var(--bg-card)",
                padding: "16px 20px",
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
              }}
            >
              <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Text strong style={{ fontSize: 14, color: "#fa8c16" }}>
                  立即补充必要运行参数（共 {requiredInputs.length} 项）
                </Text>
              </div>
              <ExecutionDetailResumeSection
                execution={selectedExecution}
                waitingInputStep={waitingInputStep}
                requiredInputs={requiredInputs}
                requiredInputGroups={requiredInputGroups}
                resumeForm={resumeForm}
                submitInputMutation={submitInputMutation}
                handleResumeExecution={handleResumeExecution}
              />
            </div>
          )}

          {/* 3. 实时浏览器画面预览（若为浏览器执行） */}
          {isSelectedBrowserExecution &&
          stableSelectedRuntimeSessionNovncUrl &&
          (isSelectedExecutionActive ||
            isPreviewRuntimeSessionState(selectedRuntimeSession?.state)) ? (
            <LiveSessionPreviewCard
              novncUrl={stableSelectedRuntimeSessionNovncUrl}
              title="实时画面预览"
              statusLabel={getRuntimeSessionStatusLabel(
                selectedRuntimeSession?.state
              )}
              height={360}
            />
          ) : null}

          {/* 4. 基本信息卡片（默认展开，展示 ID、耗时、触发源） */}
          <ExecutionDetailSummarySection
            execution={selectedExecution}
            skillDisplayName={skillTitle}
            isSelectedBrowserExecution={isSelectedBrowserExecution}
            selectedExecutionInput={selectedExecutionInput}
            selectedExecutionNormalizedResult={selectedExecutionNormalizedResult}
            effectiveSelectedResultJson={effectiveSelectedResultJson}
          />

          {/* 4.5 链路追踪与全生命周期耗时瀑布流 */}
          <ExecutionTraceTab
            execution={selectedExecution}
            steps={selectedSteps}
          />

          {/* 5. 步骤执行流与现场输出 */}
          <ExecutionDetailOutputsSection
            execution={selectedExecution}
            isSelectedBrowserExecution={isSelectedBrowserExecution}
            selectedSteps={selectedSteps}
            displaySelectedPhases={displaySelectedPhases}
            currentSelectedPhase={currentSelectedPhase}
            currentSelectedStep={currentSelectedStep}
            shouldShowSelectedExecutionSummary={shouldShowSelectedExecutionSummary}
            selectedCurrentPhaseIndex={selectedCurrentPhaseIndex}
            selectedCompletedPhaseCount={selectedCompletedPhaseCount}
            selectedLoopCount={selectedLoopCount}
            shouldShowSelectedCurrentPhaseInfo={shouldShowSelectedCurrentPhaseInfo}
            selectedSummaryHeadline={selectedSummaryHeadline}
            selectedLoopSummary={selectedLoopSummary}
          />

          {/* 6. 内联自愈恢复面板 */}
          <InlineRecoveryPanel
            executionId={selectedExecution.id}
            executionStatus={selectedExecution.status}
            currentStepId={selectedExecution.currentStepId}
            phase={currentSelectedPhase}
          />

          {/* 7. 浏览器多阶段 / 历史步骤折叠区 */}
          {isSelectedBrowserExecution ? (
            <Collapse
              ghost
              expandIconPosition="end"
              items={[
                buildExecutionDetailPhasesCollapseItem({
                  execution: selectedExecution,
                  displaySelectedPhases,
                  phaseTakeoverMutation,
                }),
                ...(!displaySelectedPhases.length && shouldShowLegacySteps
                  ? [
                      buildExecutionDetailLegacyStepsCollapseItem({
                        selectedSteps,
                        isStepsLoading,
                      }),
                    ]
                  : []),
              ]}
            />
          ) : null}
        </Space>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="未找到该执行记录"
        />
      )}
    </Drawer>
  );
};

export default ExecutionDetailDrawer;
