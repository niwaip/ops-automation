import React from 'react';
import { Card, Space, Button, Typography, Input, Alert, Form } from 'antd';
import { RobotOutlined } from '@ant-design/icons';

const { Text } = Typography;

export interface WorkflowHttpAiZoneCardProps {
  selectedStep: any;
  previewHttpConfigMutation: { isLoading: boolean };
  handlePreviewHttpConfig: () => void;
  selectedStepAiPreviewResponse: any;
  selectedStepAiLeafPaths: Array<{ path: string; value: unknown }>;
  selectedStepAiSelectedLeafPaths: string[];
  toggleAiLeafPathSelection: (path: string) => void;
  selectedStepAiLeafAliases: Record<string, string>;
  buildOutputKeyFromPath: (path: string) => string;
  updateAiLeafAlias: (path: string, alias: string) => void;
  handleGenerateMultiFieldOutputParams: () => void;
  selectedStepAiPrompt: string;
  setHttpAiOptimizePrompts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  selectedStepAiError?: string;
  optimizeHttpConfigMutation: { isLoading: boolean };
  handleAiOptimizeHttpConfig: () => void;
  handleApplyAiOptimizedHttpConfig: () => void;
  selectedStepAiSuggestedConfig: any;
  selectedStepAiExplanation?: string;
  selectedStepAiSuggestedJsonDraft?: string;
  setHttpAiSuggestedJsonDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  selectedStepAiApplySummary: string[];
  SECTION_CARD_STYLE: React.CSSProperties;
  SECTION_CARD_BODY_STYLE: React.CSSProperties;
  CONFIG_SECTION_STYLE: React.CSSProperties;
}

export const WorkflowHttpAiZoneCard: React.FC<WorkflowHttpAiZoneCardProps> = ({
  selectedStep,
  previewHttpConfigMutation,
  handlePreviewHttpConfig,
  selectedStepAiPreviewResponse,
  selectedStepAiLeafPaths,
  selectedStepAiSelectedLeafPaths,
  toggleAiLeafPathSelection,
  selectedStepAiLeafAliases,
  buildOutputKeyFromPath,
  updateAiLeafAlias,
  handleGenerateMultiFieldOutputParams,
  selectedStepAiPrompt,
  setHttpAiOptimizePrompts,
  selectedStepAiError,
  optimizeHttpConfigMutation,
  handleAiOptimizeHttpConfig,
  handleApplyAiOptimizedHttpConfig,
  selectedStepAiSuggestedConfig,
  selectedStepAiExplanation,
  selectedStepAiSuggestedJsonDraft,
  setHttpAiSuggestedJsonDrafts,
  selectedStepAiApplySummary,
  SECTION_CARD_STYLE,
  SECTION_CARD_BODY_STYLE,
  CONFIG_SECTION_STYLE,
}) => {
  return (
    <Card
      title="HTTP 步骤 AI 优化与路径推导"
      size="small"
      style={SECTION_CARD_STYLE}
      styles={{ body: SECTION_CARD_BODY_STYLE }}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="基于样例参数即时请求真实 URL 探查 Response 结构，帮助你零记忆推导 Result Path、解析规则和多字段映射。"
        />

        <Button
          type="default"
          loading={previewHttpConfigMutation.isLoading}
          onClick={handlePreviewHttpConfig}
        >
          即时请求并探查 Response
        </Button>

        {selectedStepAiPreviewResponse ? (
          <div style={CONFIG_SECTION_STYLE}>
            <Text strong style={{ display: 'block', marginBottom: 6 }}>
              探查到的响应体 Preview
            </Text>
            <Input.TextArea
              value={
                typeof selectedStepAiPreviewResponse === 'string'
                  ? selectedStepAiPreviewResponse
                  : JSON.stringify(selectedStepAiPreviewResponse, null, 2)
              }
              rows={6}
              readOnly
              style={{ fontFamily: 'Monaco, Menlo, monospace', fontSize: 12 }}
            />
          </div>
        ) : null}

        {selectedStepAiLeafPaths.length > 0 && (
          <div style={CONFIG_SECTION_STYLE}>
            <Text strong style={{ display: 'block', marginBottom: 6 }}>
              展开的字段路径（点击勾选多个作为输出字段）
            </Text>
            <Space wrap size={[6, 6]} style={{ marginBottom: 10 }}>
              {selectedStepAiLeafPaths.slice(0, 50).map((item) => {
                const selected = selectedStepAiSelectedLeafPaths.includes(item.path);
                return (
                  <Button
                    key={item.path}
                    size="small"
                    type={selected ? 'primary' : 'default'}
                    onClick={() => toggleAiLeafPathSelection(item.path)}
                  >
                    {item.path}
                  </Button>
                );
              })}
            </Space>
            {selectedStepAiSelectedLeafPaths.length > 0 ? (
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                {selectedStepAiSelectedLeafPaths.map((path) => (
                  <div
                    key={`alias-${path}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) 180px',
                      gap: 8,
                      alignItems: 'center',
                    }}
                  >
                    <Text code>{path}</Text>
                    <Input
                      size="small"
                      value={
                        selectedStepAiLeafAliases[path] || buildOutputKeyFromPath(path)
                      }
                      onChange={(e) => updateAiLeafAlias(path, e.target.value)}
                      placeholder="输出字段名"
                    />
                  </div>
                ))}
                <Space wrap>
                  <Button onClick={handleGenerateMultiFieldOutputParams}>
                    生成多字段输出草稿
                  </Button>
                  <Text type="secondary">
                    会自动把返回模式切换为 `body`，并把所选字段生成到输出参数草稿。
                  </Text>
                </Space>
              </Space>
            ) : (
              <Alert type="info" showIcon message="请先在上面选择需要的多个字段" />
            )}
          </div>
        )}

        <Form.Item label="自然语义输入" style={{ marginBottom: 0 }}>
          <Input.TextArea
            rows={3}
            value={selectedStepAiPrompt}
            onChange={(e) => {
              if (!selectedStep?.id) {
                return;
              }
              const nextPrompt = e.target.value;
              setHttpAiOptimizePrompts((prev) => ({
                ...prev,
                [selectedStep.id as string]: nextPrompt,
              }));
            }}
            placeholder="例如：只保留当前温度、天气描述和体感温度，并自动选择最合适的 Body 路径"
          />
        </Form.Item>

        {selectedStepAiError ? (
          <Alert type="warning" showIcon message={selectedStepAiError} />
        ) : null}

        <Space wrap>
          <Button
            type="primary"
            icon={<RobotOutlined />}
            loading={optimizeHttpConfigMutation.isLoading}
            onClick={handleAiOptimizeHttpConfig}
          >
            生成优化建议
          </Button>
          <Button
            onClick={handleApplyAiOptimizedHttpConfig}
            disabled={!selectedStepAiSuggestedConfig}
          >
            应用到左侧配置
          </Button>
        </Space>

        {(selectedStepAiExplanation || selectedStepAiSuggestedConfig) && (
          <div style={CONFIG_SECTION_STYLE}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              AI 优化结果
            </Text>
            {selectedStepAiExplanation ? (
              <Alert
                type="success"
                showIcon
                style={{ marginBottom: 10 }}
                message={selectedStepAiExplanation}
              />
            ) : null}
            <Input.TextArea
              value={selectedStepAiSuggestedJsonDraft}
              rows={12}
              onChange={(e) => {
                if (!selectedStep?.id) {
                  return;
                }
                const nextValue = e.target.value;
                setHttpAiSuggestedJsonDrafts((prev) => ({
                  ...prev,
                  [selectedStep.id as string]: nextValue,
                }));
              }}
              placeholder="AI 生成的配置 JSON 会显示在这里，可手动微调后再应用"
              style={{ fontFamily: 'Monaco, Menlo, monospace', fontSize: 12 }}
            />
          </div>
        )}

        {selectedStepAiApplySummary.length > 0 && (
          <div style={CONFIG_SECTION_STYLE}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              已应用到左侧配置
            </Text>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {selectedStepAiApplySummary.map((item) => (
                <li key={item}>
                  <Text>{item}</Text>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Space>
    </Card>
  );
};
