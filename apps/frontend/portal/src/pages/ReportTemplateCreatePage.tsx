import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Select, Button, Space, Divider, Typography, message, Collapse, Switch, InputNumber, Tag } from 'antd';
import { PlusOutlined, MinusCircleOutlined, SaveOutlined } from '@ant-design/icons';
import {
  reportApi,
  CreateReportTemplateParams,
  ReportSection,
} from '../api/report';

const { Title, Text } = Typography;
const { Panel } = Collapse;

const ReportTemplateCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [sections, setSections] = useState<ReportSection[]>([
    {
      id: `section-${Date.now()}`,
      name: 'Summary',
      type: 'text',
      source: 'ai_analysis',
      ai_prompt: 'Summarize the execution results',
    },
  ]);

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      const params: CreateReportTemplateParams = {
        name: values.name,
        format: values.format,
        sections: sections,
        global_config: {
          title: values.title,
          header: values.header,
          footer: values.footer,
          page_size: values.page_size,
          orientation: values.orientation,
        },
        ai_config: values.ai_enabled ? {
          model_id: values.model_id,
          temperature: values.temperature,
          max_tokens: values.max_tokens,
        } : undefined,
        notification_config: values.notification_enabled ? {
          enabled: true,
          type: values.notification_type,
          recipients: values.recipients?.split(',').map((r: string) => r.trim()),
          webhook_url: values.webhook_url,
        } : undefined,
      };

      await reportApi.createTemplate(params);
      message.success('Report template created successfully');
      navigate('/report-templates');
    } catch (error) {
      message.error('Failed to create report template');
    } finally {
      setLoading(false);
    }
  };

  const addSection = () => {
    const newSection: ReportSection = {
      id: `section-${Date.now()}`,
      name: 'New Section',
      type: 'text',
      source: 'step_result',
    };
    setSections([...sections, newSection]);
  };

  const removeSection = (index: number) => {
    setSections(sections.filter((_, i) => i !== index));
  };

  const updateSection = (index: number, field: string, value: any) => {
    const updated = [...sections];
    updated[index] = { ...updated[index], [field]: value };
    setSections(updated);
  };

  return (
    <div style={{ padding: '24px' }}>
      <Card>
        <Title level={4}>Create Report Template</Title>
        <Divider />

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            format: 'word',
            page_size: 'A4',
            orientation: 'portrait',
            ai_enabled: true,
            notification_enabled: false,
            notification_type: 'webhook',
          }}
        >
          <Form.Item
            name="name"
            label="Template Name"
            rules={[{ required: true, message: 'Please enter template name' }]}
          >
            <Input placeholder="e.g., Daily Operations Report" />
          </Form.Item>

          <Form.Item
            name="format"
            label="Output Format"
            rules={[{ required: true }]}
          >
            <Select>
              <Select.Option value="word">Word (.docx)</Select.Option>
              <Select.Option value="excel">Excel (.xlsx)</Select.Option>
              <Select.Option value="pdf">PDF (.pdf)</Select.Option>
            </Select>
          </Form.Item>

          <Divider>Global Configuration</Divider>

          <Form.Item name="title" label="Report Title">
            <Input placeholder="Report title displayed in the document" />
          </Form.Item>

          <Form.Item name="header" label="Header Text">
            <Input placeholder="Optional header text" />
          </Form.Item>

          <Form.Item name="footer" label="Footer Text">
            <Input placeholder="Optional footer text" />
          </Form.Item>

          <Form.Item name="page_size" label="Page Size">
            <Select>
              <Select.Option value="A4">A4</Select.Option>
              <Select.Option value="A3">A3</Select.Option>
              <Select.Option value="Letter">Letter</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item name="orientation" label="Orientation">
            <Select>
              <Select.Option value="portrait">Portrait</Select.Option>
              <Select.Option value="landscape">Landscape</Select.Option>
            </Select>
          </Form.Item>

          <Divider>Sections</Divider>

          <Collapse>
            {sections.map((section, index) => (
              <Panel
                header={
                  <Space>
                    <Text strong>{index + 1}. {section.name}</Text>
                    <Tag>{section.type}</Tag>
                    <Tag color="blue">{section.source}</Tag>
                    <MinusCircleOutlined
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSection(index);
                      }}
                      style={{ color: 'red' }}
                    />
                  </Space>
                }
                key={section.id}
              >
                <Form.Item label="Section Name">
                  <Input
                    value={section.name}
                    onChange={(e) => updateSection(index, 'name', e.target.value)}
                  />
                </Form.Item>

                <Form.Item label="Section Type">
                  <Select
                    value={section.type}
                    onChange={(value) => updateSection(index, 'type', value)}
                  >
                    <Select.Option value="text">Text</Select.Option>
                    <Select.Option value="table">Table</Select.Option>
                    <Select.Option value="image">Image</Select.Option>
                    <Select.Option value="chart">Chart</Select.Option>
                  </Select>
                </Form.Item>

                <Form.Item label="Content Source">
                  <Select
                    value={section.source}
                    onChange={(value) => updateSection(index, 'source', value)}
                  >
                    <Select.Option value="step_result">Step Result</Select.Option>
                    <Select.Option value="ai_analysis">AI Analysis</Select.Option>
                    <Select.Option value="static">Static Content</Select.Option>
                  </Select>
                </Form.Item>

                {section.source === 'static' && (
                  <Form.Item label="Static Content">
                    <Input.TextArea
                      value={section.content}
                      onChange={(e) => updateSection(index, 'content', e.target.value)}
                      rows={3}
                    />
                  </Form.Item>
                )}

                {section.source === 'ai_analysis' && (
                  <Form.Item label="AI Prompt">
                    <Input.TextArea
                      value={section.ai_prompt}
                      onChange={(e) => updateSection(index, 'ai_prompt', e.target.value)}
                      rows={3}
                      placeholder="Enter the prompt for AI analysis"
                    />
                  </Form.Item>
                )}

                {section.source === 'step_result' && (
                  <>
                    <Form.Item label="Filter by Actions">
                      <Select
                        mode="multiple"
                        placeholder="Select actions to include"
                        value={section.step_filter?.actions}
                        onChange={(value) => updateSection(index, 'step_filter', { ...section.step_filter, actions: value })}
                      >
                        <Select.Option value="click">Click</Select.Option>
                        <Select.Option value="input">Input</Select.Option>
                        <Select.Option value="scroll">Scroll</Select.Option>
                        <Select.Option value="wait">Wait</Select.Option>
                        <Select.Option value="navigate">Navigate</Select.Option>
                      </Select>
                    </Form.Item>
                    <Form.Item label="Only Successful Steps">
                      <Switch
                        checked={section.step_filter?.success_only}
                        onChange={(checked) => updateSection(index, 'step_filter', { ...section.step_filter, success_only: checked })}
                      />
                    </Form.Item>
                  </>
                )}

                <Form.Item label="Validation Condition">
                  <Space.Compact style={{ width: '100%' }}>
                    <Select
                      value={section.validation?.condition?.split(' ')[0] || 'success_count'}
                      onChange={(value) => updateSection(index, 'validation', { ...section.validation, condition: `${value} >= 0` })}
                      style={{ width: '40%' }}
                    >
                      <Select.Option value="success_count">Success Count</Select.Option>
                      <Select.Option value="failure_count">Failure Count</Select.Option>
                      <Select.Option value="has_text">Has Text</Select.Option>
                    </Select>
                    {section.validation?.condition?.includes('count') && (
                      <InputNumber
                        value={parseInt(section.validation?.condition?.match(/\d+/)?.[0] || '0')}
                        onChange={(value) => updateSection(index, 'validation', { ...section.validation, condition: `${section.validation?.condition?.split(' ')[0]} >= ${value}` })}
                        style={{ width: '30%' }}
                      />
                    )}
                  </Space.Compact>
                </Form.Item>

                {section.validation?.condition && (
                  <Form.Item label="On Validation Failure">
                    <Select
                      value={section.validation?.on_fail}
                      onChange={(value) => updateSection(index, 'validation', { ...section.validation, on_fail: value })}
                    >
                      <Select.Option value="skip">Skip Section</Select.Option>
                      <Select.Option value="notify">Send Notification</Select.Option>
                      <Select.Option value="stop">Stop Report Generation</Select.Option>
                    </Select>
                  </Form.Item>
                )}
              </Panel>
            ))}
          </Collapse>

          <Button type="dashed" icon={<PlusOutlined />} onClick={addSection} style={{ width: '100%', marginTop: '16px' }}>
            Add Section
          </Button>

          <Divider>AI Configuration</Divider>

          <Form.Item name="ai_enabled" label="Enable AI Analysis" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item name="model_id" label="AI Model ID">
            <Input placeholder="Optional: specific model ID to use" />
          </Form.Item>

          <Form.Item name="temperature" label="Temperature">
            <InputNumber min={0} max={2} step={0.1} />
          </Form.Item>

          <Form.Item name="max_tokens" label="Max Tokens">
            <InputNumber min={100} max={4000} />
          </Form.Item>

          <Divider>Notification Configuration</Divider>

          <Form.Item name="notification_enabled" label="Enable Notifications" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item name="notification_type" label="Notification Type">
            <Select>
              <Select.Option value="webhook">Webhook</Select.Option>
              <Select.Option value="email">Email</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item name="webhook_url" label="Webhook URL">
            <Input placeholder="https://your-webhook-url.com" />
          </Form.Item>

          <Form.Item name="recipients" label="Email Recipients">
            <Input placeholder="email1@example.com, email2@example.com" />
          </Form.Item>

          <Divider />

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading}>
                Create Template
              </Button>
              <Button onClick={() => navigate('/report-templates')}>
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default ReportTemplateCreatePage;