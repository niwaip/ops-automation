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
import { executionApi, ExecutionDto, ExecutionStepDto } from '../api/execution';
import { skillApi } from '../api/skill';
import { capabilityReleaseApi } from '../api/capability-release';
import { useAuthStore } from '../store/authStore';
import {
  EXECUTION_ACTIVE_POLLING_STATUSES,
  EXECUTION_STATUS_COLORS,
  EXECUTION_STATUS_LABELS_EN,
  EXECUTION_STATUS_LABELS_ZH,
} from '../utils/executionStatusMeta';

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

const statusColors = EXECUTION_STATUS_COLORS;

const stepTypeLabels: Record<string, { zh: string; en: string }> = {
  input_collection: { zh: '输入采集', en: 'Input Collection' },
  approval: { zh: '审批', en: 'Approval' },
  activity: { zh: '活动', en: 'Activity' },
  skill: { zh: '技能', en: 'Skill' },
};

const stepStatusLabels: Record<string, { zh: string; en: string }> = {
  pending: { zh: '待执行', en: 'Pending' },
  running: { zh: '执行中', en: 'Running' },
  succeeded: { zh: '已成功', en: 'Succeeded' },
  failed: { zh: '失败', en: 'Failed' },
  skipped: { zh: '已跳过', en: 'Skipped' },
  waiting_input: { zh: '待补输入', en: 'Waiting Input' },
  pending_approval: { zh: '待审批', en: 'Pending Approval' },
  cancelled: { zh: '已取消', en: 'Cancelled' },
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
  const { language } = useAuthStore();
  const isEnglish = language === 'en-US';
  const text = {
    loading: isEnglish ? 'Loading execution...' : '正在加载执行详情...',
    loadFailed: isEnglish ? 'Failed to load execution' : '加载执行详情失败',
    notFound: isEnglish ? 'Execution not found' : '未找到执行记录',
    backToExecutions: isEnglish ? 'Back to Executions' : '返回执行列表',
    enterTakeoverMode: isEnglish ? 'Enter Takeover Mode' : '进入接管模式',
    details: isEnglish ? 'Execution Details' : '执行详情',
    idLabel: isEnglish ? 'ID' : '执行单 ID',
    takeoverRequired: isEnglish ? 'Human Takeover Required' : '需要人工接管',
    takeoverDescDefault: isEnglish ? 'The execution requires human intervention.' : '该执行需要人工介入处理。',
    enterTakeoverWorkbench: isEnglish ? 'Enter Takeover Workbench' : '进入人工接管工作台',
    approvalRequired: isEnglish ? 'Approval Required' : '需要审批',
    approvalWaiting: isEnglish ? 'Execution is waiting for approval' : '执行正在等待审批',
    approvalStatusPrefix: isEnglish ? 'Current approval status:' : '当前审批状态：',
    approvalDescDefault: isEnglish ? 'Review the execution details and decide whether it can continue.' : '请先查看执行详情，再决定是否允许继续执行。',
    approveAndContinue: isEnglish ? 'Approve And Continue' : '批准并继续执行',
    rejectExecution: isEnglish ? 'Reject Execution' : '拒绝执行',
    missingInputRequired: isEnglish ? 'Missing Input Required' : '需要补充输入',
    waitingInput: isEnglish ? 'Execution is waiting for additional input' : '执行正在等待补充输入',
    waitingInputDesc: isEnglish ? 'Fill in the missing parameters below to resume execution.' : '请填写下面缺失的参数后恢复执行。',
    invalidJson: isEnglish ? 'Invalid JSON input' : 'JSON 输入格式无效',
    submitAndResume: isEnglish ? 'Submit And Resume' : '提交并恢复执行',
    reset: isEnglish ? 'Reset' : '重置',
    status: isEnglish ? 'Status' : '状态',
    skillId: isEnglish ? 'Skill ID' : '技能标识',
    runtimeType: isEnglish ? 'Runtime Type' : '运行时类型',
    riskLevel: isEnglish ? 'Risk Level' : '风险等级',
    approvalStatus: isEnglish ? 'Approval Status' : '审批状态',
    createdBy: isEnglish ? 'Created By' : '创建人',
    createdAt: isEnglish ? 'Created At' : '创建时间',
    startedAt: isEnglish ? 'Started At' : '开始时间',
    endedAt: isEnglish ? 'Ended At' : '结束时间',
    failureReason: isEnglish ? 'Failure Reason' : '失败原因',
    failureCode: isEnglish ? 'Failure Code' : '失败代码',
    inputOutput: isEnglish ? 'Input & Output' : '输入与输出',
    input: isEnglish ? 'Input' : '输入',
    result: isEnglish ? 'Result' : '结果',
    stepsProgress: isEnglish ? 'Steps Progress' : '步骤进度',
    stepsDetails: isEnglish ? 'Steps Details' : '步骤详情',
    noSteps: isEnglish ? 'No steps recorded' : '暂无步骤记录',
    inputSubmitted: isEnglish ? 'Input submitted and execution resumed' : '输入已提交，执行已恢复',
    submitInputFailed: isEnglish ? 'Failed to submit input' : '提交输入失败',
    executionApproved: isEnglish ? 'Execution approved' : '执行已批准',
    approveFailed: isEnglish ? 'Failed to approve execution' : '批准执行失败',
    executionRejected: isEnglish ? 'Execution rejected' : '执行已拒绝',
    rejectFailed: isEnglish ? 'Failed to reject execution' : '拒绝执行失败',
    provideField: isEnglish ? 'Please provide' : '请输入',
    enterJsonString: isEnglish ? 'Enter JSON string' : '请输入 JSON 字符串',
    enterField: isEnglish ? 'Enter' : '请输入',
    source: isEnglish ? 'Source' : '来源',
    step: isEnglish ? 'Step' : '步骤',
    name: isEnglish ? 'Name' : '名称',
    type: isEnglish ? 'Type' : '类型',
    action: isEnglish ? 'Action' : '动作',
    error: isEnglish ? 'Error' : '错误',
    duration: isEnglish ? 'Duration' : '耗时',
  };
  const statusLabels = isEnglish ? EXECUTION_STATUS_LABELS_EN : EXECUTION_STATUS_LABELS_ZH;

  // Fetch execution details
  const { data: execution, isLoading: isLoadingExecution, error: errorExecution } = useQuery<ExecutionDto, Error>(
    ['execution', id],
    () => executionApi.getById(id!),
    {
      enabled: !!id,
      refetchInterval: (data) => {
        if (!data) return false;
        return EXECUTION_ACTIVE_POLLING_STATUSES.includes(data.status) ? 3000 : false;
      },
    }
  );

  // Fetch execution steps
  const { data: steps } = useQuery<ExecutionStepDto[], Error>(
    ['execution-steps', id],
    () => executionApi.getSteps(id!),
    {
      enabled: !!id,
      refetchInterval: () => {
        // 如果详情在轮询，步骤也一起轮询
        if (!execution) return false;
        return EXECUTION_ACTIVE_POLLING_STATUSES.includes(execution.status) ? 3000 : false;
      },
    }
  );

  const { data: skillsData } = useQuery(['execution-detail-skills-name-map'], () => skillApi.list());
  const { data: releasesData } = useQuery(
    ['execution-detail-published-skills-name-map'],
    () => capabilityReleaseApi.listReleaseCenter(),
  );

  const skillNameMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (releasesData?.releases || []).forEach((release) => {
      if (release.publishedSkillId) {
        map.set(
          release.publishedSkillId,
          release.sourceName || release.sourceId || release.publishedSkillId,
        );
      }
    });
    (skillsData?.skills || []).forEach((skill) => {
      if (!map.has(skill.id)) {
        map.set(skill.id, skill.name);
      }
    });
    return map;
  }, [releasesData?.releases, skillsData?.skills]);

  const getSkillDisplayName = (skillId?: string) => {
    if (!skillId) {
      return '-';
    }
    return skillNameMap.get(skillId) || skillId;
  };

  const submitInputMutation = useMutation(
    (values: Record<string, unknown>) => executionApi.submitInput(id!, {
      stepId: waitingInputStep!.id,
      input: values,
    }),
    {
      onSuccess: () => {
        void message.success(text.inputSubmitted);
        void queryClient.invalidateQueries(['execution', id]);
        void queryClient.invalidateQueries(['execution-steps', id]);
      },
      onError: (error: Error) => {
        void message.error(`${text.submitInputFailed}: ${error.message}`);
      },
    }
  );

  const approveMutation = useMutation(
    () => executionApi.approve(id!),
    {
      onSuccess: () => {
        void message.success(text.executionApproved);
        void queryClient.invalidateQueries(['execution', id]);
        void queryClient.invalidateQueries(['execution-steps', id]);
      },
      onError: (error: Error) => {
        void message.error(`${text.approveFailed}: ${error.message}`);
      },
    }
  );

  const rejectMutation = useMutation(
    () => executionApi.reject(id!),
    {
      onSuccess: () => {
        void message.success(text.executionRejected);
        void queryClient.invalidateQueries(['execution', id]);
        void queryClient.invalidateQueries(['execution-steps', id]);
      },
      onError: (error: Error) => {
        void message.error(`${text.rejectFailed}: ${error.message}`);
      },
    }
  );

  if (isLoadingExecution) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" tip={text.loading} />
      </div>
    );
  }

  if (errorExecution || !execution) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          type="error"
          message={text.loadFailed}
          description={errorExecution?.message || text.notFound}
          showIcon
          action={
            <Button onClick={() => navigate('/executions')}>
              {text.backToExecutions}
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
      return <Input.TextArea rows={4} placeholder={text.enterJsonString} />;
    }

    return <Input placeholder={field.description || `${text.enterField} ${field.name}`} />;
  };

  const normalizeSubmittedValues = (values: Record<string, unknown>) => {
    return requiredInputs.reduce<Record<string, unknown>>((acc, field) => {
      const rawValue = values[field.name];
      if (rawValue === undefined) {
        return acc;
      }

      if ((field.type.toLowerCase() === 'object' || field.type.toLowerCase() === 'json') && typeof rawValue === 'string') {
        acc[field.name] = JSON.parse(rawValue) as unknown;
        return acc;
      }

      acc[field.name] = rawValue;
      return acc;
    }, {});
  };

  const stepColumns = [
    {
      title: text.step,
      dataIndex: 'stepIndex',
      key: 'stepIndex',
      width: 80,
      render: (index: number) => `${text.step} ${index + 1}`,
    },
    {
      title: text.name,
      dataIndex: 'name',
      key: 'name',
      width: 150,
    },
    {
      title: text.type,
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (type: string) => stepTypeLabels[type]?.[isEnglish ? 'en' : 'zh'] || type,
    },
    {
      title: text.status,
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => (
        <Space>{stepStatusIcons[status]} {stepStatusLabels[status]?.[isEnglish ? 'en' : 'zh'] || status}</Space>
      ),
    },
    {
      title: text.action,
      dataIndex: 'action',
      key: 'action',
      width: 100,
      render: (action?: string) => action || '-',
    },
    {
      title: text.error,
      dataIndex: 'errorMessage',
      key: 'errorMessage',
      render: (error?: string) => error ? <Text type="danger">{error}</Text> : '-',
    },
    {
      title: text.duration,
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
            {text.backToExecutions}
          </Button>
          {execution.status === 'human_control' && (
            <Button
              type="primary"
              onClick={() => navigate(`/executions/${id}/takeover`)}
            >
              {text.enterTakeoverMode}
            </Button>
          )}
        </Space>
        <Title level={2}>{text.details}</Title>
        <Text type="secondary">{text.idLabel}: {execution.id}</Text>
      </div>

      {/* Takeover Alert */}
      {execution.status === 'human_control' && (
        <Alert
          type="warning"
          message={text.takeoverRequired}
          description={
            <div>
              <p>{execution.takeoverReason || text.takeoverDescDefault}</p>
              <Button
                type="primary"
                icon={<UserOutlined />}
                onClick={() => navigate(`/executions/${id}/takeover`)}
              >
                {text.enterTakeoverWorkbench}
              </Button>
            </div>
          }
          icon={<WarningOutlined />}
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}

      {execution.status === 'pending_approval' && (
        <Card title={text.approvalRequired} style={{ marginBottom: 16 }}>
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message={text.approvalWaiting}
            description={
              execution.approvalStatus
                ? `${text.approvalStatusPrefix} ${execution.approvalStatus}`
                : text.approvalDescDefault
            }
          />
          <Space>
            <Button type="primary" loading={approveMutation.isLoading} onClick={() => approveMutation.mutate()}>
              {text.approveAndContinue}
            </Button>
            <Button danger loading={rejectMutation.isLoading} onClick={() => rejectMutation.mutate()}>
              {text.rejectExecution}
            </Button>
          </Space>
        </Card>
      )}

      {execution.status === 'waiting_input' && waitingInputStep && (
        <Card title={text.missingInputRequired} style={{ marginBottom: 16 }}>
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message={text.waitingInput}
            description={text.waitingInputDesc}
          />
          <Form
            form={form}
            layout="vertical"
            initialValues={requiredInputs.reduce<Record<string, unknown>>((acc, field) => {
              acc[field.name] = field.value;
              return acc;
            }, {})}
            onFinish={(values: Record<string, unknown>) => {
              try {
                handleSubmitInput(normalizeSubmittedValues(values));
              } catch (error) {
                void message.error(error instanceof Error ? error.message : text.invalidJson);
              }
            }}
          >
            {requiredInputs.map((field) => (
              <Form.Item
                key={field.name}
                name={field.name}
                label={`${field.name} (${field.type})`}
                extra={field.description || `${text.source}: ${field.source}`}
                rules={[
                  {
                    required: field.required,
                    message: `${text.provideField} ${field.name}`,
                  },
                ]}
                valuePropName={field.type.toLowerCase() === 'boolean' ? 'checked' : 'value'}
              >
                {renderInputField(field)}
              </Form.Item>
            ))}
            <Space>
              <Button type="primary" htmlType="submit" loading={submitInputMutation.isLoading}>
                {text.submitAndResume}
              </Button>
              <Button onClick={() => form.resetFields()}>
                {text.reset}
              </Button>
            </Space>
          </Form>
        </Card>
      )}

      {/* Execution Info */}
      <Card style={{ marginBottom: 16 }}>
        <Descriptions column={2}>
          <Descriptions.Item label={text.status}>
            <Tag color={statusColors[execution.status]}>{statusLabels[execution.status]}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={isEnglish ? 'Skill' : '技能'}>
            <Space direction="vertical" size={0}>
              <Text>{getSkillDisplayName(execution.skillId)}</Text>
              {getSkillDisplayName(execution.skillId) !== execution.skillId ? (
                <Text type="secondary">{`${text.skillId}: ${execution.skillId}`}</Text>
              ) : null}
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label={text.runtimeType}>{execution.runtimeType}</Descriptions.Item>
          <Descriptions.Item label={text.riskLevel}>{execution.riskLevel}</Descriptions.Item>
          <Descriptions.Item label={text.approvalStatus}>{execution.approvalStatus || '-'}</Descriptions.Item>
          <Descriptions.Item label={text.createdBy}>{execution.createdBy}</Descriptions.Item>
          <Descriptions.Item label={text.createdAt}>
            {new Date(execution.createdAt).toLocaleString()}
          </Descriptions.Item>
          {execution.startedAt && (
            <Descriptions.Item label={text.startedAt}>
              {new Date(execution.startedAt).toLocaleString()}
            </Descriptions.Item>
          )}
          {execution.endedAt && (
            <Descriptions.Item label={text.endedAt}>
              {new Date(execution.endedAt).toLocaleString()}
            </Descriptions.Item>
          )}
          {execution.failureReason && (
            <Descriptions.Item label={text.failureReason} span={2}>
              <Text type="danger">{execution.failureReason}</Text>
            </Descriptions.Item>
          )}
          {execution.failureCode && (
            <Descriptions.Item label={text.failureCode}>
              <Text type="danger">{execution.failureCode}</Text>
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {/* Input/Output */}
      {(execution.input || execution.result) && (
        <Card title={text.inputOutput} style={{ marginBottom: 16 }}>
          {execution.input && (
            <div style={{ marginBottom: 16 }}>
              <Text strong>{text.input}:</Text>
              <pre style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--bg-secondary)', padding: 12, borderRadius: 8, overflow: 'auto' }}>
                {JSON.stringify(execution.input, null, 2)}
              </pre>
            </div>
          )}
          {execution.result && (
            <div>
              <Text strong>{text.result}:</Text>
              <pre style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--bg-secondary)', padding: 12, borderRadius: 8, overflow: 'auto' }}>
                {JSON.stringify(execution.result, null, 2)}
              </pre>
            </div>
          )}
        </Card>
      )}

      {/* Steps Progress */}
      {steps && steps.length > 0 && (
        <Card title={text.stepsProgress} style={{ marginBottom: 16 }}>
          <Steps
            current={getCurrentStepIndex()}
            size="small"
            style={{ marginBottom: 24 }}
            items={steps.map((step, index) => ({
              title: step.name || `${text.step} ${index + 1}`,
              status: step.status as 'wait' | 'process' | 'finish' | 'error',
              description: stepStatusLabels[step.status]?.[isEnglish ? 'en' : 'zh'] || step.action,
            }))}
          />
        </Card>
      )}

      {/* Steps Table */}
      <Card title={text.stepsDetails}>
        {steps && steps.length > 0 ? (
          <Table
            columns={stepColumns}
            dataSource={steps}
            rowKey="id"
            pagination={false}
            size="small"
          />
        ) : (
          <Empty description={text.noSteps} />
        )}
      </Card>
    </div>
  );
};

export default ExecutionDetailPage;
