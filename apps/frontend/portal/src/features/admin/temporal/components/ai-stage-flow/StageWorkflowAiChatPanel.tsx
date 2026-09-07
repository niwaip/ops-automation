import React from 'react';
import {
  Input,
  Button,
  Radio,
  Tag,
  Typography,
  Card,
  Spin,
  Select,
  theme,
} from 'antd';
import {
  SendOutlined,
  ThunderboltOutlined,
  ApiOutlined,
  GlobalOutlined,
  UserOutlined,
  RobotOutlined,
  KeyOutlined,
} from '@ant-design/icons';
import { useQuery } from 'react-query';
import { templateApi } from '@/api/template';
import type { StageFlowMode } from '@/api/orgWorkflow';
import {
  StageAiMessage,
  QUICK_STAGE_FLOW_PRESETS,
  QuickPreset,
} from './stageWorkflowAi.types';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

interface StageWorkflowAiChatPanelProps {
  messages: StageAiMessage[];
  inputPrompt: string;
  setInputPrompt: (val: string) => void;
  selectedMode: StageFlowMode | 'auto';
  setSelectedMode: (mode: StageFlowMode | 'auto') => void;
  selectedTemplateId?: string;
  setSelectedTemplateId: (id?: string) => void;
  credentialKey: string;
  setCredentialKey: (key: string) => void;
  onSendMessage: () => void;
  loading: boolean;
}

export const StageWorkflowAiChatPanel: React.FC<StageWorkflowAiChatPanelProps> = ({
  messages,
  inputPrompt,
  setInputPrompt,
  selectedMode,
  setSelectedMode,
  selectedTemplateId,
  setSelectedTemplateId,
  credentialKey,
  setCredentialKey,
  onSendMessage,
  loading,
}) => {
  const { token } = theme.useToken();

  // 获取系统中已录制的浏览器模版
  const { data: templateResponse } = useQuery(
    ['browser-templates-stage-ai'],
    () => templateApi.list(),
    { enabled: selectedMode === 'browser_template' || selectedMode === 'auto' }
  );
  const browserTemplates = templateResponse?.templates || [];

  const handleApplyPreset = (preset: QuickPreset) => {
    setSelectedMode(preset.mode);
    setInputPrompt(preset.prompt);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '45%',
        minWidth: 420,
        borderRight: `1px solid ${token.colorBorderSecondary}`,
        backgroundColor: token.colorBgContainer,
      }}
    >
      {/* 顶部配置与模式切换 */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          backgroundColor: token.colorFillAlter,
        }}
      >
        <div style={{ marginBottom: 10 }}>
          <Text strong style={{ fontSize: 13, marginRight: 8 }}>
            工作流执行方式：
          </Text>
          <Radio.Group
            size="small"
            value={selectedMode}
            onChange={(e) => setSelectedMode(e.target.value)}
          >
            <Radio.Button value="auto">
              <ThunderboltOutlined /> 智能推断
            </Radio.Button>
            <Radio.Button value="api">
              <ApiOutlined /> 方式一：API 直接更新
            </Radio.Button>
            <Radio.Button value="browser_template">
              <GlobalOutlined /> 方式二：浏览器模版
            </Radio.Button>
          </Radio.Group>
        </div>

        {/* 方式专属辅助参数 */}
        {selectedMode === 'browser_template' && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Select
              size="small"
              placeholder="选择已录制的浏览器模版（可选）"
              style={{ flex: 1 }}
              allowClear
              value={selectedTemplateId}
              onChange={setSelectedTemplateId}
              options={browserTemplates.map((t) => ({
                label: `${t.name} (${t.id})`,
                value: t.id,
              }))}
            />
            <Input
              size="small"
              placeholder="自动注入秘钥 Key (如: VAULT_OA_PWD)"
              prefix={<KeyOutlined style={{ color: token.colorWarning }} />}
              value={credentialKey}
              onChange={(e) => setCredentialKey(e.target.value)}
              style={{ width: 220 }}
            />
          </div>
        )}

        {selectedMode === 'api' && (
          <div style={{ marginTop: 8 }}>
            <Input
              size="small"
              placeholder="认证凭证环境变量 / 秘钥引用 (默认: VAULT_API_KEY)"
              prefix={<KeyOutlined style={{ color: token.colorWarning }} />}
              value={credentialKey}
              onChange={(e) => setCredentialKey(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
        )}

        {/* 快捷推荐提示词 */}
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {QUICK_STAGE_FLOW_PRESETS.map((preset) => (
            <Tag
              key={preset.label}
              color={preset.mode === 'api' ? 'purple' : 'cyan'}
              style={{ cursor: 'pointer', margin: 0, fontSize: 11 }}
              onClick={() => handleApplyPreset(preset)}
            >
              + {preset.label}
            </Tag>
          ))}
        </div>
      </div>

      {/* 消息对话滚动区 */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '88%',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 4,
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              {msg.role === 'user' ? (
                <>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    管理员
                  </Text>
                  <UserOutlined style={{ fontSize: 12, color: token.colorPrimary }} />
                </>
              ) : (
                <>
                  <RobotOutlined style={{ fontSize: 12, color: token.colorSuccess }} />
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    AI 流程架构师
                  </Text>
                </>
              )}
            </div>

            <Card
              size="small"
              style={{
                borderRadius: 10,
                backgroundColor:
                  msg.role === 'user'
                    ? token.colorPrimaryBg
                    : token.colorFillAlter,
                borderColor:
                  msg.role === 'user'
                    ? token.colorPrimaryBorder
                    : token.colorBorderSecondary,
              }}
              styles={{ body: { padding: '8px 12px' } }}
            >
              <Paragraph
                style={{
                  margin: 0,
                  fontSize: 13,
                  whiteSpace: 'pre-wrap',
                  color: token.colorText,
                }}
              >
                {msg.content}
              </Paragraph>
            </Card>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8 }}>
            <Spin size="small" />
            <Text type="secondary" style={{ fontSize: 12 }}>
              AI 正在分析业务参数并编排固定接口契约...
            </Text>
          </div>
        )}
      </div>

      {/* 底部输入框 */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: `1px solid ${token.colorBorderSecondary}`,
          backgroundColor: token.colorFillAlter,
        }}
      >
        <TextArea
          rows={3}
          placeholder="描述您要创建的原子流（例如：审批通过后调用人事系统扣减额度；或通过录制模版在OA系统录入报销单）..."
          value={inputPrompt}
          onChange={(e) => setInputPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSendMessage();
            }
          }}
          disabled={loading}
          style={{ resize: 'none', borderRadius: 8, fontSize: 13 }}
        />
        <div
          style={{
            marginTop: 8,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Text type="secondary" style={{ fontSize: 11 }}>
            按 Enter 发送，Shift + Enter 换行
          </Text>
          <Button
            type="primary"
            icon={<SendOutlined />}
            size="middle"
            onClick={onSendMessage}
            loading={loading}
            disabled={!inputPrompt.trim()}
            style={{ borderRadius: 6 }}
          >
            发送并生成
          </Button>
        </div>
      </div>
    </div>
  );
};
