import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Descriptions, Tag, Button, Space, Typography, Tabs, Collapse, Spin, message, Modal, Form, Input } from 'antd';
import {
  ArrowLeftOutlined,
  CloudUploadOutlined,
  CopyOutlined,
  PlayCircleOutlined,
  BugOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { templateApi, TemplateStep, ParamsSchema } from '../api/template';
import { sessionApi } from '../api/session';
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

  const [executeModalVisible, setExecuteModalVisible] = useState(false);
  const [testModalVisible, setTestModalVisible] = useState(false);
  const [form] = Form.useForm();

  const templateQuery = useQuery(
    ['template', id],
    () => templateApi.getById(id!),
    { enabled: !!id }
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
      // Create session with user_id and template_id
      const result = await sessionApi.create({
        user_id: user?.id || '',
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
        navigate(`/sessions/${session.id}`);
      },
      onError: () => {
        message.error(t('template:executeFailed'));
      },
    }
  );

  const template = templateQuery.data;

  // Extract parameter definitions from params_schema
  const paramProperties = useMemo(() => {
    const schema = template?.params_schema as ParamsSchema | undefined;
    if (!schema?.properties) return {};
    return schema.properties as Record<string, ParamProperty>;
  }, [template?.params_schema]);

  const requiredParams = useMemo(() => {
    const schema = template?.params_schema as ParamsSchema | undefined;
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
      testMutation.mutate(values);
    } catch {
      // Form validation failed
    }
  };

  const testMutation = useMutation(
    async (params: Record<string, unknown>) => {
      // Create session with user_id and template_id for testing
      const result = await sessionApi.create({
        user_id: user?.id || '',
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
        message.success(t('template:testSuccess'));
        setTestModalVisible(false);
        navigate(`/sessions/${session.id}`);
      },
      onError: () => {
        message.error(t('template:testFailed'));
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

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button onClick={() => navigate('/templates')}>
          <ArrowLeftOutlined /> {t('template:templateList')}
        </Button>
      </Space>

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
                    <Descriptions.Item label={t('template:stepType')}>
                      <Tag>{step.type}</Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label={t('template:stepAction')}>
                      {step.action}
                    </Descriptions.Item>
                    {step.selector && (
                      <Descriptions.Item label={t('template:stepSelector')}>
                        <Text code>{step.selector}</Text>
                      </Descriptions.Item>
                    )}
                    {step.value && (
                      <Descriptions.Item label={t('template:stepValue')}>
                        {step.value}
                      </Descriptions.Item>
                    )}
                    {step.timeout && (
                      <Descriptions.Item label={t('template:stepTimeout')}>
                        {step.timeout} ms
                      </Descriptions.Item>
                    )}
                    {step.retry && (
                      <Descriptions.Item label={t('template:stepRetry')}>
                        {step.retry}
                      </Descriptions.Item>
                    )}
                  </Descriptions>
                </Panel>
              ))}
            </Collapse>
          </Tabs.TabPane>

          <Tabs.TabPane tab={t('template:templateParams')} key="params">
            <pre
              style={{
                background: '#f5f5f5',
                padding: 16,
                borderRadius: 4,
                overflow: 'auto',
              }}
            >
              {JSON.stringify(template.params_schema, null, 2)}
            </pre>
          </Tabs.TabPane>

          <Tabs.TabPane tab={t('template:templateGuards')} key="guards">
            <pre
              style={{
                background: '#f5f5f5',
                padding: 16,
                borderRadius: 4,
                overflow: 'auto',
              }}
            >
              {JSON.stringify(template.guards, null, 2)}
            </pre>
          </Tabs.TabPane>

          <Tabs.TabPane tab={t('template:templateConfig')} key="config">
            <pre
              style={{
                background: '#f5f5f5',
                padding: 16,
                borderRadius: 4,
                overflow: 'auto',
              }}
            >
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