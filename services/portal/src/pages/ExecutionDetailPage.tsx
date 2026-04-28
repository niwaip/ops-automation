/**
 * ExecutionDetailPage
 * View execution details and steps
 * Phase 4: Portal Execution views
 */

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Tag, Button, Space, Typography, Spin, Alert, Table, Steps, Empty, Form, Input, InputNumber, Switch, message } from 'antd';
import {
  ArrowLeftOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { executionApi, ExecutionDto, ExecutionStepDto, ExecutionStatus } from '../api/execution';

const { Title, Text } = Typography;

interface RequiredInputField {
  name: string;
  type: string;
  description?: string;
  required: boolean;
  value?: unknown;
  missing: boolean;
  source: 'user_input' | 'default' | 'unresolved';
}

const statusColors: Record<ExecutionStatus, string> = {
  draft: 'default',
  queued: 'default',
  running: 'processing',
  waiting_input: 'warning',
  pending_approval: 'warning',
  human_control: 'error',
  paused: 'default',
  succeeded: 'success',
  failed: 'error',
  cancelled: 'default',
  rolled_back: 'default',
};

const stepStatusIcons: Record<string, React.ReactNode> = {
  pending: <ClockCircleOutlined />,
  running: <PlayCircleOutlined />,
  succeeded: <CheckCircleOutlined style={{ color: 'green' }} />,
  failed: <CloseCircleOutlined style={{ color: 'red' }} />,
  skipped: <PauseCircleOutlined />,
};

const ExecutionDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();

  // Fetch execution details
  const { data: execution, isLoading: isLoadingExecution, error: errorExecution } = useQuery<ExecutionDto, Error>(
    ['execution', id],
    () => executionApi.getById(id!),
    { enabled: !!id }
  );

  // Fetch execution steps
  const { data: steps } = useQuery<ExecutionStepDto[], Error>(
    ['execution-steps', id],
    () => executionApi.getSteps(id!),
    { enabled: !!id }
  );

  const submitInputMutation = useMutation(
    (values: Record<string, unknown>) => executionApi.submitInput(id!, {
      stepId: waitingInputStep!.id,
      input: values,
    }),
    {
      onSuccess: () => {
        message.success('Input submitted and execution resumed');
        void queryClient.invalidateQueries(['execution', id]);
        void queryClient.invalidateQueries(['execution-steps', id]);
      },
      onError: (error: Error) => {
        message.error(`Failed to submit input: ${error.message}`);
      },
    }
  );

  const approveMutation = useMutation(
    () => executionApi.approve(id!),
    {
      onSuccess: () => {
        message.success('Execution approved');
        void queryClient.invalidateQueries(['execution', id]);
        void queryClient.invalidateQueries(['execution-steps', id]);
      },
      onError: (error: Error) => {
        message.error(`Failed to approve execution: ${error.message}`);
      },
    }
  );

  const rejectMutation = useMutation(
    () => executionApi.reject(id!),
    {
      onSuccess: () => {
        message.success('Execution rejected');
        void queryClient.invalidateQueries(['execution', id]);
        void queryClient.invalidateQueries(['execution-steps', id]);
      },
      onError: (error: Error) => {
        message.error(`Failed to reject execution: ${error.message}`);
      },
    }
  );

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

  const getCurrentStepIndex = () => {
    if (!steps || !execution.currentStepId) return -1;
    return steps.findIndex(s => s.id === execution.currentStepId);
  };

  const waitingInputStep = execution.status === 'waiting_input'
    ? steps?.find((step) =>
      step.id === execution.currentStepId ||
      (step.type === 'input_collection' && step.status === 'running')
    )
    : undefined;

  const requiredInputs = Array.isArray(waitingInputStep?.input?.requiredInputs)
    ? waitingInputStep.input.requiredInputs as RequiredInputField[]
    : [];

  const handleSubmitInput = (values: Record<string, unknown>) => {
    submitInputMutation.mutate(values);
  };

  const renderInputField = (field: RequiredInputField) => {
    const normalizedType = field.type.toLowerCase();

    if (normalizedType === 'number' || normalizedType === 'integer') {
      return <InputNumber style={{ width: '100%' }} />;
    }

    if (normalizedType === 'boolean') {
      return <Switch />;
    }

    if (normalizedType === 'object' || normalizedType === 'json') {
      return <Input.TextArea rows={4} placeholder="Enter JSON string" />;
    }

    return <Input placeholder={field.description || `Enter ${field.name}`} />;
  };

  const normalizeSubmittedValues = (values: Record<string, unknown>) => {
    return requiredInputs.reduce<Record<string, unknown>>((acc, field) => {
      const rawValue = values[field.name];
      if (rawValue === undefined) {
        return acc;
      }

      if ((field.type.toLowerCase() === 'object' || field.type.toLowerCase() === 'json') && typeof rawValue === 'string') {
        acc[field.name] = JSON.parse(rawValue);
        return acc;
      }

      acc[field.name] = rawValue;
      return acc;
    }, {});
  };

  const stepColumns = [
    {
      title: 'Step',
      dataIndex: 'stepIndex',
      key: 'stepIndex',
      width: 80,
      render: (index: number) => `Step ${index + 1}`,
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      width: 150,
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 120,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => (
        <Space>{stepStatusIcons[status]} {status}</Space>
      ),
    },
    {
      title: 'Action',
      dataIndex: 'action',
      key: 'action',
      width: 100,
    },
    {
      title: 'Error',
      dataIndex: 'errorMessage',
      key: 'errorMessage',
      render: (error?: string) => error ? <Text type="danger">{error}</Text> : '-',
    },
    {
      title: 'Duration',
      key: 'duration',
      render: (_: unknown, record: ExecutionStepDto) => {
        if (record.startedAt && record.endedAt) {
          const duration = new Date(record.endedAt).getTime() - new Date(record.startedAt).getTime();
          return `${(duration / 1000).toFixed(1)}s`;
        }
        return '-';
      },
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Space align="center" style={{ marginBottom: 16 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/executions')}>
            Back to Executions
          </Button>
          {execution.status === 'human_control' && (
            <Button
              type="primary"
              onClick={() => navigate(`/executions/${id}/takeover`)}
            >
              Enter Takeover Mode
            </Button>
          )}
        </Space>
        <Title level={2}>Execution Details</Title>
        <Text type="secondary">ID: {execution.id}</Text>
      </div>

      {/* Takeover Alert */}
      {execution.status === 'human_control' && (
        <Alert
          type="warning"
          message="Human Takeover Required"
          description={
            <div>
              <p>{execution.takeoverReason || 'The execution requires human intervention.'}</p>
              <Button
                type="primary"
                icon={<UserOutlined />}
                onClick={() => navigate(`/executions/${id}/takeover`)}
              >
                Enter Takeover Workbench
              </Button>
            </div>
          }
          icon={<WarningOutlined />}
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}

      {execution.status === 'pending_approval' && (
        <Card title="Approval Required" style={{ marginBottom: 16 }}>
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message="Execution is waiting for approval"
            description={
              execution.approvalStatus
                ? `Current approval status: ${execution.approvalStatus}`
                : 'Review the execution details and decide whether it can continue.'
            }
          />
          <Space>
            <Button type="primary" loading={approveMutation.isLoading} onClick={() => approveMutation.mutate()}>
              Approve And Continue
            </Button>
            <Button danger loading={rejectMutation.isLoading} onClick={() => rejectMutation.mutate()}>
              Reject Execution
            </Button>
          </Space>
        </Card>
      )}

      {execution.status === 'waiting_input' && waitingInputStep && (
        <Card title="Missing Input Required" style={{ marginBottom: 16 }}>
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message="Execution is waiting for additional input"
            description="Fill in the missing parameters below to resume execution."
          />
          <Form
            form={form}
            layout="vertical"
            initialValues={requiredInputs.reduce<Record<string, unknown>>((acc, field) => {
              acc[field.name] = field.value;
              return acc;
            }, {})}
            onFinish={(values) => {
              try {
                handleSubmitInput(normalizeSubmittedValues(values));
              } catch (error) {
                message.error(error instanceof Error ? error.message : 'Invalid JSON input');
              }
            }}
          >
            {requiredInputs.map((field) => (
              <Form.Item
                key={field.name}
                name={field.name}
                label={`${field.name} (${field.type})`}
                extra={field.description || `Source: ${field.source}`}
                rules={[
                  {
                    required: field.required,
                    message: `Please provide ${field.name}`,
                  },
                ]}
                valuePropName={field.type.toLowerCase() === 'boolean' ? 'checked' : 'value'}
              >
                {renderInputField(field)}
              </Form.Item>
            ))}
            <Space>
              <Button type="primary" htmlType="submit" loading={submitInputMutation.isLoading}>
                Submit And Resume
              </Button>
              <Button onClick={() => form.resetFields()}>
                Reset
              </Button>
            </Space>
          </Form>
        </Card>
      )}

      {/* Execution Info */}
      <Card style={{ marginBottom: 16 }}>
        <Descriptions column={2}>
          <Descriptions.Item label="Status">
            <Tag color={statusColors[execution.status]}>{execution.status.toUpperCase()}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Skill ID">{execution.skillId}</Descriptions.Item>
          <Descriptions.Item label="Runtime Type">{execution.runtimeType}</Descriptions.Item>
          <Descriptions.Item label="Risk Level">{execution.riskLevel}</Descriptions.Item>
          <Descriptions.Item label="Approval Status">{execution.approvalStatus || '-'}</Descriptions.Item>
          <Descriptions.Item label="Created By">{execution.createdBy}</Descriptions.Item>
          <Descriptions.Item label="Created At">
            {new Date(execution.createdAt).toLocaleString()}
          </Descriptions.Item>
          {execution.startedAt && (
            <Descriptions.Item label="Started At">
              {new Date(execution.startedAt).toLocaleString()}
            </Descriptions.Item>
          )}
          {execution.endedAt && (
            <Descriptions.Item label="Ended At">
              {new Date(execution.endedAt).toLocaleString()}
            </Descriptions.Item>
          )}
          {execution.failureReason && (
            <Descriptions.Item label="Failure Reason" span={2}>
              <Text type="danger">{execution.failureReason}</Text>
            </Descriptions.Item>
          )}
          {execution.failureCode && (
            <Descriptions.Item label="Failure Code">
              <Text type="danger">{execution.failureCode}</Text>
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {/* Input/Output */}
      {(execution.input || execution.result) && (
        <Card title="Input & Output" style={{ marginBottom: 16 }}>
          {execution.input && (
            <div style={{ marginBottom: 16 }}>
              <Text strong>Input:</Text>
              <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, overflow: 'auto' }}>
                {JSON.stringify(execution.input, null, 2)}
              </pre>
            </div>
          )}
          {execution.result && (
            <div>
              <Text strong>Result:</Text>
              <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, overflow: 'auto' }}>
                {JSON.stringify(execution.result, null, 2)}
              </pre>
            </div>
          )}
        </Card>
      )}

      {/* Steps Progress */}
      {steps && steps.length > 0 && (
        <Card title="Steps Progress" style={{ marginBottom: 16 }}>
          <Steps
            current={getCurrentStepIndex()}
            size="small"
            style={{ marginBottom: 24 }}
            items={steps.map((step, index) => ({
              title: step.name || `Step ${index + 1}`,
              status: step.status as 'wait' | 'process' | 'finish' | 'error',
              description: step.action,
            }))}
          />
        </Card>
      )}

      {/* Steps Table */}
      <Card title="Steps Details">
        {steps && steps.length > 0 ? (
          <Table
            columns={stepColumns}
            dataSource={steps}
            rowKey="id"
            pagination={false}
            size="small"
          />
        ) : (
          <Empty description="No steps recorded" />
        )}
      </Card>
    </div>
  );
};

export default ExecutionDetailPage;
