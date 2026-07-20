import React from 'react';
import { Button, Collapse, Drawer, Empty, Space, Spin } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import {
  buildExecutionDetailCollapseItem,
  executionDetailPanelStyle,
} from '@/features/executions/detail/components/executionDetailCollapse';
import type { ExecutionListDetailDrawerProps } from '@/features/executions/list/lib/executionListDrawerProps';
import LiveSessionPreviewCard from '@/components/runtime/LiveSessionPreviewCard';
import ExecutionBasicInfoSection from '@/features/executions/shared/components/ExecutionBasicInfoSection';
import ExecutionBrowserProgressCard from '@/features/executions/shared/components/ExecutionBrowserProgressCard';
import ExecutionInputOutputCard from '@/features/executions/shared/components/ExecutionInputOutputCard';
import ExecutionLegacyStepsTimeline from '@/features/executions/shared/components/ExecutionLegacyStepsTimeline';
import ExecutionPhasesCollapse from '@/features/executions/shared/components/ExecutionPhasesCollapse';
import InlineRecoveryPanel from '@/features/executions/shared/components/InlineRecovery';
import WaitingInputActionPanel from '@/features/executions/shared/components/WaitingInputActionPanel';
import { RECOVERY_COPY } from '@/features/executions/shared/components/recoveryOptions';
import { EXECUTION_STATUS_LABELS_ZH } from '@/shared/lib/executionStatusMeta';

const ExecutionListDetailDrawer: React.FC<ExecutionListDetailDrawerProps> = ({
  open,
  isDetailLoading,
  selectedExecution,
  onClose,
  onOpenExecutionDetailPage,
  getSkillDisplayName,
  shouldShowSelectedCurrentPhaseInfo,
  selectedExecutionRuntimeSessionId,
  stableSelectedRuntimeSessionNovncUrl,
  isSelectedBrowserExecution,
  shouldShowLivePreview,
  runtimeSessionStatusLabel,
  selectedExecutionInput,
  selectedExecutionNormalizedResult,
  effectiveSelectedResultJson,
  currentSelectedPhase,
  currentSelectedStep,
  displaySelectedPhases,
  selectedCurrentPhaseIndex,
  selectedCompletedPhaseCount,
  selectedLoopCount,
  shouldShowSelectedExecutionSummary,
  selectedSummaryHeadline,
  selectedLoopSummary,
  waitingInputStep,
  requiredInputs,
  requiredInputGroups,
  submitInputLoading,
  onSubmitWaitingInput,
  onResumeInAi,
  onTakeoverPhase,
  phaseTakeoverLoading,
  shouldShowLegacySteps,
  selectedSteps,
  isStepsLoading,
  legacyStepsSummary,
}) => {
  return (
    <Drawer
      className="execution-detail-drawer"
      title="执行详情"
      placement="right"
      width={720}
      open={open}
      onClose={onClose}
      styles={{ body: { background: 'var(--bg-primary)' } }}
    >
      {isDetailLoading ? (
        <div className="execution-detail-loading">
          <Spin />
        </div>
      ) : selectedExecution ? (
        <Space
          direction="vertical"
          size={16}
          style={{ width: '100%' }}
          className="execution-detail-content"
        >
          <Collapse
            className="execution-detail-sections"
            ghost
            defaultActiveKey={['summary']}
            expandIconPosition="end"
            items={[
              buildExecutionDetailCollapseItem({
                key: 'summary',
                title: '基本信息',
                summary: `${getSkillDisplayName(selectedExecution.skillId)} / ${EXECUTION_STATUS_LABELS_ZH[selectedExecution.status]}`,
                children: (
                  <ExecutionBasicInfoSection
                    execution={selectedExecution}
                    getSkillDisplayName={getSkillDisplayName}
                    shouldShowCurrentPhaseInfo={shouldShowSelectedCurrentPhaseInfo}
                    runtimeSessionId={selectedExecutionRuntimeSessionId}
                    runtimePreviewUrl={stableSelectedRuntimeSessionNovncUrl}
                    isBrowserExecution={isSelectedBrowserExecution}
                    onOpenDetailPage={() => onOpenExecutionDetailPage(selectedExecution.id)}
                  />
                ),
              }),
            ]}
          />

          {isSelectedBrowserExecution && stableSelectedRuntimeSessionNovncUrl && shouldShowLivePreview ? (
            <div className="execution-detail-live-card">
              <LiveSessionPreviewCard
                novncUrl={stableSelectedRuntimeSessionNovncUrl}
                title="实时画面"
                statusLabel={runtimeSessionStatusLabel}
                height={360}
              />
            </div>
          ) : null}

          {!isSelectedBrowserExecution ? (
            <ExecutionInputOutputCard
              execution={selectedExecution}
              executionInput={selectedExecutionInput}
              executionNormalizedResult={selectedExecutionNormalizedResult}
              effectiveResultJson={effectiveSelectedResultJson}
            />
          ) : null}

          {isSelectedBrowserExecution && displaySelectedPhases.length > 0 ? (
            <ExecutionBrowserProgressCard
              execution={selectedExecution}
              currentSelectedPhase={currentSelectedPhase}
              currentSelectedStep={currentSelectedStep}
              displaySelectedPhases={displaySelectedPhases}
              selectedCurrentPhaseIndex={selectedCurrentPhaseIndex}
              selectedCompletedPhaseCount={selectedCompletedPhaseCount}
              selectedLoopCount={selectedLoopCount}
              shouldShowSelectedCurrentPhaseInfo={shouldShowSelectedCurrentPhaseInfo}
              shouldShowSelectedExecutionSummary={shouldShowSelectedExecutionSummary}
              selectedSummaryHeadline={selectedSummaryHeadline}
              selectedLoopSummary={selectedLoopSummary}
            />
          ) : null}

          <InlineRecoveryPanel
            executionId={selectedExecution.id}
            executionStatus={selectedExecution.status}
            currentStepId={selectedExecution.currentStepId}
            phase={currentSelectedPhase}
          />

          {(selectedExecution.status === 'waiting_input' && waitingInputStep) ||
          isSelectedBrowserExecution ? (
            <Collapse
              ghost
              expandIconPosition="end"
              items={[
                ...(selectedExecution.status === 'waiting_input' && waitingInputStep
                  ? [
                      buildExecutionDetailCollapseItem({
                        key: 'resume',
                        title: '继续 / 恢复执行',
                        summary: `待补 ${requiredInputs.length} 个参数`,
                        children: (
                          <WaitingInputActionPanel
                            title={RECOVERY_COPY.waitingInputTitle}
                            summaryText={RECOVERY_COPY.waitingInputDesc}
                            requiredInputs={requiredInputs}
                            requiredInputGroups={requiredInputGroups}
                            submitLoading={submitInputLoading}
                            onSubmit={onSubmitWaitingInput}
                            submitLabel={RECOVERY_COPY.waitingInputContinue}
                            resetLabel="重置"
                            provideFieldPrefix="请输入"
                            sourceLabel="来源"
                            enterJsonString="请输入 JSON 字符串"
                            enterFieldPrefix="请输入"
                            confirmTagLabel="待确认"
                            extraActions={(form) => (
                              <Button
                                icon={<RobotOutlined />}
                                loading={submitInputLoading}
                                onClick={() => onResumeInAi(form)}
                              >
                                {RECOVERY_COPY.waitingInputToAi}
                              </Button>
                            )}
                          />
                        ),
                      }),
                    ]
                  : []),
                ...(isSelectedBrowserExecution
                  ? [
                      buildExecutionDetailCollapseItem({
                        key: 'phases',
                        title: '阶段',
                        summary:
                          displaySelectedPhases.length > 0
                            ? `${displaySelectedPhases.length} 个阶段 / ${selectedExecution.currentPhaseKey || '已归档'}`
                            : '暂无阶段记录',
                        children: (
                          <ExecutionPhasesCollapse
                            execution={selectedExecution}
                            phases={displaySelectedPhases}
                            onTakeoverPhase={onTakeoverPhase}
                            takeoverLoading={phaseTakeoverLoading}
                          />
                        ),
                      }),
                    ]
                  : []),
                ...(isSelectedBrowserExecution && !displaySelectedPhases.length && shouldShowLegacySteps
                  ? [
                      buildExecutionDetailCollapseItem({
                        key: 'steps',
                        title: '步骤',
                        summary: legacyStepsSummary,
                        style: { ...executionDetailPanelStyle, marginBottom: 0 },
                        children: isStepsLoading ? (
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'center',
                              padding: '24px 0',
                            }}
                          >
                            <Spin />
                          </div>
                        ) : selectedSteps && selectedSteps.length > 0 ? (
                          <ExecutionLegacyStepsTimeline steps={selectedSteps} />
                        ) : (
                          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无步骤" />
                        ),
                      }),
                    ]
                  : []),
              ]}
            />
          ) : null}
        </Space>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请选择一条执行记录" />
      )}
    </Drawer>
  );
};

export default ExecutionListDetailDrawer;
