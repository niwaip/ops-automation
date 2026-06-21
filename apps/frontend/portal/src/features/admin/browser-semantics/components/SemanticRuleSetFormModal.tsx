import React, { useEffect } from 'react';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, InputNumber, Modal, Select, Space, Switch, Typography } from 'antd';
import type { SemanticRuleSetFormValues } from '../lib/ruleSetForm';
import {
  buildDefaultRuleFormValuesItem,
  RULE_CATEGORY_OPTIONS,
  RULE_TYPE_OPTIONS,
} from '../lib/ruleSetForm';

const { Text } = Typography;

interface SemanticRuleSetFormModalProps {
  mode: 'create' | 'edit';
  open: boolean;
  title: string;
  confirmLoading?: boolean;
  initialValues: SemanticRuleSetFormValues;
  onCancel: () => void;
  onSubmit: (values: SemanticRuleSetFormValues) => void | Promise<void>;
}

const SemanticRuleSetFormModal: React.FC<SemanticRuleSetFormModalProps> = ({
  mode,
  open,
  title,
  confirmLoading,
  initialValues,
  onCancel,
  onSubmit,
}) => {
  const [form] = Form.useForm<SemanticRuleSetFormValues>();
  const rules = Form.useWatch('rules', form) || [];

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue(initialValues);
    }
  }, [form, initialValues, open]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    await onSubmit(values);
  };

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onCancel}
      onOk={handleSubmit}
      confirmLoading={confirmLoading}
      width={860}
      destroyOnHidden
    >
      <Form layout="vertical" form={form}>
        <Space size={16} style={{ display: 'flex' }} align="start">
          <Form.Item
            label="Domain Code"
            name="domain_code"
            style={{ flex: 1 }}
            rules={[{ required: true, message: '请输入 domain code' }]}
          >
            <Input placeholder="browser_recorder" disabled={mode === 'edit'} />
          </Form.Item>
          <Form.Item
            label="Key"
            name="key"
            style={{ flex: 1 }}
            rules={[{ required: true, message: '请输入规则集 key' }]}
          >
            <Input placeholder="default-login-alias" disabled={mode === 'edit'} />
          </Form.Item>
        </Space>

        <Space size={16} style={{ display: 'flex' }} align="start">
          <Form.Item
            label="名称"
            name="name"
            style={{ flex: 1 }}
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="Default Login Alias" />
          </Form.Item>
          <Form.Item label="版本" name="version" style={{ width: 160 }}>
            <Input placeholder="v1" />
          </Form.Item>
          <Form.Item
            label="创建人"
            name="created_by"
            style={{ width: 180 }}
            rules={[{ required: true, message: '请输入创建人' }]}
          >
            <Input placeholder="portal-admin" disabled={mode === 'edit'} />
          </Form.Item>
        </Space>

        <Form.Item label="描述" name="description">
          <Input.TextArea rows={2} placeholder="规则集描述" />
        </Form.Item>

        <Card
          size="small"
          title="规则列表"
          extra={
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              onClick={() => {
                const currentRules = form.getFieldValue('rules') || [];
                form.setFieldValue('rules', [...currentRules, buildDefaultRuleFormValuesItem()]);
              }}
            >
              添加规则
            </Button>
          }
        >
          <Space direction="vertical" size={8} style={{ width: '100%', marginBottom: 12 }}>
            <Text type="secondary">
              同一规则集可同时维护多条规则，适合把登录、导航、填写、菜单等能力拆开审核和调整。
            </Text>
          </Space>
          <Form.List
            name="rules"
            rules={[
              {
                validator: async (_, value) => {
                  if (Array.isArray(value) && value.length > 0) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('至少需要一条规则'));
                },
              },
            ]}
          >
            {(fields, { add, remove }, { errors }) => (
              <>
                {fields.map((field, index) => {
                  const currentRule = rules[index];

                  return (
                    <Card
                      key={field.key}
                      size="small"
                      style={{ marginBottom: 12, borderRadius: 10 }}
                      title={
                        <Space wrap>
                          <span>{currentRule?.name?.trim() || `规则 ${index + 1}`}</span>
                          {currentRule?.category ? <Text type="secondary">{currentRule.category}</Text> : null}
                          {currentRule?.type ? <Text type="secondary">{currentRule.type}</Text> : null}
                        </Space>
                      }
                      extra={
                        <Button
                          danger
                          type="text"
                          icon={<MinusCircleOutlined />}
                          disabled={fields.length <= 1}
                          onClick={() => remove(field.name)}
                        >
                          删除
                        </Button>
                      }
                    >
                      <Space size={16} style={{ display: 'flex' }} align="start">
                        <Form.Item
                          label="能力类别"
                          name={[field.name, 'category']}
                          style={{ width: 200 }}
                          rules={[{ required: true, message: '请选择能力类别' }]}
                        >
                          <Select
                            options={RULE_CATEGORY_OPTIONS.map((value) => ({
                              label: value,
                              value,
                            }))}
                          />
                        </Form.Item>
                        <Form.Item
                          label="规则类型"
                          name={[field.name, 'type']}
                          style={{ width: 220 }}
                          rules={[{ required: true, message: '请选择规则类型' }]}
                        >
                          <Select
                            options={RULE_TYPE_OPTIONS.map((value) => ({
                              label: value,
                              value,
                            }))}
                          />
                        </Form.Item>
                        <Form.Item
                          label="规则名称"
                          name={[field.name, 'name']}
                          style={{ flex: 1 }}
                          rules={[{ required: true, message: '请输入规则名称' }]}
                        >
                          <Input placeholder="login phrase alias" />
                        </Form.Item>
                      </Space>

                      <Space size={16} style={{ display: 'flex' }} align="start">
                        <Form.Item label="优先级" name={[field.name, 'priority']} style={{ width: 160 }}>
                          <InputNumber min={0} style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item label="Flags" name={[field.name, 'flags']} style={{ width: 160 }}>
                          <Input placeholder="i" />
                        </Form.Item>
                        <Form.Item
                          label="启用"
                          name={[field.name, 'enabled']}
                          valuePropName="checked"
                          style={{ width: 120 }}
                        >
                          <Switch />
                        </Form.Item>
                        <Form.Item
                          label="停止匹配"
                          name={[field.name, 'stop_on_match']}
                          valuePropName="checked"
                          style={{ width: 140 }}
                        >
                          <Switch />
                        </Form.Item>
                      </Space>

                      <Form.Item
                        label="Patterns"
                        name={[field.name, 'patterns']}
                        rules={[{ required: true, message: '请输入至少一条 pattern' }]}
                        extra="支持逗号或换行分隔"
                      >
                        <Input.TextArea rows={4} placeholder={'登进系统\n登录系统'} />
                      </Form.Item>

                      <Form.Item
                        label="Outputs JSON"
                        name={[field.name, 'outputs']}
                        rules={[{ required: true, message: '请输入输出 JSON' }]}
                      >
                        <Input.TextArea rows={6} placeholder='{"normalized_input":"点击登录"}' />
                      </Form.Item>
                    </Card>
                  );
                })}

                <Button
                  block
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={() => add(buildDefaultRuleFormValuesItem())}
                >
                  继续添加一条规则
                </Button>
                <Form.ErrorList errors={errors} />
              </>
            )}
          </Form.List>
        </Card>

        <Card
          size="small"
          title="可选 Targeting"
          style={{ marginTop: 16 }}
          extra={
            <Form.Item name="targeting_enabled" valuePropName="checked" noStyle>
              <Switch />
            </Form.Item>
          }
        >
          <Space size={16} style={{ display: 'flex' }} align="start">
            <Form.Item label="环境" name="targeting_environments" style={{ flex: 1 }}>
              <Input placeholder="development,production" />
            </Form.Item>
            <Form.Item label="Hosts" name="targeting_hosts" style={{ flex: 1 }}>
              <Input placeholder="erp.example.com,targeting-check.local" />
            </Form.Item>
          </Space>
          <Space size={16} style={{ display: 'flex' }} align="start">
            <Form.Item label="页面类型" name="targeting_page_types" style={{ flex: 1 }}>
              <Input placeholder="login,list,detail" />
            </Form.Item>
            <Form.Item
              label="Targeting 启用"
              name="targeting_item_enabled"
              valuePropName="checked"
              style={{ width: 140 }}
            >
              <Switch />
            </Form.Item>
          </Space>
        </Card>
      </Form>
    </Modal>
  );
};

export default SemanticRuleSetFormModal;
