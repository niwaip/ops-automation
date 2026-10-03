import React from 'react';
import {
  Row,
  Col,
  Form,
  Input,
  Select,
  Button,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  BulbOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { AIProviderConfig } from '@/api/ai';
import { PROVIDER_NAMES } from '../types';
import { RecognizedModelProfile } from '../utils/modelProfileRecognizer';

const { Text } = Typography;

interface ModelIdentitySectionProps {
  isEditing: boolean;
  providers: AIProviderConfig[];
  availableModels: string[];
  isLoadingModels: boolean;
  detectedProfile: RecognizedModelProfile | null;
  onFetchRemoteModels: () => void;
  onSelectModelName: (name: string) => void;
  onApplyAutoProfile: (profile?: RecognizedModelProfile | null, showToast?: boolean) => void;
}

export const ModelIdentitySection: React.FC<ModelIdentitySectionProps> = ({
  isEditing,
  providers,
  availableModels,
  isLoadingModels,
  detectedProfile,
  onFetchRemoteModels,
  onSelectModelName,
  onApplyAutoProfile,
}) => {
  return (
    <div style={{ marginBottom: 10 }}>
      {/* Row 1: 服务商与模型名称 */}
      <Row gutter={12}>
        <Col span={11}>
          <Form.Item
            name="providerConfigId"
            label="服务商配置 (Provider)"
            rules={[{ required: true, message: '请选择服务商' }]}
          >
            <Select
              placeholder="选择服务商"
              disabled={isEditing}
              options={providers.map((p) => ({
                value: p.id,
                label: `${p.name || PROVIDER_NAMES[p.provider] || p.provider} (${p.hasCredential ? '已存凭据' : '未配凭据'})`,
              }))}
            />
          </Form.Item>
        </Col>
        <Col span={13}>
          <Form.Item
            name="name"
            label={
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                <span>模型标识 (Model ID)</span>
                <Space size={8}>
                  <Tooltip title="一键识别该模型特性并自动填充思考模式、模态与描述">
                    <Button
                      type="link"
                      size="small"
                      icon={<BulbOutlined />}
                      onClick={() => onApplyAutoProfile(detectedProfile, true)}
                      style={{ padding: 0, height: 'auto', fontSize: 12, color: '#8b5cf6' }}
                    >
                      智能填充
                    </Button>
                  </Tooltip>
                  <Button
                    type="link"
                    size="small"
                    icon={<ReloadOutlined />}
                    loading={isLoadingModels}
                    onClick={onFetchRemoteModels}
                    style={{ padding: 0, height: 'auto', fontSize: 12 }}
                  >
                    拉取列表
                  </Button>
                </Space>
              </div>
            }
            rules={[{ required: true, message: '请输入或选择模型名称' }]}
          >
            {availableModels.length > 0 ? (
              <Select
                showSearch
                placeholder="从拉取的列表中选择或直接输入"
                options={availableModels.map((m) => ({ value: m, label: m }))}
                onChange={onSelectModelName}
              />
            ) : (
              <Input
                placeholder="例如：deepseek-reasoner / claude-3-7-sonnet"
                onBlur={() => {
                  if (!isEditing && detectedProfile) {
                    onApplyAutoProfile(detectedProfile, false);
                  }
                }}
              />
            )}
          </Form.Item>
        </Col>
      </Row>

      {/* 实时特性探测标签条 (超紧凑胶囊) */}
      {detectedProfile && detectedProfile.highlights && detectedProfile.highlights.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 10px',
            background: 'rgba(124, 58, 237, 0.1)',
            border: '1px solid rgba(124, 58, 237, 0.25)',
            borderRadius: 6,
            marginBottom: 8,
          }}
        >
          <Space size={6} wrap align="center">
            <Text style={{ fontSize: 12, color: '#a78bfa', fontWeight: 600 }}>特性探测:</Text>
            {detectedProfile.highlights.map((h) => (
              <Tag key={h} color="purple" style={{ margin: 0, fontSize: 11, borderRadius: 4, lineHeight: '18px', padding: '0 6px' }}>
                {h}
              </Tag>
            ))}
          </Space>
          <Button
            type="link"
            size="small"
            icon={<ThunderboltOutlined />}
            onClick={() => onApplyAutoProfile(detectedProfile, true)}
            style={{ fontSize: 11, color: '#a78bfa', padding: 0, height: 'auto' }}
          >
            匹配预设
          </Button>
        </div>
      )}

      {/* Row 2: 显示别名与能力层级 */}
      <Row gutter={12}>
        <Col span={11}>
          <Form.Item name="display_name" label="显示别名 (可选)">
            <Input placeholder="例如：DeepSeek R1 (深度推理)" />
          </Form.Item>
        </Col>
        <Col span={13}>
          <Form.Item name="capability_tier" label="能力层级" initialValue="standard">
            <Select
              options={[
                { label: '⚡ 标准常规模型 (Standard) · 快速低延迟', value: 'standard' },
                { label: '🏆 高级深度模型 (Advanced) · 深度推理解题', value: 'advanced' },
              ]}
            />
          </Form.Item>
        </Col>
      </Row>
    </div>
  );
};
