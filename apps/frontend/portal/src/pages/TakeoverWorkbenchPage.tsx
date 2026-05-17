/**
 * TakeoverWorkbenchPage
 * Page for human takeover of executions in human_control status
 * NIW-142: Portal TakeoverWorkbenchPage (Phase 3.3)
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Button, Space, Typography, message, Spin, Alert, Descriptions, Modal, Radio, Select, Input, Form, Divider } from 'antd';
import {
  ArrowLeftOutlined,
  PlayCircleOutlined,
  StopOutlined,
  ReloadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { executionApi, ExecutionDto } from '../api/execution';
import { runtimeSessionApi, RuntimeSessionDto } from '../api/runtimeSession';
import { runtimeConfig } from '../config/runtime';
import LiveSessionPreviewCard from '../components/runtime/LiveSessionPreviewCard';
import { RECOVERY_COPY, RECOVERY_RESUME_OPTIONS, RecoveryResumeAction } from '../components/execution/recoveryOptions';

const { Title, Text, Paragraph } = Typography;

const isLiveRuntimeSessionState = (state?: string): boolean => state === 'busy' || state === 'ready' || state === 'frozen';
const isPreviewRuntimeSessionState = (state?: string): boolean =>
  state === 'allocating' || isLiveRuntimeSessionState(state);

const getRuntimeSessionNovncUrl = (runtimeSession?: RuntimeSessionDto): string | undefined => {
  return typeof runtimeSession?.connectionInfo?.novnc === 'string'
    ? runtimeSession.connectionInfo.novnc
    : undefined;
};

const getRuntimeSessionStatusLabel = (state?: string): string => {
  if (state === 'frozen') {
    return '人工接管';
  }
  if (state === 'ready') {
    return '已就绪';
  }
  if (state === 'busy') {
    return '执行中';
  }
  if (state === 'closed') {
    return '已关闭';
  }
  if (state === 'error') {
    return '异常';
  }
  return '未知';
};

const TakeoverWorkbenchPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const phaseKey = searchParams.get('phaseKey') || undefined;

  const [showResumeConfirm, setShowResumeConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const [resumeAction, setResumeAction] = useState<RecoveryResumeAction>('retry');
  const [resumeFromStepId, setResumeFromStepId] = useState<string | undefined>(undefined);
  const [patchNote, setPatchNote] = useState<string>('');
  const [patchInputValues, setPatchInputValues] = useState<string>('{}');

  // Fetch execution details
  const { data: execution, isLoading: isLoadingExecution, error: errorExecution } = useQuery<ExecutionDto, Error>(
    ['execution', id],
    () => executionApi.getById(id!),
    { enabled: !!id }
  );

  const selectedPhase = useMemo(
    () => execution?.phases?.find((phase) => phase.phaseKey === phaseKey),
    [execution?.phases, phaseKey],
  );

  const executionRuntimeSessionId = execution?.runtimeSessionId;
  const { data: runtimeSession } = useQuery(
    ['runtime-session', executionRuntimeSessionId],
    () => runtimeSessionApi.getById(executionRuntimeSessionId!),
    {
      enabled: !!executionRuntimeSessionId,
      refetchInterval: execution?.status === 'human_control' ? 5000 : false,
    },
  );

  const lastKnownNovncUrlRef = useRef<string | undefined>(undefined);

  // Resume mutation
  const resumeMutation = useMutation(
    (stepId?: string) => (
      phaseKey
        ? executionApi.resumePhaseTakeover(id!, phaseKey, { stepId })
        : executionApi.releaseHumanControl(id!, { stepId })
    ),
    {
      onSuccess: () => {
        message.success('Execution resumed successfully');
        queryClient.invalidateQueries(['execution', id]);
        navigate(`/executions/${id}`);
      },
      onError: (error: Error) => {
        message.error(`Failed to resume: ${error.message}`);
      },
    }
  );

  const reconcileMutation = useMutation(
    () => {
      if (!phaseKey || !id) return Promise.resolve(null);
      
      let patch = null;
      if (resumeAction === 'resume_from_step' && resumeFromStepId) {
        patch = {
          type: 'resolve_by_human',
          failedStepId: execution?.currentStepId || '',
          resumeFromStepId: resumeFromStepId,
          note: patchNote || RECOVERY_COPY.retryNote,
        };
      } else if (resumeAction === 'resolve_by_human') {
        patch = {
          type: 'resolve_by_human',
          failedStepId: execution?.currentStepId || '',
          note: patchNote || RECOVERY_COPY.resolveByHumanNote,
        };
      } else if (patchInputValues && patchInputValues !== '{}') {
        try {
          const inputValues = JSON.parse(patchInputValues);
          patch = {
            type: 'replace_input_value',
            failedStepId: execution?.currentStepId || '',
            inputValues,
            note: patchNote || RECOVERY_COPY.applyPatchNote,
          };
        } catch (e) {
          message.error(RECOVERY_COPY.invalidJson);
          return Promise.reject(new Error(RECOVERY_COPY.invalidJson));
        }
      }

      return executionApi.reconcilePhaseTakeover(id, phaseKey, {
        comment: patchNote,
        patch,
      });
    },
    {
      onSuccess: () => {
        message.success(phaseKey ? 'Phase reconciled with patches' : 'Execution refreshed');
        queryClient.invalidateQueries(['execution', id]);
      },
      onError: (error: Error) => {
        message.error(`Failed to reconcile: ${error.message}`);
      },
    }
  );

  // Cancel mutation
  const cancelMutation = useMutation(
    () => executionApi.cancel(id!),
    {
      onSuccess: () => {
        message.success('Execution cancelled');
        queryClient.invalidateQueries(['execution', id]);
        navigate('/executions');
      },
      onError: (error: Error) => {
        message.error(`Failed to cancel: ${error.message}`);
      },
    }
  );

  const handleResume = () => {
    setShowResumeConfirm(false);
    resumeMutation.mutate(undefined);
  };

  const handleCancel = () => {
    setShowCancelConfirm(false);
    cancelMutation.mutate();
  };

  const runtimeSessionNovncUrl = getRuntimeSessionNovncUrl(runtimeSession);

  useEffect(() => {
    if (runtimeSessionNovncUrl) {
      lastKnownNovncUrlRef.current = runtimeSessionNovncUrl;
    }
  }, [runtimeSessionNovncUrl]);

  if (isLoadingExecution) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" tip="Loading execution..." />
      </div>
    );
  }

  if (errorExecution || !execution) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          type="error"
          message="Failed to load execution"
          description={errorExecution?.message || 'Execution not found'}
          showIcon
          action={
            <Button onClick={() => navigate('/executions')}>
              Back to Executions
            </Button>
          }
        />
      </div>
    );
  }

  const shouldKeepWorkbenchVisible = execution.status === 'human_control'
    || execution.takeoverRequired === true
    || selectedPhase?.status === 'waiting_takeover'
    || selectedPhase?.status === 'resumable'
    || runtimeSession?.state === 'frozen'
    || runtimeSession?.controlMode === 'human';

  if (!shouldKeepWorkbenchVisible) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          type="warning"
          message="Execution is not in takeover mode"
          description={`Current status: ${execution.status}`}
          showIcon
          action={
            <Button onClick={() => navigate(`/executions/${id}`)}>
              View Execution
            </Button>
          }
        />
      </div>
    );
  }

  const novncUrl =
    runtimeSessionNovncUrl ||
    lastKnownNovncUrlRef.current ||
    (execution.result?.novncUrl as string | undefined) ||
    runtimeConfig.noVncUrl;
  const shouldShowLivePreview = Boolean(novncUrl)
    && (isPreviewRuntimeSessionState(runtimeSession?.state) || shouldKeepWorkbenchVisible);

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Space align="center" style={{ marginBottom: 16 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/executions')}>
            Back to Executions
          </Button>
        </Space>
        <Title level={2}>Human Takeover Workbench</Title>
        <Text type="secondary">Execution ID: {execution.id}</Text>
      </div>

      {/* Takeover Reason Alert */}
      {execution.takeoverReason && (
        <Alert
          type="warning"
          message="Takeover Required"
          description={
            <div>
              <p style={{ marginBottom: 8 }}>{execution.takeoverReason}</p>
              <Text type="secondary">
                The execution paused at step: {execution.currentStepId || 'Unknown'}
              </Text>
              {selectedPhase ? (
                <Text type="secondary" style={{ display: 'block' }}>
                  Phase: {selectedPhase.phaseName || selectedPhase.phaseKey}
                </Text>
              ) : null}
            </div>
          }
          icon={<WarningOutlined />}
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}

      {/* Main Content */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: 24 }}>
        {shouldShowLivePreview ? (
          <LiveSessionPreviewCard
            novncUrl={novncUrl}
            title="当前浏览器会话"
            statusLabel={getRuntimeSessionStatusLabel(runtimeSession?.state)}
            height={600}
          />
        ) : (
          <Card
            title="Browser View"
            extra={
              <Button icon={<ReloadOutlined />} onClick={() => window.location.reload()}>
                Refresh
              </Button>
            }
          >
            <Alert
              type="warning"
              showIcon
              message="当前会话画面不可用"
              description={executionRuntimeSessionId
                ? `已找到运行会话 ${executionRuntimeSessionId}，但尚未拿到可用的 noVNC 连接信息。`
                : '当前 execution 没有关联的 runtime session。'}
            />
          </Card>
        )}

        {/* Control Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Execution Info */}
          <Card title="Execution Info" size="small">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Status">
                <Text strong style={{ color: 'orange' }}>{execution.status.toUpperCase()}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Skill ID">{execution.skillId}</Descriptions.Item>
              <Descriptions.Item label="Runtime Session">
                {executionRuntimeSessionId ? (
                  <Text copyable={{ text: executionRuntimeSessionId }}>{executionRuntimeSessionId}</Text>
                ) : (
                  <Text type="secondary">Unavailable</Text>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Session State">
                <Text>{getRuntimeSessionStatusLabel(runtimeSession?.state)}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Created At">
                {new Date(execution.createdAt).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="Runtime Type">{execution.runtimeType}</Descriptions.Item>
              {runtimeSession?.freezeReason ? (
                <Descriptions.Item label="Freeze Reason">
                  <Text type="secondary">{runtimeSession.freezeReason}</Text>
                </Descriptions.Item>
              ) : null}
              {selectedPhase ? (
                <>
                  <Descriptions.Item label="Phase">{selectedPhase.phaseName || selectedPhase.phaseKey}</Descriptions.Item>
                  <Descriptions.Item label="Phase Status">{selectedPhase.status}</Descriptions.Item>
                </>
              ) : null}
            </Descriptions>
          </Card>

          {/* Recovery Options */}
          <Card title={RECOVERY_COPY.panelTitle} size="small">
            <Form layout="vertical">
              <Form.Item label={RECOVERY_COPY.resumeAction}>
                <Radio.Group 
                  value={resumeAction} 
                  onChange={(e) => setResumeAction(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <Space direction="vertical">
                    {RECOVERY_RESUME_OPTIONS.map((option) => (
                      <Radio key={option.value} value={option.value}>{option.label}</Radio>
                    ))}
                  </Space>
                </Radio.Group>
              </Form.Item>

              {resumeAction === 'resume_from_step' && (
                <Form.Item label={RECOVERY_COPY.resumeFromStep}>
                  <Select
                    placeholder={RECOVERY_COPY.selectStep}
                    value={resumeFromStepId}
                    onChange={setResumeFromStepId}
                  >
                    {selectedPhase?.steps?.map(step => (
                      <Select.Option key={step.id} value={step.stepId || step.id}>
                        {`${step.stepIndex}. ${step.action} (${step.status})`}
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              )}

              <Divider style={{ margin: '12px 0' }} />
              
              <Form.Item label={RECOVERY_COPY.patchJson}>
                <Input.TextArea
                  placeholder={RECOVERY_COPY.patchJsonPlaceholder}
                  value={patchInputValues}
                  onChange={(e) => setPatchInputValues(e.target.value)}
                  rows={3}
                />
              </Form.Item>

              <Form.Item label={RECOVERY_COPY.note}>
                <Input.TextArea
                  placeholder={RECOVERY_COPY.notePlaceholder}
                  value={patchNote}
                  onChange={(e) => setPatchNote(e.target.value)}
                  rows={2}
                />
              </Form.Item>
            </Form>
          </Card>

          {/* Control Buttons */}
          <Card title="Controls" size="small">
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <Button
                type={selectedPhase?.status === 'waiting_takeover' ? 'primary' : 'default'}
                icon={<ReloadOutlined />}
                size="large"
                block
                onClick={() => reconcileMutation.mutate()}
                loading={reconcileMutation.isLoading}
                disabled={!phaseKey || selectedPhase?.status === 'resumable'}
              >
                {selectedPhase?.status === 'resumable' ? RECOVERY_COPY.successMarkResumable : RECOVERY_COPY.markResumableOnly}
              </Button>
              <Button
                type={selectedPhase?.status === 'resumable' ? 'primary' : 'default'}
                icon={<PlayCircleOutlined />}
                size="large"
                block
                onClick={() => setShowResumeConfirm(true)}
                loading={resumeMutation.isLoading}
                disabled={selectedPhase?.status === 'waiting_takeover'}
              >
                {RECOVERY_COPY.resumeConfirmOk}
              </Button>
              <Button
                danger
                icon={<StopOutlined />}
                size="large"
                block
                onClick={() => setShowCancelConfirm(true)}
                loading={cancelMutation.isLoading}
              >
                {RECOVERY_COPY.cancelExecution}
              </Button>
            </Space>
          </Card>

          {/* Instructions */}
          <Card title="Instructions" size="small">
            <Paragraph>
              <Text>
                You now have control of the browser session. You can:
              </Text>
              <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                <li>Interact with the browser directly through noVNC</li>
                <li>Fill in forms or navigate as needed</li>
                <li>Click "Apply Recovery Options" after manual fixes to mark the phase resumable</li>
                <li>Click "Resume Execution" when the phase becomes resumable to let the AI continue</li>
                <li>Click "Cancel Execution" to abort the execution</li>
              </ul>
            </Paragraph>
          </Card>
        </div>
      </div>

      {/* Resume Confirmation Modal */}
      <Modal
        title="Resume Execution"
        open={showResumeConfirm}
        onOk={handleResume}
        onCancel={() => setShowResumeConfirm(false)}
        okText="Resume"
        cancelText="Cancel"
      >
        <p>Are you sure you want to resume this execution?</p>
        <p>The AI agent will continue from the current step.</p>
      </Modal>

      {/* Cancel Confirmation Modal */}
      <Modal
        title="Cancel Execution"
        open={showCancelConfirm}
        onOk={handleCancel}
        onCancel={() => setShowCancelConfirm(false)}
        okText="Cancel Execution"
        cancelText="Continue"
        okButtonProps={{ danger: true }}
      >
        <p>Are you sure you want to cancel this execution?</p>
        <p>This action cannot be undone.</p>
      </Modal>
    </div>
  );
};

export default TakeoverWorkbenchPage;
