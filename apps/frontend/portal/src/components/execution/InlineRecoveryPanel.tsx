import React from 'react';
import { Alert, Button, Card, Divider, Form, Input, Modal, Radio, Select, Space, Typography, message } from 'antd';
import { PlayCircleOutlined, ReloadOutlined, StopOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from 'react-query';
import { executionApi, ExecutionPhaseDto } from '../../api/execution';
import { RECOVERY_COPY, RECOVERY_RESUME_OPTIONS, RecoveryResumeAction } from './recoveryOptions';

const { Text } = Typography;

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
  const [resumeAction, setResumeAction] = React.useState<RecoveryResumeAction>('retry');
  const [resumeFromStepId, setResumeFromStepId] = React.useState<string | undefined>(undefined);
  const [patchNote, setPatchNote] = React.useState('');
  const [patchInputValues, setPatchInputValues] = React.useState('{}');
  const [showResumeConfirm, setShowResumeConfirm] = React.useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = React.useState(false);

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
    if (resumeAction === 'resume_from_step' && resumeFromStepId) {
      return {
        type: 'resolve_by_human',
        failedStepId: currentStepId || phase?.steps?.[0]?.stepId || phase?.steps?.[0]?.id || '',
        resumeFromStepId,
          note: patchNote || RECOVERY_COPY.retryNote,
      };
    }

    if (resumeAction === 'resolve_by_human') {
      return {
        type: 'resolve_by_human',
        failedStepId: currentStepId || phase?.steps?.[0]?.stepId || phase?.steps?.[0]?.id || '',
          note: patchNote || RECOVERY_COPY.resolveByHumanNote,
      };
    }

    if (patchInputValues.trim() && patchInputValues.trim() !== '{}') {
      try {
        const inputValues = JSON.parse(patchInputValues) as Record<string, unknown>;
        return {
          type: 'replace_input_value',
          failedStepId: currentStepId || phase?.steps?.[0]?.stepId || phase?.steps?.[0]?.id || '',
          inputValues,
          note: patchNote || RECOVERY_COPY.applyPatchNote,
        };
      } catch {
        throw new Error(RECOVERY_COPY.invalidJson);
      }
    }

    return null;
  }, [currentStepId, patchInputValues, patchNote, phase?.steps, resumeAction, resumeFromStepId]);

  const applyRecoveryMutation = useMutation(
    async ({ resumeAfterApply }: { resumeAfterApply: boolean }) => {
      const resumePayload = {
        ...(resumeAction === 'resume_from_step' && resumeFromStepId ? { stepId: resumeFromStepId } : {}),
        ...(patchNote ? { comment: patchNote } : {}),
      };

      if (phase) {
        if (phase.status === 'waiting_takeover') {
          await executionApi.reconcilePhaseTakeover(executionId, phase.phaseKey, {
            comment: patchNote || undefined,
            patch: buildPatch(),
          });
        }

        if (resumeAfterApply) {
          return executionApi.resumePhaseTakeover(executionId, phase.phaseKey, resumePayload);
        }

        return executionApi.getById(executionId);
      }

      if (executionStatus === 'human_control') {
        return resumeAfterApply
          ? executionApi.releaseHumanControl(executionId, resumePayload)
          : executionApi.getById(executionId);
      }

      throw new Error(RECOVERY_COPY.noRecoverablePhase);
    },
    {
      onSuccess: async (_data, variables) => {
        void message.success(variables.resumeAfterApply ? RECOVERY_COPY.successResume : RECOVERY_COPY.successMarkResumable);
        await invalidateExecutionQueries();
      },
      onError: (error: Error) => {
        void message.error(error.message);
      },
    }
  );

  const cancelMutation = useMutation(
    () => executionApi.cancel(executionId),
    {
      onSuccess: async () => {
        void message.success(RECOVERY_COPY.successCancel);
        await invalidateExecutionQueries();
      },
      onError: (error: Error) => {
        void message.error(`${RECOVERY_COPY.cancelErrorPrefix}：${error.message}`);
      },
    }
  );

  const canResume = Boolean(
    phase
      ? phase.status === 'waiting_takeover' || phase.status === 'resumable'
      : executionStatus === 'human_control',
  );

  if (!canResume) {
    return null;
  }

  return (
    <>
      <Card title={title || RECOVERY_COPY.panelTitle}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            type="warning"
            showIcon
            message={phase ? `${RECOVERY_COPY.currentPhase}：${phase.phaseName || phase.phaseKey}` : RECOVERY_COPY.activeHumanControl}
            description={
              <Space direction="vertical" size={4}>
                {phase ? (
                  <>
                    <Text type="secondary">{`${RECOVERY_COPY.phaseStatus}：${phase.status}`}</Text>
                    <Text type="secondary">{`${RECOVERY_COPY.phaseKey}：${phase.phaseKey}`}</Text>
                  </>
                ) : null}
                {phase?.errorMessage ? <Text type="danger">{phase.errorMessage}</Text> : null}
              </Space>
            }
          />

          <Form layout="vertical">
            <Form.Item label={RECOVERY_COPY.resumeAction}>
              <Radio.Group value={resumeAction} onChange={(e) => setResumeAction(e.target.value)}>
                <Space direction="vertical">
                  {RECOVERY_RESUME_OPTIONS.map((option) => (
                    <Radio key={option.value} value={option.value}>{option.label}</Radio>
                  ))}
                </Space>
              </Radio.Group>
            </Form.Item>

            {resumeAction === 'resume_from_step' ? (
              <Form.Item label={RECOVERY_COPY.resumeFromStep}>
                <Select
                  placeholder={RECOVERY_COPY.selectStep}
                  value={resumeFromStepId}
                  onChange={setResumeFromStepId}
                  options={(phase?.steps || []).map((step) => ({
                    value: step.stepId || step.id,
                    label: `${step.stepIndex}. ${step.action} (${step.status})`,
                  }))}
                />
              </Form.Item>
            ) : null}

            <Divider style={{ margin: '8px 0 16px' }} />

            <Form.Item label={RECOVERY_COPY.patchJson}>
              <Input.TextArea
                rows={3}
                placeholder={RECOVERY_COPY.patchJsonPlaceholder}
                value={patchInputValues}
                onChange={(e) => setPatchInputValues(e.target.value)}
              />
            </Form.Item>

            <Form.Item label={RECOVERY_COPY.note}>
              <Input.TextArea
                rows={2}
                placeholder={RECOVERY_COPY.notePlaceholder}
                value={patchNote}
                onChange={(e) => setPatchNote(e.target.value)}
              />
            </Form.Item>
          </Form>

          <Space wrap>
            {phase?.status === 'waiting_takeover' ? (
              <Button
                icon={<ReloadOutlined />}
                onClick={() => applyRecoveryMutation.mutate({ resumeAfterApply: false })}
                loading={applyRecoveryMutation.isLoading}
              >
                {RECOVERY_COPY.markResumableOnly}
              </Button>
            ) : null}
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
          applyRecoveryMutation.mutate({ resumeAfterApply: true });
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
