import React from 'react';
import { Button, Space, Typography, message } from 'antd';
import { CheckCircleOutlined, CloseOutlined } from '@ant-design/icons';
import ExecutionDetailAlertActions from '@/features/executions/detail/components/ExecutionDetailAlertActions';
import ExecutionExternalLink from '@/features/executions/shared/components/ExecutionExternalLink';
import type { ExecutionDto, ExecutionPhaseDto, ExecutionStepDto } from '@/api/execution';
import ExecutionDetailSectionCard from '@/features/executions/detail/components/ExecutionDetailSectionCard';
import InlineRecoveryPanel from '@/features/executions/shared/components/InlineRecovery';
import WaitingInputActionPanel from '@/features/executions/shared/components/WaitingInputActionPanel';
import {
  normalizeRequiredInputValues,
  type RequiredInputField,
} from '@/features/executions/create/lib/inputFields';
import type { WaitingInputDisplayGroup } from '@/shared/lib/waitingInputDisplay';

const { Text } = Typography;

interface ExecutionBrowserActionCardLabels {
  operationsArea: string;
  browserTakeoverReason: string;
  currentPageLink: string;
  takeoverApproveAndContinue: string;
  approvalWaiting: string;
  approvalStatusPrefix: string;
  approvalDescDefault: string;
  approveAndContinue: string;
  rejectExecution: string;
  submitAndResume: string;
  reset: string;
  provideField: string;
  source: string;
  enterJsonString: string;
  enterField: string;
  invalidJson: string;
  noPendingActions: string;
}

interface ExecutionBrowserActionCardProps {
  execution: ExecutionDto;
  currentPhase?: ExecutionPhaseDto;
  currentPhaseDetailUrl?: string;
  waitingInputStep?: ExecutionStepDto;
  waitingInputSummary?: string;
  requiredInputs: RequiredInputField[];
  requiredInputGroups: WaitingInputDisplayGroup<RequiredInputField>[];
  approveAndContinueLoading?: boolean;
  approveLoading?: boolean;
  rejectLoading?: boolean;
  submitInputLoading?: boolean;
  confirmTagLabel: string;
  labels: ExecutionBrowserActionCardLabels;
  onApproveAndContinue: () => void;
  onApprove: () => void;
  onReject: () => void;
  onSubmitInput: (values: Record<string, unknown>) => void;
}

const ExecutionBrowserActionCard: React.FC<ExecutionBrowserActionCardProps> = ({
  execution,
  currentPhase,
  currentPhaseDetailUrl,
  waitingInputStep,
  waitingInputSummary,
  requiredInputs,
  requiredInputGroups,
  approveAndContinueLoading,
  approveLoading,
  rejectLoading,
  submitInputLoading,
  confirmTagLabel,
  labels,
  onApproveAndContinue,
  onApprove,
  onReject,
  onSubmitInput,
}) => {
  if (execution.status === 'human_control') {
    return (
      <InlineRecoveryPanel
        title={labels.operationsArea}
        executionId={execution.id}
        executionStatus={execution.status}
        currentStepId={execution.currentStepId}
        phase={currentPhase}
        hideStatusAlert
        auxiliaryContent={
          execution.takeoverReason || currentPhaseDetailUrl ? (
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              {execution.takeoverReason ? (
                <div style={{ display: 'grid', gap: 2 }}>
                  <Text type="secondary">{labels.browserTakeoverReason}</Text>
                  <Text>{execution.takeoverReason}</Text>
                </div>
              ) : null}
              {currentPhaseDetailUrl ? (
                <ExecutionExternalLink
                  href={currentPhaseDetailUrl}
                  label={labels.currentPageLink}
                />
              ) : null}
            </Space>
          ) : undefined
        }
        extraActions={
          <Button
            type="default"
            icon={<CheckCircleOutlined />}
            loading={approveAndContinueLoading}
            onClick={onApproveAndContinue}
          >
            {labels.takeoverApproveAndContinue}
          </Button>
        }
      />
    );
  }

  if (execution.status === 'pending_approval') {
    return (
      <ExecutionDetailSectionCard
        title={labels.operationsArea}
        size="small"
        style={{ marginBottom: 16 }}
        styles={{ body: { padding: 16 } }}
      >
        <ExecutionDetailAlertActions
          message={labels.approvalWaiting}
          description={
            execution.approvalStatus
              ? `${labels.approvalStatusPrefix} ${execution.approvalStatus}`
              : labels.approvalDescDefault
          }
          separateFooter
          footerContent={
            <Text type="secondary" style={{ fontSize: 13 }}>
              {labels.approvalDescDefault}
            </Text>
          }
          actions={
            <Space wrap size={[8, 8]}>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                loading={approveLoading}
                onClick={onApprove}
              >
                {labels.approveAndContinue}
              </Button>
              <Button
                danger
                ghost
                icon={<CloseOutlined />}
                loading={rejectLoading}
                onClick={onReject}
              >
                {labels.rejectExecution}
              </Button>
            </Space>
          }
        />
      </ExecutionDetailSectionCard>
    );
  }

  if (execution.status === 'waiting_input' && waitingInputStep) {
    return (
      <WaitingInputActionPanel
        title={labels.operationsArea}
        cardSize="small"
        summaryText={waitingInputSummary}
        requiredInputs={requiredInputs}
        requiredInputGroups={requiredInputGroups}
        submitLoading={submitInputLoading}
        onSubmit={(values) => {
          try {
            onSubmitInput(
              normalizeRequiredInputValues(values, requiredInputs, { treatArrayAsJson: true })
            );
          } catch (error) {
            void message.error(error instanceof Error ? error.message : labels.invalidJson);
          }
        }}
        submitLabel={labels.submitAndResume}
        resetLabel={labels.reset}
        provideFieldPrefix={labels.provideField}
        sourceLabel={labels.source}
        enterJsonString={labels.enterJsonString}
        enterFieldPrefix={labels.enterField}
        confirmTagLabel={confirmTagLabel}
      />
    );
  }

  return (
    <ExecutionDetailSectionCard
      title={labels.operationsArea}
      size="small"
      style={{ marginBottom: 16 }}
      styles={{ body: { padding: 16 } }}
    >
      <ExecutionDetailAlertActions type="info" message={labels.noPendingActions} />
    </ExecutionDetailSectionCard>
  );
};

export default ExecutionBrowserActionCard;
