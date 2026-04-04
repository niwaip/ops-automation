import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Select, Input, Button, Space, Spin, message, Tag, Alert, Radio, DatePicker, TimePicker, Divider, Row, Col, Typography, Tabs } from 'antd';
import {
  RobotOutlined,
  PlayCircleOutlined,
  LoadingOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined,
  CalendarOutlined,
  EyeOutlined,
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
const { RangePicker } = DatePicker;

// noVNC URL - use environment variable or default
const NOVNC_URL = import.meta.env.VITE_NOVNC_URL || 'http://localhost:6080/vnc.html';

const SessionStartPage: React.FC = () => {
  const { t } = useTranslation(['common', 'session', 'template']);
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>();
  const [userInput, setUserInput] = useState('');
  const [recognizedParams, setRecognizedParams] = useState<RecognizeParamsResponse | null>(null);

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
    }),
    {
      onSuccess: (data) => {
        setRecognizedParams(data);
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

      // Create session
      const result = await sessionApi.create({
        user_id: user?.id || '',
        template_id: selectedTemplateId!,
        params: {
          ...recognizedParams?.params,
          schedule: scheduleConfig,
        },
      });

      // Start session immediately if not scheduled
      if (executionMode === 'immediate') {
        await sessionApi.start(result.session.id, {
          template_id: selectedTemplateId!,
          params: recognizedParams?.params || {},
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
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <Row gutter={24}>
        {/* Left Column - Configuration */}
        <Col span={12}>
          {/* Main Content Card */}
          <Card bordered={false} style={{ borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
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
                  (option?.children as string)?.toLowerCase().includes(input.toLowerCase())
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
                  <Row gutter={[16, 12]}>
                    <Col span={12}>
                      <Text type="secondary">{t('template:description')}</Text>
                      <div><Text strong>{selectedTemplate.description || '-'}</Text></div>
                    </Col>
                    <Col span={6}>
                      <Text type="secondary">{t('template:stepsCount')}</Text>
                      <div><Text strong>{selectedTemplate.steps?.length || 0}</Text></div>
                    </Col>
                    <Col span={6}>
                      <Text type="secondary">{t('template:paramsSchema')}</Text>
                      <div>
                        {selectedTemplate.params_schema?.required?.length > 0
                          ? selectedTemplate.params_schema.required.map((p: string) => (
                              <Tag key={p} color="blue">{p}</Tag>
                            ))
                          : <Tag>{t('template:noParams')}</Tag>}
                      </div>
                    </Col>
                  </Row>
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

            {/* Step 3: Review Params */}
            {recognizedParams && (
              <>
                <div style={stepStyle}>
                  <div style={stepNumberStyle}>3</div>
                  <Title level={4} style={{ margin: 0 }}>{t('session:stepReviewParams')}</Title>
                </div>

                <div style={{ marginLeft: 44, marginBottom: 32 }}>
                  <Alert
                    type={recognizedParams.confidence > 0.8 ? 'success' : 'warning'}
                    message={t('session:confidenceScore', { score: recognizedParams.confidence })}
                    style={{ marginBottom: 16, borderRadius: 10 }}
                  />
                  <Card size="small" style={{ borderRadius: 12 }}>
                    {Object.entries(recognizedParams.params).map(([key, value]) => (
                      <div key={key} style={{ marginBottom: 8 }}>
                        <Text type="secondary">{key}: </Text>
                        <Text strong>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</Text>
                      </div>
                    ))}
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
        <Col span={12}>
          <Card
            bordered={false}
            style={{ borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.06)', height: '100%' }}
            title={
              <Space>
                <DesktopOutlined style={{ fontSize: 20 }} />
                <span>{t('session:desktopView') || '桌面预览'}</span>
              </Space>
            }
            extra={
              <Button
                type="link"
                size="small"
                onClick={() => window.open(`${NOVNC_URL}?autoconnect=true&resize=scale`, '_blank')}
              >
                {t('session:openInNewTab') || '新标签页打开'}
              </Button>
            }
          >
            <div style={{
              width: '100%',
              height: 700,
              border: '1px solid #d9d9d9',
              borderRadius: 8,
              background: '#1e1e1e',
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