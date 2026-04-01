import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Tag, Button, Space, Typography, Tabs, Collapse, Spin, message } from 'antd';
import {
  ArrowLeftOutlined,
  CloudUploadOutlined,
  CopyOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { templateApi, TemplateStep } from '../api/template';
import { useAuthStore } from '../store/authStore';

const { Title, Text } = Typography;
const { Panel } = Collapse;

const TemplateDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation(['common', 'template']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const templateQuery = useQuery(
    ['template', id],
    () => templateApi.getById(id!),
    { enabled: !!id }
  );

  const publishMutation = useMutation(
    (templateId: string) => templateApi.publish(templateId, user?.id || ''),
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

  const template = templateQuery.data;

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
              {template.status === 'DRAFT' && user?.role === 'admin' && (
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
                icon={<CheckCircleOutlined />}
                onClick={() => templateApi.validate(template.id)}
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
    </div>
  );
};

export default TemplateDetailPage;