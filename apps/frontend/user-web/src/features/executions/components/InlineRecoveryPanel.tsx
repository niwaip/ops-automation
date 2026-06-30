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
  Tooltip,
  Typography,
  message,
} from 'antd';
import { InfoCircleOutlined, PlayCircleOutlined, StopOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from 'react-query';
import { executionApi, ExecutionPhaseDto } from '@/api/execution';
import {
  RECOVERY_COPY,
  RECOVERY_RESUME_OPTIONS,
  RecoveryResumeAction,
} from './recoveryOptions';

const { Text } = Typography;

const isRecoveryResumeAction = (value: unknown): value is RecoveryResumeAction =>
  value === 'retry' || value === 'resolve_by_human' || value === 'resume_from_step';

const RECOVERY_ACTION_DESCRIPTIONS: Record<RecoveryResumeAction, string> = {
  resume_from_step: '从当前异常点继续，优先用于人工确认后继续后续流程。',
  resolve_by_human: '标记该步骤已由人工处理，跳过当前阶段并继续执行。',
  retry: '重新运行当前阶段，适用于页面或条件判断需要再次验证的场景。',
};

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
  const [resumeAction, setResumeAction] = React.useState<RecoveryResumeAction>('resume_from_step');
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
  }, [currentStepId, phaseSteps]);

  const failedPhaseStepId = React.useMemo(() => {
    if (failedPhaseStep?.stepId || failedPhaseStep?.id) {
      return failedPhaseStep.stepId || failedPhaseStep.id;
    }
    return currentStepId;
  }, [currentStepId, failedPhaseStep]);

  const defaultResumeFromStepId = React.useMemo(() => {
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
  }, [failedPhaseStepId, phaseSteps]);
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
        ...(phaseLoopIteration ? { loopIteration: phaseLoopIteration } : {}),
        resumeFromStepId: activeStepId,
        note: reviewComment.trim() || RECOVERY_COPY.retryNote,
      };
    }

    if (resumeAction === 'resolve_by_human') {
      return {
        type: 'resolve_by_human',
        failedStepId: failedPhaseStepId || '',
        ...(phaseLoopIteration ? { loopIteration: phaseLoopIteration } : {}),
        note: reviewComment.trim() || RECOVERY_COPY.resolveByHumanNote,
      };
    }

    return null;
  }, [failedPhaseStepId, phaseLoopIteration, resumeAction, activeStepId, reviewComment]);

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
  const isTakeoverPhase = phase?.status === 'waiting_takeover';

  if (!canResume) {
    return null;
  }

  return (
    <>
      <Card
        title={title || RECOVERY_COPY.panelTitle}
        size="small"
        styles={{ body: { padding: 16 } }}
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
                              const step = phaseSteps.find((s) => (s.stepId || s.id) === activeStepId);
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
                          options={phaseSteps.map((step) => ({
                            value: step.stepId || step.id,
                            label: `${step.stepIndex}. ${step.action} ${['failed', 'takeover_required', 'blocked'].includes(step.status) ? '(发生分歧/错误的步骤)' : ''}`,
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
                borderRadius: 10,
                border: '1px solid var(--bg-secondary)',
                background: 'var(--bg-secondary)',
              }}
            >
              {auxiliaryContent}
            </div>
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
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  padding: 12,
                  borderRadius: 10,
                  border: '1px solid var(--bg-secondary)',
                  background: 'var(--bg-card)',
                }}
              >
                <Form.Item label="人工审查记录" style={{ marginBottom: 0 }}>
                  <Input.TextArea
                    rows={4}
                    value={reviewComment}
                    onChange={(event) => setReviewComment(event.target.value)}
                    placeholder="记录人工审查结论，例如：已人工核实该案件可继续承认，允许跳过条件分支并继续后续步骤"
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
                  borderRadius: 10,
                  border: '1px solid var(--bg-secondary)',
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
                        <Text strong={resumeAction === option.value}>{option.label}</Text>
                        <Tooltip title={RECOVERY_ACTION_DESCRIPTIONS[option.value]}>
                          <InfoCircleOutlined
                            style={{ fontSize: 14, color: 'var(--text-secondary)', cursor: 'help' }}
                          />
                        </Tooltip>
                      </div>
                    </Radio>
                  ))}
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
              borderTop: '1px solid var(--bg-secondary)',
            }}
          >
            <Space wrap size={[8, 8]}>
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={() => setShowResumeConfirm(true)}
                loading={applyRecoveryMutation.isLoading}
              >
                {RECOVERY_COPY.applyAndResume}
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
