import React from 'react';
import { Button, Space, Typography, message } from 'antd';
import type { ExecutionDto, ExecutionPhaseDto, ExecutionStepDto } from '@/api/execution';
import ExecutionDetailAlertActions from '@/features/executions/components/ExecutionDetailAlertActions';
import ExecutionExternalLink from '@/features/executions/components/ExecutionExternalLink';
import ExecutionDetailSectionCard from '@/features/executions/components/ExecutionDetailSectionCard';
import WaitingInputActionPanel from '@/features/executions/components/WaitingInputActionPanel';
import {
  normalizeRequiredInputValues,
  type RequiredInputField,
} from '@/features/executions/lib/inputFields';
import type { WaitingInputDisplayGroup } from '@/shared/lib/waitingInputDisplay';

const { Text } = Typography;

interface ExecutionNonBrowserActionCardLabels {
  manualReviewPending: string;
  takeoverDescDefault: string;
  currentPhase: string;
  currentPageLink: string;
  takeoverApproveAndContinue: string;
  openCurrentPage: string;
  approvalRequired: string;
  approvalWaiting: string;
  approvalStatusPrefix: string;
  approvalDescDefault: string;
  approveAndContinue: string;
  rejectExecution: string;
  missingInputRequired: string;
  submitAndResume: string;
  reset: string;
  provideField: string;
  source: string;
  enterJsonString: string;
  enterField: string;
  invalidJson: string;
}

interface ExecutionNonBrowserActionCardProps {
  execution: ExecutionDto;
  currentPhase?: ExecutionPhaseDto;
  currentPhaseDetailUrl?: string;
  waitingInputStep?: ExecutionStepDto;
  waitingInputSummary?: string;
  requiredInputs: RequiredInputField[];
  requiredInputGroups: WaitingInputDisplayGroup<RequiredInputField>[];
  shouldShowCurrentPhaseInfo: boolean;
  approveAndContinueLoading?: boolean;
  approveLoading?: boolean;
  rejectLoading?: boolean;
  submitInputLoading?: boolean;
  confirmTagLabel: string;
  labels: ExecutionNonBrowserActionCardLabels;
  onApproveAndContinue: () => void;
  onApprove: () => void;
  onReject: () => void;
  onSubmitInput: (values: Record<string, unknown>) => void;
}

const ExecutionNonBrowserActionCard: React.FC<ExecutionNonBrowserActionCardProps> = ({
  execution,
  currentPhase,
  currentPhaseDetailUrl,
  waitingInputStep,
  waitingInputSummary,
  requiredInputs,
  requiredInputGroups,
  shouldShowCurrentPhaseInfo,
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
      <ExecutionDetailSectionCard title={labels.manualReviewPending} style={{ marginBottom: 16 }}>
        <ExecutionDetailAlertActions
          message={labels.manualReviewPending}
          description={
            <div style={{ display: 'grid', gap: 8 }}>
              <p style={{ marginBottom: 0 }}>{execution.takeoverReason || labels.takeoverDescDefault}</p>
              {shouldShowCurrentPhaseInfo && currentPhase ? (
                <Text type="secondary">{`${labels.currentPhase}: ${currentPhase.phaseName || currentPhase.phaseKey}`}</Text>
              ) : null}
              {currentPhaseDetailUrl ? (
                <ExecutionExternalLink
                  href={currentPhaseDetailUrl}
                  label={labels.currentPageLink}
                />
              ) : null}
            </div>
          }
          actions={
            <Space>
              <Button type="primary" loading={approveAndContinueLoading} onClick={onApproveAndContinue}>
                {labels.takeoverApproveAndContinue}
              </Button>
              {currentPhaseDetailUrl ? (
                <Button href={currentPhaseDetailUrl} target="_blank" rel="noopener noreferrer">
                  {labels.openCurrentPage}
                </Button>
              ) : null}
            </Space>
          }
          alertStyle={{ marginBottom: 16 }}
        />
      </ExecutionDetailSectionCard>
    );
  }

  if (execution.status === 'pending_approval') {
    return (
      <ExecutionDetailSectionCard title={labels.approvalRequired} style={{ marginBottom: 16 }}>
        <ExecutionDetailAlertActions
          message={labels.approvalWaiting}
          description={
            execution.approvalStatus
              ? `${labels.approvalStatusPrefix} ${execution.approvalStatus}`
              : labels.approvalDescDefault
          }
          actions={
            <Space>
              <Button type="primary" loading={approveLoading} onClick={onApprove}>
                {labels.approveAndContinue}
              </Button>
              <Button danger loading={rejectLoading} onClick={onReject}>
                {labels.rejectExecution}
              </Button>
            </Space>
          }
          alertStyle={{ marginBottom: 16 }}
        />
      </ExecutionDetailSectionCard>
    );
  }

  if (execution.status === 'waiting_input' && waitingInputStep) {
    return (
      <WaitingInputActionPanel
        title={labels.missingInputRequired}
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

  return null;
};

export default ExecutionNonBrowserActionCard;
