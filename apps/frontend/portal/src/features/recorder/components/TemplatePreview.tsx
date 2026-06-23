import React from 'react';
import {
  Card,
  Button,
  Space,
  Typography,
  Empty,
  Descriptions,
  Tag,
  List,
  Alert,
  message,
  Tooltip,
  Collapse,
} from 'antd';
import {
  SaveOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { CompiledTemplate, ValidationResult } from '@/services/recorder.service';

const { Text, Title } = Typography;

interface ParamSchemaItem {
  type: string;
  description?: string;
}

interface TemplatePreviewProps {
  template: CompiledTemplate | null;
  validation: ValidationResult | null;
  onSave: (template: CompiledTemplate) => void;
  saving?: boolean;
}

const TemplatePreview: React.FC<TemplatePreviewProps> = ({
  template,
  validation,
  onSave,
  saving = false,
}) => {
  const { t } = useTranslation(['common', 'recorder', 'template']);

  const handleSave = () => {
    if (!template) {
      void message.warning(t('recorder:noTemplate'));
      return;
    }
    if (validation && !validation.valid) {
      void message.warning(t('recorder:validationFailed'));
      return;
    }
    onSave(template);
  };

  const handleDownload = () => {
    if (!template) return;
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${template.name || 'template'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getValidationIcon = () => {
    if (!validation) return null;
    if (validation.valid) {
      return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
    }
    if (validation.errors.length > 0) {
      return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
    }
    return <WarningOutlined style={{ color: '#faad14' }} />;
  };

  const getStepActionColor = (action: string): string => {
    const colors: Record<string, string> = {
      click: '#52c41a',
      fill: '#faad14',
      navigate: '#1890ff',
      wait: '#722ed1',
      select: '#eb2f96',
      check: '#13c2c2',
      screenshot: '#8c8c8c',
      assert: '#fa8c16',
    };
    return colors[action] || '#595959';
  };

  const getLocatorTypeTag = (type: string): React.ReactNode => {
    const colors: Record<string, string> = {
      role: 'blue',
      text: 'green',
      test_id: 'purple',
      'test-id': 'purple',
      css: 'orange',
      xpath: 'red',
    };
    return <Tag color={colors[type] || 'default'}>{type}</Tag>;
  };

  const getExecutionPolicyTag = (policy?: string): React.ReactNode => {
    const normalized = policy || 'auto_execute';
    const mapping: Record<string, { color: string; label: string }> = {
      auto_execute: { color: 'green', label: '自动执行' },
      require_confirmation: { color: 'gold', label: '需确认' },
      require_takeover: { color: 'orange', label: '人工接管' },
      forbid_in_replay: { color: 'red', label: '禁止回放' },
    };
    const resolved = mapping[normalized] || { color: 'default', label: normalized };
    return <Tag color={resolved.color}>{resolved.label}</Tag>;
  };

  if (!template) {
    return (
      <Card title={t('recorder:templatePreview')}>
        <Empty description={t('recorder:noTemplateYet')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </Card>
    );
  }

  const hasParamsSchema =
    template.params_schema.properties && Object.keys(template.params_schema.properties).length > 0;

  const paramsEntries: Array<[string, ParamSchemaItem]> = hasParamsSchema
    ? Object.entries(template.params_schema.properties as Record<string, ParamSchemaItem>)
    : [];

  const collapseItems = template.steps.map((step, index) => ({
    key: String(index),
    label: (
      <Space>
        <Tag color={getStepActionColor(step.action)}>{step.action}</Tag>
        <Text type="secondary">{step.step_id}</Text>
        {step.locator && getLocatorTypeTag(step.locator.type)}
      </Space>
    ),
    children: (
      <Descriptions size="small" column={1}>
        {step.locator && (
          <Descriptions.Item label={t('recorder:locator')}>
            <Space>
              {getLocatorTypeTag(step.locator.type)}
              <Text code>{step.locator.value}</Text>
              {step.locator.fallback && (
                <Text type="secondary">
                  (fallback: {step.locator.fallback.type}={step.locator.fallback.value})
                </Text>
              )}
            </Space>
          </Descriptions.Item>
        )}
        {step.params && (
          <Descriptions.Item label={t('recorder:params')}>
            <Text code>{JSON.stringify(step.params)}</Text>
          </Descriptions.Item>
        )}
        {step.wait && (
          <Descriptions.Item label={t('recorder:wait')}>
            <Text>
              {step.wait.type}: {step.wait.value}
            </Text>
          </Descriptions.Item>
        )}
        {step.retry && (
          <Descriptions.Item label={t('recorder:retry')}>
            {step.retry.max_attempts} attempts, {step.retry.delay_ms}ms delay
          </Descriptions.Item>
        )}
        <Descriptions.Item label="执行策略">
          {getExecutionPolicyTag(step.execution_policy)}
        </Descriptions.Item>
        <Descriptions.Item label={t('recorder:onFail')}>{step.on_fail || 'stop'}</Descriptions.Item>
      </Descriptions>
    ),
  }));

  return (
    <Card
      title={
        <Space>
          <FileTextOutlined />
          {t('recorder:templatePreview')}
          {getValidationIcon()}
        </Space>
      }
      extra={
        <Space>
          <Tooltip title={t('recorder:downloadJson')}>
            <Button icon={<DownloadOutlined />} onClick={handleDownload} />
          </Tooltip>
        </Space>
      }
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {/* Validation Alert */}
        {validation && (
          <Alert
            type={validation.valid ? 'success' : 'error'}
            showIcon
            message={
              validation.valid ? t('recorder:validationPassed') : t('recorder:validationFailed')
            }
            description={
              !validation.valid && validation.errors.length > 0 ? (
                <List
                  size="small"
                  dataSource={validation.errors}
                  renderItem={(error) => (
                    <List.Item>
                      <Text type="danger">{error}</Text>
                    </List.Item>
                  )}
                />
              ) : undefined
            }
          />
        )}

        {/* Warnings */}
        {validation && validation.warnings && validation.warnings.length > 0 && (
          <Alert
            type="warning"
            showIcon
            message={t('recorder:warnings')}
            description={
              <List
                size="small"
                dataSource={validation.warnings}
                renderItem={(warning) => (
                  <List.Item>
                    <Text type="warning">{warning}</Text>
                  </List.Item>
                )}
              />
            }
          />
        )}

        {/* Template Metadata */}
        <Descriptions size="small" bordered column={2}>
          <Descriptions.Item label={t('template:name')}>{template.name}</Descriptions.Item>
          <Descriptions.Item label={t('template:version')}>{template.version}</Descriptions.Item>
          <Descriptions.Item label={t('template:status')}>
            <Tag>{template.status}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('template:stepsCount')}>
            {template.steps.length}
          </Descriptions.Item>
        </Descriptions>

        {/* Steps Preview */}
        <Title level={5}>{t('recorder:stepsPreview')}</Title>
        <Collapse items={collapseItems} />

        {/* Params Schema */}
        {hasParamsSchema && (
          <>
            <Title level={5}>{t('recorder:paramsSchema')}</Title>
            <List
              size="small"
              bordered
              dataSource={paramsEntries}
              renderItem={(entry) => {
                const paramName = entry[0];
                const schema = entry[1];
                return (
                  <List.Item>
                    <Space>
                      <Text strong>{paramName}</Text>
                      <Tag>{schema.type}</Tag>
                      {schema.description && <Text type="secondary">{schema.description}</Text>}
                      {template.params_schema.required.includes(paramName) && (
                        <Tag color="red">{t('recorder:required')}</Tag>
                      )}
                    </Space>
                  </List.Item>
                );
              }}
            />
          </>
        )}

        {/* Save Button */}
        <Button
          type="primary"
          size="large"
          block
          icon={<SaveOutlined />}
          onClick={handleSave}
          loading={saving}
          disabled={!template || (validation !== null && !validation.valid)}
        >
          {t('recorder:saveTemplate')}
        </Button>
      </Space>
    </Card>
  );
};

export default TemplatePreview;
