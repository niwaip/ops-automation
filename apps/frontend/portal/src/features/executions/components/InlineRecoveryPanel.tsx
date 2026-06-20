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
  Typography,
  message,
} from 'antd';
import { PlayCircleOutlined, StopOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from 'react-query';
import { executionApi, ExecutionPhaseDto } from '@/api/execution';
import {
  RECOVERY_COPY,
  RECOVERY_RESUME_OPTIONS,
  RecoveryResumeAction,
} from '@/features/executions/components/recoveryOptions';

const { Text } = Typography;

const isRecoveryResumeAction = (value: unknown): value is RecoveryResumeAction =>
  value === 'retry' || value === 'resolve_by_human' || value === 'resume_from_step';

interface InlineRecoveryPanelProps {
  executionId: string;
  executionStatus?: string;
  currentStepId?: string;
  phase?: ExecutionPhaseDto;
  title?: string;
  onAfterSuccess?: () => void | Promise<void>;
}

const InlineRecoveryPanel: React.FC<InlineRecoveryPanelProps> = ({
  executionId,
  executionStatus,
  currentStepId,
  phase,
  title,
  onAfterSuccess,
}) => {
  const queryClient = useQueryClient();
  const [resumeAction, setResumeAction] = React.useState<RecoveryResumeAction>('resume_from_step');
  const [resumeFromStepId, setResumeFromStepId] = React.useState<string | undefined>(undefined);
  const [showAdvancedStepSelect, setShowAdvancedStepSelect] = React.useState(false);
  const [showResumeConfirm, setShowResumeConfirm] = React.useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = React.useState(false);
  const [reviewComment, setReviewComment] = React.useState('');

  const failedPhaseStep = React.useMemo(() => {
    const phaseSteps = phase?.steps || [];
    return (
      phaseSteps.find((step) => ['failed', 'takeover_required', 'blocked'].includes(step.status)) ||
      phaseSteps.find((step) => step.status !== 'completed') ||
      phaseSteps[phaseSteps.length - 1]
    );
  }, [currentStepId, phase?.steps]);

  const failedPhaseStepId = React.useMemo(() => {
    if (failedPhaseStep?.stepId || failedPhaseStep?.id) {
      return failedPhaseStep.stepId || failedPhaseStep.id;
    }
    return currentStepId;
  }, [currentStepId, failedPhaseStep]);

  const defaultResumeFromStepId = React.useMemo(() => {
    const phaseSteps = phase?.steps || [];
    if (!failedPhaseStepId) {
      return undefined;
    }
    const failedIndex = phaseSteps.findIndex(
      (step) => (step.stepId || step.id) === failedPhaseStepId
    );
    if (failedIndex >= 0 && phaseSteps[failedIndex + 1]) {
      return phaseSteps[failedIndex + 1].stepId || phaseSteps[failedIndex + 1].id;
    }
    return failedPhaseStepId;
  }, [failedPhaseStepId, phase?.steps]);

  const activeStepId = resumeFromStepId || defaultResumeFromStepId || failedPhaseStepId;

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
    if (resumeAction === 'resume_from_step' && activeStepId) {
      return {
        type: 'resolve_by_human',
        failedStepId: failedPhaseStepId || '',
        resumeFromStepId: activeStepId,
        note: reviewComment.trim() || RECOVERY_COPY.retryNote,
      };
    }

    if (resumeAction === 'resolve_by_human') {
      return {
        type: 'resolve_by_human',
        failedStepId: failedPhaseStepId || '',
        note: reviewComment.trim() || RECOVERY_COPY.resolveByHumanNote,
      };
    }

    return null;
  }, [failedPhaseStepId, phase?.steps, resumeAction, activeStepId, reviewComment]);

  const applyRecoveryMutation = useMutation(
    async () => {
      const resumePayload = {
        ...(resumeAction === 'resume_from_step' && activeStepId ? { stepId: activeStepId } : {}),
      };

      if (phase) {
        if (phase.status === 'waiting_takeover') {
          await executionApi.reconcilePhaseTakeover(executionId, phase.phaseKey, {
            patch: buildPatch(),
            comment: reviewComment.trim() || undefined,
          });
        }

        return executionApi.resumePhaseTakeover(executionId, phase.phaseKey, {
          ...resumePayload,
          comment: reviewComment.trim() || undefined,
        });
      }

      if (executionStatus === 'human_control') {
        return executionApi.releaseHumanControl(executionId, {
          ...resumePayload,
          comment: reviewComment.trim() || undefined,
        });
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

  if (!canResume) {
    return null;
  }

  return (
    <>
      <Card title={title || RECOVERY_COPY.panelTitle}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            type={phase?.errorMessage ? 'error' : 'warning'}
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
                    <Text
                      type="secondary"
                      style={{ fontSize: 13 }}
                    >{`${RECOVERY_COPY.phaseStatus}：${phase.status}`}</Text>
                    <Text
                      type="secondary"
                      style={{ fontSize: 13 }}
                    >{`${RECOVERY_COPY.phaseKey}：${phase.phaseKey}`}</Text>
                  </Space>
                ) : null}
                {phase && activeStepId ? (
                  <Space wrap size={8}>
                    <Text strong style={{ fontSize: 13 }}>
                      错误步骤：
                    </Text>
                    {!showAdvancedStepSelect ? (
                      <>
                        <Text style={{ fontSize: 13 }}>
                          {(() => {
                            const step = phase?.steps?.find(
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
                        onChange={setResumeFromStepId}
                        options={(phase?.steps || []).map((step) => ({
                          value: step.stepId || step.id,
                          label: `${step.stepIndex}. ${step.action} ${['failed', 'takeover_required', 'blocked'].includes(step.status) ? '(发生分歧/错误的步骤)' : ''}`,
                        }))}
                      />
                    )}
                  </Space>
                ) : null}
                {phase?.errorMessage ? (
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

          <Form layout="vertical">
            <Form.Item label={RECOVERY_COPY.resumeAction}>
              <Radio.Group
                value={resumeAction}
                onChange={(e) => {
                  if (isRecoveryResumeAction(e.target.value)) {
                    setResumeAction(e.target.value);
                  }
                }}
              >
                <Space wrap>
                  {RECOVERY_RESUME_OPTIONS.map((option) => (
                    <Radio key={option.value} value={option.value}>
                      {option.label}
                    </Radio>
                  ))}
                </Space>
              </Radio.Group>
            </Form.Item>
            <Form.Item label="人工审查记录">
              <Input.TextArea
                rows={3}
                value={reviewComment}
                onChange={(event) => setReviewComment(event.target.value)}
                placeholder="记录人工审查结论，例如：已人工核实该案件可继续承认，允许跳过条件分支并继续后续步骤"
              />
            </Form.Item>
          </Form>

          <Space wrap>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={() => setShowResumeConfirm(true)}
              loading={applyRecoveryMutation.isLoading}
            >
              {RECOVERY_COPY.applyAndResume}
            </Button>
            <Button
              danger
              icon={<StopOutlined />}
              onClick={() => setShowCancelConfirm(true)}
              loading={cancelMutation.isLoading}
            >
              {RECOVERY_COPY.cancelExecution}
            </Button>
          </Space>
        </Space>
      </Card>

      <Modal
        title={RECOVERY_COPY.resumeConfirmTitle}
        open={showResumeConfirm}
        onOk={() => {
          setShowResumeConfirm(false);
          applyRecoveryMutation.mutate();
        }}
        onCancel={() => setShowResumeConfirm(false)}
        okText={RECOVERY_COPY.resumeConfirmOk}
        cancelText={RECOVERY_COPY.resumeConfirmCancel}
      >
        <p>{RECOVERY_COPY.resumeConfirmDesc}</p>
        <p>{RECOVERY_COPY.resumeConfirmHint}</p>
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
