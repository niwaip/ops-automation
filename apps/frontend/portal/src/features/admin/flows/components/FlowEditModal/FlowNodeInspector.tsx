import React from 'react';
import {
  Form,
  Input,
  Select,
  Switch,
  Space,
  Button,
  Divider,
  Tag,
  Tooltip,
  Popconfirm,
  InputNumber,
  theme,
} from 'antd';
import {
  CloseOutlined,
  DeleteOutlined,
  CopyOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import { ExecutionFlowStep, STEP_TYPE_LABELS } from '@/api/flows';
const { TextArea } = Input;
const { Option } = Select;

interface FlowNodeInspectorProps {
  step: ExecutionFlowStep;
  stepIndex: number;
  totalSteps: number;
  onUpdateStep: (field: string, value: any) => void;
  onDuplicateStep: () => void;
  onDeleteStep: () => void;
  onClose: () => void;
}

export const FlowNodeInspector: React.FC<FlowNodeInspectorProps> = ({
  step,
  stepIndex,
  onUpdateStep,
  onDuplicateStep,
  onDeleteStep,
  onClose,
}) => {
  const { token } = theme.useToken();

  const insertConditionSnippet = (snippet: string) => {
    onUpdateStep('condition', snippet);
  };

  return (
    <div
      style={{
        width: 380,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderLeft: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorBgContainer,
      }}
    >
      {/* 头部 */}
      <div
        style={{
          padding: '14px 16px',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: token.colorFillAlter,
        }}
      >
        <Space size={8}>
          <Tag color="blue" style={{ margin: 0, fontWeight: 600 }}>
            步骤 #{stepIndex + 1}
          </Tag>
          <span style={{ fontWeight: 600, fontSize: 14 }}>属性检查器</span>
        </Space>
        <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} />
      </div>

      {/* 属性表单滚动区 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        <Form layout="vertical" size="middle">
          {/* 基本信息 */}
          <Form.Item label="步骤名称" required style={{ marginBottom: 12 }}>
            <Input
              value={step.name}
              onChange={(e) => onUpdateStep('name', e.target.value)}
              placeholder="请输入步骤名称"
            />
          </Form.Item>

          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <Form.Item label="节点类型" style={{ flex: 1, marginBottom: 0 }}>
              <Select
                value={step.type}
                onChange={(val) => onUpdateStep('type', val)}
                style={{ width: '100%' }}
              >
                {Object.entries(STEP_TYPE_LABELS).map(([key, val]) => (
                  <Option key={key} value={key}>
                    <Tag color={val.color} style={{ marginRight: 6 }}>
                      {val.label}
                    </Tag>
                  </Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item label="运行策略" style={{ width: 110, marginBottom: 0 }}>
              <div style={{ paddingTop: 4 }}>
                <Switch
                  checked={step.optional}
                  onChange={(checked) => onUpdateStep('optional', checked)}
                  checkedChildren="可选"
                  unCheckedChildren="必选"
                />
              </div>
            </Form.Item>
          </div>

          <Divider style={{ margin: '14px 0' }}>环节专属配置</Divider>

          {/* API 专属 */}
          {step.type === 'api' && (
            <div>
              <Form.Item label="请求方式与端点" required style={{ marginBottom: 12 }}>
                <Space.Compact style={{ width: '100%' }}>
                  <Select
                    value={step.api?.method || 'POST'}
                    onChange={(m) => onUpdateStep('api', { ...step.api, method: m })}
                    style={{ width: 95 }}
                  >
                    <Option value="GET">GET</Option>
                    <Option value="POST">POST</Option>
                    <Option value="PUT">PUT</Option>
                    <Option value="DELETE">DELETE</Option>
                  </Select>
                  <Input
                    value={step.api?.endpoint || ''}
                    onChange={(e) => onUpdateStep('api', { ...step.api, endpoint: e.target.value })}
                    placeholder="/api/v1/resource 或 {{flow_input.url}}"
                    style={{ flex: 1 }}
                  />
                </Space.Compact>
              </Form.Item>

              <Form.Item
                label={
                  <Space>
                    <span>请求体 Body (JSON)</span>
                    <Tooltip title="支持插值变量，如 {{flow_input.city}}">
                      <QuestionCircleOutlined style={{ color: '#8c8c8c' }} />
                    </Tooltip>
                  </Space>
                }
                style={{ marginBottom: 12 }}
              >
                <TextArea
                  rows={4}
                  value={step.api?.body ? JSON.stringify(step.api.body, null, 2) : ''}
                  onChange={(e) => {
                    try {
                      const body = e.target.value ? JSON.parse(e.target.value) : undefined;
                      onUpdateStep('api', { ...step.api, body });
                    } catch {
                      // 允许输入过程暂不报错
                    }
                  }}
                  placeholder='{\n  "target": "{{flow_input.target}}"\n}'
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                />
              </Form.Item>
            </div>
          )}

          {/* Script 专属 */}
          {step.type === 'script' && (
            <div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <Form.Item label="执行环境" style={{ flex: 1, marginBottom: 0 }}>
                  <Select
                    value={step.script?.language || 'python'}
                    onChange={(lang) => onUpdateStep('script', { ...step.script, language: lang })}
                  >
                    <Option value="python">Python 3.10</Option>
                    <Option value="bash">Bash / Shell</Option>
                    <Option value="javascript">Node.js</Option>
                  </Select>
                </Form.Item>
                <Form.Item label="超时 (秒)" style={{ width: 100, marginBottom: 0 }}>
                  <InputNumber
                    min={1}
                    max={600}
                    value={step.script?.timeout || 60}
                    onChange={(t) => onUpdateStep('script', { ...step.script, timeout: t || 60 })}
                  />
                </Form.Item>
              </div>

              <Form.Item label="脚本代码" style={{ marginBottom: 12 }}>
                <TextArea
                  rows={6}
                  value={step.script?.code || ''}
                  onChange={(e) => onUpdateStep('script', { ...step.script, code: e.target.value })}
                  placeholder="# 编写自动化代码\ndef main(inputs):\n    return {'status': 'ok'}"
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                />
              </Form.Item>
            </div>
          )}

          {/* Tool 专属 */}
          {step.type === 'tool' && (
            <div>
              <Form.Item label="工具标识" required style={{ marginBottom: 12 }}>
                <Input
                  value={step.tool?.name || ''}
                  onChange={(e) => onUpdateStep('tool', { ...step.tool, name: e.target.value })}
                  placeholder="如: browser_crawl, read_excel, send_email"
                />
              </Form.Item>
              <Form.Item label="工具入参 (JSON)" style={{ marginBottom: 12 }}>
                <TextArea
                  rows={4}
                  value={step.tool?.params ? JSON.stringify(step.tool.params, null, 2) : ''}
                  onChange={(e) => {
                    try {
                      const params = e.target.value ? JSON.parse(e.target.value) : {};
                      onUpdateStep('tool', { ...step.tool, params });
                    } catch {
                      // 允许中间状态
                    }
                  }}
                  placeholder='{\n  "url": "https://..."\n}'
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                />
              </Form.Item>
            </div>
          )}

          {/* Text / LLM / Validator */}
          {['text', 'llm', 'validator'].includes(step.type) && (
            <Form.Item
              label={step.type === 'llm' ? '提示词指令 Prompt' : step.type === 'validator' ? '断言规则与表达式' : '指导内容说明'}
              style={{ marginBottom: 12 }}
            >
              <TextArea
                rows={4}
                value={step.content || ''}
                onChange={(e) => onUpdateStep('content', e.target.value)}
                placeholder={
                  step.type === 'llm'
                    ? '根据前序结果分析关键指标并生成结构化 JSON'
                    : step.type === 'validator'
                    ? 'assert result.status == 200'
                    : '描述当前环节操作要点'
                }
              />
            </Form.Item>
          )}

          <Divider style={{ margin: '14px 0' }}>流程控制与数据流动</Divider>

          {/* 执行条件 */}
          <Form.Item
            label={
              <Space>
                <span>执行条件 (Condition)</span>
                <Tooltip title="只有满足表达式时才执行此节点">
                  <QuestionCircleOutlined style={{ color: '#8c8c8c' }} />
                </Tooltip>
              </Space>
            }
            style={{ marginBottom: 6 }}
          >
            <Input
              value={step.condition || ''}
              onChange={(e) => onUpdateStep('condition', e.target.value)}
              placeholder="如: step_prev.status == 'success'"
            />
          </Form.Item>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            <Tag
              style={{ cursor: 'pointer', fontSize: 11 }}
              onClick={() => insertConditionSnippet("step_prev.status == 'success'")}
            >
              + 前序成功
            </Tag>
            <Tag
              style={{ cursor: 'pointer', fontSize: 11 }}
              onClick={() => insertConditionSnippet("flow_input.target != null")}
            >
              + 参数存在
            </Tag>
          </div>

          {/* 变量映射 */}
          <Form.Item
            label={
              <Space>
                <span>输入参数映射 (Input Mapping)</span>
                <Tooltip title="将全局变量或前置步骤输出注入当前节点">
                  <QuestionCircleOutlined style={{ color: '#8c8c8c' }} />
                </Tooltip>
              </Space>
            }
            style={{ marginBottom: 12 }}
          >
            <TextArea
              rows={2}
              value={step.inputMapping ? JSON.stringify(step.inputMapping) : ''}
              onChange={(e) => {
                try {
                  const m = e.target.value ? JSON.parse(e.target.value) : undefined;
                  onUpdateStep('inputMapping', m);
                } catch {
                  // ignore
                }
              }}
              placeholder='{"city": "flow_input.city"}'
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
          </Form.Item>

          {/* 预期产出 */}
          <Form.Item label="预期产出物 (Expected Output)" style={{ marginBottom: 16 }}>
            <Input
              value={step.expectedOutput || ''}
              onChange={(e) => onUpdateStep('expectedOutput', e.target.value)}
              placeholder="说明此步骤交付的数据结构或成果"
            />
          </Form.Item>
        </Form>
      </div>

      {/* 底部动作条 */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: `1px solid ${token.colorBorderSecondary}`,
          display: 'flex',
          justifyContent: 'space-between',
          background: token.colorFillAlter,
        }}
      >
        <Button icon={<CopyOutlined />} size="small" onClick={onDuplicateStep}>
          复制此节点
        </Button>
        <Popconfirm
          title="确认删除该步骤节点？"
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          onConfirm={onDeleteStep}
        >
          <Button danger icon={<DeleteOutlined />} size="small">
            删除节点
          </Button>
        </Popconfirm>
      </div>
    </div>
  );
};
