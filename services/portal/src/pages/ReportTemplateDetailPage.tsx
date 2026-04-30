import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Typography, Descriptions, Tag, Button, Space, Divider, Collapse, message, Spin } from 'antd';
import { EditOutlined, DeleteOutlined, FileWordOutlined, FileExcelOutlined, FilePdfOutlined } from '@ant-design/icons';
import { reportApi, ReportTemplate, ReportFormat, SectionType, SectionSource } from '../api/report';

const { Title, Text } = Typography;
const { Panel } = Collapse;

const ReportTemplateDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [template, setTemplate] = useState<ReportTemplate | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (id) {
      loadTemplate(id);
    }
  }, [id]);

  const loadTemplate = async (templateId: string) => {
    setLoading(true);
    try {
      const response = await reportApi.getTemplate(templateId);
      setTemplate(response);
    } catch (error) {
      message.error('Failed to load report template');
    } finally {
      setLoading(false);
    }
  };

  const getFormatIcon = (format: ReportFormat) => {
    switch (format) {
      case 'word':
        return <FileWordOutlined style={{ color: '#2b579a' }} />;
      case 'excel':
        return <FileExcelOutlined style={{ color: '#217346' }} />;
      case 'pdf':
        return <FilePdfOutlined style={{ color: '#f40f02' }} />;
      default:
        return null;
    }
  };

  const getSectionTypeTag = (type: SectionType) => {
    const colors: Record<SectionType, string> = {
      text: 'default',
      table: 'processing',
      image: 'success',
      chart: 'warning',
    };
    return <Tag color={colors[type]}>{type}</Tag>;
  };

  const getSourceTag = (source: SectionSource) => {
    const colors: Record<SectionSource, string> = {
      step_result: 'blue',
      ai_analysis: 'purple',
      static: 'cyan',
    };
    return <Tag color={colors[source]}>{source}</Tag>;
  };

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!template) {
    return (
      <div style={{ padding: '24px' }}>
        <Text>Template not found</Text>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
          <Title level={4}>
            <Space>
              {getFormatIcon(template.format)}
              {template.name}
            </Space>
          </Title>
          <Space>
            <Button icon={<EditOutlined />} onClick={() => navigate(`/report-templates/${id}/edit`)}>
              Edit
            </Button>
            <Button icon={<DeleteOutlined />} danger onClick={() => navigate('/report-templates')}>
              Delete
            </Button>
          </Space>
        </div>

        <Descriptions bordered column={2}>
          <Descriptions.Item label="Format">
            <Tag color="blue">{template.format.toUpperCase()}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Created At">
            {new Date(template.created_at).toLocaleString()}
          </Descriptions.Item>
          <Descriptions.Item label="Title">
            {template.global_config?.title || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Page Size">
            {template.global_config?.page_size || 'A4'}
          </Descriptions.Item>
        </Descriptions>

        <Divider />

        <Title level={5}>Sections ({template.sections.length})</Title>

        <Collapse>
          {template.sections.map((section, index) => (
            <Panel
              header={
                <Space>
                  <Text strong>{index + 1}. {section.name}</Text>
                  {getSectionTypeTag(section.type)}
                  {getSourceTag(section.source)}
                </Space>
              }
              key={section.id}
            >
              <Descriptions size="small" column={1}>
                <Descriptions.Item label="ID">{section.id}</Descriptions.Item>
                <Descriptions.Item label="Type">{section.type}</Descriptions.Item>
                <Descriptions.Item label="Source">{section.source}</Descriptions.Item>
                {section.ai_prompt && (
                  <Descriptions.Item label="AI Prompt">
                    <Text italic>{section.ai_prompt}</Text>
                  </Descriptions.Item>
                )}
                {section.step_filter && (
                  <Descriptions.Item label="Step Filter">
                    <Space>
                      {section.step_filter.actions?.map(a => <Tag key={a}>{a}</Tag>)}
                      {section.step_filter.success_only && <Tag color="green">Success Only</Tag>}
                    </Space>
                  </Descriptions.Item>
                )}
                {section.validation && (
                  <Descriptions.Item label="Validation">
                    <Space direction="vertical">
                      <Text>Condition: <Tag>{section.validation.condition}</Tag></Text>
                      <Text>On Fail: <Tag color="orange">{section.validation.on_fail}</Tag></Text>
                    </Space>
                  </Descriptions.Item>
                )}
              </Descriptions>
            </Panel>
          ))}
        </Collapse>

        {template.ai_config && (
          <Divider />
        )}

        {template.ai_config && (
          <>
            <Title level={5}>AI Configuration</Title>
            <Descriptions size="small" column={2}>
              {template.ai_config.model_id && (
                <Descriptions.Item label="Model ID">{template.ai_config.model_id}</Descriptions.Item>
              )}
              {template.ai_config.temperature && (
                <Descriptions.Item label="Temperature">{template.ai_config.temperature}</Descriptions.Item>
              )}
              {template.ai_config.max_tokens && (
                <Descriptions.Item label="Max Tokens">{template.ai_config.max_tokens}</Descriptions.Item>
              )}
            </Descriptions>
          </>
        )}

        {template.notification_config && (
          <Divider />
        )}

        {template.notification_config && template.notification_config.enabled && (
          <>
            <Title level={5}>Notification Configuration</Title>
            <Descriptions size="small" column={2}>
              <Descriptions.Item label="Type">
                <Tag color="purple">{template.notification_config.type}</Tag>
              </Descriptions.Item>
              {template.notification_config.recipients && (
                <Descriptions.Item label="Recipients">
                  {template.notification_config.recipients.join(', ')}
                </Descriptions.Item>
              )}
              {template.notification_config.webhook_url && (
                <Descriptions.Item label="Webhook URL">
                  {template.notification_config.webhook_url}
                </Descriptions.Item>
              )}
            </Descriptions>
          </>
        )}
      </Card>
    </div>
  );
};

export default ReportTemplateDetailPage;