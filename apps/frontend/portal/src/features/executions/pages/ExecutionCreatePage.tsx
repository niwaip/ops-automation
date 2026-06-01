import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  App,
  Alert,
  Button,
  Card,
  Collapse,
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
} from 'antd';
import { 
  ArrowLeftOutlined, 
  LoadingOutlined, 
  PlayCircleOutlined, 
  RobotOutlined, 
  UploadOutlined 
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { useTranslation } from 'react-i18next';
import { executionApi } from '@/api/execution';
import { capabilityReleaseApi } from '@/api/capabilities';
import { SkillParamsSchema, skillApi, SkillConfigDTO } from '@/api/skill';
import { aiApi } from '@/api/ai';
import type { UploadProps } from 'antd';
import { Modal, Upload } from 'antd';
import { useAuthStore } from '@/shared/store/authStore';

const { Title, Text } = Typography;
const { Panel } = Collapse;

type SchemaField = {
  name: string;
  type: string;
  description?: string;
  required: boolean;
  defaultValue?: unknown;
};

type PublishedSkillOption = {
  skillId: string;
  skillName: string;
  updatedAt: string;
};

type PublishedSkillCandidate = PublishedSkillOption & {
  releaseVersion: number;
};

const getSchemaFields = (schema?: SkillParamsSchema): SchemaField[] => {
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
  const { message } = App.useApp();
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm();
  const selectedSkillId = Form.useWatch('skillId', form) as string | undefined;
  const initializedSkillIdRef = useRef<string | undefined>();
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiTextInput, setAiTextInput] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [uploadedText, setUploadedText] = useState<string>('');
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const { user } = useAuthStore();

  // 为页面容器增加一个最大高度和溢出处理，确保在大屏幕下不出现全局滚动条
  const containerStyle: React.CSSProperties = {
    height: '100%',
    minHeight: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  };

  const publishedSkillsQuery = useQuery(
    ['published-skills-for-execution-create'],
    capabilityReleaseApi.listReleaseCenter,
  );
  const authorizedSkillsQuery = useQuery(['authorized-skills-for-execution-create'], skillApi.list);
  const authorizedSkillIds = useMemo(
    () => new Set((authorizedSkillsQuery.data?.skills || []).map((skill) => skill.id)),
    [authorizedSkillsQuery.data?.skills],
  );

  const skillOptions = useMemo(() => {
    const releases = publishedSkillsQuery.data?.releases || [];
    const skillMap = new Map<string, PublishedSkillCandidate>();

    releases.forEach((release) => {
      if (!release.publishedSkillId) {
        return;
      }
      if (user?.role !== 'admin' && !authorizedSkillIds.has(release.publishedSkillId)) {
        return;
      }

      const sourceKey = [
        release.sourceType,
        release.sourceId || release.sourceName || release.publishedSkillId,
      ].join('::');
      const nextItem: PublishedSkillCandidate = {
        skillId: release.publishedSkillId,
        skillName: release.sourceName || release.sourceId || release.publishedSkillId,
        updatedAt: release.updatedAt,
        releaseVersion: release.releaseVersion || 0,
      };
      const currentItem = skillMap.get(sourceKey);

      const shouldReplace =
        !currentItem ||
        nextItem.releaseVersion > currentItem.releaseVersion ||
        (
          nextItem.releaseVersion === currentItem.releaseVersion &&
          new Date(nextItem.updatedAt).getTime() > new Date(currentItem.updatedAt).getTime()
        );

      if (shouldReplace) {
        skillMap.set(sourceKey, nextItem);
      }
    });

    return Array.from(skillMap.values())
      .map(({ releaseVersion: _releaseVersion, ...item }) => item)
      .sort((left, right) => left.skillName.localeCompare(right.skillName));
  }, [authorizedSkillIds, publishedSkillsQuery.data?.releases, user?.role]);

  const selectedSkillOption = useMemo(
    () => skillOptions.find((skill) => skill.skillId === selectedSkillId),
    [selectedSkillId, skillOptions],
  );

  const selectedSkillQuery = useQuery(
    ['skill-detail-for-execution-create', selectedSkillId],
    () => skillApi.getById(selectedSkillId ?? ''),
    { enabled: Boolean(selectedSkillId) },
  );

  const selectedSkill: SkillConfigDTO | undefined = selectedSkillQuery.data;
  const selectedSkillDisplayName = selectedSkillOption?.skillName || selectedSkill?.name || selectedSkillId || '-';
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
      input: getInitialInputValues(schemaFields),
    });
  }, [form, schemaFields, selectedSkill]);

  const createMutation = useMutation(
    async (values: {
      skillId: string;
      input?: Record<string, unknown>;
    }) => {
      return executionApi.create({
        skillId: values.skillId,
        input: normalizeInputValues(values.input || {}, schemaFields),
      });
    },
    {
      onSuccess: async (execution) => {
        void message.success('执行已创建');
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
        void message.error(`创建执行失败：${error.message}`);
      },
    },
  );

  const handleSubmit = (values: {
    skillId: string;
    input?: Record<string, unknown>;
  }) => {
    try {
      createMutation.mutate(values);
    } catch (error) {
      void message.error(error instanceof Error ? error.message : '输入格式无效');
    }
  };

  const applyGeneratedParamsToForm = (params: Record<string, unknown>) => {
    const currentValues = (form.getFieldValue('input') as Record<string, unknown> | undefined) || {};
    const nextValues: Record<string, unknown> = { ...currentValues };
    schemaFields.forEach((field) => {
      if (params[field.name] !== undefined) {
        const value = params[field.name];
        const normalizedType = field.type.toLowerCase();
        if ((normalizedType === 'object' || normalizedType === 'json') && typeof value !== 'string') {
          nextValues[field.name] = JSON.stringify(value, null, 2);
        } else {
          nextValues[field.name] = value;
        }
      }
    });
    form.setFieldValue('input', nextValues);
    void message.success('已根据AI生成结果自动填充参数');
  };

  const handleOpenAiModal = () => {
    if (!selectedSkillId) {
      void message.warning('请先选择技能');
      return;
    }
    setAiModalOpen(true);
  };

  const handleCloseAiModal = () => {
    setAiModalOpen(false);
    setAiTextInput('');
    setUploadedText('');
    setUploadedFileName('');
    setAiGenerating(false);
  };

  const uploadProps: UploadProps = {
    beforeUpload: (file) => {
      const isText =
        file.type.startsWith('text/') ||
        file.type === 'application/json' ||
        /\.txt$|\.md$|\.csv$|\.json$/i.test(file.name);
      if (!isText) {
        void message.error('目前仅支持文本文件（.txt/.md/.csv/.json）用于参数识别');
        return Upload.LIST_IGNORE;
      }
      try {
        const reader = new FileReader();
        reader.onload = () => {
          const content = String(reader.result || '');
          setUploadedText(content);
          setUploadedFileName(file.name);
          void message.success(`已读取文本文件：${file.name}`);
        };
        reader.onerror = () => {
          void message.error('读取文件失败');
        };
        reader.readAsText(file);
      } catch {
        void message.error('读取文件失败');
        return Upload.LIST_IGNORE;
      }
      return Upload.LIST_IGNORE;
    },
    multiple: false,
    maxCount: 1,
    showUploadList: false,
  };

  const handleAiGenerate = async () => {
    if (!selectedSkill) {
      void message.error('请先选择技能');
      return;
    }
    const userInput = (aiTextInput || uploadedText || '').trim();
    if (!userInput) {
      void message.warning('请输入文字或上传文本文件');
      return;
    }
    setAiGenerating(true);
    try {
      const templateId =
        selectedSkill.carboneTemplateId
        || selectedSkill.templateId
        || '';
      const paramsSchema = selectedSkill.paramsSchema;
      const result = await aiApi.recognizeParams({
        template_id: templateId || 'unknown',
        user_input: uploadedFileName ? `【文件：${uploadedFileName}】\n${userInput}` : userInput,
        params_schema: paramsSchema,
        context: {
          skillId: selectedSkill.id,
          skillName: selectedSkillDisplayName,
          skillDescription: selectedSkill.description,
          triggerKeywords: selectedSkill.triggerKeywords,
          tools: selectedSkill.tools,
        },
      });
      applyGeneratedParamsToForm(result.params || {});
      handleCloseAiModal();
    } catch (error) {
      void message.error(error instanceof Error ? error.message : '参数识别失败');
    } finally {
      setAiGenerating(false);
    }
  };

  return (
    <div style={containerStyle}>
      <div style={{ marginBottom: 16 }}>
        <Space align="center" style={{ marginBottom: 8 }}>
          <Button size="small" icon={<ArrowLeftOutlined />} onClick={() => navigate('/executions')}>
            返回执行列表
          </Button>
        </Space>
        <Title level={4} style={{ margin: 0 }}>
          {t('newExecution')}
        </Title>
      </div>

      {createMutation.isLoading && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="正在创建执行单"
          description="请求已经提交，系统正在创建执行单并准备跳转详情页，请稍候。"
        />
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2fr) minmax(320px, 1fr)',
          gap: 16,
          minHeight: 0,
          flex: 1,
        }}
      >
        <Card title="执行配置" styles={{ body: { maxHeight: '100%', overflowY: 'auto' } }}>
          {publishedSkillsQuery.isLoading || authorizedSkillsQuery.isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
              <Spin tip="正在加载已发布技能..." />
            </div>
          ) : skillOptions.length === 0 ? (
            <Empty description="当前没有已发布技能可发起执行" />
          ) : (
            <Form
              form={form}
              layout="vertical"
              initialValues={{
                skillId: searchParams.get('skillId') || undefined,
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
                  placeholder="请选择已发布技能"
                  optionFilterProp="data-search"
                  options={skillOptions.map((skill) => ({
                    value: skill.skillId,
                    label: (
                      <Space size={8}>
                        <span>{skill.skillName}</span>
                        <Tag color="green">published</Tag>
                      </Space>
                    ),
                    'data-search': `${skill.skillName} ${skill.skillId}`,
                  }))}
                />
              </Form.Item>

              <Card
                size="small"
                type="inner"
                title="执行输入参数"
                style={{ marginBottom: 16 }}
              >
                <Space style={{ marginBottom: 12 }}>
                  <Button icon={<RobotOutlined />} onClick={handleOpenAiModal} disabled={!selectedSkillId}>
                    智能识别参数
                  </Button>
                </Space>
                {selectedSkillId && selectedSkillQuery.isFetching ? (
                  <div style={{ padding: '40px 0', textAlign: 'center' }}>
                    <Spin indicator={formLoadingIndicator} tip="正在生成参数表单..." />
                    <div style={{ marginTop: 16 }}>
                      <Text type="secondary">技能参数较多时可能需要几秒，请稍候。</Text>
                    </div>
                  </div>
                ) : selectedSkillId ? (
                  schemaFields.length > 0 ? (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                        gap: 12,
                      }}
                    >
                      {schemaFields.map((field) => {
                        const normalizedType = field.type.toLowerCase();
                        return (
                          <div
                            key={field.name}
                            style={{
                              padding: 14,
                              borderRadius: 14,
                              border: '1px solid var(--bg-secondary)',
                              background: 'var(--bg-card)',
                              boxShadow: 'var(--shadow-sm)',
                            }}
                          >
                            <Space size={[6, 6]} wrap style={{ marginBottom: 8 }}>
                              <Text strong>{field.name}</Text>
                              <Tag style={{ marginInlineEnd: 0 }}>{field.type}</Tag>
                              <Tag
                                color={field.required ? 'error' : 'default'}
                                style={{ marginInlineEnd: 0 }}
                              >
                                {field.required ? '必填' : '可选'}
                              </Tag>
                            </Space>
                            <Text
                              type="secondary"
                              style={{
                                display: 'block',
                                fontSize: 12,
                                minHeight: 36,
                                marginBottom: 10,
                              }}
                            >
                              {field.description || (field.required ? '必填参数' : '可选参数')}
                            </Text>
                            <Form.Item
                              name={['input', field.name]}
                              style={{ marginBottom: 8 }}
                              rules={[
                                {
                                  validator: (_, value) => {
                                    if (
                                      field.required &&
                                      (value === undefined || value === null || value === '')
                                    ) {
                                      return Promise.reject(new Error(`请输入 ${field.name}`));
                                    }

                                    if (
                                      value &&
                                      (normalizedType === 'object' || normalizedType === 'json') &&
                                      typeof value === 'string'
                                    ) {
                                      JSON.parse(value);
                                    }

                                    return Promise.resolve();
                                  },
                                },
                              ]}
                              valuePropName={normalizedType === 'boolean' ? 'checked' : 'value'}
                            >
                              {renderInputField(field)}
                            </Form.Item>
                          </div>
                        );
                      })}
                    </div>
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

        <Space direction="vertical" size="middle" style={{ width: '100%', minHeight: 0, overflowY: 'auto' }}>
          <Card title="技能信息">
            {selectedSkill ? (
              <Descriptions bordered size="small" column={1}>
                <Descriptions.Item label="名称">{selectedSkillDisplayName}</Descriptions.Item>
                <Descriptions.Item label="技能标识">{selectedSkill.id}</Descriptions.Item>
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

          <Card styles={{ body: { padding: 0 } }}>
            <Collapse ghost defaultActiveKey={[]}>
              <Panel header="参数 Schema" key="params-schema">
                {selectedSkill?.paramsSchema ? (
                  <pre style={{ margin: 0, maxHeight: 360, overflow: 'auto', whiteSpace: 'pre-wrap', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--bg-secondary)', padding: 12, borderRadius: 8 }}>
                    {JSON.stringify(selectedSkill.paramsSchema, null, 2)}
                  </pre>
                ) : (
                  <Empty description="暂无参数 schema" />
                )}
              </Panel>
            </Collapse>
          </Card>
        </Space>
      </div>
      <Modal
        title="智能识别参数"
        open={aiModalOpen}
        onCancel={handleCloseAiModal}
        onOk={() => void handleAiGenerate()}
        okText={aiGenerating ? '正在识别...' : '识别并填充'}
        confirmLoading={aiGenerating}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Input.TextArea
            rows={4}
            placeholder="请输入你的需求描述，系统将基于技能参数 schema 自动识别并填充"
            value={aiTextInput}
            onChange={(e) => setAiTextInput(e.target.value)}
          />
          <Space direction="vertical" style={{ width: '100%' }}>
            <Upload.Dragger {...uploadProps} style={{ padding: 8 }}>
              <p className="ant-upload-drag-icon">
                <UploadOutlined />
              </p>
              <p className="ant-upload-text">拖拽或点击上传文本文件（.txt/.md/.csv/.json）</p>
              <p className="ant-upload-hint">将读取文件文本用于参数识别；暂不支持直接解析PDF/Word。</p>
            </Upload.Dragger>
            {uploadedFileName ? (
              <Text type="secondary">已选择文件：{uploadedFileName}</Text>
            ) : null}
          </Space>
        </Space>
      </Modal>
    </div>
  );
};

export default ExecutionCreatePage;
