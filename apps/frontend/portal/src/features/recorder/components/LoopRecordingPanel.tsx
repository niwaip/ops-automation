import React, { useEffect, useState } from 'react';
import { Button, Tooltip, message } from 'antd';
import {
  ApiOutlined,
  FileSearchOutlined,
  PlayCircleOutlined,
  SafetyCertificateOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { apiClient } from '@/shared/api/http/client';

type RecorderBackend = 'cli' | 'chrome-devtools';
type LoopScope = 'current_list' | 'current_table' | 'current_cards';

interface TemplateStepLike {
  id: string;
  tool: string;
  description: string;
}

interface LoopDraft {
  mode: 'repeat_until';
  target: {
    scope: LoopScope;
    regionId?: string;
    currentPageUrl?: string;
    match?: {
      field?: string;
      operator?: 'equals' | 'contains' | 'lt' | 'gt';
      value?: string | number | boolean;
    };
  };
  sampleRow?: {
    rowKey?: string;
    entityType?: string;
    entityId?: string;
    semanticPath?: string[];
  };
  eachIteration?: {
    capturedFromIndex?: number;
    capturedToIndex?: number;
    stepIds: string[];
    stepCount: number;
  };
  stopWhen?: {
    read:
      | { type: 'count' | 'text'; locator: { type: string; value: string } }
      | { type: 'page_signal'; key: string };
    conditionFn: string;
    description: string;
  };
  onNoProgress?: 'takeover' | 'stop';
  maxIterations?: number;
  updatedAt?: string;
}

interface RecorderDebugSessionResponse {
  sessionId: string;
  runtimeSessionId: string;
  loopDraft?: LoopDraft;
}

interface SaveLoopDraftResponse {
  sessionId: string;
  runtimeSessionId: string;
  loopDraft: LoopDraft;
}

interface LoopRecordingPanelProps {
  sessionId?: string;
  runtimeSessionId?: string;
  backend: RecorderBackend;
  currentPageUrl?: string;
  templateSteps: TemplateStepLike[];
  isDarkTheme: boolean;
  onSessionBound?: (sessionId: string, runtimeSessionId: string) => void;
  onInsertControlToken?: (token: string) => void;
  children?: React.ReactNode;
}

const createDefaultLoopDraft = (currentPageUrl?: string): LoopDraft => ({
  mode: 'repeat_until',
  target: {
    scope: 'current_list',
    ...(currentPageUrl ? { currentPageUrl } : {}),
  },
  onNoProgress: 'takeover',
  maxIterations: 100,
});

const MFA_MANUAL_INTERVENTION_TOKEN =
  '[人工介入:MFA认证|behavior=optional_takeover_if_present|selector=body|method=attribute|attribute=data-auth-stage|expect=mfa|precheck=true|fallbackPattern=mfa,otp,two factor,multi factor,verification code,one time code,authenticator,验证码,二次验证,双重认证,双因素,多因素]';

const LoopRecordingPanel: React.FC<LoopRecordingPanelProps> = ({
  sessionId,
  runtimeSessionId,
  backend,
  currentPageUrl,
  templateSteps,
  isDarkTheme,
  onSessionBound,
  onInsertControlToken,
  children,
}) => {
  const [saving, setSaving] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [captureStartIndex, setCaptureStartIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<LoopDraft>(createDefaultLoopDraft(currentPageUrl));
  const [loadedSessionId, setLoadedSessionId] = useState<string>();

  useEffect(() => {
    if (!currentPageUrl) {
      return;
    }
    setDraft((prev) => ({
      ...prev,
      target: {
        ...prev.target,
        currentPageUrl: prev.target.currentPageUrl || currentPageUrl,
      },
    }));
  }, [currentPageUrl]);

  useEffect(() => {
    if (!sessionId) {
      setLoadedSessionId(undefined);
      return;
    }
    if (loadedSessionId === sessionId) {
      return;
    }

    let cancelled = false;
    setLoadingDraft(true);
    void apiClient
      .get<RecorderDebugSessionResponse>(`/ai/recorder-debug/${sessionId}`)
      .then((response) => {
        if (cancelled) {
          return;
        }
        if (response.loopDraft) {
          const nextDraft = response.loopDraft;
          setDraft(nextDraft);
        }
        setLoadedSessionId(sessionId);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadedSessionId(sessionId);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingDraft(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadedSessionId, sessionId]);

  const persistLoopDraft = async (nextDraft: LoopDraft, successMessage: string) => {
    setSaving(true);
    try {
      const response = await apiClient.post<SaveLoopDraftResponse>(
        '/ai/recorder-debug/loop-draft',
        {
          sessionId,
          runtimeSessionId,
          backend,
          loopDraft: nextDraft,
        }
      );
      setDraft(response.loopDraft);
      setLoadedSessionId(response.sessionId);
      onSessionBound?.(response.sessionId, response.runtimeSessionId);
      void message.success(successMessage);
    } catch (error) {
      console.error('Failed to save loop draft', error);
      void message.error('循环草稿保存失败');
    } finally {
      setSaving(false);
    }
  };

  const isCapturing = captureStartIndex !== null;

  const insertControlToken = (token: string) => {
    onInsertControlToken?.(token);
  };

  const handleSetCurrentListTarget = async () => {
    const nextDraft: LoopDraft = {
      ...draft,
      target: {
        ...draft.target,
        scope: 'current_list',
        currentPageUrl: currentPageUrl || draft.target.currentPageUrl,
      },
      updatedAt: new Date().toISOString(),
    };
    setDraft(nextDraft);
    insertControlToken('[循环对象:当前列表]');
    await persistLoopDraft(nextDraft, '已设置循环对象，并追加控制符到自然语言输入');
  };

  const handleStartLoop = async () => {
    const nextDraft: LoopDraft = {
      ...createDefaultLoopDraft(currentPageUrl),
      ...draft,
      target: {
        ...createDefaultLoopDraft(currentPageUrl).target,
        ...draft.target,
        scope: 'current_list',
        currentPageUrl: currentPageUrl || draft.target.currentPageUrl,
      },
      updatedAt: new Date().toISOString(),
    };
    setDraft(nextDraft);
    setCaptureStartIndex(templateSteps.length);
    insertControlToken('[循环开始]');
    await persistLoopDraft(nextDraft, '已开始循环录制，并追加控制符到自然语言输入');
  };

  const handleFinishLoop = async () => {
    if (captureStartIndex === null) {
      void message.warning('请先点击“开始”');
      return;
    }
    const capturedSteps = templateSteps.slice(captureStartIndex);
    const nextDraft: LoopDraft = {
      ...draft,
      eachIteration: {
        capturedFromIndex: captureStartIndex,
        capturedToIndex: capturedSteps.length > 0 ? templateSteps.length - 1 : captureStartIndex,
        stepIds: capturedSteps.map((step) => step.id),
        stepCount: capturedSteps.length,
      },
      updatedAt: new Date().toISOString(),
    };
    setDraft(nextDraft);
    setCaptureStartIndex(null);
    insertControlToken('[循环结束]');
    await persistLoopDraft(
      nextDraft,
      capturedSteps.length > 0
        ? `已结束循环录制，捕获 ${capturedSteps.length} 个单轮步骤`
        : '已结束循环录制，但当前没有新增模板步骤'
    );
  };

  const handleInsertMfaIntervention = () => {
    insertControlToken(MFA_MANUAL_INTERVENTION_TOKEN);
    void message.success('已插入 MFA 人工介入控制符');
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: 8,
          borderRadius: 12,
          background: isDarkTheme ? '#0f172a' : '#f8fafc',
          border: isDarkTheme ? '1px solid #334155' : '1px solid #e2e8f0',
        }}
      >
        <Tooltip title="标记循环对象：当前列表">
          <Button
            size="small"
            shape="circle"
            icon={<ApiOutlined />}
            onClick={() => {
              void handleSetCurrentListTarget();
            }}
            loading={saving && !isCapturing}
            disabled={loadingDraft}
            type={draft.target.scope === 'current_list' ? 'primary' : 'default'}
          />
        </Tooltip>
        <Tooltip title="标记循环开始">
          <Button
            size="small"
            shape="circle"
            icon={<PlayCircleOutlined />}
            onClick={() => {
              void handleStartLoop();
            }}
            loading={saving && isCapturing}
            disabled={loadingDraft}
            type={isCapturing ? 'primary' : 'default'}
          />
        </Tooltip>
        <Tooltip title="标记循环结束">
          <Button
            size="small"
            shape="circle"
            icon={<StopOutlined />}
            onClick={() => {
              void handleFinishLoop();
            }}
            disabled={!isCapturing || loadingDraft}
          />
        </Tooltip>
        <Tooltip title="插入条件分歧控制符">
          <Button
            size="small"
            shape="circle"
            icon={<FileSearchOutlined />}
            onClick={() => {
              insertControlToken('[条件分歧]');
            }}
            disabled={loadingDraft}
          />
        </Tooltip>
        <Tooltip title="插入 MFA 人工介入控制符">
          <Button
            size="small"
            shape="circle"
            icon={<SafetyCertificateOutlined />}
            onClick={handleInsertMfaIntervention}
            disabled={loadingDraft}
          />
        </Tooltip>
        {children}
      </div>
    </div>
  );
};

export default LoopRecordingPanel;
