import React, { useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Typography,
  message,
} from 'antd';
import { ArrowLeftOutlined, LoadingOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { useTranslation } from 'react-i18next';
import { executionApi } from '../api/execution';
import { ParamsSchema, skillApi, SkillConfigDTO } from '../api/skill';

const { Title, Text } = Typography;

type SchemaField = {
  name: string;
  type: string;
  description?: string;
  required: boolean;
  defaultValue?: unknown;
};

const getSchemaFields = (schema?: ParamsSchema): SchemaField[] => {
  if (!schema?.properties) {
    return [];
  }

  const requiredFields = new Set(schema.required || []);
  return Object.entries(schema.properties).map(([name, config]) => ({
    name,
    type: config?.type || 'string',
    description: config?.description,
    required: requiredFields.has(name) || Boolean(config?.required),
    defaultValue: config?.default,
  }));
};

const getInitialInputValues = (fields: SchemaField[]): Record<string, unknown> => {
  return fields.reduce<Record<string, unknown>>((acc, field) => {
    if (field.defaultValue === undefined) {
      if (field.type === 'boolean') {
        acc[field.name] = false;
      }
      return acc;
    }

    if (field.type === 'object' || field.type === 'json') {
      acc[field.name] =
        typeof field.defaultValue === 'string'
          ? field.defaultValue
          : JSON.stringify(field.defaultValue, null, 2);
      return acc;
    }

    acc[field.name] = field.defaultValue;
    return acc;
  }, {});
};

const renderInputField = (field: SchemaField) => {
  const normalizedType = field.type.toLowerCase();

  if (normalizedType === 'number' || normalizedType === 'integer') {
    return <InputNumber style={{ width: '100%' }} placeholder={`请输入 ${field.name}`} />;
  }

  if (normalizedType === 'boolean') {
    return <Switch />;
  }

  if (normalizedType === 'object' || normalizedType === 'json') {
    return <Input.TextArea rows={6} placeholder="请输入 JSON 字符串" />;
  }

  return <Input placeholder={field.description || `请输入 ${field.name}`} />;
};

const normalizeInputValues = (
  values: Record<string, unknown>,
  fields: SchemaField[],
): Record<string, unknown> => {
  return fields.reduce<Record<string, unknown>>((acc, field) => {
    const rawValue = values[field.name];

    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return acc;
    }

    const normalizedType = field.type.toLowerCase();

    if ((normalizedType === 'object' || normalizedType === 'json') && typeof rawValue === 'string') {
      acc[field.name] = JSON.parse(rawValue);
      return acc;
    }

    acc[field.name] = rawValue;
    return acc;
  }, {});
};

const ExecutionCreatePage: React.FC = () => {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm();
  const selectedSkillId = Form.useWatch('skillId', form) as string | undefined;
  const initializedSkillIdRef = useRef<string | undefined>();

  const skillsQuery = useQuery(['skills-for-execution-create'], () => skillApi.list());

  const skillOptions = useMemo(() => {
    const skills = [...(skillsQuery.data?.skills || [])];
    return skills.sort((left, right) => {
      if (left.isActive === right.isActive) {
        return left.name.localeCompare(right.name);
      }
      return left.isActive ? -1 : 1;
    });
  }, [skillsQuery.data?.skills]);

  const selectedSkillQuery = useQuery(
    ['skill-detail-for-execution-create', selectedSkillId],
    () => skillApi.getById(selectedSkillId as string),
    { enabled: Boolean(selectedSkillId) },
  );

  const selectedSkill = selectedSkillQuery.data as SkillConfigDTO | undefined;
  const schemaFields = useMemo(() => getSchemaFields(selectedSkill?.paramsSchema), [selectedSkill?.paramsSchema]);
  const formLoadingIndicator = <LoadingOutlined style={{ fontSize: 24 }} spin />;

  useEffect(() => {
    const initialSkillId = searchParams.get('skillId');
    if (!initialSkillId) {
      return;
    }

    if (!form.getFieldValue('skillId')) {
      form.setFieldValue('skillId', initialSkillId);
    }
  }, [form, searchParams]);

  useEffect(() => {
    if (!selectedSkill?.id) {
      initializedSkillIdRef.current = undefined;
      form.setFieldValue('input', {});
      return;
    }

    if (initializedSkillIdRef.current === selectedSkill.id) {
      return;
    }

    initializedSkillIdRef.current = selectedSkill.id;
    form.setFieldsValue({
      skillVersion: undefined,
      runtimeType: form.getFieldValue('runtimeType') || 'browser',
      input: getInitialInputValues(schemaFields),
    });
  }, [form, schemaFields, selectedSkill]);

  const createMutation = useMutation(
    async (values: {
      skillId: string;
      skillVersion?: string;
      runtimeType?: string;
      input?: Record<string, unknown>;
    }) => {
      return executionApi.create({
        skillId: values.skillId,
        skillVersion: values.skillVersion?.trim() || undefined,
        runtimeType: values.runtimeType?.trim() || 'browser',
        input: normalizeInputValues(values.input || {}, schemaFields),
      });
    },
    {
      onSuccess: async (execution) => {
        message.success('执行已创建');
        await Promise.all([
          queryClient.invalidateQueries(['executions']),
          queryClient.invalidateQueries(['dashboard-executions-recent']),
          queryClient.invalidateQueries(['dashboard-executions-total']),
          queryClient.invalidateQueries(['dashboard-executions-running']),
          queryClient.invalidateQueries(['dashboard-executions-pending-approval']),
        ]);
        navigate(`/executions/${execution.id}`);
      },
      onError: (error: Error) => {
        message.error(`创建执行失败：${error.message}`);
      },
    },
  );

  const handleSubmit = (values: {
    skillId: string;
    skillVersion?: string;
    runtimeType?: string;
    input?: Record<string, unknown>;
  }) => {
    try {
      createMutation.mutate(values);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '输入格式无效');
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <Space align="center" style={{ marginBottom: 16 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/executions')}>
            返回执行列表
          </Button>
        </Space>
        <Title level={2} style={{ marginBottom: 8 }}>
          {t('newExecution')}
        </Title>
        <Text type="secondary">
          选择一个可用技能并填写参数后，系统会立即创建执行并按风险策略进入排队或审批流程。
        </Text>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="创建说明"
        description="如果技能参数 schema 中包含对象类型字段，请输入合法 JSON；创建成功后会自动跳转到执行详情页。"
      />

      {createMutation.isLoading && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="正在创建执行单"
          description="请求已经提交，系统正在创建执行单并准备跳转详情页，请稍候。"
        />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(320px, 1fr)', gap: 16 }}>
        <Card title="执行配置">
          {skillsQuery.isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
              <Spin tip="正在加载技能列表..." />
            </div>
          ) : skillOptions.length === 0 ? (
            <Empty description="当前没有可用技能可发起执行" />
          ) : (
            <Form
              form={form}
              layout="vertical"
              initialValues={{
                skillId: searchParams.get('skillId') || undefined,
                runtimeType: 'browser',
                input: {},
              }}
              onFinish={handleSubmit}
            >
              <Form.Item
                name="skillId"
                label="技能"
                rules={[{ required: true, message: '请选择一个技能' }]}
              >
                <Select
                  showSearch
                  placeholder="请选择技能"
                  optionFilterProp="data-search"
                  options={skillOptions.map((skill) => ({
                    value: skill.id,
                    label: (
                      <Space>
                        <span>{skill.name}</span>
                        {!skill.isActive ? <Tag color="default">inactive</Tag> : null}
                      </Space>
                    ),
                    disabled: !skill.isActive,
                    'data-search': `${skill.name} ${skill.id}`,
                  }))}
                />
              </Form.Item>

              <Form.Item name="skillVersion" label="技能版本">
                <Input placeholder="可选，例如 v1" />
              </Form.Item>

              <Form.Item
                name="runtimeType"
                label="运行时类型"
                rules={[{ required: true, message: '请输入运行时类型' }]}
              >
                <Input placeholder="默认 browser" />
              </Form.Item>

              <Card
                size="small"
                type="inner"
                title="执行输入参数"
                style={{ marginBottom: 16 }}
              >
                {selectedSkillId && selectedSkillQuery.isFetching ? (
                  <div style={{ padding: '40px 0', textAlign: 'center' }}>
                    <Spin indicator={formLoadingIndicator} tip="正在生成参数表单..." />
                    <div style={{ marginTop: 16 }}>
                      <Text type="secondary">技能参数较多时可能需要几秒，请稍候。</Text>
                    </div>
                  </div>
                ) : selectedSkillId ? (
                  schemaFields.length > 0 ? (
                    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                      {schemaFields.map((field) => {
                        const normalizedType = field.type.toLowerCase();
                        return (
                          <Form.Item
                            key={field.name}
                            name={['input', field.name]}
                            label={`${field.name} (${field.type})`}
                            extra={field.description || (field.required ? '必填参数' : '可选参数')}
                            rules={[
                              {
                                validator: async (_, value) => {
                                  if (
                                    field.required &&
                                    (value === undefined || value === null || value === '')
                                  ) {
                                    throw new Error(`请输入 ${field.name}`);
                                  }

                                  if (
                                    value &&
                                    (normalizedType === 'object' || normalizedType === 'json') &&
                                    typeof value === 'string'
                                  ) {
                                    JSON.parse(value);
                                  }
                                },
                              },
                            ]}
                            valuePropName={normalizedType === 'boolean' ? 'checked' : 'value'}
                          >
                            {renderInputField(field)}
                          </Form.Item>
                        );
                      })}
                    </Space>
                  ) : (
                    <Empty description="该技能没有定义额外输入参数，可直接创建执行" />
                  )
                ) : (
                  <Empty description="请选择技能后填写参数" />
                )}
              </Card>

              <Space>
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  htmlType="submit"
                  loading={createMutation.isLoading}
                  disabled={!selectedSkillId}
                >
                  {t('create')}
                </Button>
                <Button onClick={() => form.resetFields()}>{t('reset')}</Button>
                <Button onClick={() => navigate('/executions')}>{t('cancel')}</Button>
              </Space>
            </Form>
          )}
        </Card>

        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Card title="技能信息">
            {selectedSkill ? (
              <Descriptions bordered size="small" column={1}>
                <Descriptions.Item label="名称">{selectedSkill.name}</Descriptions.Item>
                <Descriptions.Item label="Skill ID">{selectedSkill.id}</Descriptions.Item>
                <Descriptions.Item label="状态">
                  <Tag color={selectedSkill.isActive ? 'green' : 'default'}>
                    {selectedSkill.isActive ? 'active' : 'inactive'}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="描述">
                  {selectedSkill.description || <Text type="secondary">暂无描述</Text>}
                </Descriptions.Item>
                <Descriptions.Item label="工具">
                  <Space wrap>
                    {(selectedSkill.tools || []).length > 0 ? (
                      selectedSkill.tools.map((tool) => (
                        <Tag key={tool} color="purple">
                          {tool}
                        </Tag>
                      ))
                    ) : (
                      <Text type="secondary">无</Text>
                    )}
                  </Space>
                </Descriptions.Item>
              </Descriptions>
            ) : selectedSkillId && selectedSkillQuery.isFetching ? (
              <div style={{ padding: '48px 0', textAlign: 'center' }}>
                <Spin indicator={formLoadingIndicator} tip="正在加载技能信息..." />
              </div>
            ) : (
              <Empty description="选择技能后可查看说明" />
            )}
          </Card>

          <Card title="参数 Schema">
            {selectedSkill?.paramsSchema ? (
              <pre style={{ margin: 0, maxHeight: 360, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(selectedSkill.paramsSchema, null, 2)}
              </pre>
            ) : (
              <Empty description="暂无参数 schema" />
            )}
          </Card>
        </Space>
      </div>
    </div>
  );
};

export default ExecutionCreatePage;
