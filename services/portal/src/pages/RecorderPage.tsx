import React, { useState, useEffect, useCallback } from 'react';
import { Typography, Row, Col, message, Spin, Card, Button } from 'antd';
import { useTranslation } from 'react-i18next';
import { useMutation } from 'react-query';
import { AIControls, TemplatePreview } from '../components/recorder';
import recorderService, { RecorderStatus, CompiledTemplate, ValidationResult } from '../services/recorder.service';
import { templateApi, CompileResult } from '../api/template';
import { useAuthStore } from '../store/authStore';

const { Title } = Typography;

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
  const [template, setTemplate] = useState<CompiledTemplate | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);

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

  const handleCompile = useCallback((options: { script: string; intent?: string }) => {
    compileMutation.mutate(options);
  }, [compileMutation]);

  const handleSave = useCallback((compiledTemplate: CompiledTemplate) => {
    saveMutation.mutate(compiledTemplate);
  }, [saveMutation]);

  const handleAICommandExecuted = useCallback((commands: MCPCommand[]) => {
    console.log('AI commands generated:', commands);
    // Commands will be executed via the AI backend service
  }, []);

  // noVNC URL
  const NOVNC_URL = import.meta.env.VITE_NOVNC_URL || 'http://localhost:6080/vnc.html';

  return (
    <div>
      <Title level={4}>{t('common:recorder')}</Title>

      <Row gutter={[16, 16]}>
        {/* Left Column: Controls */}
        <Col xs={24} lg={8}>
          <AIControls
            onCommandExecuted={handleAICommandExecuted}
            recorderStatus={recorderState.status}
            isConnected={isConnected}
            onStartRecording={handleStart}
            onStopRecording={handleStop}
            onPauseRecording={handlePause}
            onResumeRecording={handleResume}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            recordedScript={recorderState.script}
          />
        </Col>

        {/* Right Column: Browser Preview (larger) */}
        <Col xs={24} lg={16}>
          {/* Browser Preview - noVNC iframe */}
          <Card
            title={t('recorder:browserPreview')}
            style={{ height: '100%' }}
            bodyStyle={{ height: 'calc(100% - 57px)', padding: 0 }}
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
            <div
              style={{
                height: '100%',
                minHeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#f5f5f5',
                borderRadius: 4,
                overflow: 'hidden',
              }}
            >
              {recorderState.status === 'recording' || recorderState.status === 'paused' || isConnected ? (
                <iframe
                  src={`${NOVNC_URL}?autoconnect=true&resize=scale&reconnect=true`}
                  style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                  }}
                  title="Browser Preview"
                />
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ color: '#999' }}>
                    {t('recorder:ai.startToPreview') || '初始化浏览器后开始控制'}
                  </p>
                  <p style={{ color: '#8c8c8c', fontSize: 12, marginTop: 8 }}>
                    {t('recorder:novncHint') || 'noVNC will show browser after initialization'}
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* Template Preview below */}
          {recorderState.status === 'stopped' && recorderState.script && (
            <div style={{ marginTop: 16 }}>
              {compileMutation.isLoading ? (
                <Card>
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
        </Col>
      </Row>
    </div>
  );
};

export default RecorderPage;