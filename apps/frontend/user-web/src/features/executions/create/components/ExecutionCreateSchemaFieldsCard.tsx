import React from 'react';
import {
  Button,
  Collapse,
  Empty,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Typography,
} from 'antd';
import { ReloadOutlined, RobotOutlined, SettingOutlined } from '@ant-design/icons';
import ExecutionCreatePanelCard from '@/features/executions/create/components/ExecutionCreatePanelCard';
import { executionCreatePillTagStyle } from '@/features/executions/create/components/executionCreateStyles';
import type { SchemaField } from '@/features/executions/create/lib/executionCreate';
import {
  getTypeTagColor,
  stringifyPreview,
} from '@/features/executions/create/lib/executionCreate';

const { Panel } = Collapse;
const { Text } = Typography;

interface ExecutionCreateSchemaFieldsCardProps {
  selectedSkillId?: string;
  schemaFields: SchemaField[];
  requiredFieldCount: number;
  optionalFieldCount: number;
  skillLoading: boolean;
  loadingIndicator: React.ReactElement;
  onOpenAiModal: () => void;
  onResetDefaults: () => void;
}

const renderInputField = (field: SchemaField) => {
  const normalizedType = field.type.toLowerCase();

  if (Array.isArray(field.enum) && field.enum.length > 0) {
    return (
      <Select
        style={{ width: '100%' }}
        allowClear
        placeholder={field.description || `请选择 ${field.name}`}
        options={field.enum.map((value) => ({
          label: String(value),
          value,
        }))}
      />
    );
  }

  if (normalizedType === 'number' || normalizedType === 'integer') {
    return <InputNumber style={{ width: '100%' }} placeholder={`请输入 ${field.name}`} />;
  }

  if (normalizedType === 'boolean') {
    return <Switch />;
  }

  if (normalizedType === 'object' || normalizedType === 'json' || normalizedType === 'array') {
    return <Input.TextArea rows={6} placeholder="请输入 JSON 字符串" />;
  }

  return <Input placeholder={field.description || `请输入 ${field.name}`} />;
};

const ExecutionCreateSchemaFieldsCard: React.FC<ExecutionCreateSchemaFieldsCardProps> = ({
  selectedSkillId,
  schemaFields,
  requiredFieldCount,
  optionalFieldCount,
  skillLoading,
  loadingIndicator,
  onOpenAiModal,
  onResetDefaults,
}) => {
  return (
    <ExecutionCreatePanelCard
      size="small"
      type="inner"
      style={{ marginBottom: 16 }}
      styles={{ body: { padding: 0 } }}
    >
      <Collapse ghost defaultActiveKey={['params-settings']} style={{ paddingInline: 8 }}>
        <Panel
          header={
            <Space wrap size={8}>
              <Space size={8}>
                <SettingOutlined style={{ color: 'var(--text-secondary)' }} />
                <Text strong>参数设置</Text>
              </Space>
              <Tag style={executionCreatePillTagStyle}>{schemaFields.length} 个参数</Tag>
              <Tag style={executionCreatePillTagStyle}>{requiredFieldCount} 必填</Tag>
              {optionalFieldCount > 0 ? (
                <Tag style={executionCreatePillTagStyle}>{optionalFieldCount} 可选</Tag>
              ) : null}
            </Space>
          }
          key="params-settings"
        >
          <div
            style={{
              marginBottom: 8,
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <Text type="secondary" style={{ fontSize: 12 }}>
              填写本次执行所需参数；我的工作流会复用冻结步骤，但允许覆盖本次运行值
            </Text>
            <Space wrap size={8}>
              <Button
                size="small"
                icon={<RobotOutlined />}
                onClick={onOpenAiModal}
                disabled={!selectedSkillId}
              >
                智能识别
              </Button>
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={onResetDefaults}
                disabled={!selectedSkillId}
              >
                恢复默认
              </Button>
            </Space>
          </div>

          {selectedSkillId && skillLoading ? (
            <div style={{ padding: '40px 0', textAlign: 'center' }}>
              <Spin indicator={loadingIndicator} tip="正在生成参数表单..." />
              <div style={{ marginTop: 16 }}>
                <Text type="secondary">技能参数较多时可能需要几秒，请稍候。</Text>
              </div>
            </div>
          ) : selectedSkillId ? (
            schemaFields.length > 0 ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  gap: 12,
                }}
              >
                {schemaFields.map((field) => {
                  const normalizedType = field.type.toLowerCase();

                  return (
                    <div
                      key={field.name}
                      style={{
                        padding: 14,
                        borderRadius: 16,
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-card)',
                      }}
                    >
                      <Space
                        align="start"
                        style={{
                          width: '100%',
                          justifyContent: 'space-between',
                          marginBottom: 8,
                        }}
                      >
                        <Space size={[6, 6]} wrap>
                          <Text strong>{field.name}</Text>
                          <Tag
                            color={getTypeTagColor(field.type)}
                            style={{ marginInlineEnd: 0, borderRadius: 999 }}
                          >
                            {field.type}
                          </Tag>
                        </Space>
                        <Tag
                          style={{
                            marginInlineEnd: 0,
                            ...executionCreatePillTagStyle,
                          }}
                        >
                          {field.required ? '必填' : '可选'}
                        </Tag>
                      </Space>

                      <Text
                        type="secondary"
                        style={{
                          display: 'block',
                          fontSize: 12,
                          minHeight: 34,
                          marginBottom: 12,
                        }}
                      >
                        {field.description || (field.required ? '必填参数' : '可选参数')}
                      </Text>

                      {field.defaultValue !== undefined ? (
                        <div
                          style={{
                            marginBottom: 12,
                            padding: '8px 10px',
                            borderRadius: 10,
                            background: 'var(--bg-secondary)',
                          }}
                        >
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            默认值：
                            {typeof field.defaultValue === 'string'
                              ? field.defaultValue
                              : stringifyPreview(field.defaultValue)}
                          </Text>
                        </div>
                      ) : null}

                      <Form.Item
                        name={['input', field.name]}
                        style={{ marginBottom: 8 }}
                        rules={[
                          {
                            validator: (_, value) => {
                              if (
                                field.required &&
                                (value === undefined || value === null || value === '')
                              ) {
                                return Promise.reject(new Error(`请输入 ${field.name}`));
                              }

                              if (
                                value &&
                                (normalizedType === 'object' ||
                                  normalizedType === 'json' ||
                                  normalizedType === 'array') &&
                                typeof value === 'string'
                              ) {
                                JSON.parse(value);
                              }

                              return Promise.resolve();
                            },
                          },
                        ]}
                        valuePropName={normalizedType === 'boolean' ? 'checked' : 'value'}
                      >
                        {renderInputField(field)}
                      </Form.Item>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty description="该技能没有定义额外输入参数，可直接创建执行" />
            )
          ) : (
            <Empty description="请选择技能后填写参数" />
          )}
        </Panel>
      </Collapse>
    </ExecutionCreatePanelCard>
  );
};

export default ExecutionCreateSchemaFieldsCard;
