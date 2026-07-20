import React from 'react';
import { Form, Input, Modal, Radio, Space, Tooltip, Typography } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import ExecutionDetailInfoBlock from '@/features/executions/detail/components/ExecutionDetailInfoBlock';
import ExecutionDetailPanelBlock from '@/features/executions/detail/components/ExecutionDetailPanelBlock';
import ExecutionDetailSectionCard from '@/features/executions/detail/components/ExecutionDetailSectionCard';
import {
  RECOVERY_COPY,
  RECOVERY_RESUME_OPTIONS,
} from '../recoveryOptions';
import {
  RECOVERY_ACTION_DESCRIPTIONS,
  useInlineRecovery,
} from './hooks/useInlineRecovery';
import { InlineRecoveryActions } from './InlineRecoveryActions';
import { InlineRecoveryStatusContent } from './InlineRecoveryStatusContent';

const { Text } = Typography;

interface InlineRecoveryPanelProps {
  executionId: string;
  executionStatus?: string;
  currentStepId?: string;
  phase?: import('@/api/execution').ExecutionPhaseDto;
  title?: string;
  auxiliaryContent?: React.ReactNode;
  extraActions?: React.ReactNode;
  hideStatusAlert?: boolean;
  onAfterSuccess?: () => void | Promise<void>;
}

const InlineRecoveryPanel: React.FC<InlineRecoveryPanelProps> = ({
  executionId,
  executionStatus,
  currentStepId,
  phase,
  title,
  auxiliaryContent,
  extraActions,
  hideStatusAlert,
  onAfterSuccess,
}) => {
  const r = useInlineRecovery({ executionId, executionStatus, currentStepId, phase, onAfterSuccess });
  if (!r.canResume) {
    return null;
  }
  return (
    <>
      <ExecutionDetailSectionCard
        title={title || RECOVERY_COPY.panelTitle}
        size="small"
        styles={{ body: { padding: 16 } }}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {!hideStatusAlert ? (
            <InlineRecoveryStatusContent
              phase={phase}
              isTakeoverPhase={r.isTakeoverPhase}
              activeStepId={r.activeStepId}
              phaseSteps={r.phaseSteps}
              showAdvancedStepSelect={r.showAdvancedStepSelect}
              onShowAdvancedStepSelect={() => r.setShowAdvancedStepSelect(true)}
              onStepIdChange={(v) => r.setResumeFromStepId(v)}
            />
          ) : null}
          {auxiliaryContent ? (
            <ExecutionDetailInfoBlock>{auxiliaryContent}</ExecutionDetailInfoBlock>
          ) : null}
          <Form layout="vertical">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 7fr) minmax(0, 3fr)',
                gap: 12,
                alignItems: 'stretch',
              }}
            >
              <ExecutionDetailPanelBlock
                style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
              >
                <Form.Item label="人工审查记录" style={{ marginBottom: 0 }}>
                  <Input.TextArea
                    rows={4}
                    value={r.reviewComment}
                    onChange={(event) => r.setReviewComment(event.target.value)}
                    placeholder="记录人工审查结论，例如：已人工核实该案件可继续承认，允许跳过条件分支并继续后续步骤"
                  />
                </Form.Item>
              </ExecutionDetailPanelBlock>
              <ExecutionDetailPanelBlock
                style={{ display: 'grid', gap: 10, width: '100%', height: '100%' }}
              >
                <Text strong style={{ margin: 0 }}>
                  {RECOVERY_COPY.resumeAction}
                </Text>
                <Radio.Group
                  value={r.resumeAction}
                  onChange={(e) => {
                    if (r.isRecoveryResumeAction(e.target.value)) {
                      r.setResumeAction(e.target.value);
                    }
                  }}
                  style={{ display: 'grid', gap: 8 }}
                >
                  {RECOVERY_RESUME_OPTIONS.map((option) => (
                    <Radio key={option.value} value={option.value} style={{ marginInlineEnd: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '2px 0',
                        }}
                      >
                        <Text strong={r.resumeAction === option.value}>{option.label}</Text>
                        <Tooltip title={RECOVERY_ACTION_DESCRIPTIONS[option.value]}>
                          <InfoCircleOutlined
                            style={{ fontSize: 14, color: 'var(--text-secondary)', cursor: 'help' }}
                          />
                        </Tooltip>
                      </div>
                    </Radio>
                  ))}
                </Radio.Group>
              </ExecutionDetailPanelBlock>
            </div>
          </Form>
          <InlineRecoveryActions
            onApplyResume={() => r.setShowResumeConfirm(true)}
            onCancel={() => r.setShowCancelConfirm(true)}
            isApplyLoading={r.applyRecoveryMutation.isLoading}
            isCancelLoading={r.cancelMutation.isLoading}
            extraActions={extraActions}
          />
        </Space>
      </ExecutionDetailSectionCard>
      <Modal
        title={RECOVERY_COPY.resumeConfirmTitle}
        open={r.showResumeConfirm}
        onOk={() => {
          r.setShowResumeConfirm(false);
          r.applyRecoveryMutation.mutate();
        }}
        onCancel={() => r.setShowResumeConfirm(false)}
        okText={RECOVERY_COPY.resumeConfirmOk}
        cancelText={RECOVERY_COPY.resumeConfirmCancel}
      >
        <p>{RECOVERY_COPY.resumeConfirmDesc}</p>
        <p>{RECOVERY_COPY.resumeConfirmHint}</p>
      </Modal>
      <Modal
        title={RECOVERY_COPY.cancelConfirmTitle}
        open={r.showCancelConfirm}
        onOk={() => {
          r.setShowCancelConfirm(false);
          r.cancelMutation.mutate();
        }}
        onCancel={() => r.setShowCancelConfirm(false)}
        okText={RECOVERY_COPY.cancelConfirmOk}
        cancelText={RECOVERY_COPY.cancelConfirmCancel}
        okButtonProps={{ danger: true }}
      >
        <p>{RECOVERY_COPY.cancelConfirmDesc}</p>
      </Modal>
    </>
  );
};

export default InlineRecoveryPanel;
