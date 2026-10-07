import React from 'react';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  RedoOutlined,
  ReloadOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { useMutation, useQueryClient } from 'react-query';
import { executionApi, ExecutionPhaseDto } from '@/api/execution';
import {
  RECOVERY_COPY,
  RECOVERY_RESUME_OPTIONS,
  RECOVERY_ACTION_BUTTON_LABELS,
  RECOVERY_CONFIRM_DETAILS,
  RecoveryResumeAction,
} from '@/features/executions/shared/recoveryOptions';

const { Text } = Typography;

const isRecoveryResumeAction = (value: unknown): value is RecoveryResumeAction =>
  value === 'resolve_by_human' ||
  value === 'retry_step' ||
  value === 'retry_phase' ||
  value === 'retry' ||
  value === 'resume_from_step';

const getPhaseSteps = (phase?: ExecutionPhaseDto) =>
  (Array.isArray(phase?.steps) ? phase.steps : []) as NonNullable<ExecutionPhaseDto['steps']>;

interface InlineRecoveryPanelProps {
  executionId: string;
  executionStatus?: string;
  currentStepId?: string;
  phase?: ExecutionPhaseDto;
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
  const queryClient = useQueryClient();
  const [resumeAction, setResumeAction] = React.useState<RecoveryResumeAction>('resolve_by_human');
  const [resumeFromStepId, setResumeFromStepId] = React.useState<string | undefined>(undefined);
  const [showAdvancedStepSelect, setShowAdvancedStepSelect] = React.useState(false);
  const [showResumeConfirm, setShowResumeConfirm] = React.useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = React.useState(false);
  const [reviewComment, setReviewComment] = React.useState('');
  const phaseSteps = React.useMemo(() => getPhaseSteps(phase), [phase]);

  const failedPhaseStep = React.useMemo(() => {
    return (
      phaseSteps.find((step) => ['failed', 'takeover_required', 'blocked'].includes(step.status)) ||
      phaseSteps.find((step) => step.status !== 'completed') ||
      phaseSteps[phaseSteps.length - 1]
    );
  }, [phaseSteps]);

  const failedPhaseStepId = React.useMemo(() => {
    if (failedPhaseStep?.stepId || failedPhaseStep?.id) {
      return failedPhaseStep.stepId || failedPhaseStep.id;
    }
    return currentStepId;
  }, [currentStepId, failedPhaseStep]);

  const nextStepAfterFailedId = React.useMemo(() => {
    if (!failedPhaseStepId) {
      return undefined;
    }
    const failedIndex = phaseSteps.lastIndexOf(failedPhaseStep as any);
    if (failedIndex >= 0 && phaseSteps[failedIndex + 1]) {
      return phaseSteps[failedIndex + 1].stepId || phaseSteps[failedIndex + 1].id;
    }
    // When execution pauses/fails at runtime, failedPhaseStep is the last step recorded in phaseSteps.
    // In a loop execution, look backwards for an earlier iteration of the same stepId that had a successor.
    for (let i = failedIndex - 1; i >= 0; i--) {
      const prevStep = phaseSteps[i];
      if ((prevStep.stepId || prevStep.id) === failedPhaseStepId && phaseSteps[i + 1]) {
        const candidateNext = phaseSteps[i + 1].stepId || phaseSteps[i + 1].id;
        if (candidateNext && candidateNext !== failedPhaseStepId) {
          return candidateNext;
        }
      }
    }
    // Fallback for sequential steps like step_9 -> step_10
    if (/^step_\d+$/.test(failedPhaseStepId)) {
      const num = parseInt(failedPhaseStepId.replace('step_', ''), 10);
      if (!Number.isNaN(num)) {
        return `step_${num + 1}`;
      }
    }
    return undefined;
  }, [failedPhaseStep, failedPhaseStepId, phaseSteps]);

  const phaseLoopIteration = React.useMemo(() => {
    const value = phase?.input?.loopIteration;
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isInteger(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return undefined;
  }, [phase?.input]);

  const activeStepId = React.useMemo(() => {
    if (resumeFromStepId) {
      return resumeFromStepId;
    }
    if (resumeAction === 'retry_step') {
      return failedPhaseStepId;
    }
    if (resumeAction === 'resolve_by_human' || resumeAction === 'resume_from_step') {
      return nextStepAfterFailedId || failedPhaseStepId;
    }
    return undefined;
  }, [resumeFromStepId, resumeAction, failedPhaseStepId, nextStepAfterFailedId]);

  const invalidateExecutionQueries = React.useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries(['executions']),
      queryClient.invalidateQueries(['execution', executionId]),
      queryClient.invalidateQueries(['execution-steps', executionId]),
      queryClient.invalidateQueries(['execution-phases', executionId]),
    ]);
    await onAfterSuccess?.();
  }, [executionId, onAfterSuccess, queryClient]);

  const buildPatch = React.useCallback(() => {
    if (resumeAction === 'resolve_by_human' || resumeAction === 'resume_from_step') {
      const effectiveResumeStepId =
        activeStepId ||
        nextStepAfterFailedId ||
        (failedPhaseStepId && /^step_\d+$/.test(failedPhaseStepId)
          ? `step_${parseInt(failedPhaseStepId.replace('step_', ''), 10) + 1}`
          : undefined);
      return {
        type: 'resolve_by_human',
        failedStepId: failedPhaseStepId || '',
        ...(phaseLoopIteration ? { loopIteration: phaseLoopIteration } : {}),
        ...(effectiveResumeStepId ? { resumeFromStepId: effectiveResumeStepId } : {}),
        note: reviewComment.trim() || RECOVERY_COPY.resolveByHumanNote,
      };
    }

    if (resumeAction === 'retry_step') {
      return {
        type: 'retry_step',
        failedStepId: failedPhaseStepId || '',
        ...(phaseLoopIteration ? { loopIteration: phaseLoopIteration } : {}),
        resumeFromStepId: failedPhaseStepId,
        note: reviewComment.trim() || RECOVERY_COPY.retryNote,
      };
    }

    return null;
  }, [activeStepId, failedPhaseStepId, nextStepAfterFailedId, phaseLoopIteration, resumeAction, reviewComment]);

  const applyRecoveryMutation = useMutation(
    async () => {
      let targetStepId: string | undefined;
      if (resumeAction === 'resolve_by_human' || resumeAction === 'resume_from_step') {
        targetStepId = activeStepId;
      } else if (resumeAction === 'retry_step') {
        targetStepId = failedPhaseStepId;
      } else {
        targetStepId = undefined;
      }

      const resumePayload = {
        ...(targetStepId ? { stepId: targetStepId } : {}),
        comment: reviewComment.trim() || undefined,
      };

      if (phase) {
        if (phase.status === 'waiting_takeover') {
          await executionApi.reconcilePhaseTakeover(executionId, phase.phaseKey, {
            patch: buildPatch(),
            comment: reviewComment.trim() || undefined,
          });
        }

        return executionApi.resumePhaseTakeover(executionId, phase.phaseKey, resumePayload);
      }

      if (executionStatus === 'human_control') {
        return executionApi.releaseHumanControl(executionId, resumePayload);
      }

      throw new Error(RECOVERY_COPY.noRecoverablePhase);
    },
    {
      onSuccess: async () => {
        void message.success(RECOVERY_COPY.successResume);
        await invalidateExecutionQueries();
      },
      onError: (error: Error) => {
        void message.error(error.message);
      },
    }
  );

  const cancelMutation = useMutation(() => executionApi.cancel(executionId), {
    onSuccess: async () => {
      void message.success(RECOVERY_COPY.successCancel);
      await invalidateExecutionQueries();
    },
    onError: (error: Error) => {
      void message.error(`${RECOVERY_COPY.cancelErrorPrefix}：${error.message}`);
    },
  });

  const canResume = Boolean(
    phase
      ? phase.status === 'waiting_takeover' || phase.status === 'resumable'
      : executionStatus === 'human_control'
  );
  const isTakeoverPhase = phase?.status === 'waiting_takeover';

  if (!canResume) {
    return null;
  }

  const actionButtonLabel =
    RECOVERY_ACTION_BUTTON_LABELS[resumeAction] || RECOVERY_COPY.applyAndResume;
  const actionButtonIcon =
    resumeAction === 'retry_step' ? (
      <RedoOutlined />
    ) : resumeAction === 'retry_phase' || resumeAction === 'retry' ? (
      <ReloadOutlined />
    ) : (
      <CheckCircleOutlined />
    );
  const confirmModalDetails =
    RECOVERY_CONFIRM_DETAILS[resumeAction] || {
      title: RECOVERY_COPY.resumeConfirmTitle,
      desc: RECOVERY_COPY.resumeConfirmDesc,
      hint: RECOVERY_COPY.resumeConfirmHint,
      okText: RECOVERY_COPY.resumeConfirmOk,
    };

  return (
    <>
      <Card
        title={title || RECOVERY_COPY.panelTitle}
        size="small"
        style={{
          marginBottom: 16,
          borderRadius: 8,
          borderColor: 'var(--border-color-split)',
          background: 'var(--bg-card)',
        }}
        bodyStyle={{ padding: 16 }}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {!hideStatusAlert ? (
            <Alert
              type={isTakeoverPhase ? 'warning' : phase?.errorMessage ? 'error' : 'warning'}
              showIcon
              message={
                phase
                  ? `${RECOVERY_COPY.currentPhase}：${phase.phaseName || phase.phaseKey}`
                  : RECOVERY_COPY.activeHumanControl
              }
              description={
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {phase ? (
                    <Space wrap size={16} style={{ rowGap: 0 }}>
                      <Text type="secondary" style={{ fontSize: 13 }}>
                        {`${RECOVERY_COPY.phaseStatus}：${phase.status}`}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 13 }}>
                        {`${RECOVERY_COPY.phaseKey}：${phase.phaseKey}`}
                      </Text>
                    </Space>
                  ) : null}
                  {phase && activeStepId ? (
                    <Space wrap size={8}>
                      <Text strong style={{ fontSize: 13 }}>
                        {isTakeoverPhase ? '介入步骤：' : '异常步骤：'}
                      </Text>
                      {!showAdvancedStepSelect ? (
                        <>
                          <Text style={{ fontSize: 13 }}>
                            {(() => {
                              const step = phaseSteps.find(
                                (s) => (s.stepId || s.id) === activeStepId
                              );
                              if (step) {
                                return `${step.stepIndex}. ${step.action}`;
                              }
                              return activeStepId.length > 20
                                ? `${activeStepId.slice(0, 8)}...`
                                : activeStepId;
                            })()}
                          </Text>
                          <Button
                            type="link"
                            size="small"
                            style={{ padding: 0, fontSize: 13 }}
                            onClick={() => setShowAdvancedStepSelect(true)}
                          >
                            修改
                          </Button>
                        </>
                      ) : (
                        <Select
                          size="small"
                          style={{ minWidth: 200 }}
                          value={activeStepId}
                          onChange={(value) => setResumeFromStepId(value)}
                          options={phaseSteps.map((step) => ({
                            value: step.stepId || step.id,
                            label: `${step.stepIndex}. ${step.action} ${
                              ['failed', 'takeover_required', 'blocked'].includes(step.status)
                                ? '(待介入/异常步骤)'
                                : ''
                            }`,
                          }))}
                        />
                      )}
                    </Space>
                  ) : null}
                  {phase?.errorMessage && !isTakeoverPhase ? (
                    <div
                      style={{
                        marginTop: 4,
                        padding: '6px 10px',
                        background: 'rgba(255, 77, 79, 0.08)',
                        borderRadius: 4,
                        borderLeft: '3px solid #ff4d4f',
                      }}
                    >
                      <Text
                        type="danger"
                        style={{ fontSize: 13, wordBreak: 'break-word', fontFamily: 'monospace' }}
                      >
                        {phase.errorMessage}
                      </Text>
                    </div>
                  ) : null}
                </div>
              }
            />
          ) : null}

          {auxiliaryContent ? (
            <div
              style={{
                padding: 12,
                borderRadius: 8,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color-split)',
              }}
            >
              {auxiliaryContent}
            </div>
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
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  padding: 12,
                  borderRadius: 8,
                  border: '1px solid var(--border-color-split)',
                  background: 'var(--bg-card)',
                }}
              >
                <Form.Item label={RECOVERY_COPY.note} style={{ marginBottom: 0 }}>
                  <Input.TextArea
                    rows={5}
                    value={reviewComment}
                    onChange={(event) => setReviewComment(event.target.value)}
                    placeholder={RECOVERY_COPY.notePlaceholder}
                  />
                </Form.Item>
              </div>
              <div
                style={{
                  display: 'grid',
                  gap: 10,
                  width: '100%',
                  height: '100%',
                  padding: 12,
                  borderRadius: 8,
                  border: '1px solid var(--border-color-split)',
                  background: 'var(--bg-card)',
                }}
              >
                <Text strong style={{ margin: 0 }}>
                  {RECOVERY_COPY.resumeAction}
                </Text>
                <Radio.Group
                  value={resumeAction}
                  onChange={(e) => {
                    if (isRecoveryResumeAction(e.target.value)) {
                      setResumeAction(e.target.value);
                    }
                  }}
                  style={{ display: 'grid', gap: 8, width: '100%' }}
                >
                  {RECOVERY_RESUME_OPTIONS.map((option) => {
                    const isSelected = resumeAction === option.value;
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
                            <Text strong={isSelected}>{option.label}</Text>
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
              </div>
            </div>
          </Form>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              flexWrap: 'wrap',
              gap: 12,
              paddingTop: 12,
              borderTop: '1px solid var(--border-color-split)',
            }}
          >
            <Space wrap size={[10, 8]}>
              <Button
                type="primary"
                icon={actionButtonIcon}
                onClick={() => setShowResumeConfirm(true)}
                loading={applyRecoveryMutation.isLoading}
              >
                {actionButtonLabel}
              </Button>
              {extraActions}
              <Button
                danger
                ghost
                icon={<StopOutlined />}
                onClick={() => setShowCancelConfirm(true)}
                loading={cancelMutation.isLoading}
              >
                {RECOVERY_COPY.cancelExecution}
              </Button>
            </Space>
          </div>
        </Space>
      </Card>

      <Modal
        title={confirmModalDetails.title}
        open={showResumeConfirm}
        onOk={() => {
          setShowResumeConfirm(false);
          applyRecoveryMutation.mutate();
        }}
        onCancel={() => setShowResumeConfirm(false)}
        okText={confirmModalDetails.okText}
        cancelText={RECOVERY_COPY.resumeConfirmCancel}
      >
        <p style={{ fontSize: 14 }}>{confirmModalDetails.desc}</p>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{confirmModalDetails.hint}</p>
      </Modal>

      <Modal
        title={RECOVERY_COPY.cancelConfirmTitle}
        open={showCancelConfirm}
        onOk={() => {
          setShowCancelConfirm(false);
          cancelMutation.mutate();
        }}
        onCancel={() => setShowCancelConfirm(false)}
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
