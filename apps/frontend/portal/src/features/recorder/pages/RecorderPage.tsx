import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Col, message, Row, Space, Tag, Typography } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useMutation } from 'react-query';
import { AIControls } from '@/features/recorder/components';
import { runtimeConfig } from '@/shared/config/runtime';
import RecorderBrowserPreviewCard from '@/features/recorder/components/RecorderBrowserPreviewCard';
import RecorderCompilePanel from '@/features/recorder/components/RecorderCompilePanel';
import RecorderTopActions from '@/features/recorder/components/RecorderTopActions';
import type {
  MCPCommand,
  RecorderPageState,
  RecorderPreviewMode,
  RecorderTakeoverViewState,
} from '@/features/recorder/lib/types';
import recorderService, {
  type CompiledTemplate,
  type RecorderStatus,
  type ValidationResult,
} from '@/services/recorder.service';
import { useAuthStore } from '@/shared/store/authStore';
import { usePreferencesStore } from '@/shared/store/preferencesStore';
import { templateApi, type CompileResult } from '@/api/template';

const { Text } = Typography;

const RecorderPage: React.FC = () => {
  const { t } = useTranslation(['common', 'recorder', 'session']);
  const { user } = useAuthStore();
  const theme = usePreferencesStore((state) => state.theme);
  const isDarkTheme = theme === 'dark';

  const [recorderState, setRecorderState] = useState<RecorderPageState>({
    status: 'idle',
    script: '',
    targetUrl: '',
  });
  const [isConnected, setIsConnected] = useState(false);
  const [isBrowserInitialized, setIsBrowserInitialized] = useState(false);
  const [dynamicNoVncUrl, setDynamicNoVncUrl] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<RecorderPreviewMode>('idle');
  const [template, setTemplate] = useState<CompiledTemplate | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [hasExecuted, setHasExecuted] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [takeoverState, setTakeoverState] = useState<RecorderTakeoverViewState>({
    mode: 'idle',
    patchStepCount: 0,
    resumeCommandCount: 0,
  });

  const leftSpan = hasExecuted || isExpanded ? 6 : 10;
  const rightSpan = hasExecuted || isExpanded ? 18 : 14;

  const compileMutation = useMutation(
    (options: { script: string; intent?: string }) =>
      templateApi.compile(options.script, options.intent),
    {
      onSuccess: (result: CompileResult) => {
        setTemplate(result.template as CompiledTemplate);
        setValidation(result.validation);
        void message.success(t('recorder:compileSuccess'));
      },
      onError: () => {
        void message.error(t('recorder:compileFailed'));
      },
    }
  );

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
        void message.success(t('recorder:saveSuccess'));
        setTemplate(null);
        setValidation(null);
        setRecorderState((prev) => ({ ...prev, script: '' }));
      },
      onError: () => {
        void message.error(t('recorder:saveFailed'));
      },
    }
  );

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
      void message.error(errorData.message);
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

  useEffect(() => {
    const checkConnection = () => {
      setIsConnected(recorderService.isConnected());
    };

    checkConnection();
    const interval = setInterval(checkConnection, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (recorderState.status === 'stopped' && recorderState.script) {
      compileMutation.mutate({ script: recorderState.script });
    }
  }, [compileMutation, recorderState.script, recorderState.status]);

  const handleConnect = useCallback(async () => {
    try {
      await recorderService.connect();
      setIsConnected(true);
    } catch (error) {
      void message.error(t('recorder:connectionFailed'));
      throw error;
    }
  }, [t]);

  const handleDisconnect = useCallback(() => {
    recorderService.disconnect();
    setIsConnected(false);
    setDynamicNoVncUrl(null);
    setPreviewMode('idle');
    setIsBrowserInitialized(false);
    setRecorderState({ status: 'idle', script: '', targetUrl: '' });
  }, []);

  const handleStart = useCallback((url: string) => {
    setRecorderState((prev) => ({ ...prev, targetUrl: url, script: '' }));
    setDynamicNoVncUrl(null);
    setPreviewMode('shared');
    setIsBrowserInitialized(false);
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

  const handleAICommandExecuted = useCallback((_commands: MCPCommand[]) => {
    setHasExecuted(true);
  }, []);

  const handleToggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handleStartWithReset = useCallback((url: string) => {
    setHasExecuted(false);
    setIsExpanded(false);
    handleStart(url);
  }, [handleStart]);

  const defaultNoVncUrl = runtimeConfig.noVncUrl;
  const previewUrl = previewMode === 'session'
    ? dynamicNoVncUrl
    : previewMode === 'shared'
      ? (defaultNoVncUrl ?? null)
      : null;
  const activeTakeover = takeoverState.mode !== 'idle';
  const takeoverAlertType = takeoverState.mode === 'ready_to_resume'
    ? 'success'
    : takeoverState.mode === 'required'
      ? 'warning'
      : 'info';
  const takeoverModeLabelMap: Record<RecorderTakeoverViewState['mode'], string> = {
    idle: '空闲',
    required: '等待人工接管',
    recording: '人工接管中',
    reconciling: '生成恢复方案中',
    ready_to_resume: '可恢复执行',
    resuming: '恢复执行中',
  };

  return (
    <div
      style={{
        padding: '0 8px',
        height: 'calc(100vh - 60px)',
        overflow: 'hidden',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        background: isDarkTheme
          ? 'var(--bg-primary)'
          : 'linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-primary) 100%)',
      }}
    >
      <div style={{ marginBottom: 8 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} href="/templates" style={{ paddingInline: 0 }}>
          {t('common:back')}
        </Button>
      </div>

      <RecorderTopActions
        isBrowserInitialized={isBrowserInitialized}
        hasExecuted={hasExecuted}
        isExpanded={isExpanded}
        onToggleExpand={handleToggleExpand}
      />

      {activeTakeover ? (
        <Alert
          type={takeoverAlertType}
          showIcon
          style={{ marginBottom: 8, borderRadius: 12 }}
          message={
            <Space wrap>
              <span>{takeoverModeLabelMap[takeoverState.mode]}</span>
              {takeoverState.strategy ? <Tag color="processing">{takeoverState.strategy}</Tag> : null}
              {takeoverState.patchStepCount > 0 ? <Tag>{`patch ${takeoverState.patchStepCount}`}</Tag> : null}
              {takeoverState.resumeCommandCount > 0 ? <Tag>{`resume ${takeoverState.resumeCommandCount}`}</Tag> : null}
            </Space>
          }
          description={
            <Space direction="vertical" size={4}>
              <Text>
                {takeoverState.explanation
                  || takeoverState.reason
                  || '当前浏览器执行处于人工接管恢复流程中。'}
              </Text>
              <Space wrap size={[12, 4]}>
                {takeoverState.currentPageUrl ? (
                  <Text type="secondary">{`页面: ${takeoverState.currentPageUrl}`}</Text>
                ) : null}
                {takeoverState.runtimeSessionId ? (
                  <Text type="secondary" copyable={{ text: takeoverState.runtimeSessionId }}>
                    {`会话: ${takeoverState.runtimeSessionId}`}
                  </Text>
                ) : null}
              </Space>
            </Space>
          }
        />
      ) : null}

      <Row gutter={[8, 8]} style={{ flex: 1, minHeight: 0 }}>
        <Col
          xs={24}
          lg={leftSpan}
          style={{
            height: '100%',
            display: 'flex',
            minHeight: 0,
            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <Card
            style={{
              flex: 1,
              height: 'auto',
              borderRadius: 16,
              boxShadow: isDarkTheme ? '0 8px 24px rgba(0, 0, 0, 0.24)' : '0 4px 20px rgba(0, 0, 0, 0.08)',
              border: '1px solid var(--bg-secondary)',
              overflow: 'hidden',
              background: 'var(--bg-card)',
            }}
            styles={{
              body: {
                padding: 8,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
              },
            }}
          >
            <AIControls
              onCommandExecuted={handleAICommandExecuted}
              onBrowserReady={setIsBrowserInitialized}
              onTakeoverStateChange={setTakeoverState}
              onBrowserEndpoints={(endpoints) => {
                if (endpoints.novnc) {
                  setDynamicNoVncUrl(endpoints.novnc);
                  setPreviewMode('session');
                } else {
                  setDynamicNoVncUrl(null);
                  setPreviewMode('idle');
                }
              }}
              recorderStatus={recorderState.status}
              isConnected={isConnected}
              onStartRecording={handleStartWithReset}
              onStopRecording={handleStop}
              onPauseRecording={handlePause}
              onResumeRecording={handleResume}
              onConnect={() => {
                void handleConnect();
              }}
              onDisconnect={handleDisconnect}
              recordedScript={recorderState.script}
            />
          </Card>
        </Col>

        <Col
          xs={24}
          lg={rightSpan}
          style={{
            height: '100%',
            display: 'flex',
            minHeight: 0,
            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <RecorderBrowserPreviewCard
            isDarkTheme={isDarkTheme}
            previewMode={previewMode}
            previewUrl={previewUrl}
            openInNewTabLabel={t('session:openInNewTab') || '新标签页打开'}
            browserPreviewLabel={t('recorder:browserPreview')}
            startPreviewHint={t('recorder:ai.startToPreview') || '初始化浏览器后开始控制'}
            noVncHint={t('recorder:novncHint') || 'noVNC will show browser after initialization'}
          />
        </Col>
      </Row>

      {recorderState.status === 'stopped' && recorderState.script && (
        <div style={{ marginTop: 24 }}>
          <RecorderCompilePanel
            isDarkTheme={isDarkTheme}
            isCompiling={compileMutation.isLoading}
            compilingLabel={t('recorder:compiling')}
            template={template}
            validation={validation}
            onSave={handleSave}
            saving={saveMutation.isLoading}
          />
        </div>
      )}
    </div>
  );
};

export default RecorderPage;
