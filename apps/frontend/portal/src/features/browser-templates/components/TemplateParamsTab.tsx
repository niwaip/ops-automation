import React, { useMemo, useState } from 'react';
import {
  Button,
  Card,
  Checkbox,
  Collapse,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
  theme,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { TemplateParamsSchema, TemplateStep } from '@/api/template';

const { Text } = Typography;
const { Panel } = Collapse;

export interface ParamRowItem {
  key: string;
  name: string;
  type: string;
  description: string;
  required: boolean;
  defaultValue?: string | number | boolean;
}

interface TemplateParamsTabProps {
  paramsSchema?: TemplateParamsSchema;
  steps?: TemplateStep[];
  isEditMode: boolean;
  jsonBlockStyle: React.CSSProperties;
  onChange?: (updatedSchema: TemplateParamsSchema) => void;
}

const extractPlaceholdersAndParamsFromSteps = (
  steps: TemplateStep[]
): Record<string, { type: string; description: string; default?: string | number }> => {
  const extracted: Record<string, { type: string; description: string; default?: string | number }> =
    {};

  const scanString = (val: string, context: string) => {
    const matches = val.matchAll(/(?:\$\{([a-zA-Z0-9_]+)\}|\{\{([a-zA-Z0-9_]+)\}\})/g);
    for (const match of matches) {
      const paramName = match[1] || match[2];
      if (paramName && !extracted[paramName]) {
        extracted[paramName] = {
          type: 'string',
          description: `${context}中的动态变量`,
        };
      }
    }
  };

  steps.forEach((step, idx) => {
    const stepLabel = step.step_id || `步骤 ${idx + 1}`;
    if (step.description) scanString(step.description, `${stepLabel} 描述`);
    if (step.locator?.value) scanString(step.locator.value, `${stepLabel} 选择器`);

    if (step.params && typeof step.params === 'object') {
      Object.entries(step.params).forEach(([k, v]) => {
        if (typeof v === 'string') {
          scanString(v, `${stepLabel} 参数 ${k}`);
          if (k === 'url' && (v.startsWith('http://') || v.startsWith('https://')) && !extracted[k]) {
            extracted[k] = {
              type: 'string',
              description: `目标网页地址 (来自 ${stepLabel})`,
              default: v,
            };
          } else if (['query', 'keyword', 'search', 'text', 'value'].includes(k) && !extracted[k]) {
            extracted[k] = {
              type: 'string',
              description: `${k} (来自 ${stepLabel})`,
              default: v,
            };
          }
        }
      });
    }
  });

  return extracted;
};

const TemplateParamsTab: React.FC<TemplateParamsTabProps> = ({
  paramsSchema,
  steps = [],
  isEditMode,
  jsonBlockStyle,
  onChange,
}) => {
  const { token } = theme.useToken();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingParamKey, setEditingParamKey] = useState<string | null>(null);
  const [form] = Form.useForm();

  const properties = (paramsSchema?.properties || {}) as Record<
    string,
    {
      type?: string;
      description?: string;
      default?: string | number | boolean;
      enum?: Array<string | number>;
    }
  >;
  const requiredList = Array.isArray(paramsSchema?.required) ? paramsSchema.required : [];

  const tableData: ParamRowItem[] = useMemo(() => {
    return Object.entries(properties).map(([key, prop]) => ({
      key,
      name: key,
      type: prop.type || 'string',
      description: prop.description || '',
      required: requiredList.includes(key),
      defaultValue: prop.default,
    }));
  }, [properties, requiredList]);

  const handleOpenAddModal = () => {
    setEditingParamKey(null);
    form.resetFields();
    form.setFieldsValue({
      type: 'string',
      required: true,
    });
    setModalVisible(true);
  };

  const handleOpenEditModal = (record: ParamRowItem) => {
    setEditingParamKey(record.name);
    form.resetFields();
    form.setFieldsValue({
      name: record.name,
      type: record.type,
      description: record.description,
      required: record.required,
      default: record.defaultValue !== undefined ? String(record.defaultValue) : '',
    });
    setModalVisible(true);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      const paramName = (values.name || '').trim();
      if (!paramName) return;

      const newProperties = { ...properties };
      const newRequired = new Set(requiredList);

      if (editingParamKey && editingParamKey !== paramName) {
        delete newProperties[editingParamKey];
        newRequired.delete(editingParamKey);
      }

      newProperties[paramName] = {
        type: values.type || 'string',
        description: values.description?.trim() || undefined,
        default: values.default?.trim() ? values.default.trim() : undefined,
      };

      if (values.required) {
        newRequired.add(paramName);
      } else {
        newRequired.delete(paramName);
      }

      onChange?.({
        type: 'object',
        properties: newProperties,
        required: Array.from(newRequired),
      });

      setModalVisible(false);
      message.success(editingParamKey ? '参数已更新' : '参数已追加');
    } catch {
      // validation error
    }
  };

  const handleDeleteParam = (paramName: string) => {
    const newProperties = { ...properties };
    delete newProperties[paramName];
    const newRequired = requiredList.filter((r) => r !== paramName);

    onChange?.({
      type: 'object',
      properties: newProperties,
      required: newRequired,
    });
    message.success(`参数 ${paramName} 已删除`);
  };

  const handleAutoDeriveParams = () => {
    const candidates = extractPlaceholdersAndParamsFromSteps(steps);
    const candidateKeys = Object.keys(candidates);

    if (candidateKeys.length === 0) {
      message.info('未在当前步骤中发现未声明的动态占位符或参数');
      return;
    }

    const newProperties = { ...properties };
    const newRequired = new Set(requiredList);
    let addedCount = 0;

    candidateKeys.forEach((key) => {
      if (!newProperties[key]) {
        newProperties[key] = {
          type: candidates[key].type,
          description: candidates[key].description,
          default: candidates[key].default,
        };
        newRequired.add(key);
        addedCount++;
      }
    });

    if (addedCount === 0) {
      message.info('步骤中的参数均已存在于参数列表中');
      return;
    }

    onChange?.({
      type: 'object',
      properties: newProperties,
      required: Array.from(newRequired),
    });

    message.success(`已从步骤中自动推导并追加 ${addedCount} 个参数 (${candidateKeys.join(', ')})`);
  };

  const columns = [
    {
      title: '参数名 (Key)',
      dataIndex: 'name',
      key: 'name',
      width: 160,
      render: (text: string, record: ParamRowItem) => (
        <Space>
          <Text code strong>
            {text}
          </Text>
          {record.required && <Tag color="red">必填</Tag>}
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type: string) => <Tag color="blue">{type}</Tag>,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      render: (desc: string) => desc || <Text type="secondary">-</Text>,
    },
    {
      title: '默认值',
      dataIndex: 'defaultValue',
      key: 'defaultValue',
      width: 220,
      render: (val: any) =>
        val !== undefined && val !== null && val !== '' ? (
          <Text ellipsis style={{ maxWidth: 200 }}>
            {String(val)}
          </Text>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    ...(isEditMode
      ? [
          {
            title: '操作',
            key: 'action',
            width: 120,
            render: (_: any, record: ParamRowItem) => (
              <Space size="small">
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => handleOpenEditModal(record)}
                />
                <Popconfirm
                  title={`确认删除参数 ${record.name}？`}
                  onConfirm={() => handleDeleteParam(record.name)}
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                >
                  <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      {isEditMode && (
        <Card size="small" style={{ background: token.colorFillAlter, border: `1px solid ${token.colorBorderSecondary}` }}>
          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <Space>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenAddModal}>
                追加参数
              </Button>
              <Button
                icon={<ThunderboltOutlined />}
                onClick={handleAutoDeriveParams}
                disabled={steps.length === 0}
              >
                从步骤一键提取参数
              </Button>
            </Space>
            <Text type="secondary">
              在步骤参数中可使用 <Text code>${'{参数名}'}</Text> 或 <Text code>{'{{参数名}}'}</Text> 引用此处定义的参数。
            </Text>
          </Space>
        </Card>
      )}

      {tableData.length > 0 ? (
        <Table
          dataSource={tableData}
          columns={columns}
          pagination={false}
          size="middle"
          bordered
        />
      ) : (
        <Empty
          description={
            <span>
              暂无已定义的模板参数
              {isEditMode && '，请点击上方「追加参数」或「从步骤一键提取参数」添加'}
            </span>
          }
        />
      )}

      <Collapse ghost>
        <Panel header="查看 JSON Schema" key="json_schema">
          <pre style={jsonBlockStyle}>{JSON.stringify(paramsSchema || {}, null, 2)}</pre>
        </Panel>
      </Collapse>

      <Modal
        title={editingParamKey ? `编辑参数: ${editingParamKey}` : '追加模板参数'}
        open={modalVisible}
        onOk={handleModalOk}
        onCancel={() => setModalVisible(false)}
        okText="确定"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="name"
            label="参数名 (Key)"
            rules={[
              { required: true, message: '请输入参数英文名称' },
              {
                pattern: /^[a-zA-Z_][a-zA-Z0-9_]*$/,
                message: '参数名只能包含字母、数字和下划线，且不能以数字开头',
              },
            ]}
            extra="如 url, keyword, username 等，步骤中可通过 ${参数名} 引用"
          >
            <Input placeholder="例如: url" />
          </Form.Item>

          <Form.Item name="type" label="数据类型" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="string">string (字符串/网址/文本)</Select.Option>
              <Select.Option value="number">number (数值)</Select.Option>
              <Select.Option value="boolean">boolean (布尔值)</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item name="description" label="参数描述 / 显示名称">
            <Input placeholder="例如: 目标知乎文章地址" />
          </Form.Item>

          <Form.Item name="default" label="默认值 (可选)">
            <Input placeholder="例如: https://zhuanlan.zhihu.com/p/..." />
          </Form.Item>

          <Form.Item name="required" valuePropName="checked">
            <Checkbox>设为执行时必填参数</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
};

export default TemplateParamsTab;
