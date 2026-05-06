import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Descriptions, Tag, Button, Space, Typography, Tabs, Collapse, Spin, message, Modal, Form, Input, Alert, theme as antdTheme } from 'antd';
import {
  ArrowLeftOutlined,
  CloudUploadOutlined,
  CopyOutlined,
  PlayCircleOutlined,
  BugOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { templateApi, TemplateStep, TemplateParamsSchema } from '../api/template';
import { sessionApi, workerApi } from '../api/session';
import { useAuthStore } from '../store/authStore';

const { Title, Text } = Typography;
const { Panel } = Collapse;

interface ParamProperty {
  type?: string;
  description?: string;
}

const TemplateDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation(['common', 'template']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { token } = antdTheme.useToken();

  const [executeModalVisible, setExecuteModalVisible] = useState(false);
  const [testModalVisible, setTestModalVisible] = useState(false);
  const [workerExhausted, setWorkerExhausted] = useState(false);
  const [form] = Form.useForm();

  const templateQuery = useQuery(
    ['template', id],
    () => templateApi.getById(id!),
    { enabled: !!id }
  );

  // Reset worker pool mutation
  const resetWorkerMutation = useMutation(
    async () => {
      const result = await workerApi.reset();
      setWorkerExhausted(false);
      return result;
    },
    {
      onSuccess: (result) => {
        message.success(result.message || t('template:workerResetSuccess'));
      },
      onError: () => {
        message.error(t('template:workerResetFailed'));
      },
    }
  );

  // Auto-open execute modal if execute=true in query params
  useEffect(() => {
    if (searchParams.get('execute') === 'true' && templateQuery.data?.status === 'PUBLISHED') {
      setExecuteModalVisible(true);
    }
    // Auto-open test modal if test=true in query params (for any status)
    if (searchParams.get('test') === 'true' && templateQuery.data) {
      setTestModalVisible(true);
    }
  }, [searchParams, templateQuery.data?.status, templateQuery.data]);

  const publishMutation = useMutation(
    (templateId: string) => templateApi.publish(templateId, user?.id || ''),
    {
      onSuccess: () => {
        message.success(t('common:success'));
        queryClient.invalidateQueries(['template', id]);
      },
    }
  );

  const submitForReviewMutation = useMutation(
    (templateId: string) => templateApi.submitForReview(templateId),
    {
      onSuccess: () => {
        message.success(t('common:success'));
        queryClient.invalidateQueries(['template', id]);
      },
    }
  );

  const cloneMutation = useMutation(templateApi.clone, {
    onSuccess: (newTemplate) => {
      message.success(t('common:success'));
      navigate(`/templates/${newTemplate.id}`);
    },
  });

  const executeMutation = useMutation(
    async (params: Record<string, unknown>) => {
      if (!user?.id) {
        throw new Error('用户未登录，请先登录');
      }
      // Create session with user_id and template_id
      const result = await sessionApi.create({
        user_id: user.id,
        template_id: id!,
        params,
      });
      // Start the session with template_id and params
      await sessionApi.start(result.session.id, {
        template_id: id!,
        params,
      });
      return result.session;
    },
    {
      onSuccess: (session) => {
        message.success(t('template:executeSuccess'));
        setExecuteModalVisible(false);
        setWorkerExhausted(false);
        navigate(`/sessions/${session.id}`);
      },
      onError: (error: any) => {
        const errorMsg = error.response?.data?.message || error.message || '';
        // Check if worker pool is exhausted
        if (errorMsg.includes('No available workers') || errorMsg.includes('workers')) {
          setWorkerExhausted(true);
          message.error(t('template:workerExhausted'));
        } else {
          message.error(errorMsg || t('template:executeFailed'));
        }
      },
    }
  );

  const template = templateQuery.data;

  // Extract parameter definitions from params_schema
  const paramProperties = useMemo(() => {
    const schema = template?.params_schema as TemplateParamsSchema | undefined;
    if (!schema?.properties) return {};
    return schema.properties as Record<string, ParamProperty>;
  }, [template?.params_schema]);

  const requiredParams = useMemo(() => {
    const schema = template?.params_schema as TemplateParamsSchema | undefined;
    return schema?.required || [];
  }, [template?.params_schema]);

  const hasParams = Object.keys(paramProperties).length > 0;

  const handleExecuteClick = () => {
    if (hasParams) {
      setExecuteModalVisible(true);
    } else {
      executeMutation.mutate({});
    }
  };

  const handleTestClick = () => {
    if (hasParams) {
      setTestModalVisible(true);
    } else {
      testMutation.mutate({});
    }
  };

  const handleTestConfirm = async () => {
    try {
      const values = await form.validateFields();
      // Close popup immediately; test continues in background.
      setTestModalVisible(false);
      message.loading({
        content: '测试已提交，正在后台执行...',
        key: 'template-test-progress',
        duration: 0,
      });
      testMutation.mutate(values);
    } catch {
      // Form validation failed
    }
  };

  const testMutation = useMutation(
    async (params: Record<string, unknown>) => {
      if (!user?.id) {
        throw new Error('用户未登录，请先登录');
      }
      // Create session with user_id and template_id for testing
      const result = await sessionApi.create({
        user_id: user.id,
        template_id: id!,
        params,
      });
      // Start the session with template_id and params
      await sessionApi.start(result.session.id, {
        template_id: id!,
        params,
      });
      return result.session;
    },
    {
      onSuccess: (session) => {
        message.success({
          content: `${t('template:testSuccess')}（Session: ${session.id}）`,
          key: 'template-test-progress',
        });
        setWorkerExhausted(false);
      },
      onError: (error: any) => {
        const errorMsg = error.response?.data?.message || error.message || '';
        // Check if worker pool is exhausted
        if (errorMsg.includes('No available workers') || errorMsg.includes('workers')) {
          setWorkerExhausted(true);
          message.error({
            content: t('template:workerExhausted'),
            key: 'template-test-progress',
          });
        } else {
          message.error({
            content: errorMsg || t('template:testFailed'),
            key: 'template-test-progress',
          });
        }
      },
    }
  );

  const handleExecuteConfirm = async () => {
    try {
      const values = await form.validateFields();
      executeMutation.mutate(values);
    } catch {
      // Form validation failed
    }
  };

  const getStatusColor = (status: string) => {
    const colorMap: Record<string, string> = {
      DRAFT: 'default',
      REVIEW: 'processing',
      PUBLISHED: 'success',
      DEPRECATED: 'warning',
      REVOKED: 'error',
    };
    return colorMap[status] || 'default';
  };

  if (templateQuery.isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!template) {
    return (
      <Card>
        <Title level={4}>{t('common:noData')}</Title>
        <Button onClick={() => navigate('/templates')}>
          <ArrowLeftOutlined /> {t('template:templateList')}
        </Button>
      </Card>
    );
  }

  const templateConfig = (template.config || {}) as Record<string, unknown>;
  const exportedScript = typeof templateConfig.script === 'string' ? templateConfig.script : '';
  const exportedOutputs = Array.isArray(templateConfig.outputs)
    ? templateConfig.outputs as Array<Record<string, unknown>>
    : [];
  const exportedSkillDraft = templateConfig.skillDraft && typeof templateConfig.skillDraft === 'object'
    ? templateConfig.skillDraft as Record<string, unknown>
    : null;
  const jsonBlockStyle: React.CSSProperties = {
    margin: 0,
    background: token.colorFillAlter,
    color: token.colorText,
    border: `1px solid ${token.colorBorderSecondary}`,
    padding: 16,
    borderRadius: token.borderRadius,
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  };
  const scriptBlockStyle: React.CSSProperties = {
    ...jsonBlockStyle,
    background: token.colorBgElevated,
    color: token.colorText,
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button onClick={() => navigate('/templates')}>
          <ArrowLeftOutlined /> {t('template:templateList')}
        </Button>
      </Space>

      {/* Worker exhausted warning */}
      {workerExhausted && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('template:workerExhaustedTitle')}
          description={
            <Space direction="vertical" size="small">
              <span>{t('template:workerExhaustedDesc')}</span>
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                onClick={() => resetWorkerMutation.mutate()}
                loading={resetWorkerMutation.isLoading}
              >
                {t('template:resetWorkers')}
              </Button>
            </Space>
          }
        />
      )}

      <Card
        title={
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <span>
              {t('template:templateDetail')} - {template.name}
            </span>
            <Space>
              {template.status === 'PUBLISHED' && (
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  onClick={handleExecuteClick}
                  loading={executeMutation.isLoading}
                >
                  {t('template:executeTemplate')}
                </Button>
              )}
              {template.status === 'DRAFT' && (
                <Button
                  type="primary"
                  icon={<CloudUploadOutlined />}
                  onClick={() => submitForReviewMutation.mutate(template.id)}
                  loading={submitForReviewMutation.isLoading}
                >
                  {t('template:submitForReview')}
                </Button>
              )}
              {template.status === 'REVIEW' && user?.role === 'admin' && (
                <Button
                  type="primary"
                  icon={<CloudUploadOutlined />}
                  onClick={() => publishMutation.mutate(template.id)}
                  loading={publishMutation.isLoading}
                >
                  {t('template:publishTemplate')}
                </Button>
              )}
              <Button
                icon={<CopyOutlined />}
                onClick={() => cloneMutation.mutate(template.id)}
                loading={cloneMutation.isLoading}
              >
                {t('template:cloneTemplate')}
              </Button>
              <Button
                icon={<BugOutlined />}
                onClick={handleTestClick}
                loading={testMutation.isLoading}
              >
                {t('template:testTemplate')}
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => resetWorkerMutation.mutate()}
                loading={resetWorkerMutation.isLoading}
              >
                {t('template:resetWorkers')}
              </Button>
            </Space>
          </Space>
        }
      >
        <Descriptions bordered column={{ xs: 1, sm: 2, md: 3 }}>
          <Descriptions.Item label={t('template:templateName')}>{template.name}</Descriptions.Item>
          <Descriptions.Item label={t('template:templateVersion')}>
            {template.version}
          </Descriptions.Item>
          <Descriptions.Item label={t('template:templateStatus')}>
            <Tag color={getStatusColor(template.status)}>
              {t(`template:status${template.status}`)}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('common:description')} span={3}>
            {template.description || '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('template:createdBy')}>
            {template.created_by}
          </Descriptions.Item>
          <Descriptions.Item label={t('template:reviewedBy')}>
            {template.reviewed_by || '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('template:publishedAt')}>
            {template.published_at ? new Date(template.published_at).toLocaleString() : '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('common:createdAt')}>
            {new Date(template.created_at).toLocaleString()}
          </Descriptions.Item>
          <Descriptions.Item label={t('common:updatedAt')}>
            {new Date(template.updated_at).toLocaleString()}
          </Descriptions.Item>
          <Descriptions.Item label={t('template:deprecatedAt')}>
            {template.deprecated_at ? new Date(template.deprecated_at).toLocaleString() : '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <Tabs defaultActiveKey="steps">
          <Tabs.TabPane tab={t('template:templateSteps')} key="steps">
            <Collapse accordion>
              {template.steps?.map((step: TemplateStep, index: number) => (
                <Panel
                  header={`Step ${index + 1}: ${step.action}`}
                  key={index}
                >
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label={t('template:stepAction')}>
                      {step.action}
                    </Descriptions.Item>
                    {step.locator && (
                      <Descriptions.Item label={t('template:stepSelector')}>
                        <Tag>{step.locator.type}</Tag>
                        <Text code>{step.locator.value}</Text>
                      </Descriptions.Item>
                    )}
                    {step.params && Object.keys(step.params).length > 0 && (
                      <Descriptions.Item label={t('template:stepParams')}>
                        <pre style={jsonBlockStyle}>{JSON.stringify(step.params, null, 2)}</pre>
                      </Descriptions.Item>
                    )}
                    {step.wait && (
                      <Descriptions.Item label={t('template:stepTimeout')}>
                        <Tag>{step.wait.type}</Tag>
                        {step.wait.value}
                      </Descriptions.Item>
                    )}
                    {step.retry && (
                      <Descriptions.Item label={t('template:stepRetry')}>
                        {step.retry.max_attempts} attempts, {step.retry.delay_ms}ms delay
                      </Descriptions.Item>
                    )}
                  </Descriptions>
                </Panel>
              ))}
            </Collapse>
          </Tabs.TabPane>

          <Tabs.TabPane tab={t('template:templateParams')} key="params">
            <pre style={jsonBlockStyle}>
              {JSON.stringify(template.params_schema, null, 2)}
            </pre>
          </Tabs.TabPane>

          <Tabs.TabPane tab={t('template:templateGuards')} key="guards">
            <pre style={jsonBlockStyle}>
              {JSON.stringify(template.guards, null, 2)}
            </pre>
          </Tabs.TabPane>

          <Tabs.TabPane tab={t('template:templateConfig')} key="config">
            {(exportedScript || exportedOutputs.length > 0 || exportedSkillDraft) && (
              <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }} size="middle">
                {exportedScript && (
                  <Card size="small" title="JS 脚本">
                    <Collapse ghost defaultActiveKey={[]}>
                      <Panel header="展开查看 JS 脚本" key="script">
                        <pre style={scriptBlockStyle}>
                          {exportedScript}
                        </pre>
                      </Panel>
                    </Collapse>
                  </Card>
                )}
                {exportedOutputs.length > 0 && (
                  <Card size="small" title="输出内容">
                    <Descriptions column={1} size="small" bordered>
                      {exportedOutputs.map((output, index) => (
                        <Descriptions.Item
                          key={`${index}-${String(output.name || 'output')}`}
                          label={String(output.name || `output_${index + 1}`)}
                        >
                          <div>{String(output.description || '-')}</div>
                          <div style={{ marginTop: 4 }}>
                            <Text type="secondary">位置: {String(output.location || '-')}</Text>
                          </div>
                        </Descriptions.Item>
                      ))}
                    </Descriptions>
                  </Card>
                )}
                {exportedSkillDraft && (
                  <Card size="small" title="Skill 草稿">
                    <pre style={jsonBlockStyle}>
                      {JSON.stringify(exportedSkillDraft, null, 2)}
                    </pre>
                  </Card>
                )}
              </Space>
            )}
            <pre style={jsonBlockStyle}>
              {JSON.stringify(template.config, null, 2)}
            </pre>
          </Tabs.TabPane>
        </Tabs>
      </Card>

      {/* Execute Parameter Modal */}
      <Modal
        title={t('template:executeModalTitle')}
        open={executeModalVisible}
        onOk={handleExecuteConfirm}
        onCancel={() => setExecuteModalVisible(false)}
        confirmLoading={executeMutation.isLoading}
        okText={t('template:executeTemplate')}
        cancelText={t('common:cancel')}
      >
        <p style={{ marginBottom: 16 }}>{t('template:executeModalDesc')}</p>
        <Form form={form} layout="vertical">
          {Object.entries(paramProperties).map(([paramName, paramDef]) => (
            <Form.Item
              key={paramName}
              name={paramName}
              label={paramName}
              rules={[
                { required: requiredParams.includes(paramName), message: `${paramName} is required` },
              ]}
              help={paramDef.description || undefined}
            >
              <Input placeholder={paramDef.description || t('template:paramValue')} />
            </Form.Item>
          ))}
        </Form>
      </Modal>

      {/* Test Parameter Modal */}
      <Modal
        title={t('template:testModalTitle')}
        open={testModalVisible}
        onOk={handleTestConfirm}
        onCancel={() => setTestModalVisible(false)}
        confirmLoading={testMutation.isLoading}
        okText={t('template:testTemplate')}
        cancelText={t('common:cancel')}
      >
        <p style={{ marginBottom: 16 }}>{t('template:testModalDesc')}</p>
        <Form form={form} layout="vertical">
          {Object.entries(paramProperties).map(([paramName, paramDef]) => (
            <Form.Item
              key={paramName}
              name={paramName}
              label={paramName}
              rules={[
                { required: requiredParams.includes(paramName), message: `${paramName} is required` },
              ]}
              help={paramDef.description || undefined}
            >
              <Input placeholder={paramDef.description || t('template:paramValue')} />
            </Form.Item>
          ))}
        </Form>
      </Modal>
    </div>
  );
};

export default TemplateDetailPage;
