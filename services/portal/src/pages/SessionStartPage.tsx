import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Select, Input, Button, Space, Spin, message, Tag, Alert, Divider, Row, Col, Typography, Table } from 'antd';
import {
  RobotOutlined,
  PlayCircleOutlined,
  LoadingOutlined,
  DesktopOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from 'react-query';
import { templateApi, Template } from '../api/template';
import { aiApi, RecognizeParamsResponse } from '../api/ai';
import { sessionApi, workerApi } from '../api/session';
import { useAuthStore } from '../store/authStore';

const { TextArea } = Input;
const { Option } = Select;
const { Title, Text } = Typography;

// noVNC URL - use environment variable or default
const NOVNC_URL = import.meta.env.VITE_NOVNC_URL || 'http://localhost:6080/vnc.html';

// Action descriptions mapping
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

  // Track execution state for dynamic layout
  const [hasExecuted, setHasExecuted] = useState(false);

  // Layout sizes: initial 60/40, after execution 40/60
  const leftSpan = hasExecuted ? 10 : 14;
  const rightSpan = hasExecuted ? 14 : 10;

  // Fetch published templates
  const templatesQuery = useQuery(
    ['templates', { status: 'PUBLISHED' }],
    () => templateApi.list({ status: 'PUBLISHED' }),
    { staleTime: 30000 }
  );

  // Get selected template details
  const selectedTemplateQuery = useQuery(
    ['template', selectedTemplateId],
    () => templateApi.getById(selectedTemplateId!),
    { enabled: !!selectedTemplateId }
  );

  // AI recognize params mutation
  const recognizeMutation = useMutation(
    () => aiApi.recognizeParams({
      template_id: selectedTemplateId!,
      user_input: userInput,
      // 传入模版的 params_schema，让 AI 能够正确识别参数
      params_schema: selectedTemplate?.params_schema,
    }),
    {
      onSuccess: (data) => {
        setRecognizedParams(data);
        setEditedParams(data.params);
        message.success(t('session:recognizeSuccess'));
      },
      onError: () => {
        message.error(t('session:recognizeFailed'));
      },
    }
  );

  // Create and start session mutation
  const executeMutation = useMutation(
    async () => {
      // Use edited params (from AI recognition + manual edits)
      const finalParams = Object.keys(editedParams).length > 0 ? editedParams : {};

      // Create session
      const result = await sessionApi.create({
        user_id: user?.id || '',
        template_id: selectedTemplateId!,
        params: finalParams,
      });

      // Start session immediately
      await sessionApi.start(result.session.id, {
        template_id: selectedTemplateId!,
        params: finalParams,
      });
      return result.session;
    },
    {
      onSuccess: (session) => {
        message.success(t('session:startSuccess'));
        navigate(`/sessions/${session.id}`);
      },
      onError: () => {
        message.error(t('session:startFailed'));
      },
    }
  );

  // Reset worker pool mutation
  const resetWorkerMutation = useMutation(
    async () => {
      const result = await workerApi.reset();
      return result;
    },
    {
      onSuccess: (result) => {
        message.success(result.message || t('template:workerResetSuccess'));
      },
      onError: () => {
        message.error(t('template:workerResetFailed'));
      },
    }
  );

  const handleRecognize = () => {
    if (!selectedTemplateId) {
      message.warning(t('session:selectTemplateFirst'));
      return;
    }
    if (!userInput.trim()) {
      message.warning(t('session:enterDescription'));
      return;
    }
    recognizeMutation.mutate();
  };

  const handleExecute = () => {
    if (!selectedTemplateId) {
      message.warning(t('session:selectTemplateFirst'));
      return;
    }
    // Mark execution started - triggers layout change
    setHasExecuted(true);
    executeMutation.mutate();
  };

  const selectedTemplate = selectedTemplateQuery.data;
  const isLoading = templatesQuery.isLoading || recognizeMutation.isLoading || executeMutation.isLoading || resetWorkerMutation.isLoading;

  // Step indicator styles
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
        background: 'linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%)',
      }}
    >
      <Row gutter={24} style={{ minHeight: 'calc(100vh - 120px)' }}>
        {/* Left Column - Configuration */}
        <Col
          span={leftSpan}
          style={{
            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {/* Main Content Card */}
          <Card
            bordered={false}
            style={{
              borderRadius: 16,
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.8)',
              height: '100%',
            }}
          >
            {/* Template Selection and Actions */}
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
                      style={{
                        borderRadius: 8,
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: '#fff',
                        border: 'none',
                      }}
                    >
                      解析参数
                    </Button>
                    <Button
                      type="primary"
                      icon={<PlayCircleOutlined />}
                      size="large"
                      onClick={handleExecute}
                      loading={executeMutation.isLoading}
                      disabled={!selectedTemplateId}
                      style={{ borderRadius: 8 }}
                    >
                      执行
                    </Button>
                    <Button
                      icon={<ReloadOutlined />}
                      size="large"
                      onClick={() => resetWorkerMutation.mutate()}
                      loading={resetWorkerMutation.isLoading}
                      style={{
                        borderRadius: 8,
                        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                        color: '#fff',
                        border: 'none',
                      }}
                    >
                      重置池
                    </Button>
                  </Space>
                </Col>
              </Row>

              {/* Input Description - above the steps table */}
              <div style={{ marginTop: 16 }}>
                <TextArea
                  rows={3}
                  placeholder="输入需要替换的参数描述，然后点击「解析参数」按钮，AI将自动识别并填充参数值"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  disabled={!selectedTemplateId}
                  style={{ borderRadius: 12 }}
                />
              </div>

              {selectedTemplate && (
                <Card
                  size="small"
                  style={{ marginTop: 16, borderRadius: 12, background: 'var(--bg-secondary)' }}
                >
                  <Text strong style={{ marginBottom: 8, display: 'block' }}>执行步骤详情</Text>

                  {/* Steps Table - only show steps with replaceable params */}
                  {selectedTemplate.steps && selectedTemplate.steps.length > 0 && (
                    <Table
                      size="small"
                      pagination={false}
                      dataSource={selectedTemplate.steps
                        .map((step, index) => {
                          // Find which params in this step can be replaced
                          const replaceableParams: string[] = [];
                          if (step.params) {
                            Object.entries(step.params).forEach(([, value]) => {
                              // Check if param value contains template reference like ${param_name}
                              const str = String(value);
                              if (str.includes('${') || str.includes('{{')) {
                                const match = str.match(/\$\{(\w+)\}|\{\{(\w+)\}\}/);
                                if (match) {
                                  replaceableParams.push(match[1] || match[2]);
                                }
                              }
                            });
                          }

                          return {
                            key: step.step_id || `step-${index}`,
                            step: index + 1,
                            action: step.action,
                            actionName: ACTION_DESCRIPTIONS[step.action] || step.action,
                            params: step.params || {},
                            locator: step.locator,
                            replaceableParams,
                          };
                        })
                        .filter((record) => record.replaceableParams.length > 0)
                      }
                      columns={[
                        {
                          title: '步骤',
                          dataIndex: 'step',
                          key: 'step',
                          width: 50,
                          render: (num: number) => <Tag color="purple">{num}</Tag>,
                        },
                        {
                          title: '动作',
                          dataIndex: 'actionName',
                          key: 'actionName',
                          width: 120,
                        },
                        {
                          title: '参数',
                          key: 'params',
                          width: 280,
                          render: (_: any, record: any) => {
                            const params = record.params;
                            if (!params || Object.keys(params).length === 0) {
                              return <Text type="secondary">-</Text>;
                            }

                            // 只显示可替换参数（包含 ${param_name} 占位符的）
                            const replaceableItems: JSX.Element[] = [];
                            Object.entries(params).forEach(([k, v]) => {
                              const str = String(v);
                              const match = str.match(/\$\{(\w+)\}|\{\{(\w+)\}\}/);
                              if (match) {
                                const paramName = match[1] || match[2];
                                const prop = selectedTemplate.params_schema?.properties?.[paramName as any] as any;
                                const description = prop?.description || paramName;
                                const defaultValue = prop?.default || '-';
                                replaceableItems.push(
                                  <div key={k} style={{ fontSize: 12, marginBottom: 4 }}>
                                    <Tag color="blue">{paramName}</Tag>
                                    <Text type="secondary" style={{ marginLeft: 4 }}>{description}</Text>
                                    <Text type="secondary" style={{ marginLeft: 8, fontSize: 11 }}>
                                      (默认: {String(defaultValue)})
                                    </Text>
                                  </div>
                                );
                              }
                            });

                            return replaceableItems.length > 0 ? (
                              <div>{replaceableItems}</div>
                            ) : <Text type="secondary">-</Text>;
                          },
                        },
                        {
                          title: '执行时替换',
                          key: 'replaceable',
                          width: 160,
                          render: (_: any, record: any) => {
                            const params = record.params;
                            if (!params) return <Text type="secondary">-</Text>;

                            const inputs: JSX.Element[] = [];
                            Object.entries(params).forEach(([, v]) => {
                              const str = String(v);
                              const match = str.match(/\$\{(\w+)\}|\{\{(\w+)\}\}/);
                              if (match) {
                                const paramName = match[1] || match[2];
                                const currentValue = editedParams[paramName] ?? '';
                                inputs.push(
                                  <div key={paramName} style={{ marginBottom: 4 }}>
                                    <Text style={{ fontSize: 11 }} type="secondary">{paramName}:</Text>
                                    <Input
                                      size="small"
                                      value={String(currentValue)}
                                      placeholder={`输入${paramName}`}
                                      onChange={(e) => {
                                        setEditedParams(prev => ({
                                          ...prev,
                                          [paramName]: e.target.value,
                                        }));
                                      }}
                                      style={{ marginLeft: 4, width: 80, fontSize: 12 }}
                                    />
                                  </div>
                                );
                              }
                            });

                            return inputs.length > 0 ? (
                              <div>{inputs}</div>
                            ) : <Text type="secondary">-</Text>;
                          },
                        },
                      ]}
                    />
                  )}
                </Card>
              )}
            </div>

            {/* Step 2: AI解析结果 */}
            {recognizedParams && Object.keys(editedParams).length > 0 && (
              <>
                <div style={stepStyle}>
                  <div style={stepNumberStyle}>2</div>
                  <Title level={4} style={{ margin: 0 }}>AI参数解析结果</Title>
                </div>

                <div style={{ marginLeft: 44, marginBottom: 32 }}>
                  <Alert
                    type={recognizedParams.confidence > 0.8 ? 'success' : 'warning'}
                    message={`置信度: ${(recognizedParams.confidence * 100).toFixed(1)}% - AI已根据您的描述自动解析参数`}
                    style={{ marginBottom: 16, borderRadius: 10 }}
                  />
                  <Card size="small" style={{ borderRadius: 12, background: '#f6ffed' }}>
                    <Text type="secondary" style={{ marginBottom: 8, display: 'block' }}>
                      解析后的参数值（可在上方表格"执行时替换"列中修改）:
                    </Text>
                    <Row gutter={[16, 8]}>
                      {Object.entries(editedParams).map(([key, value]) => (
                        <Col span={12} key={key}>
                          <Space>
                            <Text strong>{key}:</Text>
                            <Tag color="blue">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</Tag>
                          </Space>
                        </Col>
                      ))}
                    </Row>
                  </Card>
                </div>
              </>
            )}
            {isLoading && (
              <div style={{ textAlign: 'center', marginTop: 24 }}>
                <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
              </div>
            )}
          </Card>
        </Col>

        {/* Right Column - noVNC Desktop View */}
        <Col
          span={rightSpan}
          style={{
            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <Card
            bordered={false}
            style={{
              borderRadius: 16,
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.8)',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
            }}
            bodyStyle={{
              flex: 1,
              padding: 0,
              minHeight: 0,
            }}
            title={
              <Space>
                <DesktopOutlined style={{ fontSize: 20, color: '#6366f1' }} />
                <span style={{ fontWeight: 600 }}>{t('session:desktopView') || '桌面预览'}</span>
              </Space>
            }
            extra={
              <Button
                type="link"
                size="small"
                onClick={() => window.open(`${NOVNC_URL}?autoconnect=true&resize=scale`, '_blank')}
                style={{ color: '#6366f1' }}
              >
                {t('session:openInNewTab') || '新标签页打开'}
              </Button>
            }
          >
            <div style={{
              width: '100%',
              height: '100%',
              background: '#1a1a2e',
              overflow: 'hidden',
              borderRadius: 12,
              display: 'flex',
              flexDirection: 'column',
            }}>
              <iframe
                src={`${NOVNC_URL}?autoconnect=true&resize=scale`}
                style={{ width: '100%', height: '100%', border: 'none', flex: 1 }}
                title="noVNC Desktop"
              />
              <div style={{ padding: 12, textAlign: 'center' }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t('session:desktopHint') || '点击"立即执行"后，浏览器窗口将在此显示'}
                </Text>
              </div>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default SessionStartPage;