import React, { useEffect } from 'react';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, InputNumber, Modal, Select, Space, Switch, Tag, Typography } from 'antd';
import type { SemanticRuleCategory } from '@/api/browser-semantics';
import type { SemanticRuleFormValuesItem } from '../lib/ruleSetForm';
import { buildDefaultRuleFormValuesItem, RULE_TYPE_OPTIONS } from '../lib/ruleSetForm';

const { Text } = Typography;

interface SemanticRuleCategoryReplaceModalProps {
  open: boolean;
  category: SemanticRuleCategory | null;
  initialRules: SemanticRuleFormValuesItem[];
  confirmLoading?: boolean;
  onCancel: () => void;
  onSubmit: (rules: SemanticRuleFormValuesItem[]) => void | Promise<void>;
}

interface ReplaceCategoryFormValues {
  rules: SemanticRuleFormValuesItem[];
}

const SemanticRuleCategoryReplaceModal: React.FC<SemanticRuleCategoryReplaceModalProps> = ({
  open,
  category,
  initialRules,
  confirmLoading,
  onCancel,
  onSubmit,
}) => {
  const [form] = Form.useForm<ReplaceCategoryFormValues>();
  const rules = Form.useWatch('rules', form) || [];

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({
        rules: initialRules.length
          ? initialRules
          : [
              {
                ...buildDefaultRuleFormValuesItem(),
                category: category || 'GENERIC_ALIAS',
              },
            ],
      });
    }
  }, [category, form, initialRules, open]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    await onSubmit(values.rules);
  };

  return (
    <Modal
      title={
        <Space wrap>
          <span>按类别替换规则</span>
          {category ? <Tag color="purple">{category}</Tag> : null}
        </Space>
      }
      open={open}
      onCancel={onCancel}
      onOk={handleSubmit}
      confirmLoading={confirmLoading}
      width={860}
      destroyOnHidden
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Text type="secondary">
          提交后只会替换当前类别的规则，其他类别与 targeting 配置保持不变。
        </Text>

        <Form layout="vertical" form={form}>
          <Card
            size="small"
            title="类别规则"
            extra={
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => {
                  const currentRules = form.getFieldValue('rules') || [];
                  form.setFieldValue('rules', [
                    ...currentRules,
                    {
                      ...buildDefaultRuleFormValuesItem(),
                      category: category || 'GENERIC_ALIAS',
                    },
                  ]);
                }}
              >
                添加规则
              </Button>
            }
          >
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
                            {category ? <Tag color="purple">{category}</Tag> : null}
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
                          <Form.Item label="能力类别" style={{ width: 180 }}>
                            <Input value={category || '-'} disabled />
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
                            <Input placeholder="navigation alias rule" />
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
                          <Input.TextArea rows={4} placeholder={'进入首页\n打开系统首页'} />
                        </Form.Item>

                        <Form.Item
                          label="Outputs JSON"
                          name={[field.name, 'outputs']}
                          rules={[{ required: true, message: '请输入输出 JSON' }]}
                        >
                          <Input.TextArea rows={6} placeholder='{"normalized_input":"打开首页"}' />
                        </Form.Item>
                      </Card>
                    );
                  })}

                  <Button
                    block
                    type="dashed"
                    icon={<PlusOutlined />}
                    onClick={() =>
                      add({
                        ...buildDefaultRuleFormValuesItem(),
                        category: category || 'GENERIC_ALIAS',
                      })
                    }
                  >
                    继续添加一条规则
                  </Button>
                  <Form.ErrorList errors={errors} />
                </>
              )}
            </Form.List>
          </Card>
        </Form>
      </Space>
    </Modal>
  );
};

export default SemanticRuleCategoryReplaceModal;
