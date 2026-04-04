import React, { useState, useEffect, useCallback } from 'react';
import { Typography, Row, Col, message, Spin, Card, Button, Space, Tag } from 'antd';
import { useTranslation } from 'react-i18next';
import { useMutation } from 'react-query';
import { RobotOutlined, DesktopOutlined, FullscreenOutlined, CompressOutlined } from '@ant-design/icons';
import { AIControls, TemplatePreview } from '../components/recorder';
import recorderService, { RecorderStatus, CompiledTemplate, ValidationResult } from '../services/recorder.service';
import { templateApi, CompileResult } from '../api/template';
import { useAuthStore } from '../store/authStore';

const { Title, Text } = Typography;

interface RecorderState {
  status: RecorderStatus;
  script: string;
  targetUrl: string;
  error?: string;
}

// MCP-style command
interface MCPCommand {
  tool: string;
  params: Record<string, unknown>;
}

const RecorderPage: React.FC = () => {
  const { t } = useTranslation(['common', 'recorder']);
  const { user } = useAuthStore();

  const [recorderState, setRecorderState] = useState<RecorderState>({
    status: 'idle',
    script: '',
    targetUrl: '',
  });

  const [isConnected, setIsConnected] = useState(false);
  const [isBrowserInitialized, setIsBrowserInitialized] = useState(false);
  const [template, setTemplate] = useState<CompiledTemplate | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);

  // Track execution state for dynamic layout
  const [hasExecuted, setHasExecuted] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Layout sizes: initial 40/60, after execution 25/75
  const leftSpan = hasExecuted || isExpanded ? 6 : 10;
  const rightSpan = hasExecuted || isExpanded ? 18 : 14;

  // Compile mutation
  const compileMutation = useMutation(
    (options: { script: string; intent?: string }) =>
      templateApi.compile(options.script, options.intent),
    {
      onSuccess: (result: CompileResult) => {
        setTemplate(result.template as CompiledTemplate);
        setValidation(result.validation);
        message.success(t('recorder:compileSuccess'));
      },
      onError: () => {
        message.error(t('recorder:compileFailed'));
      },
    }
  );

  // Save template mutation
  const saveMutation = useMutation(
    (compiledTemplate: CompiledTemplate) =>
      templateApi.create({
        name: compiledTemplate.name,
        version: compiledTemplate.version,
        description: compiledTemplate.metadata.description,
        params_schema: compiledTemplate.params_schema,
        steps: compiledTemplate.steps.map((step) => ({
          step_id: step.step_id,
          action: step.action,
          locator: step.locator,
          params: step.params,
          wait: step.wait,
          retry: step.retry,
          on_fail: step.on_fail,
        })),
        created_by: user?.id || 'unknown',
      }),
    {
      onSuccess: () => {
        message.success(t('recorder:saveSuccess'));
        setTemplate(null);
        setValidation(null);
        setRecorderState((prev) => ({ ...prev, script: '' }));
      },
      onError: () => {
        message.error(t('recorder:saveFailed'));
      },
    }
  );

  // WebSocket event handlers
  useEffect(() => {
    const handleStatus = (data: unknown) => {
      const statusData = data as { status: RecorderStatus; url?: string };
      setRecorderState((prev) => ({
        ...prev,
        status: statusData.status,
        targetUrl: statusData.url || prev.targetUrl,
      }));
    };

    const handleScript = (data: unknown) => {
      const scriptData = data as { script: string };
      setRecorderState((prev) => ({
        ...prev,
        script: scriptData.script,
      }));
    };

    const handleError = (data: unknown) => {
      const errorData = data as { message: string };
      setRecorderState((prev) => ({
        ...prev,
        error: errorData.message,
        status: 'error',
      }));
      message.error(errorData.message);
    };

    recorderService.on('status', handleStatus);
    recorderService.on('script', handleScript);
    recorderService.on('error', handleError);

    return () => {
      recorderService.off('status', handleStatus);
      recorderService.off('script', handleScript);
      recorderService.off('error', handleError);
    };
  }, []);

  // Check connection status periodically
  useEffect(() => {
    const checkConnection = () => {
      setIsConnected(recorderService.isConnected());
    };
    checkConnection();
    const interval = setInterval(checkConnection, 1000);
    return () => clearInterval(interval);
  }, []);

  // Handlers
  const handleConnect = useCallback(async () => {
    try {
      await recorderService.connect();
      setIsConnected(true);
    } catch (error) {
      message.error(t('recorder:connectionFailed'));
      throw error;
    }
  }, [t]);

  const handleDisconnect = useCallback(() => {
    recorderService.disconnect();
    setIsConnected(false);
    setRecorderState({ status: 'idle', script: '', targetUrl: '' });
  }, []);

  const handleStart = useCallback((url: string) => {
    setRecorderState((prev) => ({ ...prev, targetUrl: url, script: '' }));
    setTemplate(null);
    setValidation(null);
    recorderService.startRecording(url);
  }, []);

  const handleStop = useCallback(() => {
    recorderService.stopRecording();
  }, []);

  const handlePause = useCallback(() => {
    recorderService.pauseRecording();
  }, []);

  const handleResume = useCallback(() => {
    recorderService.resumeRecording();
  }, []);

  const handleSave = useCallback((compiledTemplate: CompiledTemplate) => {
    saveMutation.mutate(compiledTemplate);
  }, [saveMutation]);

  const handleAICommandExecuted = useCallback((commands: MCPCommand[]) => {
    console.log('AI commands generated:', commands);
    // Mark that execution has happened - triggers layout change
    setHasExecuted(true);
    // Commands will be executed via the AI backend service
  }, []);

  // Toggle expanded view manually
  const handleToggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  // Reset execution state when starting new recording
  const handleStartWithReset = useCallback((url: string) => {
    setHasExecuted(false);
    setIsExpanded(false);
    handleStart(url);
  }, [handleStart]);

  // noVNC URL
  const NOVNC_URL = import.meta.env.VITE_NOVNC_URL || 'http://localhost:6080/vnc.html';

  return (
    <div
      style={{
        padding: '24px 48px',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%)',
      }}
    >
      {/* Header with status */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
        }}
      >
        <Space>
          <Title level={4} style={{ margin: 0 }}>
            {t('common:recorder')}
          </Title>
          <Tag color={isConnected ? 'success' : 'default'}>
            {isConnected ? '已连接' : '未连接'}
          </Tag>
          {isBrowserInitialized && (
            <Tag color="processing" icon={<RobotOutlined />}>
              浏览器就绪
            </Tag>
          )}
        </Space>

        {/* Expand/Collapse toggle */}
        <Space>
          {(hasExecuted || isExpanded) && (
            <Button
              type="text"
              icon={isExpanded ? <CompressOutlined /> : <FullscreenOutlined />}
              onClick={handleToggleExpand}
              style={{ color: '#6366f1' }}
            >
              {isExpanded ? '收起控制面板' : '展开浏览器'}
            </Button>
          )}
        </Space>
      </div>

      <Row gutter={[24, 24]} style={{ minHeight: 'calc(100vh - 120px)' }}>
        {/* Left Column: Controls */}
        <Col
          xs={24}
          lg={leftSpan}
          style={{
            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <Card
            style={{
              height: '100%',
              borderRadius: 16,
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.8)',
              overflow: 'hidden',
            }}
            bodyStyle={{
              padding: 20,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <AIControls
              onCommandExecuted={handleAICommandExecuted}
              onBrowserReady={setIsBrowserInitialized}
              recorderStatus={recorderState.status}
              isConnected={isConnected}
              onStartRecording={handleStartWithReset}
              onStopRecording={handleStop}
              onPauseRecording={handlePause}
              onResumeRecording={handleResume}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              recordedScript={recorderState.script}
            />
          </Card>
        </Col>

        {/* Right Column: Browser Preview */}
        <Col
          xs={24}
          lg={rightSpan}
          style={{
            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <Card
            title={
              <Space>
                <DesktopOutlined />
                <Text strong>{t('recorder:browserPreview')}</Text>
              </Space>
            }
            style={{
              height: '100%',
              borderRadius: 16,
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.8)',
            }}
            bodyStyle={{
              height: 'calc(100% - 57px)',
              padding: 0,
              borderRadius: '0 0 16px 16px',
            }}
            extra={
              <Button
                type="link"
                size="small"
                onClick={() => window.open(`${NOVNC_URL}?autoconnect=true&resize=remote`, '_blank')}
                style={{ color: '#6366f1' }}
              >
                {t('session:openInNewTab') || '新标签页打开'}
              </Button>
            }
          >
            <div
              style={{
                height: '100%',
                minHeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#1a1a2e',
                borderRadius: '0 0 16px 16px',
                overflow: 'hidden',
              }}
            >
              {recorderState.status === 'recording' || recorderState.status === 'paused' || isConnected || isBrowserInitialized ? (
                <iframe
                  src={`${NOVNC_URL}?autoconnect=true&resize=remote&reconnect=true`}
                  style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                  }}
                  title="Browser Preview"
                />
              ) : (
                <div style={{ textAlign: 'center', color: '#6b7280' }}>
                  <DesktopOutlined style={{ fontSize: 48, marginBottom: 16, color: '#4b5563' }} />
                  <p style={{ color: '#9ca3af', marginBottom: 8 }}>
                    {t('recorder:ai.startToPreview') || '初始化浏览器后开始控制'}
                  </p>
                  <p style={{ color: '#6b7280', fontSize: 12 }}>
                    {t('recorder:novncHint') || 'noVNC will show browser after initialization'}
                  </p>
                </div>
              )}
            </div>
          </Card>
        </Col>
      </Row>

      {/* Template Preview - full width below when recording stopped */}
      {recorderState.status === 'stopped' && recorderState.script && (
        <div style={{ marginTop: 24 }}>
          {compileMutation.isLoading ? (
            <Card
              style={{
                borderRadius: 16,
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
              }}
            >
              <Spin tip={t('recorder:compiling')}>
                <div style={{ height: 200 }} />
              </Spin>
            </Card>
          ) : (
            <TemplatePreview
              template={template}
              validation={validation}
              onSave={handleSave}
              saving={saveMutation.isLoading}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default RecorderPage;