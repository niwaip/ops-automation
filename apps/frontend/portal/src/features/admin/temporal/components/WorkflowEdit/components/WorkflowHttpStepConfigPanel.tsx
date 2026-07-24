import React from 'react';
import { Form, Select, Input, InputNumber, Button, Typography } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import type { HttpRequestStepConfig } from '../utils/workflowEditHelpers';

const { Text } = Typography;

export interface WorkflowHttpStepConfigPanelProps {
  selectedStepIndexForConfig: number | null;
  selectedStepHttpConfig: HttpRequestStepConfig;
  updateStepHttpRequestConfig: (stepIndex: number, patch: Partial<HttpRequestStepConfig>) => void;
  renderTipLabel: (title: string, tooltip: string) => React.ReactNode;
  renderHttpTemplateMapEditor: (
    field: any,
    title: string,
    tooltip: string
  ) => React.ReactNode;
  previewHttpConfigMutation: { isLoading: boolean };
  handleOpenHttpAiPanel: () => void;
  TWO_COLUMN_GRID_STYLE: React.CSSProperties;
  CONFIG_SECTION_STYLE: React.CSSProperties;
}

export const WorkflowHttpStepConfigPanel: React.FC<WorkflowHttpStepConfigPanelProps> = ({
  selectedStepIndexForConfig,
  selectedStepHttpConfig,
  updateStepHttpRequestConfig,
  renderTipLabel,
  renderHttpTemplateMapEditor,
  previewHttpConfigMutation,
  handleOpenHttpAiPanel,
  TWO_COLUMN_GRID_STYLE,
  CONFIG_SECTION_STYLE,
}) => {
  if (selectedStepIndexForConfig === null) return null;

  return (
    <>
      <div
        style={{
          ...TWO_COLUMN_GRID_STYLE,
          gridTemplateColumns: '92px minmax(0, 1fr)',
        }}
      >
        <Form.Item
          label={renderTipLabel('请求方法', '内置 httpRequest 最终执行的 HTTP Method。')}
          style={{ marginBottom: 10 }}
        >
          <Select
            size="middle"
            value={selectedStepHttpConfig.method || 'GET'}
            onChange={(value) =>
              updateStepHttpRequestConfig(selectedStepIndexForConfig, {
                method: value,
              })
            }
            options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map(
              (value) => ({ label: value, value })
            )}
            style={{ width: '100%', height: 32 }}
          />
        </Form.Item>
        <Form.Item
          label={renderTipLabel(
            'URL 模版',
            '可填写固定 URL，或使用 {city} 这类占位符进行动态拼装。'
          )}
          style={{ marginBottom: 10 }}
        >
          <Input
            size="middle"
            value={selectedStepHttpConfig.urlTemplate || ''}
            onChange={(e) =>
              updateStepHttpRequestConfig(selectedStepIndexForConfig, {
                urlTemplate: e.target.value,
              })
            }
            placeholder="例如：https://api.weather.example.com/current"
            style={{ height: 32 }}
          />
        </Form.Item>
      </div>

      <div style={{ ...CONFIG_SECTION_STYLE, marginBottom: 10 }}>
        <Text strong style={{ display: 'block', marginBottom: 10 }}>
          请求参数
        </Text>
        <div style={TWO_COLUMN_GRID_STYLE}>
          {renderHttpTemplateMapEditor(
            'queryTemplate',
            'Query 参数',
            '例如 city -> {city}，最终会组装为 params。'
          )}
          {renderHttpTemplateMapEditor(
            'headersTemplate',
            '请求头',
            '例如 Authorization -> Bearer {token}。'
          )}
        </div>
      </div>

      <div style={{ ...CONFIG_SECTION_STYLE, marginBottom: 0 }}>
        <Text strong style={{ display: 'block', marginBottom: 10 }}>
          请求体 Body
        </Text>
        <div style={TWO_COLUMN_GRID_STYLE}>
          {renderHttpTemplateMapEditor(
            'jsonTemplate',
            'JSON Body',
            '适合 POST/PUT 场景，值支持占位符。'
          )}
          {renderHttpTemplateMapEditor(
            'dataTemplate',
            'Form/Data Body',
            '如需 form 或普通 body，可在这里配置键值。'
          )}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 10,
          marginTop: 10,
          alignItems: 'end',
          justifyContent: 'space-between',
        }}
      >
        <Form.Item
          label={renderTipLabel(
            '请求超时（秒）',
            '这是 HTTP 请求本身的 timeout，不是 Temporal 步骤执行超时。'
          )}
          style={{ marginBottom: 0 }}
        >
          <InputNumber
            size="small"
            min={1}
            value={selectedStepHttpConfig.timeout ?? 30}
            onChange={(value) =>
              updateStepHttpRequestConfig(selectedStepIndexForConfig, {
                timeout: Number(value || 30),
              })
            }
            style={{ width: 180 }}
          />
        </Form.Item>
        <Button
          type="default"
          icon={<RobotOutlined />}
          loading={previewHttpConfigMutation.isLoading}
          onClick={handleOpenHttpAiPanel}
        >
          AI 优化
        </Button>
      </div>
    </>
  );
};
