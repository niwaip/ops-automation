import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Select, Input, Button, Space, Spin, message, Tag, Alert, Row, Col, Typography, Table } from 'antd';
import {
  RobotOutlined,
  PlayCircleOutlined,
  LoadingOutlined,
  DesktopOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from 'react-query';
import { templateApi, Template } from '@/api/template';
import { aiApi, RecognizeParamsResponse } from '@/api/ai';
import { sessionApi, workerApi } from '@/api/session';
import { runtimeConfig } from '@/shared/config/runtime';
import { useAuthStore } from '@/shared/store/authStore';

const normalizeParamsSchema = (template?: Template) => {
  const properties = (template?.params_schema?.properties ?? {}) as Record<string, {
    type: string;
    description?: string;
    default?: string | number | boolean;
  }>;

  return {
    properties,
    required: template?.params_schema?.required ?? [],
  };
};

const getTemplatePropertyDescription = (template: Template | undefined, name: string) => {
  const properties = (template?.params_schema?.properties ?? {}) as Record<string, { description?: string }>;
  return properties[name]?.description;
};

const { TextArea } = Input;
const { Option } = Select;
const { Title, Text } = Typography;

const NOVNC_URL = runtimeConfig.noVncUrl;

const ACTION_DESCRIPTIONS: Record<string, string> = {
  navigate: '导航到URL',
  click: '点击元素',
  fill: '填写输入框',
  screenshot: '截图',
  wait: '等待',
  hover: '悬停',
  press: '按键',
  scroll: '滚动',
  smart_search: '智能搜索',
  get_text: '获取文本',
  snapshot: '快照',
  type_text: '输入文本',
};

const SessionStartPage: React.FC = () => {
  const { t } = useTranslation(['common', 'session', 'template']);
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>();
  const [userInput, setUserInput] = useState('');
  const [recognizedParams, setRecognizedParams] = useState<RecognizeParamsResponse | null>(null);
  const [editedParams, setEditedParams] = useState<Record<string, unknown>>({});
  const [hasExecuted, setHasExecuted] = useState(false);

  const leftSpan = hasExecuted ? 10 : 14;
  const rightSpan = hasExecuted ? 14 : 10;

  const templatesQuery = useQuery(
    ['templates', { status: 'PUBLISHED' }],
    () => templateApi.list({ status: 'PUBLISHED' }),
    { staleTime: 30000 }
  );

  const selectedTemplateQuery = useQuery(
    ['template', selectedTemplateId],
    () => templateApi.getById(selectedTemplateId!),
    { enabled: !!selectedTemplateId }
  );

  const recognizeMutation = useMutation(
    () => aiApi.recognizeParams({
      template_id: selectedTemplateId!,
      user_input: userInput,
      params_schema: normalizeParamsSchema(selectedTemplate),
    }),
    {
      onSuccess: (data) => {
        setRecognizedParams(data);
        setEditedParams(data.params);
        void message.success(t('session:recognizeSuccess'));
      },
      onError: () => {
        void message.error(t('session:recognizeFailed'));
      },
    }
  );

  const executeMutation = useMutation(
    async () => {
      const finalParams = Object.keys(editedParams).length > 0 ? editedParams : {};

      const result = await sessionApi.create({
        user_id: user?.id || '',
        template_id: selectedTemplateId!,
        params: finalParams,
      });

      await sessionApi.start(result.session.id, {
        template_id: selectedTemplateId!,
        params: finalParams,
      });
      return result.session;
    },
    {
      onSuccess: (session) => {
        void message.success(t('session:startSuccess'));
        navigate(`/sessions/${session.id}`);
      },
      onError: () => {
        void message.error(t('session:startFailed'));
      },
    }
  );

  const resetWorkerMutation = useMutation(
    async () => {
      const result = await workerApi.reset();
      return result;
    },
    {
      onSuccess: (result) => {
        void message.success(result.message || t('template:workerResetSuccess'));
      },
      onError: () => {
        void message.error(t('template:workerResetFailed'));
      },
    }
  );

  const handleRecognize = () => {
    if (!selectedTemplateId) {
      void message.warning(t('session:selectTemplateFirst'));
      return;
    }
    if (!userInput.trim()) {
      void message.warning(t('session:enterDescription'));
      return;
    }
    recognizeMutation.mutate();
  };

  const handleExecute = () => {
    if (!selectedTemplateId) {
      void message.warning(t('session:selectTemplateFirst'));
      return;
    }
    setHasExecuted(true);
    executeMutation.mutate();
  };

  const selectedTemplate = selectedTemplateQuery.data;
  const isLoading = templatesQuery.isLoading || recognizeMutation.isLoading || executeMutation.isLoading || resetWorkerMutation.isLoading;

  const stepStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    padding: '12px 16px',
    background: 'var(--bg-secondary)',
    borderRadius: 12,
  };

  const stepNumberStyle = {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 600,
    fontSize: 16,
  };

  return (
    <div
      style={{
        padding: '24px 48px',
        minHeight: '100vh',
        background: 'var(--bg-primary)',
      }}
    >
      <Row gutter={24} style={{ minHeight: 'calc(100vh - 120px)' }}>
        <Col
          span={leftSpan}
          style={{
            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <Card
            variant="borderless"
            style={{
              borderRadius: 16,
              height: '100%',
            }}
          >
            <div style={{ marginBottom: 24 }}>
              <Row gutter={16} align="middle">
                <Col flex="auto">
                  <Select
                    style={{ width: '100%' }}
                    placeholder={t('session:selectTemplatePlaceholder')}
                    value={selectedTemplateId}
                    onChange={setSelectedTemplateId}
                    loading={templatesQuery.isLoading}
                    showSearch
                    size="large"
                    filterOption={(input, option) =>
                      (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
                    }
                  >
                    {templatesQuery.data?.templates.map((template: Template) => (
                      <Option key={template.id} value={template.id}>
                        <Space>
                          <Tag color="purple">{template.name}</Tag>
                          <Text type="secondary">v{template.version}</Text>
                        </Space>
                      </Option>
                    ))}
                  </Select>
                </Col>
                <Col>
                  <Space size={12}>
                    <Button
                      icon={<RobotOutlined />}
                      onClick={handleRecognize}
                      loading={recognizeMutation.isLoading}
                      disabled={!selectedTemplateId || !userInput.trim()}
                      size="large"
                    >
                      {t('session:recognizeParams')}
                    </Button>
                    <Button
                      type="primary"
                      icon={<PlayCircleOutlined />}
                      onClick={handleExecute}
                      loading={executeMutation.isLoading}
                      disabled={!selectedTemplateId}
                      size="large"
                    >
                      {t('session:startSession')}
                    </Button>
                    <Button
                      icon={<ReloadOutlined />}
                      onClick={() => resetWorkerMutation.mutate()}
                      loading={resetWorkerMutation.isLoading}
                      size="large"
                    >
                      {t('template:resetWorker')}
                    </Button>
                  </Space>
                </Col>
              </Row>
            </div>

            <div style={stepStyle}>
              <div style={stepNumberStyle}>1</div>
              <div>
                <Title level={5} style={{ margin: 0 }}>{t('session:describeTask')}</Title>
                <Text type="secondary">{t('session:describeTaskHint')}</Text>
              </div>
            </div>

            <TextArea
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder={t('session:taskDescriptionPlaceholder')}
              autoSize={{ minRows: 6, maxRows: 12 }}
              style={{ marginBottom: 24, borderRadius: 12 }}
            />

            <div style={stepStyle}>
              <div style={stepNumberStyle}>2</div>
              <div>
                <Title level={5} style={{ margin: 0 }}>{t('session:recognizedParams')}</Title>
                <Text type="secondary">{t('session:recognizedParamsHint')}</Text>
              </div>
            </div>

            {recognizeMutation.isLoading ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Spin indicator={<LoadingOutlined style={{ fontSize: 28 }} spin />} />
              </div>
            ) : recognizedParams ? (
              <Space direction="vertical" style={{ width: '100%' }} size={16}>
                {recognizedParams.suggestions?.length ? (
                  <Alert message={recognizedParams.suggestions.join('；')} type="info" showIcon />
                ) : null}
                <Table
                  pagination={false}
                  rowKey="name"
                  dataSource={Object.entries(editedParams).map(([name, value]) => ({
                    name,
                    value,
                    description: getTemplatePropertyDescription(selectedTemplate, name),
                  }))}
                  columns={[
                    {
                      title: t('common:name'),
                      dataIndex: 'name',
                      key: 'name',
                      width: 180,
                      render: (name: string) => <Tag>{name}</Tag>,
                    },
                    {
                      title: t('common:value'),
                      dataIndex: 'value',
                      key: 'value',
                      render: (value: unknown, record: { name: string }) => (
                        <Input
                          value={value === undefined || value === null ? '' : String(value)}
                          onChange={(e) => {
                            setEditedParams((prev) => ({
                              ...prev,
                              [record.name]: e.target.value,
                            }));
                          }}
                        />
                      ),
                    },
                    {
                      title: t('common:description'),
                      dataIndex: 'description',
                      key: 'description',
                    },
                  ]}
                />
              </Space>
            ) : (
              <Alert message={t('session:recognizeParamsEmpty')} type="warning" showIcon />
            )}
          </Card>
        </Col>

        <Col span={rightSpan} style={{ transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)' }}>
          <Card
            variant="borderless"
            style={{
              borderRadius: 16,
              height: '100%',
            }}
          >
            <div style={stepStyle}>
              <div style={stepNumberStyle}>3</div>
              <div>
                <Title level={5} style={{ margin: 0 }}>{t('session:browserPreview')}</Title>
                <Text type="secondary">{t('session:browserPreviewHint')}</Text>
              </div>
            </div>

            {isLoading ? (
              <div style={{ textAlign: 'center', padding: 80 }}>
                <Spin indicator={<LoadingOutlined style={{ fontSize: 28 }} spin />} />
              </div>
            ) : NOVNC_URL ? (
              <div
                style={{
                  borderRadius: 12,
                  overflow: 'hidden',
                  border: '1px solid var(--bg-secondary)',
                  background: '#111827',
                  minHeight: 640,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: 'rgba(15, 23, 42, 0.88)',
                    color: '#fff',
                  }}
                >
                  <Space>
                    <DesktopOutlined />
                    <span>{t('session:liveBrowser')}</span>
                  </Space>
                  <Button type="link" style={{ color: '#fff' }} onClick={() => window.open(NOVNC_URL, '_blank')}>
                    {t('session:openInNewWindow')}
                  </Button>
                </div>
                <iframe
                  src={NOVNC_URL}
                  title="session-live-preview"
                  style={{ width: '100%', height: 620, border: 'none' }}
                />
              </div>
            ) : (
              <Alert message={t('session:noBrowserPreview')} type="warning" showIcon />
            )}

            {selectedTemplate?.steps?.length ? (
              <Card size="small" style={{ marginTop: 16 }} title={t('session:workflowPreview')}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  {selectedTemplate.steps.map((step: Template['steps'][number], index: number) => {
                    const action = String(step.action || '');
                    return (
                      <Space key={`${action}-${index}`} style={{ width: '100%', justifyContent: 'space-between' }}>
                        <Space>
                          <Tag color="blue">{index + 1}</Tag>
                          <Text>{ACTION_DESCRIPTIONS[action] || action || '-'}</Text>
                        </Space>
                        <Text type="secondary">{String(step.locator?.value || '')}</Text>
                      </Space>
                    );
                  })}
                </Space>
              </Card>
            ) : null}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default SessionStartPage;
