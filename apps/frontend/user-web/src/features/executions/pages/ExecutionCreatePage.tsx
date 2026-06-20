import { ArrowLeftOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Spin,
  Switch,
  Typography,
} from 'antd';
import { useEffect, useMemo } from 'react';
import { useMutation, useQuery } from 'react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  buildSkillExecutionInputInitialValues,
  isBooleanInputType,
  isJsonLikeInputType,
  isNumericInputType,
  normalizeSkillExecutionInput,
  type SkillParamProperty,
} from '@ops/user-core';
import { executionApi, skillApi } from '../../../api';

const renderFieldInput = (name: string, config: SkillParamProperty) => {
  if (isNumericInputType(config.type)) {
    return <InputNumber style={{ width: '100%' }} placeholder={`请输入 ${name}`} />;
  }
  if (isBooleanInputType(config.type)) {
    return <Switch />;
  }
  if (isJsonLikeInputType(config.type)) {
    return <Input.TextArea rows={5} placeholder="请输入 JSON 字符串" />;
  }
  return <Input placeholder={config.description || `请输入 ${name}`} />;
};

export function ExecutionCreatePage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm();
  const selectedSkillId = Form.useWatch('skillId', form) as string | undefined;

  const skillsQuery = useQuery(['user-web-published-skills'], () => skillApi.list());
  const publishedSkills = useMemo(
    () => (skillsQuery.data?.skills || []).filter((skill) => skill.isPublished),
    [skillsQuery.data?.skills]
  );

  const selectedSkillQuery = useQuery(
    ['user-web-skill-detail', selectedSkillId],
    () => skillApi.getById(selectedSkillId!),
    { enabled: Boolean(selectedSkillId) }
  );

  const createMutation = useMutation(
    async (values: { skillId: string; input: Record<string, unknown> }) =>
      executionApi.create(values),
    {
      onSuccess: (execution) => {
        void message.success('执行已创建');
        navigate(`/executions/${execution.id}`);
      },
      onError: (error) => {
        void message.error(error instanceof Error ? error.message : '创建执行失败');
      },
    }
  );

  useEffect(() => {
    const presetSkillId = searchParams.get('skillId');
    if (presetSkillId && !form.getFieldValue('skillId')) {
      form.setFieldValue('skillId', presetSkillId);
    }
  }, [form, searchParams]);

  useEffect(() => {
    form.setFieldValue('input', buildSkillExecutionInputInitialValues(selectedSkillQuery.data));
  }, [form, selectedSkillQuery.data]);

  const schemaEntries = Object.entries(selectedSkillQuery.data?.paramsSchema?.properties || {});
  const requiredFields = new Set(selectedSkillQuery.data?.paramsSchema?.required || []);

  if (skillsQuery.isLoading) {
    return <Spin />;
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/executions')}>
          返回列表
        </Button>
        <Typography.Title level={3} style={{ margin: 0 }}>
          创建执行
        </Typography.Title>
      </Space>
      <Card>
        <Typography.Paragraph type="secondary">
          这里只保留普通用户发起执行所需的最小能力，不暴露管理员调试信息和 Prompt 细节。
        </Typography.Paragraph>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ input: {} }}
          onFinish={(values: { skillId: string; input?: Record<string, unknown> }) => {
            const nextInput = normalizeSkillExecutionInput(
              values.input || {},
              selectedSkillQuery.data?.paramsSchema?.properties || {}
            );
            createMutation.mutate({
              skillId: values.skillId,
              input: nextInput,
            });
          }}
        >
          <Form.Item
            label="技能"
            name="skillId"
            rules={[{ required: true, message: '请选择技能' }]}
          >
            <Select
              placeholder="请选择已发布技能"
              options={publishedSkills.map((skill) => ({
                label: skill.name,
                value: skill.id,
              }))}
            />
          </Form.Item>

          {selectedSkillQuery.isLoading ? <Spin /> : null}

          {schemaEntries.map(([name, config]) => (
            <Form.Item
              key={name}
              label={config.description || name}
              name={['input', name]}
              valuePropName={isBooleanInputType(config.type) ? 'checked' : 'value'}
              rules={
                requiredFields.has(name)
                  ? [{ required: true, message: `请填写 ${name}` }]
                  : undefined
              }
              extra={`字段名: ${name} | 类型: ${config.type}`}
            >
              {renderFieldInput(name, config)}
            </Form.Item>
          ))}

          <Space>
            <Button onClick={() => navigate('/executions')}>取消</Button>
            <Button type="primary" htmlType="submit" loading={createMutation.isLoading}>
              发起执行
            </Button>
          </Space>
        </Form>
      </Card>
    </Space>
  );
}
