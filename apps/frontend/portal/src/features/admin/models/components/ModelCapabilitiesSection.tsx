import React from 'react';
import { Form, Tag, Switch, Select, Tooltip, Typography, Space } from 'antd';
import { InfoCircleOutlined, CheckCircleOutlined, CheckOutlined, PlusOutlined } from '@ant-design/icons';
import { MODALITY_OPTIONS } from '../types';

const { Text } = Typography;

interface ModelCapabilitiesSectionProps {
  selectedModalities: string[];
  supportsReasoning: boolean;
  onModalitiesChange: (newModalities: string[]) => void;
}

export const ModelCapabilitiesSection: React.FC<ModelCapabilitiesSectionProps> = ({
  selectedModalities,
  supportsReasoning,
  onModalitiesChange,
}) => {
  const isMultimodal = selectedModalities.some((m) => m !== 'text');

  const handleToggle = (tagValue: string) => {
    let next: string[];
    if (selectedModalities.includes(tagValue)) {
      // 如果已选，点击则取消（至少保留 1 个模态，防止全空）
      if (selectedModalities.length <= 1) {
        return;
      }
      next = selectedModalities.filter((t) => t !== tagValue);
    } else {
      // 如果未选，点击则添加（多选模式）
      next = Array.from(new Set([...selectedModalities, tagValue]));
    }
    onModalitiesChange(next);
  };

  return (
    <div
      style={{
        background: 'var(--bg-hover, rgba(255, 255, 255, 0.03))',
        border: '1px solid var(--border-color, #334155)',
        borderRadius: 8,
        padding: '10px 14px',
        marginBottom: 10,
      }}
    >
      {/* Row 1: 输入模态 (支持多选) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>
            输入模态 (可多选):
          </Text>
          <Space size={6} wrap>
            {MODALITY_OPTIONS.map((opt) => {
              const isChecked = selectedModalities.includes(opt.value);
              return (
                <div
                  key={opt.value}
                  onClick={() => handleToggle(opt.value)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 12,
                    padding: '3px 9px',
                    borderRadius: 5,
                    cursor: 'pointer',
                    userSelect: 'none',
                    transition: 'all 0.2s',
                    background: isChecked ? 'rgba(22, 119, 255, 0.16)' : 'var(--bg-secondary, rgba(255, 255, 255, 0.04))',
                    border: isChecked ? '1px solid #1677ff' : '1px solid var(--border-color, #334155)',
                    color: isChecked ? '#3b82f6' : 'var(--text-secondary, #94a3b8)',
                    fontWeight: isChecked ? 600 : 400,
                  }}
                >
                  {isChecked ? (
                    <CheckOutlined style={{ fontSize: 10, color: '#3b82f6' }} />
                  ) : (
                    <PlusOutlined style={{ fontSize: 10, opacity: 0.5 }} />
                  )}
                  <span>{opt.icon}</span>
                  <span>{opt.label.split(' ')[0]}</span>
                </div>
              );
            })}
          </Space>
        </div>

        {isMultimodal && (
          <Tag color="cyan" icon={<CheckCircleOutlined />} style={{ margin: 0, fontSize: 11 }}>
            多模态就绪
          </Tag>
        )}
      </div>

      {/* Divider */}
      <div
        style={{
          height: 1,
          background: 'var(--border-color, #334155)',
          margin: '9px 0',
          opacity: 0.6,
        }}
      />

      {/* Row 2: 原生思考与思维链 (Thinking / Reasoning) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>🧠</span>
          <Text strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>
            原生思考模式 (Thinking / Reasoning):
          </Text>
          <Form.Item name="supports_reasoning" valuePropName="checked" noStyle>
            <Switch size="small" />
          </Form.Item>
        </div>

        {supportsReasoning ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              思考强度:
            </Text>
            <Form.Item name="reasoning_effort" noStyle initialValue="medium">
              <Select
                size="small"
                style={{ width: 130 }}
                options={[
                  { label: '🟢 浅度 (Low)', value: 'low' },
                  { label: '🔵 适中 (Medium)', value: 'medium' },
                  { label: '🟣 深度 (High)', value: 'high' },
                ]}
              />
            </Form.Item>
            <Tooltip title="自动适配 OpenAI (reasoning_effort)、Claude (thinking)、Gemini、通义千问 (Thinking Budget) 及 MiniMax 协议">
              <InfoCircleOutlined style={{ color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13 }} />
            </Tooltip>
          </div>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>
            适用于 R1、o1/o3、Claude 3.7、Gemini 2.5、QwQ 等
          </Text>
        )}
      </div>
    </div>
  );
};
