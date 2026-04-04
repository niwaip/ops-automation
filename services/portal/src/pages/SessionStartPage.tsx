import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Select, Input, Button, Space, Spin, message, Tag, Alert, Radio, DatePicker, TimePicker, Divider, Row, Col, Typography, Tabs, Table } from 'antd';
import {
  RobotOutlined,
  PlayCircleOutlined,
  LoadingOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined,
  CalendarOutlined,
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

  // Layout sizes: initial 70/30, after execution 30/70
  const leftSpan = hasExecuted ? 7 : 17;
  const rightSpan = hasExecuted ? 17 : 7;

  // Schedule options
  const [executionMode, setExecutionMode] = useState<'immediate' | 'scheduled' | 'recurring'>('immediate');
  const [scheduleDate, setScheduleDate] = useState<string | null>(null);
  const [scheduleTime, setScheduleTime] = useState<string | null>(null);
  const [recurringType, setRecurringType] = useState<'daily' | 'weekly' | 'monthly'>('daily');

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
      // Build schedule config
      const scheduleConfig = executionMode !== 'immediate' ? {
        mode: executionMode,
        date: scheduleDate,
        time: scheduleTime,
        recurringType: executionMode === 'recurring' ? recurringType : undefined,
      } : undefined;

      // Use edited params (from AI recognition + manual edits)
      const finalParams = Object.keys(editedParams).length > 0 ? editedParams : {};

      // Create session
      const result = await sessionApi.create({
        user_id: user?.id || '',
        template_id: selectedTemplateId!,
        params: {
          ...finalParams,
          schedule: scheduleConfig,
        },
      });

      // Start session immediately if not scheduled
      if (executionMode === 'immediate') {
        await sessionApi.start(result.session.id, {
          template_id: selectedTemplateId!,
          params: finalParams,
        });
      }
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
            {/* Step 1: Select Template */}
            <div style={stepStyle}>
              <div style={stepNumberStyle}>1</div>
              <Title level={4} style={{ margin: 0 }}>{t('session:stepSelectTemplate')}</Title>
            </div>

            <div style={{ marginLeft: 44, marginBottom: 32 }}>
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

              {selectedTemplate && (
                <Card
                  size="small"
                  style={{ marginTop: 16, borderRadius: 12, background: 'var(--bg-secondary)' }}
                >
                  <Text strong style={{ marginBottom: 8, display: 'block' }}>执行步骤详情</Text>

                  {/* Steps Table */}
                  {selectedTemplate.steps && selectedTemplate.steps.length > 0 && (
                    <Table
                      size="small"
                      pagination={false}
                      dataSource={selectedTemplate.steps.map((step, index) => {
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
                      })}
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
                          width: 200,
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
                          width: 220,
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
                                      style={{ marginLeft: 4, width: 100, fontSize: 12 }}
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

            {/* Step 2: Input Description */}
            <div style={stepStyle}>
              <div style={stepNumberStyle}>2</div>
              <Title level={4} style={{ margin: 0 }}>{t('session:stepInputDescription')}</Title>
            </div>

            <div style={{ marginLeft: 44, marginBottom: 32 }}>
              <TextArea
                rows={4}
                placeholder={t('session:descriptionPlaceholder')}
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                disabled={!selectedTemplateId}
                style={{ borderRadius: 12 }}
              />
              <Button
                type="primary"
                ghost
                icon={<RobotOutlined />}
                onClick={handleRecognize}
                loading={recognizeMutation.isLoading}
                disabled={!selectedTemplateId || !userInput.trim()}
                style={{ marginTop: 12, borderRadius: 10 }}
              >
                {t('session:aiRecognize')}
              </Button>
            </div>

            {/* Step 3: AI解析结果 */}
            {recognizedParams && Object.keys(editedParams).length > 0 && (
              <>
                <div style={stepStyle}>
                  <div style={stepNumberStyle}>3</div>
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

            {/* Step 4: Execution Mode */}
            <div style={stepStyle}>
              <div style={stepNumberStyle}>{recognizedParams ? '4' : '3'}</div>
              <Title level={4} style={{ margin: 0 }}>{t('session:stepExecutionMode') || '执行方式'}</Title>
            </div>

            <div style={{ marginLeft: 44, marginBottom: 32 }}>
              <Tabs
                activeKey={executionMode}
                onChange={(key) => setExecutionMode(key as 'immediate' | 'scheduled' | 'recurring')}
                items={[
                  {
                    key: 'immediate',
                    label: (
                      <Space>
                        <ThunderboltOutlined style={{ color: '#6366f1' }} />
                        <span>{t('session:immediateExecution') || '立即执行'}</span>
                      </Space>
                    ),
                    children: (
                      <Text type="secondary">{t('session:immediateExecutionDesc') || '会话创建后立即开始执行任务'}</Text>
                    ),
                  },
                  {
                    key: 'scheduled',
                    label: (
                      <Space>
                        <CalendarOutlined style={{ color: '#10b981' }} />
                        <span>{t('session:scheduledExecution') || '定时执行'}</span>
                      </Space>
                    ),
                    children: (
                      <Space direction="vertical" size={16}>
                        <Text type="secondary">{t('session:scheduledExecutionDesc') || '在指定时间执行一次任务'}</Text>
                        <Space size={16}>
                          <div>
                            <Text type="secondary">{t('session:selectDate') || '选择日期'}</Text>
                            <DatePicker
                              style={{ marginLeft: 8, borderRadius: 10 }}
                              onChange={(_, dateString) => setScheduleDate(dateString as string)}
                            />
                          </div>
                          <div>
                            <Text type="secondary">{t('session:selectTime') || '选择时间'}</Text>
                            <TimePicker
                              style={{ marginLeft: 8, borderRadius: 10 }}
                              format="HH:mm"
                              onChange={(_, timeString) => setScheduleTime(timeString as string)}
                            />
                          </div>
                        </Space>
                      </Space>
                    ),
                  },
                  {
                    key: 'recurring',
                    label: (
                      <Space>
                        <ClockCircleOutlined style={{ color: '#f59e0b' }} />
                        <span>{t('session:recurringExecution') || '周期执行'}</span>
                      </Space>
                    ),
                    children: (
                      <Space direction="vertical" size={12}>
                        <Text type="secondary">{t('session:recurringExecutionDesc') || '按天/周/月周期性执行任务'}</Text>
                        <div>
                          <Text type="secondary" style={{ marginRight: 12 }}>{t('session:recurringType') || '重复周期'}</Text>
                          <Radio.Group
                            value={recurringType}
                            onChange={(e) => setRecurringType(e.target.value)}
                            optionType="button"
                            buttonStyle="solid"
                          >
                            <Radio.Button value="daily">{t('session:daily') || '每天'}</Radio.Button>
                            <Radio.Button value="weekly">{t('session:weekly') || '每周'}</Radio.Button>
                            <Radio.Button value="monthly">{t('session:monthly') || '每月'}</Radio.Button>
                          </Radio.Group>
                        </div>
                        <div>
                          <Text type="secondary">{t('session:startTime') || '开始时间'}</Text>
                          <TimePicker
                            style={{ marginLeft: 8, borderRadius: 10 }}
                            format="HH:mm"
                            onChange={(_, timeString) => setScheduleTime(timeString as string)}
                          />
                        </div>
                      </Space>
                    ),
                  },
                ]}
              />
            </div>

            <Divider />

            {/* Action Buttons */}
            <Row justify="end" gutter={16}>
              <Col>
                <Button
                  icon={<ReloadOutlined />}
                  size="large"
                  onClick={() => resetWorkerMutation.mutate()}
                  loading={resetWorkerMutation.isLoading}
                  style={{ borderRadius: 10, minWidth: 160, height: 48 }}
                >
                  {t('template:resetWorkers')}
                </Button>
              </Col>
              <Col>
                <Button
                  size="large"
                  onClick={() => navigate('/sessions')}
                  style={{ borderRadius: 10, minWidth: 100 }}
                >
                  {t('common:cancel')}
                </Button>
              </Col>
              <Col>
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  size="large"
                  onClick={handleExecute}
                  loading={executeMutation.isLoading}
                  disabled={!selectedTemplateId}
                  style={{ borderRadius: 10, minWidth: 140, height: 48 }}
                >
                  {executionMode === 'immediate'
                    ? t('session:executeSession')
                    : t('session:scheduleSession') || '创建任务'}
                </Button>
              </Col>
            </Row>

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
              height: 'calc(100% - 57px)',
              minHeight: 500,
              borderRadius: 12,
              background: '#1a1a2e',
              overflow: 'hidden',
            }}>
              <iframe
                src={`${NOVNC_URL}?autoconnect=true&resize=scale`}
                style={{ width: '100%', height: '100%', border: 'none' }}
                title="noVNC Desktop"
              />
            </div>
            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('session:desktopHint') || '点击"立即执行"后，浏览器窗口将在此显示'}
              </Text>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default SessionStartPage;