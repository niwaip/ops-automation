import React, { useState } from 'react';
import {
  Form,
  Input,
  Select,
  Switch,
  Typography,
  Space,
  Button,
  Tabs,
  Tag,
  Tooltip,
  Checkbox,
  theme,
} from 'antd';
import {
  SettingOutlined,
  PlusOutlined,
  DeleteOutlined,
  CodeOutlined,
  TableOutlined,
  QuestionCircleOutlined,
  AimOutlined,
} from '@ant-design/icons';
import { EXECUTION_FLOW_CATEGORIES } from '@/api/flows';
import { ParamFieldItem, InspectorSelection } from './flowEditorTypes';

const { Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

interface FlowMetaInspectorProps {
  name: string;
  description: string;
  goal: string;
  expectedResult: string;
  category: string;
  isPublic: boolean;
  paramFields: ParamFieldItem[];
  rawJsonSchema: string;
  selection: InspectorSelection;
  onChangeName: (val: string) => void;
  onChangeDescription: (val: string) => void;
  onChangeGoal: (val: string) => void;
  onChangeExpectedResult: (val: string) => void;
  onChangeCategory: (val: string) => void;
  onChangeIsPublic: (val: boolean) => void;
  onChangeParamFields: (fields: ParamFieldItem[]) => void;
  onChangeRawJsonSchema: (raw: string) => void;
}

export const FlowMetaInspector: React.FC<FlowMetaInspectorProps> = ({
  name,
  description,
  goal,
  expectedResult,
  category,
  isPublic,
  paramFields,
  rawJsonSchema,
  selection,
  onChangeName,
  onChangeDescription,
  onChangeGoal,
  onChangeExpectedResult,
  onChangeCategory,
  onChangeIsPublic,
  onChangeParamFields,
  onChangeRawJsonSchema,
}) => {
  const { token } = theme.useToken();
  const [schemaMode, setSchemaMode] = useState<'visual' | 'json'>('visual');

  // 根据选中的对象自动决定默认 Tab
  const defaultActiveTab =
    selection.type === 'start' ? 'params' : selection.type === 'end' ? 'goal' : 'basic';

  const handleAddField = () => {
    const newField: ParamFieldItem = {
      key: `field_${Date.now()}`,
      name: `param_${paramFields.length + 1}`,
      type: 'string',
      description: '',
      required: false,
    };
    onChangeParamFields([...paramFields, newField]);
  };

  const handleUpdateField = (index: number, key: keyof ParamFieldItem, value: any) => {
    const updated = [...paramFields];
    updated[index] = { ...updated[index], [key]: value };
    onChangeParamFields(updated);
  };

  const handleRemoveField = (index: number) => {
    onChangeParamFields(paramFields.filter((_, i) => i !== index));
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
          alignItems: 'center',
          gap: 8,
          background: token.colorFillAlter,
        }}
      >
        <SettingOutlined style={{ color: '#1677ff', fontSize: 16 }} />
        <span style={{ fontWeight: 600, fontSize: 14 }}>
          {selection.type === 'start'
            ? '流程输入 · 参数配置'
            : selection.type === 'end'
            ? '流程交付 · 目标配置'
            : '工作流组合全局配置'}
        </span>
      </div>

      {/* 配置 Tabs */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        <Tabs
          defaultActiveKey={defaultActiveTab}
          size="small"
          items={[
            {
              key: 'basic',
              label: '基础属性',
              children: (
                <Form layout="vertical" size="middle">
                  <Form.Item label="组合名称" required style={{ marginBottom: 12 }}>
                    <Input
                      value={name}
                      onChange={(e) => onChangeName(e.target.value)}
                      placeholder="如: 多渠道报表聚合与通知组合"
                    />
                  </Form.Item>

                  <Form.Item label="业务分类" style={{ marginBottom: 12 }}>
                    <Select value={category} onChange={onChangeCategory}>
                      {Object.entries(EXECUTION_FLOW_CATEGORIES).map(([key, val]) => (
                        <Option key={key} value={key}>
                          <Space>
                            <Tag color={val.color}>{val.label}</Tag>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {val.desc}
                            </Text>
                          </Space>
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>

                  <Form.Item label="公开共享" style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        开启后支持组织其他业务线或技能复用此组合
                      </Text>
                      <Switch
                        checked={isPublic}
                        onChange={onChangeIsPublic}
                        checkedChildren="公开"
                        unCheckedChildren="私有"
                      />
                    </div>
                  </Form.Item>

                  <Form.Item label="业务描述与备忘" style={{ marginBottom: 12 }}>
                    <TextArea
                      rows={3}
                      value={description}
                      onChange={(e) => onChangeDescription(e.target.value)}
                      placeholder="简要说明此组合的业务场景和设计初衷..."
                    />
                  </Form.Item>
                </Form>
              ),
            },
            {
              key: 'goal',
              label: (
                <Space size={4}>
                  <AimOutlined />
                  <span>目标与交付</span>
                </Space>
              ),
              children: (
                <Form layout="vertical" size="middle">
                  <Form.Item
                    label={
                      <Space>
                        <span>流程目标 (Goal)</span>
                        <Tooltip title="核心意图描述，指导 AI 执行模拟验证与参数自动适配">
                          <QuestionCircleOutlined style={{ color: '#8c8c8c' }} />
                        </Tooltip>
                      </Space>
                    }
                    style={{ marginBottom: 16 }}
                  >
                    <TextArea
                      rows={4}
                      value={goal}
                      onChange={(e) => onChangeGoal(e.target.value)}
                      placeholder="例如：调用外部微服务查询订单数据，经过数据清洗计算后生成 PDF 交付单"
                    />
                  </Form.Item>

                  <Form.Item
                    label={
                      <Space>
                        <span>预期交付物 (Expected Result)</span>
                        <Tooltip title="流程成功运行后应产出的数据结构或文件形式">
                          <QuestionCircleOutlined style={{ color: '#8c8c8c' }} />
                        </Tooltip>
                      </Space>
                    }
                    style={{ marginBottom: 16 }}
                  >
                    <TextArea
                      rows={4}
                      value={expectedResult}
                      onChange={(e) => onChangeExpectedResult(e.target.value)}
                      placeholder="例如：返回包含统计摘要、关键图表与可下载文档链接的结构化响应"
                    />
                  </Form.Item>
                </Form>
              ),
            },
            {
              key: 'params',
              label: `输入参数 (${paramFields.length})`,
              children: (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 12,
                    }}
                  >
                    <span style={{ fontSize: 12, color: 'var(--text-light, #6b7280)' }}>
                      定义此工作流所接收的入参协议
                    </span>
                    <Button
                      type="text"
                      size="small"
                      icon={schemaMode === 'visual' ? <CodeOutlined /> : <TableOutlined />}
                      onClick={() => setSchemaMode(schemaMode === 'visual' ? 'json' : 'visual')}
                    >
                      {schemaMode === 'visual' ? 'JSON' : '表格'}
                    </Button>
                  </div>

                  {schemaMode === 'visual' ? (
                    <div>
                      {paramFields.map((field, idx) => (
                        <div
                          key={field.key}
                          style={{
                            padding: '10px 12px',
                            background: token.colorFillAlter,
                            borderRadius: 8,
                            border: `1px solid ${token.colorBorderSecondary}`,
                            marginBottom: 10,
                          }}
                        >
                          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                            <Input
                              size="small"
                              value={field.name}
                              onChange={(e) => handleUpdateField(idx, 'name', e.target.value)}
                              placeholder="参数变量名 (如 city)"
                              style={{ flex: 1 }}
                            />
                            <Select
                              size="small"
                              value={field.type}
                              onChange={(val) => handleUpdateField(idx, 'type', val)}
                              style={{ width: 85 }}
                            >
                              <Option value="string">string</Option>
                              <Option value="number">number</Option>
                              <Option value="boolean">boolean</Option>
                              <Option value="object">object</Option>
                              <Option value="array">array</Option>
                            </Select>
                            <Button
                              type="text"
                              danger
                              size="small"
                              icon={<DeleteOutlined />}
                              onClick={() => handleRemoveField(idx)}
                            />
                          </div>

                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <Input
                              size="small"
                              value={field.description}
                              onChange={(e) => handleUpdateField(idx, 'description', e.target.value)}
                              placeholder="参数业务说明..."
                              style={{ flex: 1 }}
                            />
                            <Checkbox
                              checked={field.required}
                              onChange={(e) => handleUpdateField(idx, 'required', e.target.checked)}
                              style={{ fontSize: 12 }}
                            >
                              必填
                            </Checkbox>
                          </div>
                        </div>
                      ))}

                      <Button
                        type="dashed"
                        block
                        icon={<PlusOutlined />}
                        onClick={handleAddField}
                        style={{ marginTop: 4 }}
                      >
                        添加输入参数
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <TextArea
                        rows={10}
                        value={rawJsonSchema}
                        onChange={(e) => onChangeRawJsonSchema(e.target.value)}
                        placeholder='{\n  "city": { "type": "string", "description": "城市" }\n}'
                        style={{ fontFamily: 'monospace', fontSize: 12 }}
                      />
                      <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 4 }}>
                        提示：切换回表格视图时会自动解析同步。
                      </div>
                    </div>
                  )}
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
};
