import React from 'react';
import { Card, Row, Col, Typography, Input, Select, Button, Space, Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';

const { Text } = Typography;
const { Option } = Select;

export interface WorkflowOutputParamsCardProps {
  workflowDsl: any;
  setWorkflowDsl: React.Dispatch<React.SetStateAction<any>>;
  realValidationLeafPaths?: Array<{ path: string }>;
  SECTION_CARD_STYLE: React.CSSProperties;
  SECTION_CARD_BODY_STYLE: React.CSSProperties;
  SOFT_PANEL_STYLE: React.CSSProperties;
}

export const WorkflowOutputParamsCard: React.FC<WorkflowOutputParamsCardProps> = ({
  workflowDsl,
  setWorkflowDsl,
  realValidationLeafPaths = [],
  SECTION_CARD_STYLE,
  SECTION_CARD_BODY_STYLE,
  SOFT_PANEL_STYLE,
}) => {
  const addSuggestedOutputParam = (path: string) => {
    const cleanKey = path.split('.').pop() || path;
    setWorkflowDsl((prev: any) => ({
      ...prev,
      outputParams: {
        ...prev.outputParams,
        [cleanKey]: {
          description: `从真实验证结果取值: ${path}`,
          sourceStep: undefined,
        },
      },
    }));
  };

  return (
    <Card
      title={
        <Space size={6}>
          <span>输出参数</span>
          <Text type="secondary">（Workflow 返回值）</Text>
          <Tooltip title="默认使用最后一个步骤的输出，也可以指定来源步骤。">
            <InfoCircleOutlined style={{ color: 'var(--text-light)' }} />
          </Tooltip>
        </Space>
      }
      size="small"
      style={{ ...SECTION_CARD_STYLE, marginTop: 16, marginBottom: 16 }}
      styles={{ body: SECTION_CARD_BODY_STYLE }}
    >
      <div style={SOFT_PANEL_STYLE}>
        {realValidationLeafPaths.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
              最近一次真实验证结果路径建议（基于完整 HTTP 响应预览）
            </Text>
            <Space wrap size={[6, 6]}>
              {realValidationLeafPaths.slice(0, 20).map((item) => (
                <Button
                  key={`output-${item.path}`}
                  size="small"
                  onClick={() => addSuggestedOutputParam(item.path)}
                >
                  + {item.path}
                </Button>
              ))}
            </Space>
          </div>
        )}
        {Object.entries(workflowDsl.outputParams || {}).map(([key, param]: [string, any]) => (
          <Row key={key} gutter={8} style={{ marginBottom: 8, alignItems: 'center' }}>
            <Col span={4}>
              <Input
                value={key}
                disabled
                size="small"
                suffix={
                  <Button
                    size="small"
                    danger
                    type="text"
                    onClick={() => {
                      const newParams = { ...workflowDsl.outputParams };
                      delete newParams[key];
                      setWorkflowDsl({ ...workflowDsl, outputParams: newParams });
                    }}
                  >
                    ×
                  </Button>
                }
              />
            </Col>
            <Col span={6}>
              <Select
                value={param.sourceStep || '_last'}
                onChange={(v) =>
                  setWorkflowDsl({
                    ...workflowDsl,
                    outputParams: {
                      ...workflowDsl.outputParams,
                      [key]: { ...param, sourceStep: v === '_last' ? undefined : v },
                    },
                  })
                }
                size="small"
                style={{ width: '100%' }}
              >
                <Option value="_last">最后一个步骤</Option>
                {(workflowDsl.steps || []).map((step: any, idx: number) => (
                  <Option key={step.id} value={step.id}>
                    {step.name || `步骤 ${idx + 1}`}
                  </Option>
                ))}
              </Select>
            </Col>
            <Col span={8}>
              <Input
                value={param.description || ''}
                onChange={(e) =>
                  setWorkflowDsl({
                    ...workflowDsl,
                    outputParams: {
                      ...workflowDsl.outputParams,
                      [key]: { ...param, description: e.target.value },
                    },
                  })
                }
                placeholder="参数描述"
                size="small"
              />
            </Col>
          </Row>
        ))}
        <Button
          size="small"
          type="dashed"
          onClick={() => {
            const key = prompt('请输入输出参数名:');
            if (key && key.trim()) {
              setWorkflowDsl({
                ...workflowDsl,
                outputParams: {
                  ...workflowDsl.outputParams,
                  [key.trim()]: { description: '', sourceStep: undefined },
                },
              });
            }
          }}
          style={{ width: '100%' }}
        >
          + 添加输出参数
        </Button>
      </div>
    </Card>
  );
};
