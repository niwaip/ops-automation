import React from 'react';
import { Form, Input, Modal, Radio, Space, Tag, Typography } from 'antd';
import {
  CheckCircleOutlined,
  RedoOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import ExecutionDetailInfoBlock from '@/features/executions/detail/components/ExecutionDetailInfoBlock';
import ExecutionDetailPanelBlock from '@/features/executions/detail/components/ExecutionDetailPanelBlock';
import ExecutionDetailSectionCard from '@/features/executions/detail/components/ExecutionDetailSectionCard';
import {
  RECOVERY_COPY,
  RECOVERY_RESUME_OPTIONS,
} from '../recoveryOptions';
import { useInlineRecovery } from './hooks/useInlineRecovery';
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

  const actionIcon =
    r.resumeAction === 'retry_step' ? (
      <RedoOutlined />
    ) : r.resumeAction === 'retry_phase' || r.resumeAction === 'retry' ? (
      <ReloadOutlined />
    ) : (
      <CheckCircleOutlined />
    );

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
                gridTemplateColumns: 'minmax(0, 5fr) minmax(0, 5fr)',
                gap: 16,
                alignItems: 'stretch',
              }}
            >
              <ExecutionDetailPanelBlock
                style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
              >
                <Form.Item label={RECOVERY_COPY.note} style={{ marginBottom: 0 }}>
                  <Input.TextArea
                    rows={5}
                    value={r.reviewComment}
                    onChange={(event) => r.setReviewComment(event.target.value)}
                    placeholder={RECOVERY_COPY.notePlaceholder}
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
                  style={{ display: 'grid', gap: 8, width: '100%' }}
                >
                  {RECOVERY_RESUME_OPTIONS.map((option) => {
                    const isSelected = r.resumeAction === option.value;
                    return (
                      <Radio
                        key={option.value}
                        value={option.value}
                        style={{
                          marginInlineEnd: 0,
                          padding: '8px 12px',
                          borderRadius: 6,
                          border: isSelected
                            ? '1px solid var(--ant-primary-color, #1890ff)'
                            : '1px solid var(--border-color-split, rgba(255, 255, 255, 0.08))',
                          background: isSelected
                            ? 'rgba(24, 144, 255, 0.08)'
                            : 'transparent',
                          transition: 'all 0.2s',
                          display: 'flex',
                          alignItems: 'flex-start',
                        }}
                      >
                        <div style={{ marginLeft: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Text strong={isSelected}>
                              {option.label}
                            </Text>
                            {option.badge ? (
                              <Tag
                                color="cyan"
                                style={{ margin: 0, fontSize: 11, lineHeight: '18px', padding: '0 6px' }}
                              >
                                {option.badge}
                              </Tag>
                            ) : null}
                          </div>
                          <Text
                            type="secondary"
                            style={{
                              fontSize: 12,
                              display: 'block',
                              marginTop: 3,
                              lineHeight: '18px',
                            }}
                          >
                            {option.description}
                          </Text>
                        </div>
                      </Radio>
                    );
                  })}
                </Radio.Group>
              </ExecutionDetailPanelBlock>
            </div>
          </Form>
          <InlineRecoveryActions
            onApplyResume={() => r.setShowResumeConfirm(true)}
            onCancel={() => r.setShowCancelConfirm(true)}
            isApplyLoading={r.applyRecoveryMutation.isLoading}
            isCancelLoading={r.cancelMutation.isLoading}
            actionButtonLabel={r.actionButtonLabel}
            actionButtonIcon={actionIcon}
            extraActions={extraActions}
          />
        </Space>
      </ExecutionDetailSectionCard>
      <Modal
        title={r.confirmModalDetails.title}
        open={r.showResumeConfirm}
        onOk={() => {
          r.setShowResumeConfirm(false);
          r.applyRecoveryMutation.mutate();
        }}
        onCancel={() => r.setShowResumeConfirm(false)}
        okText={r.confirmModalDetails.okText}
        cancelText={RECOVERY_COPY.resumeConfirmCancel}
      >
        <p style={{ fontSize: 14 }}>{r.confirmModalDetails.desc}</p>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{r.confirmModalDetails.hint}</p>
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
