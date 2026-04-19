/**
 * TakeoverWorkbenchPage
 * Page for human takeover of executions in human_control status
 * NIW-142: Portal TakeoverWorkbenchPage (Phase 3.3)
 */

import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Button, Space, Typography, message, Spin, Alert, Descriptions, Divider, Modal } from 'antd';
import {
  ArrowLeftOutlined,
  PlayCircleOutlined,
  StopOutlined,
  ReloadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { executionApi, ExecutionDto } from '../api/execution';

const { Title, Text, Paragraph } = Typography;

const TakeoverWorkbenchPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const [showResumeConfirm, setShowResumeConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Fetch execution details
  const { data: execution, isLoading: isLoadingExecution, error: errorExecution } = useQuery<ExecutionDto, Error>(
    ['execution', id],
    () => executionApi.getById(id!),
    { enabled: !!id }
  );

  // Resume mutation
  const resumeMutation = useMutation(
    (stepId?: string) => executionApi.resume(id!, { stepId }),
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
    resumeMutation.mutate();
  };

  const handleCancel = () => {
    setShowCancelConfirm(false);
    cancelMutation.mutate();
  };

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

  if (execution.status !== 'human_control') {
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

  // Get noVNC URL from execution result or connection info
  const novncUrl = execution.result?.novncUrl as string || 'http://localhost:6080/vnc.html';

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
            </div>
          }
          icon={<WarningOutlined />}
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}

      {/* Main Content */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: 24 }}>
        {/* noVNC Iframe */}
        <Card
          title="Browser View"
          extra={
            <Button icon={<ReloadOutlined />} onClick={() => window.location.reload()}>
              Refresh
            </Button>
          }
        >
          <div style={{ background: '#000', height: '600px', borderRadius: 8, overflow: 'hidden' }}>
            <iframe
              src={novncUrl}
              width="100%"
              height="100%"
              style={{ border: 'none' }}
              title="Browser Takeover"
              allow="fullscreen"
            />
          </div>
        </Card>

        {/* Control Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Execution Info */}
          <Card title="Execution Info" size="small">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Status">
                <Text strong style={{ color: 'orange' }}>{execution.status.toUpperCase()}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Skill ID">{execution.skillId}</Descriptions.Item>
              <Descriptions.Item label="Created At">
                {new Date(execution.createdAt).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="Runtime Type">{execution.runtimeType}</Descriptions.Item>
            </Descriptions>
          </Card>

          {/* Control Buttons */}
          <Card title="Controls" size="small">
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                size="large"
                block
                onClick={() => setShowResumeConfirm(true)}
                loading={resumeMutation.isLoading}
              >
                Resume Execution
              </Button>
              <Button
                danger
                icon={<StopOutlined />}
                size="large"
                block
                onClick={() => setShowCancelConfirm(true)}
                loading={cancelMutation.isLoading}
              >
                Cancel Execution
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
                <li>Click "Resume Execution" when finished to let the AI continue</li>
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