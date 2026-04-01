import React, { useState, useEffect, useCallback } from 'react';
import { Typography, Row, Col, message, Spin, Card } from 'antd';
import { useTranslation } from 'react-i18next';
import { useMutation } from 'react-query';
import { RecorderControls, ScriptPreview, TemplatePreview } from '../components/recorder';
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
    (script: string) => templateApi.compile(script),
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
          type: step.locator?.type || 'text',
          action: step.action,
          selector: step.locator?.value,
          value: step.params?.value as string | undefined,
          timeout: step.wait?.value as number | undefined,
          retry: step.retry?.max_attempts,
        })),
        created_by: user?.id || 'unknown',
      }),
    {
      onSuccess: () => {
        message.success(t('recorder:saveSuccess'));
        // Reset state after successful save
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

  const handleCompile = useCallback((script: string) => {
    compileMutation.mutate(script);
  }, [compileMutation]);

  const handleSave = useCallback((compiledTemplate: CompiledTemplate) => {
    saveMutation.mutate(compiledTemplate);
  }, [saveMutation]);

  return (
    <div>
      <Title level={4}>{t('common:recorder')}</Title>

      <Row gutter={[16, 16]}>
        {/* Left Column: Controls and Script Preview */}
        <Col xs={24} lg={12}>
          <RecorderControls
            status={recorderState.status}
            isConnected={isConnected}
            onStart={handleStart}
            onStop={handleStop}
            onPause={handlePause}
            onResume={handleResume}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />

          <div style={{ marginTop: 16 }}>
            <ScriptPreview
              script={recorderState.script}
              onCompile={handleCompile}
              disabled={recorderState.status !== 'stopped' || compileMutation.isLoading}
              status={recorderState.status}
            />
          </div>
        </Col>

        {/* Right Column: Template Preview and Browser View */}
        <Col xs={24} lg={12}>
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

          {/* Browser Preview - noVNC iframe */}
          <Card
            title={t('recorder:browserPreview')}
            style={{ marginTop: 16 }}
          >
            <div
              style={{
                height: 450,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#f5f5f5',
                borderRadius: 4,
                overflow: 'hidden',
              }}
            >
              {recorderState.status === 'recording' || recorderState.status === 'paused' ? (
                <iframe
                  src="http://localhost:6080/vnc.html?autoconnect=true&resize=scale"
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
                    {t('recorder:startToPreview')}
                  </p>
                  <p style={{ color: '#8c8c8c', fontSize: 12, marginTop: 8 }}>
                    {t('recorder:novncHint') || 'noVNC will show browser after recording starts'}
                  </p>
                </div>
              )}
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default RecorderPage;