import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input, Button, Space, Typography, Tag, Empty, message, Divider, Collapse, InputNumber, Modal, List, Tooltip, Switch, Checkbox, Radio } from 'antd';
import {
  SendOutlined,
  AudioOutlined,
  RobotOutlined,
  DeleteOutlined,
  CodeOutlined,
  CopyOutlined,
  PlayCircleOutlined,
  CameraOutlined,
  EyeOutlined,
  ClockCircleOutlined,
  FileSearchOutlined,
  ArrowDownOutlined,
  CloudUploadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SaveOutlined,
  FileAddOutlined,
  DownloadOutlined,
  LinkOutlined,
  ApiOutlined,
  DisconnectOutlined,
  PauseCircleOutlined,
  StopOutlined,
  VideoCameraOutlined,
  BugOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { useTranslation } from 'react-i18next';
import { useMutation } from 'react-query';
import { apiClient } from '@/shared/api/http/client';
import { templateApi } from '@/api/template';
import { sessionApi, workerApi } from '@/api/session';
import { transcribeAudio } from '@/features/chat/chatApi';
import type { RecorderTakeoverViewState } from '@/features/recorder/lib/types';
import recorderRuntimeService, {
  type ReconcileAfterTakeoverResponse,
  type RecorderPatchStep,
  type RecorderTakeoverObservation,
} from '@/services/recorder.service';
import { useAuthStore } from '@/shared/store/authStore';
import { usePreferencesStore } from '@/shared/store/preferencesStore';

const { TextArea } = Input;
const { Text } = Typography;

// MCP-style command interface
interface MCPCommand {
  tool: string;
  params: Record<string, unknown>;
  description?: string;
  locator?: {
    strategy?: string;
    value?: string;
    expression?: string;
    role?: string;
    name?: string;
  };
}

// AI response interface
interface AICommandResponse {
  success: boolean;
  commands: MCPCommand[];
  explanation: string;
  result?: {
    status: string;
    message?: string;
    screenshot?: string;
  };
}

interface ParseBrowserCommandPayload {
  input: string;
  context?: {
    commandType?: string;
    currentPageUrl?: string;
    backend?: ExecutionBackend;
  };
}

interface RecorderDebugObservation {
  currentPageUrl?: string;
  title?: string;
  text?: string;
  inputs?: Array<Record<string, unknown>>;
  buttons?: Array<Record<string, unknown>>;
  headings?: string[];
  links?: string[];
  suggestedParameters?: Array<{
    name: string;
    label: string;
    required: boolean;
    reason: string;
  }>;
  snapshotPath?: string;
}

interface RecorderDebugExportArtifacts {
  script?: string;
  guidance?: string;
  skillDraft?: {
    name?: string;
    description?: string;
    invocation?: string;
    parameterOnly?: boolean;
    parameters?: Array<{
      name: string;
      description: string;
      required: boolean;
      exampleValue?: string;
      source?: string;
    }>;
    outputs?: Array<{
      name: string;
      description: string;
      location: string;
    }>;
    usageNotes?: string[];
    usageMarkdown?: string;
    publishPayload?: {
      name?: string;
      description?: string;
      triggerKeywords?: string[];
      paramsSchema?: {
        properties?: Record<string, {
          type: 'string' | 'number' | 'date' | 'boolean';
          description: string;
          required?: boolean;
          default?: string | number | boolean;
          extractionPrompt?: string;
        }>;
        required?: string[];
      };
      executionFlowTemplateIds?: string[];
      executionFlow?: Array<Record<string, unknown>>;
      tools?: string[];
      apiEndpoints?: {
        runtimeMetadata?: Record<string, unknown>;
      };
    };
    executionPlan?: {
      backend?: ExecutionBackend;
      runtimeSessionId?: string;
      commands?: MCPCommand[];
    };
  };
}

interface RecorderDebugExportResponse {
  sessionId: string;
  runtimeSessionId: string;
  currentPageUrl?: string;
  exportArtifacts: RecorderDebugExportArtifacts;
}

interface RecorderDebugChatResponse {
  sessionId: string;
  runtimeSessionId: string;
  reply: string;
  status: 'executed' | 'answer' | 'question' | 'completed';
  currentPageUrl?: string;
  observation?: RecorderDebugObservation;
  commands?: MCPCommand[];
  execution?: {
    success?: boolean;
    message?: string;
    results?: Array<Record<string, unknown>>;
  };
  exportArtifacts?: RecorderDebugExportArtifacts;
}

interface TemplateInfo {
  tool: string;
  params: Record<string, unknown>;
  description?: string;
}

interface BrowserCommandExecutionResult {
  status?: string;
  message?: string;
  screenshot?: string;
  stdout?: string;
  data?: {
    url?: string;
  };
  template_info?: TemplateInfo;
}

interface BrowserCommandExecutionResponse {
  success?: boolean;
  message?: string;
  results?: BrowserCommandExecutionResult[];
}

type TakeoverUiMode =
  | 'idle'
  | 'required'
  | 'recording'
  | 'reconciling'
  | 'ready_to_resume'
  | 'resuming';

interface TakeoverUiState {
  mode: TakeoverUiMode;
  runtimeSessionId?: string;
  sessionId?: string;
  backend?: ExecutionBackend;
  takeoverSessionId?: string;
  reason?: string;
  originalCommands: MCPCommand[];
  failedCommand?: MCPCommand & {
    errorMessage?: string;
  };
  patchSteps: RecorderPatchStep[];
  observation?: RecorderTakeoverObservation;
  strategy?: ReconcileAfterTakeoverResponse['strategy'];
  explanation?: string;
  resumeCommands: MCPCommand[];
}

interface BrowserInitResponse {
  success?: boolean;
  message?: string;
  endpoints?: {
    novnc?: string;
    cdp?: string;
  };
}

interface CommandHistoryResult {
  status?: string;
  message?: string;
  screenshot?: string;
  stdout?: string;
  data?: {
    url?: string;
  };
  template_info?: TemplateInfo;
  observation?: RecorderDebugObservation;
  commands?: MCPCommand[];
  execution?: RecorderDebugChatResponse['execution'];
  exportArtifacts?: RecorderDebugExportArtifacts;
}

// Command history entry
interface CommandHistoryEntry {
  id: string;
  type: 'user' | 'ai' | 'system';
  content: string;
  commands?: MCPCommand[];
  result?: CommandHistoryResult;
  timestamp: Date;
  backend?: ExecutionBackend;
  sessionId?: string;
  runtimeSessionId?: string;
  // For template parameter extraction
  replaceable?: boolean;
  commandType?: string;
  rawParam?: string;
}

const buildCompactAiReply = (
  reply: string | undefined,
  resultPayload: {
    execution?: unknown;
    observation?: unknown;
    exportArtifacts?: unknown;
  },
): string => {
  const replyText = String(reply || '');
  const hasBrowserExecutionPayload = Boolean(
    resultPayload.execution || resultPayload.observation || resultPayload.exportArtifacts,
  );
  const looksLikeVerboseExecutionReply = (
    replyText.length > 500
    || /stepResults|### Ran Playwright code|stdout|snapshotId|backend/i.test(replyText)
    || /任务已完成[,，]?\s*返回结果/.test(replyText)
  );
  if (hasBrowserExecutionPayload) {
    return '浏览器执行已完成，详细信息请点击下方“查看详情”或“打开链接”。';
  }
  if (looksLikeVerboseExecutionReply) {
    return '任务已完成，详细信息请点击下方“查看详情”或“打开链接”。';
  }
  return replyText || 'OK';
};

const buildCompactHistoryBubbleText = (entry: CommandHistoryEntry): string => {
  if (entry.type === 'user') {
    return entry.content;
  }

  const hasExecutionLikeResult = Boolean(
    entry.result
    && (
      entry.result.execution
      || entry.result.observation
      || entry.result.exportArtifacts
      || entry.result.status
    ),
  );
  if (entry.type === 'ai' && hasExecutionLikeResult) {
    return entry.result?.execution || entry.result?.observation || entry.result?.exportArtifacts
      ? '浏览器执行已完成，详细信息请点击下方“查看详情”或“打开链接”。'
      : '任务已完成，详细信息请点击下方“查看详情”或“打开链接”。';
  }

  const compacted = entry.type === 'ai'
    ? buildCompactAiReply(entry.content, {
      execution: entry.result?.execution,
      observation: entry.result?.observation,
      exportArtifacts: entry.result?.exportArtifacts,
    })
    : String(entry.content || '');

  const text = String(compacted || '').trim();
  if (!text) {
    return 'OK';
  }
  if (text.length > 280) {
    return `${text.slice(0, 260)}...（内容已折叠）`;
  }
  if (text.length > 120 && /^[\s\S]*(?:\{|\[)[\s\S]*(?:\}|\])[\s\S]*$/.test(text)) {
    return '已返回结构化内容，详细结果已折叠。';
  }
  return text;
};

const createRuntimeSessionId = () => `recorder-ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const resolveErrorMessage = (error: unknown, fallback = '未知错误'): string => {
  if (typeof error !== 'object' || error === null) {
    return fallback;
  }

  const errorRecord = error as {
    message?: unknown;
    response?: {
      data?: {
        message?: unknown;
      };
    };
  };

  if (typeof errorRecord.response?.data?.message === 'string') {
    return errorRecord.response.data.message;
  }

  if (typeof errorRecord.message === 'string') {
    return errorRecord.message;
  }

  return fallback;
};

const getPrimaryExecutionResult = (
  payload: BrowserCommandExecutionResponse,
  fallbackMessage: string,
): BrowserCommandExecutionResult => {
  const failedResult = payload.results?.find((item) => item.status === 'error');
  if (failedResult) {
    return failedResult;
  }

  const firstResult = payload.results?.[0];
  if (firstResult) {
    return firstResult;
  }

  return {
    status: payload.success === false ? 'error' : 'success',
    message: payload.message || fallbackMessage,
  };
};

const createIdleTakeoverState = (): TakeoverUiState => ({
  mode: 'idle',
  originalCommands: [],
  patchSteps: [],
  resumeCommands: [],
});

const describeTakeoverCommand = (command: MCPCommand): string => {
  const params = command.params || {};
  const target = [
    typeof params.target === 'string' ? params.target : undefined,
    typeof params.selector === 'string' ? params.selector : undefined,
    typeof params.text === 'string' ? params.text : undefined,
    typeof params.url === 'string' ? params.url : undefined,
    typeof params.key === 'string' ? params.key : undefined,
  ].find((value): value is string => Boolean(value && value.trim()));

  return target ? `${command.tool}: ${target}` : command.tool;
};

const describePatchStep = (step: RecorderPatchStep): string => {
  const params = step.params || {};
  const target = [
    typeof params.target === 'string' ? params.target : undefined,
    typeof params.selector === 'string' ? params.selector : undefined,
    typeof params.text === 'string' ? params.text : undefined,
    typeof params.url === 'string' ? params.url : undefined,
    typeof params.key === 'string' ? params.key : undefined,
    typeof step.locator?.name === 'string' ? step.locator.name : undefined,
    typeof step.locator?.value === 'string' ? step.locator.value : undefined,
  ].find((value): value is string => Boolean(value && value.trim()));

  return target ? `${step.action}: ${target}` : step.action;
};

const pickFailedCommand = (commands: MCPCommand[]): MCPCommand | undefined => {
  return commands.find((command) => command.tool !== 'wait') || commands[0];
};

const getStringParam = (params: Record<string, unknown>, key: string): string | undefined => {
  const value = params[key];
  return typeof value === 'string' ? value : undefined;
};

const getNumberParam = (params: Record<string, unknown>, key: string): number | undefined => {
  const value = params[key];
  return typeof value === 'number' ? value : undefined;
};

// Template step - deterministic command for replay
interface TemplateStep {
  id: string;
  tool: string;
  params: Record<string, unknown>;
  description: string;
  timestamp: Date;
  // 记录哪些参数是可替换的 (参数名 -> 是否可替换)
  replaceableParams?: Record<string, boolean>;
}

interface AIControlsProps {
  onCommandExecuted?: (commands: MCPCommand[]) => void;
  // Browser ready callback
  onBrowserReady?: (ready: boolean) => void;
  // Browser endpoints callback
  onBrowserEndpoints?: (endpoints: { novnc?: string; cdp?: string }) => void;
  onTakeoverStateChange?: (state: RecorderTakeoverViewState) => void;
  // Manual mode props
  recorderStatus?: 'idle' | 'connecting' | 'recording' | 'paused' | 'stopped' | 'error';
  isConnected?: boolean;
  onStartRecording?: (url: string) => void;
  onStopRecording?: () => void;
  onPauseRecording?: () => void;
  onResumeRecording?: () => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  recordedScript?: string;
}

type ExecutionBackend = 'cli' | 'chrome-devtools';

const AIControls: React.FC<AIControlsProps> = ({
  onCommandExecuted,
  recorderStatus = 'idle',
  isConnected = false,
  onStartRecording,
  onStopRecording,
  onPauseRecording,
  onResumeRecording,
  onConnect,
  onDisconnect,
  onBrowserReady,
  onBrowserEndpoints,
  onTakeoverStateChange,
  recordedScript = '',
}) => {
  const { t } = useTranslation(['common', 'recorder']);
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const theme = usePreferencesStore((state) => state.theme);
  const isDarkTheme = theme === 'dark';

  // Predefined commands configuration
  // 搜索: 用户指定搜索框和关键词
  // 智搜: AI自动识别页面搜索框，用户只需提供关键词
  const predefinedCommands = [
    { value: 'navigate', label: '打开', prefix: '打开 ', placeholder: '输入网址，如：百度、google.com' },
    { value: 'click', label: '点击', prefix: '点击 ', placeholder: '输入目标元素描述，如：搜索按钮、登录链接' },
    { value: 'fill', label: '填充', prefix: '填充 ', placeholder: '输入内容和目标，如：用户名输入框填写 admin' },
    { value: 'search', label: '搜索', prefix: '搜索 ', placeholder: '指定搜索框和关键词，如：在搜索框输入 MCP' },
    { value: 'smart_search', label: '智搜', prefix: '智搜 ', placeholder: '输入关键词，AI自动找到搜索框，如：MCP 协议' },
  ];

  const [selectedCommand, setSelectedCommand] = useState<string>('navigate');
  const [paramInput, setParamInput] = useState('');
  const [isReplaceable, setIsReplaceable] = useState(true);
  const [history, setHistory] = useState<CommandHistoryEntry[]>([]);
  const [isBrowserReady, setIsBrowserReady] = useState(false);
  const [waitDuration, setWaitDuration] = useState(0.5);
  const [autoAppendScreenshots, setAutoAppendScreenshots] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<TextAreaRef>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isComposingRef = useRef(false);
  const suppressInputChangeRef = useRef(false);

  // Manual recording URL input
  const [recordUrl, setRecordUrl] = useState('https://');

  // Template state
  const [templateSteps, setTemplateSteps] = useState<TemplateStep[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [compiledScript, setCompiledScript] = useState('');
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [savedTemplateId, setSavedTemplateId] = useState<string | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [exportTemplateLoading, setExportTemplateLoading] = useState(false);

  // Parameter editing state - maps original param name to custom name
  const [paramNames, setParamNames] = useState<Record<string, string>>({});
  const [paramEnabled, setParamEnabled] = useState<Record<string, boolean>>({});

  // Recording mode: true = AI mode, false = Manual mode
  const [isAIMode, setIsAIMode] = useState(true);
  const [executionBackend, setExecutionBackend] = useState<ExecutionBackend>('cli');
  const [currentPageUrl, setCurrentPageUrl] = useState<string>();
  const [isReactChatMode, setIsReactChatMode] = useState(true);
  const [recorderDebugSessionId, setRecorderDebugSessionId] = useState<string>();
  const [recorderDebugRuntimeSessionId, setRecorderDebugRuntimeSessionId] = useState<string>();
  const [browserRuntimeSessionId, setBrowserRuntimeSessionId] = useState<string>(createRuntimeSessionId);
  const [takeoverState, setTakeoverState] = useState<TakeoverUiState>(createIdleTakeoverState);
  const [isTemplatePanelExpanded, setIsTemplatePanelExpanded] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const latestBrowserSessionRef = useRef<{
    browserRuntimeSessionId?: string;
    recorderDebugRuntimeSessionId?: string;
    executionBackend: ExecutionBackend;
  }>({
    browserRuntimeSessionId: undefined,
    recorderDebugRuntimeSessionId: undefined,
    executionBackend: 'cli',
  });

  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  useEffect(() => {
    setSpeechSupported(typeof window !== 'undefined' && 'MediaRecorder' in window);
  }, []);

  useEffect(() => {
    latestBrowserSessionRef.current = {
      browserRuntimeSessionId,
      recorderDebugRuntimeSessionId,
      executionBackend,
    };
  }, [browserRuntimeSessionId, recorderDebugRuntimeSessionId, executionBackend]);

  useEffect(() => {
    onTakeoverStateChange?.({
      mode: takeoverState.mode,
      runtimeSessionId: takeoverState.runtimeSessionId,
      sessionId: takeoverState.sessionId,
      backend: takeoverState.backend,
      takeoverSessionId: takeoverState.takeoverSessionId,
      reason: takeoverState.reason,
      strategy: takeoverState.strategy,
      explanation: takeoverState.explanation,
      currentPageUrl: takeoverState.observation?.currentPageUrl,
      patchStepCount: takeoverState.patchSteps.length,
      resumeCommandCount: takeoverState.resumeCommands.length,
    });
  }, [onTakeoverStateChange, takeoverState]);

  const cleanupBrowserSessions = async (
    sessions: Array<{ runtimeSessionId?: string; backend: ExecutionBackend }>,
  ) => {
    const uniqueSessions = new Map<string, { runtimeSessionId: string; backend: ExecutionBackend }>();

    sessions.forEach(({ runtimeSessionId, backend }) => {
      if (!runtimeSessionId) {
        return;
      }
      const key = `${backend}:${runtimeSessionId}`;
      uniqueSessions.set(key, { runtimeSessionId, backend });
    });

    await Promise.all(
      [...uniqueSessions.values()].map(async ({ runtimeSessionId, backend }) => {
        try {
          await apiClient.post('/browser/reset', {
            runtimeSessionId,
            backend,
          });
        } catch (error) {
          console.warn(`Failed to cleanup browser session ${runtimeSessionId}:`, error);
        }
      }),
    );
  };

  const resetTakeoverState = useCallback(() => {
    setTakeoverState(createIdleTakeoverState());
  }, []);

  const markTakeoverRequired = useCallback((input: {
    runtimeSessionId?: string;
    sessionId?: string;
    backend: ExecutionBackend;
    reason: string;
    originalCommands: MCPCommand[];
    failedCommand?: MCPCommand;
  }) => {
    const runtimeSessionId = input.runtimeSessionId?.trim();
    if (!runtimeSessionId) {
      return;
    }

    setTakeoverState((prev) => {
      if (prev.mode === 'recording' || prev.mode === 'reconciling' || prev.mode === 'ready_to_resume' || prev.mode === 'resuming') {
        return prev;
      }

      return {
        mode: 'required',
        runtimeSessionId,
        sessionId: input.sessionId,
        backend: input.backend,
        reason: input.reason,
        originalCommands: input.originalCommands,
        failedCommand: input.failedCommand
          ? {
              ...input.failedCommand,
              errorMessage: input.reason,
            }
          : undefined,
        patchSteps: [],
        resumeCommands: [],
      };
    });
  }, []);

  useEffect(() => {
    setIsBrowserReady(false);
    onBrowserReady?.(false);
  }, [executionBackend, onBrowserReady]);

  useEffect(() => {
    setIsBrowserReady(false);
    onBrowserReady?.(false);
    onBrowserEndpoints?.({});
    setCurrentPageUrl(undefined);
  }, [browserRuntimeSessionId]);

  useEffect(() => {
    setRecorderDebugSessionId(undefined);
    setRecorderDebugRuntimeSessionId(undefined);
    setBrowserRuntimeSessionId(createRuntimeSessionId());
    resetTakeoverState();
  }, [executionBackend, resetTakeoverState]);

  useEffect(() => {
    setIsTemplatePanelExpanded(!isReactChatMode);
  }, [isReactChatMode]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      const {
        browserRuntimeSessionId: activeBrowserRuntimeSessionId,
        recorderDebugRuntimeSessionId: activeRecorderDebugRuntimeSessionId,
        executionBackend: activeExecutionBackend,
      } = latestBrowserSessionRef.current;

      void cleanupBrowserSessions([
        {
          runtimeSessionId: activeBrowserRuntimeSessionId,
          backend: activeExecutionBackend,
        },
        {
          runtimeSessionId: activeRecorderDebugRuntimeSessionId,
          backend: activeExecutionBackend,
        },
      ]);
    };
  }, []);

  const mergeSpeechText = useCallback((baseText: string, speechText: string) => {
    const normalizedSpeechText = speechText.trim();
    if (!normalizedSpeechText) {
      return baseText;
    }
    if (!baseText.trim()) {
      return normalizedSpeechText;
    }
    return `${baseText.replace(/\s+$/, '')}\n${normalizedSpeechText}`;
  }, []);

  const clearParamInput = useCallback(() => {
    suppressInputChangeRef.current = true;
    setParamInput('');

    const textarea = inputRef.current?.resizableTextArea?.textArea;
    if (textarea) {
      textarea.value = '';
    }

    window.setTimeout(() => {
      suppressInputChangeRef.current = false;
      const activeTextarea = inputRef.current?.resizableTextArea?.textArea;
      if (activeTextarea?.value) {
        activeTextarea.value = '';
      }
    }, 0);
  }, []);

  const handleParamInputChange = useCallback((value: string) => {
    if (suppressInputChangeRef.current) {
      return;
    }
    setParamInput(value);
  }, []);

  const handleSpeechToggle = useCallback(async () => {
    if (isListening) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstart = () => {
        setIsListening(true);
        void message.info('正在录音，请开始说话，再次点击按钮停止并转写...');
      };

      mediaRecorder.onstop = async () => {
        setIsListening(false);
        setIsTranscribing(true);
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;

        try {
          const text = await transcribeAudio(audioBlob, 'default');
          if (!text.trim()) {
            void message.warning('未识别到语音内容，请重试并靠近麦克风。');
            return;
          }

          setParamInput((prev) => mergeSpeechText(prev, text));
          inputRef.current?.focus();
        } catch (error: unknown) {
          void message.error(error instanceof Error ? error.message : '语音识别失败');
        } finally {
          setIsTranscribing(false);
          mediaRecorderRef.current = null;
        }
      };

      mediaRecorder.start();
    } catch (error) {
      console.error('Failed to start MediaRecorder:', error);
      void message.error('无法访问麦克风，请检查浏览器权限设置。');
    }
  }, [isListening, mergeSpeechText]);

  const extractCurrentPageUrl = (result?: BrowserCommandExecutionResult): string | undefined => {
    const directUrl = typeof result?.data?.url === 'string' ? result.data.url : undefined;
    if (directUrl) {
      return directUrl;
    }

    if (typeof result?.stdout !== 'string') {
      return undefined;
    }

    const match = result.stdout.match(/- Page URL:\s*(.+)/);
    return match?.[1]?.trim();
  };

  const appendDefaultWaitCommands = (commands: MCPCommand[]): MCPCommand[] => {
    if (waitDuration <= 0) {
      return commands;
    }

    return commands.flatMap((command) => {
      if (command.tool === 'wait') {
        return [command];
      }

      return [
        command,
        {
          tool: 'wait',
          params: { duration: waitDuration * 1000 },
          description: `等待 ${waitDuration} 秒`,
        },
      ];
    });
  };

  const appendTemplateScreenshotSteps = (
    steps: Array<{
      action: string;
      params?: Record<string, string | number>;
      locator?: { type: string; value: string };
    }>,
  ): Array<{
    step_id: string;
    action: string;
    params?: Record<string, string | number>;
    locator?: { type: string; value: string };
  }> => {
    const backendSteps: Array<{
      step_id: string;
      action: string;
      params?: Record<string, string | number>;
      locator?: { type: string; value: string };
    }> = [];
    let stepCounter = 1;

    steps.forEach((step) => {
      backendSteps.push({
        step_id: `step_${stepCounter}`,
        action: step.action,
        params: step.params,
        locator: step.locator,
      });
      stepCounter++;

      if (!autoAppendScreenshots) {
        return;
      }

      backendSteps.push({
        step_id: `step_${stepCounter}`,
        action: 'wait',
        params: { duration: waitDuration * 1000 },
      });
      stepCounter++;

      backendSteps.push({
        step_id: `step_${stepCounter}`,
        action: 'screenshot',
        params: {},
      });
      stepCounter++;

      backendSteps.push({
        step_id: `step_${stepCounter}`,
        action: 'wait',
        params: { duration: waitDuration * 1000 },
      });
      stepCounter++;
    });

    return backendSteps;
  };

  const getScreenshotModeLabel = () => (autoAppendScreenshots ? '含自动截图' : '不含自动截图');

  const getFailedExecutionMessage = (payload?: BrowserCommandExecutionResponse): string => {
    const firstFailedResult = payload?.results?.find((item) => item.status === 'error');
    return (
      firstFailedResult?.message ||
      payload?.message ||
      '页面操作执行失败'
    );
  };

  const isExecutionFailed = (payload?: BrowserCommandExecutionResponse): boolean => {
    if (!payload) {
      return true;
    }
    if (payload.success === false) {
      return true;
    }
    return Array.isArray(payload.results) && payload.results.some((item) => item.status === 'error');
  };

  // Execute MCP commands directly
  const executeCommandMutation = useMutation(
    async (commands: MCPCommand[]): Promise<BrowserCommandExecutionResponse> => {
      const commandsWithWait = appendDefaultWaitCommands(commands);
      console.log('[AIControls] Executing commands:', commands, 'backend:', executionBackend);
      return apiClient.post('/browser/execute', {
        commands: commandsWithWait,
        backend: executionBackend,
        runtimeSessionId: browserRuntimeSessionId,
      });
    },
    {
      onSuccess: (data, commands) => {
        const executionFailed = isExecutionFailed(data);
        const resultMessage = getFailedExecutionMessage(data);
        console.log('[AIControls] Commands executed:', data);
        if (executionFailed) {
          markTakeoverRequired({
            runtimeSessionId: browserRuntimeSessionId,
            backend: executionBackend,
            reason: resultMessage,
            originalCommands: commands,
            failedCommand: pickFailedCommand(commands),
          });
          void message.error(resultMessage);
        } else {
          setTakeoverState((prev) => (prev.mode === 'required' ? createIdleTakeoverState() : prev));
          void message.success(t('recorder:ai.commandExecuted'));
        }
        // Update last history entry with result
        setHistory((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.type === 'ai') {
            const firstResult = getPrimaryExecutionResult(data, resultMessage);
            const nextPageUrl = extractCurrentPageUrl(firstResult);
            if (nextPageUrl) {
              setCurrentPageUrl(nextPageUrl);
            }
            return [...prev.slice(0, -1), { ...last, result: firstResult }];
          }
          return prev;
        });
      },
      onError: (error: unknown) => {
        console.error('[AIControls] Command execution failed:', error);
        void message.error(t('recorder:ai.executionFailed'));
        // Add error to history but don't block
        setHistory((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            type: 'system',
            content: `执行失败: ${resolveErrorMessage(error)}，可以继续尝试其他命令`,
            timestamp: new Date(),
            backend: executionBackend,
          },
        ]);
      },
    }
  );

  // Parse natural language to MCP commands
  const parseCommandMutation = useMutation(
    async ({ userInput, commandType }: { userInput: string; commandType: string }) => {
      console.log('[AIControls] Parsing command:', userInput, 'commandType:', commandType, 'currentPageUrl:', currentPageUrl);
      const payload: ParseBrowserCommandPayload = {
        input: userInput,
        context: {
          commandType,
          currentPageUrl,
          backend: executionBackend,
        },
      };
      return apiClient.post<AICommandResponse>('/ai/browser/parse-command', payload);
    },
    {
      onSuccess: (data) => {
        console.log('[AIControls] Parse result:', data);
        if (data.success && data.commands.length > 0) {
          // Get replaceable info from the last user entry
          setHistory((prev) => {
            const lastUserEntry = [...prev].reverse().find(e => e.type === 'user');
            const replaceableInfo = lastUserEntry ? {
              replaceable: lastUserEntry.replaceable,
              commandType: lastUserEntry.commandType,
              rawParam: lastUserEntry.rawParam,
            } : {};

            return [...prev,
              {
                id: Date.now().toString(),
                type: 'ai' as const,
                content: data.explanation,
                commands: data.commands,
                // Don't add result here - executeCommandMutation will update it
                timestamp: new Date(),
                backend: executionBackend,
                // Pass through replaceable info from user entry
                ...replaceableInfo,
              },
            ];
          });
          onCommandExecuted?.(data.commands);

          // Auto-execute the commands
          executeCommandMutation.mutate(data.commands);
        } else if (!data.success) {
          // Show error message but allow continuing
          setHistory((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              type: 'system',
              content: data.explanation || t('recorder:ai.parseFailed') || '无法解析命令，请尝试其他表达方式',
              timestamp: new Date(),
              backend: executionBackend,
            },
          ]);
        }
      },
      onError: (error: unknown) => {
        console.error('[AIControls] Parse command failed:', error);
        // Don't show message.error to avoid blocking
        // Add error to history, allow continuing
        setHistory((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            type: 'system',
            content: `解析失败: ${resolveErrorMessage(error)}，请尝试其他表达方式`,
            timestamp: new Date(),
            backend: executionBackend,
          },
        ]);
      },
    }
  );

  // Initialize browser session
  const initBrowserMutation = useMutation(
    async (): Promise<BrowserInitResponse> => {
      console.log('[AIControls] Initializing browser with backend:', executionBackend);
      return apiClient.post('/browser/init', {
        backend: executionBackend,
        runtimeSessionId: browserRuntimeSessionId,
        sessionPreferences: {
          enableCodegen: true,
        },
      });
    },
    {
      onSuccess: (data) => {
        if (!data?.success) {
          const errorMessage = data?.message || '浏览器初始化失败';
          setIsBrowserReady(false);
          onBrowserReady?.(false);
          void message.error(errorMessage);
          setHistory((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              type: 'system',
              content: `初始化失败: ${errorMessage}`,
              timestamp: new Date(),
              backend: executionBackend,
            },
          ]);
          return;
        }
        setIsBrowserReady(true);
        onBrowserReady?.(true);
        if (data.endpoints) {
          onBrowserEndpoints?.(data.endpoints);
        }
        void message.success(t('recorder:ai.browserReady'));
        setHistory((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            type: 'system',
            content: `${t('recorder:ai.browserInitialized') || '浏览器已初始化，可以开始发送命令'} (${executionBackend})`,
            timestamp: new Date(),
            backend: executionBackend,
          },
        ]);
      },
      onError: (error: unknown) => {
        console.error('[AIControls] Browser init failed:', error);
        void message.error(t('recorder:ai.browserInitFailed'));
        setHistory((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            type: 'system',
            content: `初始化失败: ${resolveErrorMessage(error)}，请检查浏览器服务是否运行`,
            timestamp: new Date(),
            backend: executionBackend,
          },
        ]);
      },
    }
  );

  const handleSend = async () => {
    // Combine command and parameter
    const commandConfig = predefinedCommands.find(c => c.value === selectedCommand);
    const prefix = commandConfig?.prefix || '';
    const fullMessage = isReactChatMode ? paramInput.trim() : prefix + paramInput.trim();

    if (!fullMessage.trim()) return;

    const userMessage = fullMessage.trim();

    // Add user message to history with replaceable flag
    setHistory((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        type: 'user',
        content: userMessage,
        timestamp: new Date(),
        backend: executionBackend,
        // Track if this command's parameter should be replaceable in template
        replaceable: isReplaceable && paramInput.trim().length > 0,
        commandType: selectedCommand,
        rawParam: paramInput.trim(),
      },
    ]);

    // Clear parameter input immediately (keep command selection)
    clearParamInput();

    // Auto init browser if not ready
    if (!isBrowserReady) {
      try {
        await initBrowserMutation.mutateAsync();
      } catch (e) {
        // Init failed, but we already added error to history
        return;
      }
    }

    // Add "parsing" status message
    const parsingId = 'parsing-' + Date.now();
    setHistory((prev) => [
      ...prev,
      {
        id: parsingId,
        type: 'system',
        content: '⏳ 正在解析命令，请稍候...',
        timestamp: new Date(),
        backend: executionBackend,
      },
    ]);

    if (isReactChatMode) {
      try {
        const activeRuntimeSessionId = recorderDebugRuntimeSessionId || browserRuntimeSessionId;
        const data = await apiClient.post<RecorderDebugChatResponse>('/ai/recorder-debug/chat', {
          sessionId: recorderDebugSessionId,
          runtimeSessionId: activeRuntimeSessionId,
          message: userMessage,
          backend: executionBackend,
        });
        const resultPayload: CommandHistoryResult = {
          status: data.status,
          observation: data.observation,
          commands: data.commands,
          execution: data.execution,
          exportArtifacts: data.exportArtifacts,
        };
        setRecorderDebugSessionId(data.sessionId);
        setRecorderDebugRuntimeSessionId(data.runtimeSessionId);
        setHistory((prev) => [
          ...prev.filter((h) => h.id !== parsingId),
          {
            id: Date.now().toString(),
            type: 'ai',
            content: buildCompactAiReply(data.reply, resultPayload),
            timestamp: new Date(),
            backend: executionBackend,
            result: resultPayload,
            commands: data.commands,
            sessionId: data.sessionId,
            runtimeSessionId: data.runtimeSessionId,
          },
        ]);
        if (data.currentPageUrl || data.observation?.currentPageUrl) {
          setCurrentPageUrl(data.currentPageUrl || data.observation?.currentPageUrl);
        }
        if (data.execution && isExecutionFailed(data.execution as BrowserCommandExecutionResponse)) {
          const failureReason = getFailedExecutionMessage(data.execution as BrowserCommandExecutionResponse);
          markTakeoverRequired({
            runtimeSessionId: data.runtimeSessionId,
            sessionId: data.sessionId,
            backend: executionBackend,
            reason: failureReason,
            originalCommands: data.commands || [],
            failedCommand: pickFailedCommand(data.commands || []),
          });
          void message.warning('检测到浏览器执行失败，可进入人工接管');
        } else {
          setTakeoverState((prev) => (prev.mode === 'required' ? createIdleTakeoverState() : prev));
        }
        void message.success('对话已处理');
      } catch (error: unknown) {
        setHistory((prev) => [
          ...prev.filter((h) => h.id !== parsingId),
          {
            id: Date.now().toString(),
            type: 'system',
            content: `处理失败: ${resolveErrorMessage(error)}`,
            timestamp: new Date(),
            backend: executionBackend,
          },
        ]);
      }
      return;
    }
    parseCommandMutation.mutate({ userInput: userMessage, commandType: selectedCommand }, {
      onSettled: () => {
        setHistory((prev) => prev.filter((h) => h.id !== parsingId));
      },
    });
  };

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) {
      return;
    }

    if (e.nativeEvent.isComposing || isComposingRef.current) {
      return;
    }

    e.preventDefault();
    void handleSend();
  }, [handleSend]);

  const handleExecuteCommands = async (commands: MCPCommand[]) => {
    // Auto init browser if not ready
    if (!isBrowserReady) {
      try {
        await initBrowserMutation.mutateAsync();
      } catch (e) {
        return;
      }
    }
    executeCommandMutation.mutate(commands);
  };

  // Quick action handlers - execute commands directly
  const handleQuickAction = async (command: string, params?: Record<string, unknown>) => {
    const quickCommand: MCPCommand = {
      tool: command,
      params: params || {},
      description: `快捷操作: ${command}`,
    };

    // Auto init browser if not ready
    if (!isBrowserReady) {
      try {
        await initBrowserMutation.mutateAsync();
      } catch (e) {
        return;
      }
    }

    // Add to history and execute in one update
    const historyEntry = {
      id: Date.now().toString(),
      type: 'ai' as const,
      content: `快捷操作: ${command}${params ? ` (${JSON.stringify(params)})` : ''}`,
      commands: [quickCommand],
      timestamp: new Date(),
      backend: executionBackend,
    };

    // Add entry first (will be updated by onSuccess)
    setHistory((prev) => [...prev, historyEntry]);

    // Execute and update the same entry
    executeCommandMutation.mutate([quickCommand]);
  };

  const handleClearHistory = async () => {
    await cleanupBrowserSessions([
      {
        runtimeSessionId: browserRuntimeSessionId,
        backend: executionBackend,
      },
      {
        runtimeSessionId: recorderDebugRuntimeSessionId,
        backend: executionBackend,
      },
    ]);
    setHistory([]);
    setRecorderDebugSessionId(undefined);
    setRecorderDebugRuntimeSessionId(undefined);
    setBrowserRuntimeSessionId(createRuntimeSessionId());
    resetTakeoverState();
  };

  const handleExecutionBackendChange = async (nextBackend: ExecutionBackend) => {
    if (nextBackend === executionBackend) {
      return;
    }

    await cleanupBrowserSessions([
      {
        runtimeSessionId: browserRuntimeSessionId,
        backend: executionBackend,
      },
      {
        runtimeSessionId: recorderDebugRuntimeSessionId,
        backend: executionBackend,
      },
    ]);

    setExecutionBackend(nextBackend);
  };

  const handleStartTakeover = async () => {
    if (takeoverState.mode !== 'required' || !takeoverState.runtimeSessionId) {
      return;
    }

    try {
      const response = await recorderRuntimeService.startTakeover({
        runtimeSessionId: takeoverState.runtimeSessionId,
        sessionId: takeoverState.sessionId,
        backend: takeoverState.backend || executionBackend,
        failedCommand: takeoverState.failedCommand,
        reason: takeoverState.reason,
      });
      setTakeoverState((prev) => ({
        ...prev,
        mode: 'recording',
        takeoverSessionId: response.takeoverSessionId,
      }));
      if (response.endpoints) {
        onBrowserEndpoints?.(response.endpoints);
      }
      void message.success('已进入人工接管模式');
    } catch (error: unknown) {
      void message.error(resolveErrorMessage(error, '进入人工接管失败'));
    }
  };

  const handleStopTakeover = async () => {
    if (
      takeoverState.mode !== 'recording'
      || !takeoverState.runtimeSessionId
      || !takeoverState.takeoverSessionId
    ) {
      return;
    }

    setTakeoverState((prev) => ({
      ...prev,
      mode: 'reconciling',
    }));

    try {
      const stopped = await recorderRuntimeService.stopTakeover({
        runtimeSessionId: takeoverState.runtimeSessionId,
        takeoverSessionId: takeoverState.takeoverSessionId,
      });

      if (stopped.observation.currentPageUrl) {
        setCurrentPageUrl(stopped.observation.currentPageUrl);
      }

      const reconcileRequest = {
        sessionId: takeoverState.sessionId || recorderDebugSessionId || stopped.runtimeSessionId,
        runtimeSessionId: stopped.runtimeSessionId,
        backend: takeoverState.backend || executionBackend,
        failedCommand: takeoverState.failedCommand,
        originalCommands: takeoverState.originalCommands,
        patchSteps: stopped.patchSteps,
        observation: stopped.observation,
      };

      try {
        const reconcile = await recorderRuntimeService.reconcileAfterTakeover(reconcileRequest);
        setTakeoverState((prev) => ({
          ...prev,
          mode: 'ready_to_resume',
          patchSteps: stopped.patchSteps,
          observation: stopped.observation,
          strategy: reconcile.strategy,
          explanation: reconcile.explanation,
          resumeCommands: reconcile.resumeCommands,
        }));
        void message.success('已生成恢复方案');
      } catch (error: unknown) {
        setTakeoverState((prev) => ({
          ...prev,
          mode: 'ready_to_resume',
          patchSteps: stopped.patchSteps,
          observation: stopped.observation,
          explanation: resolveErrorMessage(error, '恢复方案生成失败'),
          resumeCommands: [],
        }));
        void message.warning('已结束接管，但恢复方案生成失败');
      }
    } catch (error: unknown) {
      setTakeoverState((prev) => ({
        ...prev,
        mode: 'recording',
      }));
      void message.error(resolveErrorMessage(error, '结束人工接管失败'));
    }
  };

  const handleResumeAfterTakeover = async () => {
    if (
      takeoverState.mode !== 'ready_to_resume'
      || !takeoverState.runtimeSessionId
      || takeoverState.resumeCommands.length === 0
    ) {
      return;
    }

    setTakeoverState((prev) => ({
      ...prev,
      mode: 'resuming',
    }));

    try {
      const resumed = await recorderRuntimeService.resumeAfterTakeover({
        runtimeSessionId: takeoverState.runtimeSessionId,
        takeoverSessionId: takeoverState.takeoverSessionId,
        backend: takeoverState.backend || executionBackend,
        strategy: takeoverState.strategy,
        resumeCommands: takeoverState.resumeCommands,
      });

      setHistory((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          type: 'system',
          content: resumed.success
            ? `已按 ${takeoverState.strategy || '恢复方案'} 继续执行`
            : '恢复执行返回失败状态，请查看详情后重试',
          timestamp: new Date(),
          backend: takeoverState.backend || executionBackend,
        },
      ]);
      resetTakeoverState();
      void message.success(resumed.success ? '已恢复 AI 执行' : '恢复执行完成，但结果为失败');
    } catch (error: unknown) {
      setTakeoverState((prev) => ({
        ...prev,
        mode: 'ready_to_resume',
      }));
      void message.error(resolveErrorMessage(error, '恢复执行失败'));
    }
  };

  const handleCopyCommand = (command: MCPCommand) => {
    void navigator.clipboard.writeText(JSON.stringify(command, null, 2));
    void message.success(t('common:copied'));
  };

  // Remove step from template
  const handleRemoveTemplateStep = (stepId: string) => {
    setTemplateSteps((prev) => prev.filter((s) => s.id !== stepId));
  };

  // Clear template
  const handleClearTemplate = () => {
    setTemplateSteps([]);
    setTemplateName('');
    setSavedTemplateId(null);
  };

  // Compile template to executable script with parameter extraction
  const handleCompileTemplate = () => {
    if (templateSteps.length === 0) {
      void message.warning('模版为空，请先添加命令');
      return;
    }

    // Extract parameters from steps (URLs, search queries, etc.)
    const extractedParams = extractParameters(templateSteps);

    // Generate JavaScript code with parameterized variables
    const script = generateScript(templateSteps, extractedParams);
    setCompiledScript(script);
    setShowScriptModal(true);
    // Don't auto-save - let user review and confirm in the modal
  };

  // Save compiled template to backend
  const handleSaveCompiledTemplate = async () => {
    if (templateSteps.length === 0) {
      void message.warning('模版为空，请先添加命令');
      return;
    }

    const extractedParams = extractParameters(templateSteps);

    // Only include replaceable params in params_schema
    const replaceableParamsSchema: Record<string, { type: string; description: string; default?: string | number }> = {};
    Object.entries(extractedParams).forEach(([name, schema]) => {
      if (schema.replaceable) {
        replaceableParamsSchema[name] = schema;
      }
    });

    // Convert TemplateStep to backend format and append optional screenshots
    // Also substitute replaceable params with placeholders
    const coreBackendSteps: Array<{
      action: string;
      params?: Record<string, string | number>;
      locator?: { type: 'css'; value: string };
    }> = [];

    templateSteps.forEach((step) => {
      // Create params with placeholder substitution for replaceable params
      const substitutedParams = { ...step.params };

      // Only substitute params that are marked as replaceable
      Object.entries(extractedParams).forEach(([originalName, schema]) => {
        if (schema.replaceable) {
          const defaultValue = schema.default;
          if (defaultValue !== undefined) {
            Object.keys(substitutedParams).forEach(key => {
              if (substitutedParams[key] === defaultValue) {
                substitutedParams[key] = `\${${originalName}}`;
              }
            });
          }
        }
      });

      // Add the step with substituted params
      const backendStep: {
        action: string;
        params: Record<string, string | number>;
        locator?: { type: 'css'; value: string };
      } = {
        action: step.tool,
        params: substitutedParams as Record<string, string | number>,
      };

      if (step.params.selector) {
        backendStep.locator = {
          type: 'css',
          value: step.params.selector as string,
        };
      }

      coreBackendSteps.push(backendStep);
    });

    const backendSteps = appendTemplateScreenshotSteps(coreBackendSteps);

    // Generate params_schema for replaceable parameters only
    const paramsSchema = {
      type: 'object',
      properties: replaceableParamsSchema,
      required: Object.keys(replaceableParamsSchema),
    };

    const name = templateName || `编译模版 ${new Date().toLocaleString()}`;

    try {
      const createdTemplate = await templateApi.create({
        name,
        description: `由智能录制编译生成的模版，包含 ${templateSteps.length} 个步骤（${getScreenshotModeLabel()}），${Object.keys(replaceableParamsSchema).length} 个可替换参数`,
        params_schema: paramsSchema,
        steps: backendSteps,
        created_by: user?.id || 'ai_recorder',
      });

      void message.success(`模版已保存: ${createdTemplate.name}`);
      setShowScriptModal(false);
      // Store the template ID for immediate testing (don't clear template steps yet)
      setSavedTemplateId(createdTemplate.id);
      setTemplateName('');
      void message.info('模版已保存，可以点击"测试模版"按钮进行测试', 5);
    } catch (error: unknown) {
      console.error('Failed to save compiled template:', error);
      const errorMsg = resolveErrorMessage(error);
      void message.error(`保存失败: ${errorMsg}`);
    }
  };

  // Extract parameters from template steps for later replacement
  const extractParameters = (steps: TemplateStep[]): Record<string, { type: string; description: string; default?: string | number; replaceable?: boolean }> => {
    const params: Record<string, { type: string; description: string; default?: string | number; replaceable?: boolean }> = {};

    steps.forEach((step, index) => {
      const stepPrefix = `step${index + 1}`;
      const replaceableParams = step.replaceableParams || {};

      switch (step.tool) {
        case 'navigate':
          // Extract URL as parameter
          if (step.params.url) {
            params[`${stepPrefix}_url`] = {
              type: 'string',
              description: `步骤${index + 1}导航URL`,
              default: step.params.url as string,
              replaceable: replaceableParams['url'] || false,
            };
          }
          break;

        case 'fill':
          // Extract input value as parameter
          if (step.params.value) {
            params[`${stepPrefix}_value`] = {
              type: 'string',
              description: `步骤${index + 1}输入内容`,
              default: step.params.value as string,
              replaceable: replaceableParams['value'] || false,
            };
          }
          // Extract selector as parameter (optional)
          if (step.params.selector) {
            params[`${stepPrefix}_selector`] = {
              type: 'string',
              description: `步骤${index + 1}目标选择器`,
              default: step.params.selector as string,
              replaceable: replaceableParams['selector'] || false,
            };
          }
          break;

        case 'click':
          // Extract click target selector as parameter (optional)
          if (step.params.selector) {
            params[`${stepPrefix}_selector`] = {
              type: 'string',
              description: `步骤${index + 1}点击目标选择器`,
              default: step.params.selector as string,
              replaceable: replaceableParams['selector'] || false,
            };
          }
          if (step.params.text) {
            params[`${stepPrefix}_text`] = {
              type: 'string',
              description: `步骤${index + 1}点击目标文本`,
              default: step.params.text as string,
              replaceable: replaceableParams['text'] || false,
            };
          }
          break;

        case 'type_text':
          if (step.params.text) {
            params[`${stepPrefix}_text`] = {
              type: 'string',
              description: `步骤${index + 1}输入文本`,
              default: step.params.text as string,
              replaceable: replaceableParams['text'] || false,
            };
          }
          break;

        case 'wait':
          if (step.params.duration) {
            params[`${stepPrefix}_duration`] = {
              type: 'number',
              description: `步骤${index + 1}等待时间(ms)`,
              default: step.params.duration as number,
              replaceable: replaceableParams['duration'] || false,
            };
          }
          break;

        case 'scroll':
          if (step.params.amount) {
            params[`${stepPrefix}_amount`] = {
              type: 'number',
              description: `步骤${index + 1}滚动距离`,
              default: step.params.amount as number,
              replaceable: replaceableParams['amount'] || false,
            };
          }
          break;

        case 'search':
        case 'smart_search':
          // Extract search query as parameter
          if (step.params.query) {
            params[`${stepPrefix}_query`] = {
              type: 'string',
              description: `步骤${index + 1}搜索关键词`,
              default: step.params.query as string,
              replaceable: replaceableParams['query'] || false,
            };
          }
          // Extract input selector as parameter (optional)
          if (step.params.input_selector) {
            params[`${stepPrefix}_input_selector`] = {
              type: 'string',
              description: `步骤${index + 1}搜索输入框选择器`,
              default: step.params.input_selector as string,
              replaceable: replaceableParams['input_selector'] || false,
            };
          }
          break;
      }
    });

    return params;
  };

  // Generate executable script from template steps with parameterized variables
  const generateScript = (steps: TemplateStep[], params: Record<string, { type: string; description: string; default?: string | number; replaceable?: boolean }> = {}): string => {
    const lines: string[] = [
      '// Auto-generated browser automation script',
      '// Generated at: ' + new Date().toISOString(),
      '',
      'const { chromium } = require("playwright");',
      '',
      '// === CONFIGURABLE PARAMETERS ===',
      '// You can modify these values before running the script',
    ];

    // Add parameter definitions with special marking for replaceable ones
    Object.entries(params).forEach(([key, param]) => {
      const defaultValue = param.type === 'number' ? param.default : `'${param.default}'`;
      // 添加可替换标记的特别注释
      if (param.replaceable) {
        lines.push(`// ⚠️ [可替换参数] ${param.description} - AI执行时可根据用户输入自动替换`);
      } else {
        lines.push(`// ${param.description}`);
      }
      lines.push(`const ${key} = ${defaultValue};`);
    });

    lines.push('');
    lines.push('async function run() {');
    lines.push('  const browser = await chromium.launch({ headless: false });');
    lines.push('  const context = await browser.newContext();');
    lines.push('  const page = await context.newPage();');
    lines.push('');

    steps.forEach((step, index) => {
      const stepPrefix = `step${index + 1}`;
      const selector = getStringParam(step.params, 'selector');
      const text = getStringParam(step.params, 'text');
      const url = getStringParam(step.params, 'url');
      const direction = getStringParam(step.params, 'direction');
      const duration = getNumberParam(step.params, 'duration');
      const key = getStringParam(step.params, 'key');
      const query = getStringParam(step.params, 'query');
      const inputSelector = getStringParam(step.params, 'input_selector');
      const submitMethod = getStringParam(step.params, 'submit_method');
      const buttonSelector = getStringParam(step.params, 'button_selector');
      const amount = getNumberParam(step.params, 'amount');
      lines.push(`  // Step ${index + 1}: ${step.description}`);

      switch (step.tool) {
        case 'navigate': {
          const urlVar = params[`${stepPrefix}_url`] ? `${stepPrefix}_url` : `'${url || ''}'`;
          lines.push(`  await page.goto(${urlVar});`);
          break;
        }
        case 'click':
          if (params[`${stepPrefix}_selector`]) {
            lines.push(`  await page.click(${stepPrefix}_selector);`);
          } else if (params[`${stepPrefix}_text`]) {
            lines.push(`  await page.click('text=' + ${stepPrefix}_text);`);
          } else if (selector) {
            lines.push(`  await page.click('${selector}');`);
          } else if (text) {
            lines.push(`  await page.click('text=${text}');`);
          }
          break;
        case 'fill': {
          const selectorVar = params[`${stepPrefix}_selector`] ? `${stepPrefix}_selector` : `'${selector || ''}'`;
          const valueVar = params[`${stepPrefix}_value`] ? `${stepPrefix}_value` : `'${text || getStringParam(step.params, 'value') || ''}'`;
          lines.push(`  await page.fill(${selectorVar}, ${valueVar});`);
          break;
        }
        case 'screenshot':
          lines.push(`  await page.screenshot({ path: 'screenshot-${index + 1}.png' });`);
          break;
        case 'scroll':
          if (direction === 'down') {
            const amountVar = params[`${stepPrefix}_amount`] ? `${stepPrefix}_amount` : String(amount ?? 300);
            lines.push(`  await page.evaluate(() => window.scrollBy(0, ${amountVar}));`);
          } else if (direction === 'top') {
            lines.push(`  await page.evaluate(() => window.scrollTo(0, 0));`);
          }
          break;
        case 'wait':
          if (params[`${stepPrefix}_duration`]) {
            lines.push(`  await page.waitForTimeout(${stepPrefix}_duration);`);
          } else if (duration !== undefined) {
            lines.push(`  await page.waitForTimeout(${String(duration)});`);
          } else if (selector) {
            lines.push(`  await page.waitForSelector('${selector}');`);
          }
          break;
        case 'press_key':
          lines.push(`  await page.keyboard.press('${key || ''}');`);
          break;
        case 'type_text': {
          const textVar = params[`${stepPrefix}_text`] ? `${stepPrefix}_text` : `'${text || ''}'`;
          lines.push(`  await page.keyboard.type(${textVar});`);
          break;
        }
        case 'search':
        case 'smart_search': {
          const searchQuery = params[`${stepPrefix}_query`] ? `${stepPrefix}_query` : `'${query || ''}'`;
          const searchSelector = params[`${stepPrefix}_input_selector`] ? `${stepPrefix}_input_selector` : `'${inputSelector || ''}'`;
          lines.push(`  // Search: fill search input and submit`);
          lines.push(`  let searchInput;`);
          if (inputSelector) {
            lines.push(`  searchInput = page.locator(${searchSelector});`);
            lines.push(`  await searchInput.fill(${searchQuery});`);
          } else {
            lines.push(`  searchInput = page.locator('input[type="search"], input[name="q"], [role="searchbox"], input[placeholder*="search" i], input[placeholder*="搜" i]').first();`);
            lines.push(`  await searchInput.fill(${searchQuery});`);
          }
          if (submitMethod === 'click' && buttonSelector) {
            lines.push(`  await page.click('${buttonSelector}');`);
          } else {
            lines.push(`  await searchInput.press('Enter');`);
          }
          break;
        }
        default:
          lines.push(`  // Unknown tool: ${step.tool}`);
      }

      if (autoAppendScreenshots) {
        // Add screenshot pattern after each step using the configured wait duration.
        lines.push('  // Wait before screenshot');
        lines.push(`  await page.waitForTimeout(${waitDuration * 1000});`);
        lines.push(`  await page.screenshot({ path: 'screenshot-step-${index + 1}.png' });`);
        lines.push('  // Wait after screenshot');
        lines.push(`  await page.waitForTimeout(${waitDuration * 1000});`);
        lines.push('');
      }
    });

    lines.push('  // Keep browser open for review');
    lines.push('  await page.waitForTimeout(5000);');
    lines.push('  await browser.close();');
    lines.push('}');
    lines.push('');
    lines.push('run().catch(console.error);');

    return lines.join('\n');
  };

  // Confirm save template
  const handleConfirmSaveTemplate = async () => {
    if (templateSteps.length === 0) {
      void message.warning('模版为空，请先添加命令');
      return;
    }

    const name = templateName || `模版 ${new Date().toLocaleString()}`;

    // Extract parameters and apply custom names
    const extractedParams = extractParameters(templateSteps);

    // Only include replaceable params in final params_schema
    // Also apply custom parameter names
    const finalParams: Record<string, { type: string; description: string; default?: string | number }> = {};
    Object.entries(extractedParams).forEach(([originalName, schema]) => {
      // Only include if param is replaceable (checked by user during recording)
      if (schema.replaceable) {
        // Also check if manually disabled in modal
        if (paramEnabled[originalName] !== false) {
          const customName = paramNames[originalName] || originalName;
          finalParams[customName] = schema;
        }
      }
    });

    // Convert TemplateStep to backend format and append optional screenshots
    // Also replace parameter values with ${param_name} placeholders
    const coreBackendSteps: Array<{
      action: string;
      params?: Record<string, string | number>;
      locator?: { type: 'css'; value: string };
    }> = [];

    templateSteps.forEach((step) => {
      // Create params with placeholder substitution for replaceable params only
      const substitutedParams = { ...step.params };

      // Find which original params map to this step's params and substitute
      // Only substitute params that are marked as replaceable
      Object.entries(extractedParams).forEach(([originalName, schema]) => {
        // Only substitute if param is replaceable
        if (schema.replaceable && paramEnabled[originalName] !== false) {
          const customName = paramNames[originalName] || originalName;
          // Replace the value with placeholder
          const defaultValue = schema.default;
          if (defaultValue !== undefined) {
            // Find and replace in params
            Object.keys(substitutedParams).forEach(key => {
              if (substitutedParams[key] === defaultValue) {
                substitutedParams[key] = `\${${customName}}`;
              }
            });
          }
        }
      });

      // Add the original step with substituted params
      const backendStep: {
        action: string;
        params: Record<string, string | number>;
        locator?: { type: 'css'; value: string };
      } = {
        action: step.tool,
        params: substitutedParams as Record<string, string | number>,
      };

      // Add locator for selector-based actions
      if (step.params.selector) {
        backendStep.locator = {
          type: 'css',
          value: step.params.selector as string,
        };
      }

      coreBackendSteps.push(backendStep);
    });

    const backendSteps = appendTemplateScreenshotSteps(coreBackendSteps);

    // Generate params_schema for custom parameters
    const paramsSchema = {
      type: 'object',
      properties: finalParams,
      required: Object.keys(finalParams),
    };

    try {
      // Save to backend API
      const createdTemplate = await templateApi.create({
        name,
        description: `由智能录制生成的模版，包含 ${templateSteps.length} 个步骤（${getScreenshotModeLabel()}），${Object.keys(finalParams).length} 个可替换参数`,
        params_schema: paramsSchema,
        steps: backendSteps,
        created_by: user?.id || 'ai_recorder',
      });

      void message.success(`模版已保存: ${createdTemplate.name}`);
      setShowTemplateModal(false);
      handleClearTemplate();

      // Store the template ID for immediate testing
      setSavedTemplateId(createdTemplate.id);
      void message.info('模版已保存，可以点击"测试模版"按钮进行测试', 5);
    } catch (error: unknown) {
      console.error('Failed to save template:', error);
      void message.error(`保存模版失败: ${resolveErrorMessage(error)}`);
    }
  };

  // Test saved template
  const handleTestSavedTemplate = async () => {
    if (!savedTemplateId) {
      void message.warning('请先保存模版');
      return;
    }
    if (!user?.id) {
      void message.warning('用户未登录，请先登录');
      return;
    }

    setTestLoading(true);
    try {
      // Create session
      const result = await sessionApi.create({
        user_id: user.id,
        template_id: savedTemplateId,
        params: {},
      });

      // Start the session
      await sessionApi.start(result.session.id, {
        template_id: savedTemplateId,
        params: {},
      });

      void message.success('测试已启动，跳转到会话详情页');
      navigate(`/sessions/${result.session.id}`);
    } catch (error: unknown) {
      const errorMsg = resolveErrorMessage(error, '测试失败');
      if (errorMsg.includes('No available workers')) {
        // Try to reset workers and retry
        void message.warning('Worker 不足，正在重置...');
        try {
          await workerApi.reset();
          // Retry
          const result = await sessionApi.create({
            user_id: user.id,
            template_id: savedTemplateId,
            params: {},
          });
          await sessionApi.start(result.session.id, {
            template_id: savedTemplateId,
            params: {},
          });
          void message.success('测试已启动，跳转到会话详情页');
          navigate(`/sessions/${result.session.id}`);
        } catch (retryError: unknown) {
          void message.error(resolveErrorMessage(retryError, '测试失败'));
        }
      } else {
        void message.error(errorMsg);
      }
    } finally {
      setTestLoading(false);
    }
  };

  // Reset worker pool
  const handleResetWorkers = async () => {
    setResetLoading(true);
    try {
      const result = await workerApi.reset();
      void message.success(result.message || 'Worker Pool 已重置');
    } catch (_error: unknown) {
      void message.error('重置 Worker Pool 失败');
    } finally {
      setResetLoading(false);
    }
  };

  // Copy compiled script
  const handleCopyScript = () => {
    void navigator.clipboard.writeText(compiledScript);
    void message.success('脚本已复制到剪贴板');
  };

  // Download compiled script
  const handleDownloadScript = () => {
    const blob = new Blob([compiledScript], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `browser-script-${Date.now()}.js`;
    a.click();
    URL.revokeObjectURL(url);
    void message.success('脚本已下载');
  };

  // Auto extract template from history
  const handleAutoExtractTemplate = () => {
    const extractedSteps: TemplateStep[] = [];

    // Go through all history entries
    history.forEach((entry) => {
      // Check if entry has result with template_info
      if (entry.result?.template_info) {
        const info = entry.result.template_info;
        // Only add deterministic commands (navigate, fill, click with selector, etc.)
        // Skip non-deterministic commands like click_result without actual navigation
        const deterministicTools = ['navigate', 'fill', 'click', 'screenshot', 'scroll', 'wait', 'press_key', 'hover', 'type_text', 'search', 'smart_search'];
        if (deterministicTools.includes(info.tool)) {
          // Determine which params are replaceable based on entry.replaceable and commandType
          const replaceableParams: Record<string, boolean> = {};

          if (entry.replaceable && entry.rawParam) {
            // 根据命令类型标记可替换参数
            switch (info.tool) {
              case 'navigate':
                replaceableParams['url'] = true;
                break;
              case 'search':
              case 'smart_search':
                replaceableParams['query'] = true;
                break;
              case 'fill':
                replaceableParams['value'] = true;
                break;
              case 'click':
                if (info.params.text) replaceableParams['text'] = true;
                break;
              case 'type_text':
                replaceableParams['text'] = true;
                break;
            }
          }

          extractedSteps.push({
            id: Date.now().toString() + Math.random(),
            tool: info.tool,
            params: info.params,
            description: info.description || `${info.tool} ${JSON.stringify(info.params)}`,
            timestamp: entry.timestamp,
            replaceableParams,
          });
        }
      }
    });

    if (extractedSteps.length === 0) {
      void message.warning('历史记录中没有找到确定性命令');
      return;
    }

    setTemplateSteps(extractedSteps);
    void message.success(`已从历史记录中提取 ${extractedSteps.length} 个确定性命令`);
  };

  // Handle manual recording start
  const handleManualStart = () => {
    let finalUrl = recordUrl.trim();
    if (!finalUrl || finalUrl === 'https://') {
      void message.warning(t('recorder:enterUrl'));
      return;
    }
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl;
    }
    onStartRecording?.(finalUrl);
  };

  // Check if any mutation is loading
  const isLoading = parseCommandMutation.isLoading || executeCommandMutation.isLoading;
  const backendLabels: Record<ExecutionBackend, string> = {
    cli: 'Playwright CLI',
    'chrome-devtools': 'Chrome DevTools CLI',
  };
  const backendTagColors: Record<ExecutionBackend, string> = {
    cli: 'purple',
    'chrome-devtools': 'cyan',
  };
  const backendButtonLabels: Record<ExecutionBackend, string> = {
    cli: 'PW CLI',
    'chrome-devtools': 'CDT CLI',
  };

  const buildTemplateDescriptionFromArtifacts = (
    artifacts: RecorderDebugExportArtifacts,
  ) => {
    return artifacts.skillDraft?.publishPayload?.description
      || artifacts.skillDraft?.description
      || artifacts.guidance
      || '由录制流程自动生成的浏览器执行模板';
  };

  const buildTemplateNameFromArtifacts = (artifacts: RecorderDebugExportArtifacts) => {
    const rawName = artifacts.skillDraft?.publishPayload?.name
      || artifacts.skillDraft?.name
      || `recorder-export-${Date.now()}`;
    return rawName.slice(0, 255);
  };

  const buildTemplateStepsFromArtifacts = (artifacts: RecorderDebugExportArtifacts): Array<{
    step_id: string;
    action: string;
    locator?: { type: string; value: string; fallback?: { type: string; value: string } };
    params?: Record<string, string | number>;
  }> => {
    const parameterSources = new Map<string, string>();
    (artifacts.skillDraft?.parameters || []).forEach((parameter) => {
      if (parameter.source) {
        parameterSources.set(parameter.source, parameter.name);
      }
    });

    const coreSteps = (artifacts.skillDraft?.executionPlan?.commands || []).map((command, commandIndex) => {
      const rawParams = Object.fromEntries(
        Object.entries(command.params || {}).filter(([, value]) =>
          ['string', 'number'].includes(typeof value),
        ),
      ) as Record<string, string | number>;
      const locator = inferTemplateLocatorFromCommand(command);
      const locatorParamKeys = new Set(['selector', 'target', 'text']);

      const substitutedEntries = Object.entries(rawParams)
        .map(([key, value]) => {
          const parameterName = parameterSources.get(`command.${commandIndex}.${key}`)
            || parameterSources.get(`${command.tool}.${key}`);
          if (!parameterName) {
            return [key, value];
          }
          return [key, `\${${parameterName}}`];
        })
        .filter((entry): entry is [string, string | number] => !locatorParamKeys.has(String(entry[0])));

      const normalizedParams = Object.fromEntries(
        substitutedEntries,
      ) as Record<string, string | number>;

      return {
        action: command.tool,
        ...(locator ? { locator } : {}),
        ...(Object.keys(normalizedParams).length > 0 ? { params: normalizedParams } : {}),
      };
    });

    return appendTemplateScreenshotSteps(coreSteps);
  };

  const inferTemplateLocatorFromCommand = (command: MCPCommand): { type: string; value: string } | undefined => {
    const runtimeLocator = command.locator;
    if (runtimeLocator?.value && runtimeLocator.strategy) {
      const mappedType = mapRuntimeLocatorType(runtimeLocator.strategy);
      if (mappedType) {
        return {
          type: mappedType,
          value: buildTemplateLocatorValue(runtimeLocator),
        };
      }
    }

    const params = command.params || {};
    const candidate = typeof params.selector === 'string'
      ? params.selector
      : typeof params.text === 'string'
        ? params.text
        : typeof params.target === 'string' && !/^e\d+$/i.test(params.target)
          ? params.target
          : undefined;

    if (!candidate || !['click', 'fill', 'select', 'check'].includes(command.tool)) {
      return undefined;
    }

    return {
      type: inferLocatorTypeFromValue(candidate),
      value: candidate,
    };
  };

  const mapRuntimeLocatorType = (strategy: string): string | undefined => {
    switch (strategy) {
      case 'ref':
        return 'ref';
      case 'role':
        return 'role';
      case 'text':
      case 'label':
      case 'placeholder':
        return 'text';
      case 'testid':
        return 'test-id';
      case 'css':
        return 'css';
      default:
        return undefined;
    }
  };

  const buildTemplateLocatorValue = (locator: NonNullable<MCPCommand['locator']>): string => {
    if (locator.strategy === 'role' && locator.role && locator.name) {
      const escapedName = locator.name.replace(/"/g, '\\"');
      return `${locator.role}[name="${escapedName}"]`;
    }

    return locator.value || '';
  };

  const inferLocatorTypeFromValue = (value: string): string => {
    const trimmed = value.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('xpath=')) {
      return 'xpath';
    }
    if (
      trimmed.startsWith('#')
      || trimmed.startsWith('.')
      || trimmed.startsWith('[')
      || trimmed.includes('>')
      || trimmed.includes(':')
    ) {
      return 'css';
    }
    return 'text';
  };

  const buildTemplateParamsSchemaFromArtifacts = (artifacts: RecorderDebugExportArtifacts) => {
    const publishSchema = artifacts.skillDraft?.publishPayload?.paramsSchema;
    if (publishSchema?.properties) {
      return {
        type: 'object' as const,
        properties: Object.fromEntries(
          Object.entries(publishSchema.properties).map(([key, value]) => [
            key,
            {
              type: value.type,
              description: value.description,
              default: value.default,
              required: value.required,
            },
          ]),
        ),
        required: publishSchema.required || [],
      };
    }

    return {
      type: 'object' as const,
      properties: Object.fromEntries(
        (artifacts.skillDraft?.parameters || []).map((parameter) => [
          parameter.name,
          {
            type: 'string',
            description: parameter.description,
            default: parameter.exampleValue,
            required: parameter.required,
          },
        ]),
      ),
      required: (artifacts.skillDraft?.parameters || [])
        .filter((parameter) => parameter.required)
        .map((parameter) => parameter.name),
    };
  };

  const handleExportTemplateFromRecorder = async () => {
    if (!isReactChatMode) {
      void message.warning('请先切到对话调试模式后再导出');
      return;
    }

    const sessionId = recorderDebugSessionId;
    const runtimeSessionId = recorderDebugRuntimeSessionId;
    if (!sessionId || !runtimeSessionId) {
      void message.warning('当前还没有可导出的录制会话');
      return;
    }

    setExportTemplateLoading(true);
    try {
      const exported = await apiClient.post<RecorderDebugExportResponse>('/ai/recorder-debug/export', {
        sessionId,
        runtimeSessionId,
        backend: executionBackend,
        userGoal: history
          .filter((entry) => entry.type === 'user')
          .map((entry) => entry.content)
          .slice(-3)
          .join(' / ') || '录制浏览器任务',
      });

      const artifacts = exported.exportArtifacts;
      const createdTemplate = await templateApi.create({
        name: buildTemplateNameFromArtifacts(artifacts),
        description: buildTemplateDescriptionFromArtifacts(artifacts),
        params_schema: buildTemplateParamsSchemaFromArtifacts(artifacts),
        steps: buildTemplateStepsFromArtifacts(artifacts),
        guards: [
          {
            type: 'recorder_export',
            backend: executionBackend,
            runtimeSessionId: exported.runtimeSessionId,
          },
        ],
        config: {
          exportSource: 'recorder-debug',
          currentPageUrl: exported.currentPageUrl,
          backend: executionBackend,
          script: artifacts.script,
          guidance: artifacts.guidance,
          outputs: artifacts.skillDraft?.outputs || [],
          usageNotes: artifacts.skillDraft?.usageNotes || [],
          usageMarkdown: artifacts.skillDraft?.usageMarkdown,
          executionPlan: artifacts.skillDraft?.executionPlan,
          skillDraft: artifacts.skillDraft || null,
        },
        created_by: user?.id || 'ai_recorder',
      });

      setHistory((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          type: 'system',
          content: `导出模板成功: ${createdTemplate.name}`,
          timestamp: new Date(),
          backend: executionBackend,
        },
      ]);
      void message.success('已导出到模板列表');
      navigate(`/templates/${createdTemplate.id}`);
    } catch (error: unknown) {
      void message.error(resolveErrorMessage(error, '导出失败'));
    } finally {
      setExportTemplateLoading(false);
    }
  };

  const latestReactSuggestedParameters = [...history]
    .reverse()
    .find((entry) => (
      entry.type === 'ai'
      && Array.isArray(entry.result?.observation?.suggestedParameters)
      && entry.result.observation.suggestedParameters.length > 0
    ))
    ?.result?.observation?.suggestedParameters;

  const handleInsertSuggestedParameter = (name: string) => {
    const template = `${name}: `;
    setParamInput((prev) => {
      const trimmed = prev.trimEnd();
      if (!trimmed) {
        return template;
      }
      if (trimmed.includes(`${name}:`)) {
        return prev;
      }
      return `${trimmed}\n${template}`;
    });
  };

  const isRecording = recorderStatus === 'recording';
  const isPaused = recorderStatus === 'paused';
  const canSend = Boolean(
    isReactChatMode
      ? paramInput.trim()
      : (predefinedCommands.find(c => c.value === selectedCommand)?.prefix + paramInput.trim()).trim(),
  );
  const canExport = Boolean(recorderDebugSessionId && recorderDebugRuntimeSessionId);
  const canUseSpeech = speechSupported && !isLoading && !isTranscribing;
  const buildRecorderDebugDetailPath = (sessionId: string) => `/recorder-debug/${sessionId}`;
  const actionColumnHeight = 112;
  const primaryActionButtonStyle = {
    height: 44,
    borderRadius: 18,
    width: 108,
    paddingInline: 18,
    border: isDarkTheme ? '1px solid #7c83ff' : '1px solid #4f46e5',
    color: '#ffffff',
    fontWeight: 600,
    background: isDarkTheme ? '#4f46e5' : '#4f46e5',
    boxShadow: isDarkTheme
      ? '0 10px 24px rgba(79, 70, 229, 0.4)'
      : '0 6px 16px rgba(79, 70, 229, 0.24)',
  } satisfies React.CSSProperties;
  const secondaryActionButtonStyle = {
    height: 44,
    borderRadius: 18,
    width: 108,
    paddingInline: 18,
    border: isDarkTheme ? '1px solid #6366f1' : '1px solid #c7d2fe',
    background: isDarkTheme ? '#1f2540' : '#eef2ff',
    color: isDarkTheme ? '#e0e7ff' : '#4338ca',
    fontWeight: 600,
    boxShadow: isDarkTheme
      ? '0 10px 24px rgba(15, 23, 42, 0.32)'
      : '0 6px 16px rgba(99, 102, 241, 0.12)',
  } satisfies React.CSSProperties;
  const mutedActionButtonStyle = {
    opacity: 0.72,
    cursor: 'not-allowed',
  } satisfies React.CSSProperties;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 4 }}>
      {/* Header section with controls */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 8,
          padding: '8px 10px',
          background: isDarkTheme
            ? 'var(--bg-secondary)'
            : 'linear-gradient(135deg, #f0f4ff 0%, #e8f0fe 100%)',
          borderRadius: 12,
          border: isDarkTheme ? '1px solid #334155' : '1px solid rgba(99, 102, 241, 0.1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <Space>
            <Switch
              checked={isAIMode}
              onChange={setIsAIMode}
              checkedChildren={<><RobotOutlined /> AI</>}
              unCheckedChildren={<><VideoCameraOutlined /> 手动</>}
            />
          </Space>
          <Space wrap>
            <Radio.Group
              value={executionBackend}
              onChange={(e) => {
                void handleExecutionBackendChange(e.target.value as ExecutionBackend);
              }}
              size="middle"
              optionType="button"
              buttonStyle="solid"
            >
              <Radio.Button value="cli">{backendButtonLabels.cli}</Radio.Button>
              <Radio.Button value="chrome-devtools">{backendButtonLabels['chrome-devtools']}</Radio.Button>
            </Radio.Group>
            {isAIMode && (
              <Space>
                <Text type="secondary" style={{ fontSize: 14 }}>
                  模式
                </Text>
                <Switch
                  checked={isReactChatMode}
                  onChange={setIsReactChatMode}
                  checkedChildren="对话"
                  unCheckedChildren="单步"
                />
              </Space>
            )}
          </Space>
        </div>
        <Space wrap>
          <Text type="secondary" style={{ fontSize: 14 }}>
            等待
          </Text>
          <Space.Compact>
            <InputNumber
              min={0.5}
              max={120}
              step={0.5}
              value={waitDuration}
              onChange={(val) => setWaitDuration(val ?? 0.5)}
              style={{ width: 68 }}
            />
            <Button disabled>
              s
            </Button>
          </Space.Compact>
          <Text type="secondary" style={{ fontSize: 14, marginLeft: 8 }}>
            自动截图
          </Text>
          <Switch checked={autoAppendScreenshots} onChange={setAutoAppendScreenshots} />
        </Space>
      </div>

      {isAIMode ? (
        // AI Mode Content
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {/* Message history */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              background: isDarkTheme ? 'var(--bg-primary)' : '#fafafa',
              borderRadius: 12,
              padding: 8,
              border: isDarkTheme ? '1px solid #334155' : '1px solid #e5e7eb',
            }}
          >
          {history.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t('recorder:ai.noHistory') || '暂无对话记录'}
            />
          ) : (
            history.map((entry) => (
              (() => {
                const displayContent = buildCompactHistoryBubbleText(entry);
                return (
              <div
                key={entry.id}
                style={{
                  marginBottom: 12,
                  textAlign: entry.type === 'user' ? 'right' : 'left',
                }}
              >
                <div
                  style={{
                    display: 'inline-block',
                    maxWidth: '85%',
                    padding: '8px 12px',
                    borderRadius: 12,
                    background: entry.type === 'user' 
                      ? '#6366f1' 
                      : entry.type === 'system' 
                        ? (isDarkTheme ? '#1e3a8a' : '#e6f7ff') 
                        : (isDarkTheme ? 'var(--bg-card)' : '#fff'),
                    color: entry.type === 'user' ? '#fff' : 'inherit',
                    boxShadow: isDarkTheme ? '0 1px 3px rgba(0,0,0,0.3)' : '0 1px 2px rgba(0,0,0,0.1)',
                    border: isDarkTheme && entry.type !== 'user' ? '1px solid #334155' : 'none',
                  }}
                >
                  {entry.backend && (
                    <div style={{ marginBottom: 6 }}>
                      <Tag color={backendTagColors[entry.backend]}>
                        {backendLabels[entry.backend]}
                      </Tag>
                    </div>
                  )}
                  <Text
                    style={{
                      color: entry.type === 'user' ? '#fff' : 'inherit',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {displayContent}
                  </Text>

                  {/* Show commands if present */}
                  {entry.commands && entry.commands.length > 0 && !isReactChatMode && (
                    <div style={{ marginTop: 8 }}>
                      <Collapse
                        size="small"
                        ghost
                        items={[
                          {
                            key: '1',
                            label: (
                              <Space>
                                <CodeOutlined />
                                <Text style={{ fontSize: 12 }}>
                                  {entry.commands.length} {t('recorder:ai.commands') || '执行命令'}
                                </Text>
                              </Space>
                            ),
                            children: (
                              <div>
                                {entry.commands.map((cmd, i) => (
                                  <div
                                    key={i}
                                    style={{
                                      background: isDarkTheme ? '#1e293b' : '#f5f5f5',
                                      padding: '4px 8px',
                                      borderRadius: 4,
                                      marginBottom: 4,
                                      fontFamily: 'monospace',
                                      fontSize: 12,
                                      border: isDarkTheme ? '1px solid #334155' : 'none',
                                    }}
                                  >
                                    <Space>
                                      <Tag color="blue">{cmd.tool}</Tag>
                                      <Text code style={{ fontSize: 11 }}>
                                        {JSON.stringify(cmd.params)}
                                      </Text>
                                      <Button
                                        type="text"
                                        size="small"
                                        icon={<CopyOutlined />}
                                        onClick={() => handleCopyCommand(cmd)}
                                      />
                                    </Space>
                                  </div>
                                ))}
                                <Button
                                  type="primary"
                                  size="small"
                                  icon={<PlayCircleOutlined />}
                                  onClick={() => {
                                    void handleExecuteCommands(entry.commands!);
                                  }}
                                  style={{ marginTop: 8 }}
                                >
                                  {t('recorder:ai.execute') || '执行命令'}
                                </Button>
                              </div>
                            ),
                          },
                        ]}
                      />
                    </div>
                  )}

                  {/* Show result if present */}
                  {entry.result && (
                    <div style={{ marginTop: 8 }}>
                      {isReactChatMode ? (
                        <div style={{ marginTop: 8 }}>
                          {entry.commands && entry.commands.length > 0 && (
                            <div style={{ marginBottom: 8 }}>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                已执行: {entry.commands.map((cmd) => cmd.tool).join(' / ')}
                              </Text>
                            </div>
                          )}
                          {(entry.result.execution || entry.result.observation || entry.result.exportArtifacts) && (
                            <div
                              style={{
                                marginBottom: 8,
                                padding: '8px 10px',
                                borderRadius: 8,
                                background: isDarkTheme ? '#111827' : '#f8fafc',
                                border: isDarkTheme ? '1px solid #334155' : '1px solid #e2e8f0',
                                fontSize: 12,
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                <div>
                                  <div>
                                    {entry.result.execution?.success === false ? '浏览器执行失败' : '浏览器执行详情已生成'}
                                  </div>
                                  <div style={{ marginTop: 2, color: isDarkTheme ? '#94a3b8' : '#64748b' }}>
                                    {entry.commands?.length ? `命令数 ${entry.commands.length}` : '已隐藏详细执行内容，请按需查看详情'}
                                  </div>
                                </div>
                                <Space size={4} wrap>
                                  {entry.sessionId ? (
                                    <>
                                      <Button
                                        size="small"
                                        icon={<EyeOutlined />}
                                        onClick={() => navigate(buildRecorderDebugDetailPath(entry.sessionId!))}
                                      >
                                        查看详情
                                      </Button>
                                      <Button
                                        size="small"
                                        type="link"
                                        icon={<LinkOutlined />}
                                        onClick={() => window.open(buildRecorderDebugDetailPath(entry.sessionId!), '_blank', 'noopener,noreferrer')}
                                      >
                                        打开链接
                                      </Button>
                                    </>
                                  ) : null}
                                </Space>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <Collapse
                          size="small"
                          ghost
                          items={[
                            {
                              key: 'result',
                              label: (
                                <Space>
                                  {entry.result.status === 'error' ? (
                                    <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                                  ) : (
                                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                                  )}
                                  <Text style={{ fontSize: 12 }}>
                                    {entry.result.status === 'error'
                                      ? (entry.result.message || '执行失败')
                                      : (t('recorder:ai.result') || '执行结果')}
                                  </Text>
                                </Space>
                              ),
                              children: (
                                <div
                                  style={{
                                    padding: '8px 10px',
                                    borderRadius: 8,
                                    background: isDarkTheme ? '#111827' : '#f8fafc',
                                    border: isDarkTheme ? '1px solid #334155' : '1px solid #e2e8f0',
                                    fontSize: 12,
                                  }}
                                >
                                  <div style={{ marginBottom: 6 }}>
                                    已隐藏详细执行内容，请按需查看详情。
                                  </div>
                                  <Space size={4} wrap>
                                    {entry.sessionId ? (
                                      <>
                                        <Button
                                          size="small"
                                          icon={<EyeOutlined />}
                                          onClick={() => navigate(buildRecorderDebugDetailPath(entry.sessionId!))}
                                        >
                                          查看详情
                                        </Button>
                                        <Button
                                          size="small"
                                          type="link"
                                          icon={<LinkOutlined />}
                                          onClick={() => window.open(buildRecorderDebugDetailPath(entry.sessionId!), '_blank', 'noopener,noreferrer')}
                                        >
                                          打开链接
                                        </Button>
                                      </>
                                    ) : null}
                                  </Space>
                                </div>
                              ),
                            },
                          ]}
                        />
                      )}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 10, color: isDarkTheme ? '#64748b' : '#999', marginTop: 2 }}>
                  {entry.timestamp.toLocaleTimeString()}
                </div>
              </div>
                );
              })()
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area - 3列2行布局 */}
        <div style={{ marginTop: 0, flexShrink: 0 }}>
          {takeoverState.mode !== 'idle' && (
            <div
              style={{
                marginBottom: 8,
                padding: '10px 12px',
                borderRadius: 10,
                background: isDarkTheme ? '#111827' : '#fff7e6',
                border: isDarkTheme ? '1px solid #374151' : '1px solid #ffe7ba',
              }}
            >
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Space wrap>
                  <Tag color={
                    takeoverState.mode === 'required'
                      ? 'warning'
                      : takeoverState.mode === 'recording'
                        ? 'processing'
                        : takeoverState.mode === 'reconciling'
                          ? 'blue'
                          : takeoverState.mode === 'ready_to_resume'
                            ? 'success'
                            : 'purple'
                  }>
                    {{
                      required: '等待人工接管',
                      recording: '人工接管中',
                      reconciling: '生成恢复方案中',
                      ready_to_resume: '可继续执行',
                      resuming: '恢复执行中',
                    }[takeoverState.mode] || '接管处理中'}
                  </Tag>
                  {takeoverState.strategy ? (
                    <Tag color="processing">{takeoverState.strategy}</Tag>
                  ) : null}
                  {takeoverState.patchSteps.length > 0 ? (
                    <Tag>{`patchSteps: ${takeoverState.patchSteps.length}`}</Tag>
                  ) : null}
                </Space>
                <Text style={{ whiteSpace: 'pre-wrap' }}>
                  {takeoverState.explanation
                    || takeoverState.reason
                    || '检测到执行失败，建议进入人工接管完成补录后再恢复执行。'}
                </Text>
                {takeoverState.observation?.currentPageUrl ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    当前页面: {takeoverState.observation.currentPageUrl}
                  </Text>
                ) : null}
                {(takeoverState.patchSteps.length > 0 || takeoverState.resumeCommands.length > 0) ? (
                  <Collapse
                    size="small"
                    ghost
                    items={[
                      ...(takeoverState.patchSteps.length > 0 ? [{
                        key: 'patch-steps',
                        label: `补录步骤 (${takeoverState.patchSteps.length})`,
                        children: (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {takeoverState.patchSteps.map((step, index) => (
                              <div
                                key={`${step.id || step.action}-${index}`}
                                style={{
                                  padding: '6px 8px',
                                  borderRadius: 8,
                                  background: isDarkTheme ? '#0b1220' : '#fff',
                                  border: isDarkTheme ? '1px solid #374151' : '1px solid #f0f0f0',
                                  fontSize: 12,
                                }}
                              >
                                {describePatchStep(step)}
                              </div>
                            ))}
                          </div>
                        ),
                      }] : []),
                      ...(takeoverState.resumeCommands.length > 0 ? [{
                        key: 'resume-commands',
                        label: `恢复命令 (${takeoverState.resumeCommands.length})`,
                        children: (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {takeoverState.resumeCommands.map((command, index) => (
                              <div
                                key={`${command.tool}-${index}`}
                                style={{
                                  padding: '6px 8px',
                                  borderRadius: 8,
                                  background: isDarkTheme ? '#0b1220' : '#fff',
                                  border: isDarkTheme ? '1px solid #374151' : '1px solid #f0f0f0',
                                  fontSize: 12,
                                }}
                              >
                                {describeTakeoverCommand(command)}
                              </div>
                            ))}
                          </div>
                        ),
                      }] : []),
                    ]}
                  />
                ) : null}
                <Space wrap>
                  {takeoverState.mode === 'required' ? (
                    <Button type="primary" onClick={() => { void handleStartTakeover(); }}>
                      人工接管
                    </Button>
                  ) : null}
                  {takeoverState.mode === 'recording' ? (
                    <Button type="primary" onClick={() => { void handleStopTakeover(); }}>
                      结束接管
                    </Button>
                  ) : null}
                  {takeoverState.mode === 'ready_to_resume' ? (
                    <Button
                      type="primary"
                      disabled={takeoverState.resumeCommands.length === 0}
                      onClick={() => { void handleResumeAfterTakeover(); }}
                    >
                      继续执行
                    </Button>
                  ) : null}
                  {takeoverState.mode !== 'recording' && takeoverState.mode !== 'reconciling' && takeoverState.mode !== 'resuming' ? (
                    <Button onClick={resetTakeoverState}>
                      关闭
                    </Button>
                  ) : null}
                </Space>
              </Space>
            </div>
          )}
          {isReactChatMode && latestReactSuggestedParameters && latestReactSuggestedParameters.length > 0 && (
            <div
              style={{
                marginBottom: 8,
                padding: '8px 10px',
                borderRadius: 10,
                background: isDarkTheme ? '#0f172a' : '#f8fafc',
                border: isDarkTheme ? '1px solid #334155' : '1px solid #e2e8f0',
              }}
            >
              <div style={{ marginBottom: 6 }}>
                <Text strong style={{ fontSize: 12 }}>快速补充参数</Text>
              </div>
              <Space size={[6, 6]} wrap>
                {latestReactSuggestedParameters.map((param) => (
                  <Tooltip key={param.name} title={`${param.label}${param.reason ? `: ${param.reason}` : ''}`}>
                    <Tag
                      color={param.required ? 'processing' : 'default'}
                      onClick={() => handleInsertSuggestedParameter(param.name)}
                      style={{ cursor: 'pointer', marginInlineEnd: 0 }}
                    >
                      {param.name}
                    </Tag>
                  </Tooltip>
                ))}
              </Space>
            </div>
          )}
          {!isReactChatMode && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {predefinedCommands.map(c => (
                <Radio.Button
                  key={c.value}
                  value={c.value}
                  onClick={() => setSelectedCommand(c.value)}
                  style={{
                    borderRadius: 16,
                    padding: '4px 16px',
                    height: 32,
                    lineHeight: '24px',
                    border: selectedCommand === c.value ? '2px solid #6366f1' : (isDarkTheme ? '1px solid #334155' : '1px solid #d9d9d9'),
                    background: selectedCommand === c.value 
                      ? (isDarkTheme ? '#312e81' : '#eef2ff') 
                      : (isDarkTheme ? 'var(--bg-primary)' : '#fff'),
                    color: selectedCommand === c.value 
                      ? (isDarkTheme ? '#e0e7ff' : '#6366f1') 
                      : (isDarkTheme ? '#94a3b8' : '#666'),
                    fontWeight: selectedCommand === c.value ? 500 : 400,
                    transition: 'all 0.2s ease',
                    cursor: 'pointer',
                  }}
                >
                  {c.label}
                </Radio.Button>
              ))}
            </div>
          )}

          {/* Row 2: 参数输入 | 按钮区 | 参数可替换 */}
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 10 }}>
            {/* 参数输入 */}
            <TextArea
              ref={inputRef}
              value={paramInput}
              onChange={(e) => handleParamInputChange(e.target.value)}
              onCompositionStart={() => {
                isComposingRef.current = true;
              }}
              onCompositionEnd={() => {
                isComposingRef.current = false;
              }}
              placeholder={
                isReactChatMode
                  ? '直接描述你的目标，或询问页面结构、需要填写的参数'
                  : (predefinedCommands.find(c => c.value === selectedCommand)?.placeholder || '输入参数')
              }
              autoSize={isReactChatMode ? false : { minRows: 2, maxRows: 4 }}
              onKeyDown={handleInputKeyDown}
              disabled={isLoading || isTranscribing}
              style={{
                flex: 1,
                minWidth: 180,
                height: isReactChatMode ? actionColumnHeight : undefined,
                borderRadius: 20,
                padding: isReactChatMode ? '10px 14px' : '8px 14px',
                background: isDarkTheme ? '#0f172a' : '#ffffff',
                borderColor: isDarkTheme ? '#475569' : '#cbd5e1',
                color: 'var(--text-primary)',
                resize: 'none',
              }}
            />
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
                alignItems: 'stretch',
                gap: 8,
                paddingTop: 0,
                height: isReactChatMode ? actionColumnHeight : undefined,
              }}
            >
              <Button
                icon={<SendOutlined />}
                onClick={() => {
                  void handleSend();
                }}
                loading={isLoading}
                style={{
                  ...primaryActionButtonStyle,
                  ...(!canSend ? mutedActionButtonStyle : {}),
                }}
              >
                {t('common:send')}
              </Button>
              <Button
                icon={<AudioOutlined />}
                onClick={() => {
                  void handleSpeechToggle();
                }}
                disabled={!canUseSpeech && !isListening}
                loading={isTranscribing}
                type={isListening ? 'primary' : 'default'}
                style={{
                  ...secondaryActionButtonStyle,
                  ...(canUseSpeech || isListening ? {} : mutedActionButtonStyle),
                }}
                title={speechSupported ? (isListening ? '停止录音并转写' : '语音输入') : '当前浏览器不支持录音'}
              >
                {isListening ? '录音中' : (isTranscribing ? '转写中' : '语音')}
              </Button>
              {isReactChatMode ? (
                <Button
                  size="middle"
                  icon={<SaveOutlined />}
                  onClick={() => {
                    void handleExportTemplateFromRecorder();
                  }}
                  loading={exportTemplateLoading}
                  style={{
                    ...secondaryActionButtonStyle,
                    ...(!canExport ? mutedActionButtonStyle : {}),
                  }}
                >
                  导出
                </Button>
              ) : (
                <Checkbox
                  checked={isReplaceable}
                  onChange={(e) => setIsReplaceable(e.target.checked)}
                  disabled={!paramInput.trim()}
                  style={{ marginLeft: 4 }}
                >
                  <Tooltip title="勾选后，此参数在生成模版时会被标记为可替换参数">
                    <Text style={{ fontSize: 12, color: isReplaceable ? '#6366f1' : '#999' }}>可替换</Text>
                  </Tooltip>
                </Checkbox>
              )}
            </div>
          </div>
        </div>

        {/* Quick action buttons */}
        {!isReactChatMode && (
        <div style={{ marginTop: 2 }}>

          {/* Direct execution commands - click to execute immediately */}
          <div style={{ marginBottom: 8 }}>
            <Space wrap size="small">
              <Button
                size="small"
                icon={<CameraOutlined />}
                onClick={() => {
                  void handleQuickAction('screenshot');
                }}
                loading={isLoading && executeCommandMutation.isLoading}
                title="截取当前页面图片"
              >
                {t('recorder:ai.quick.screenshot') || '截图'}
              </Button>

              <Button
                size="small"
                icon={<EyeOutlined />}
                onClick={() => {
                  void handleQuickAction('snapshot');
                }}
                loading={isLoading && executeCommandMutation.isLoading}
                title="获取页面结构快照"
              >
                {t('recorder:ai.quick.snapshot') || '快照'}
              </Button>

              <Button
                size="small"
                icon={<FileSearchOutlined />}
                onClick={() => {
                  void handleQuickAction('read_page');
                }}
                loading={isLoading && executeCommandMutation.isLoading}
                title="读取页面内容"
              >
                {t('recorder:ai.quick.readPage') || '读取页面'}
              </Button>

              <Button
                size="small"
                icon={<CodeOutlined />}
                onClick={() => {
                  void handleQuickAction('get_text');
                }}
                loading={isLoading && executeCommandMutation.isLoading}
                title="获取页面所有文本"
              >
                {t('recorder:ai.quick.getText') || '获取文本'}
              </Button>

              <Button
                size="small"
                icon={<ArrowDownOutlined />}
                onClick={() => {
                  void handleQuickAction('scroll', { direction: 'down' });
                }}
                loading={isLoading && executeCommandMutation.isLoading}
                title="向下滚动页面"
              >
                {t('recorder:ai.quick.scrollDown') || '向下'}
              </Button>

              <Button
                size="small"
                icon={<CloudUploadOutlined />}
                onClick={() => {
                  void handleQuickAction('scroll', { direction: 'top' });
                }}
                loading={isLoading && executeCommandMutation.isLoading}
                title="滚动到顶部"
              >
                {t('recorder:ai.quick.scrollTop') || '顶部'}
              </Button>

              <Button
                size="small"
                icon={<ClockCircleOutlined />}
                onClick={() => {
                  void handleQuickAction('wait', { duration: waitDuration * 1000 });
                }}
                loading={isLoading && executeCommandMutation.isLoading}
                title={`等待 ${waitDuration} 秒`}
              >
                {t('recorder:ai.quick.wait') || '等待'} {waitDuration}s
              </Button>
            </Space>
          </div>
        </div>
        )}

        {/* Clear history button */}
        {history.length > 0 && (
          <Button
            type="text"
            icon={<DeleteOutlined />}
            onClick={() => {
              void handleClearHistory();
            }}
            style={{ color: '#999', marginTop: 2 }}
          >
            {t('recorder:ai.clearHistory') || '清空记录'}
          </Button>
        )}

        {/* Template section */}
        {!isReactChatMode && (
          <>
            <Divider style={{ margin: '12px 0' }} />
            <Collapse
              size="small"
              activeKey={isTemplatePanelExpanded ? ['template'] : []}
              onChange={(keys) => setIsTemplatePanelExpanded(Array.isArray(keys) ? keys.includes('template') : keys === 'template')}
              items={[
                {
                  key: 'template',
                  label: (
                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                      <Space>
                        <Text strong style={{ fontSize: 13 }}>
                          <FileAddOutlined style={{ marginRight: 4 }} />
                          模版录制
                        </Text>
                        <Tag color={templateSteps.length > 0 ? 'processing' : 'default'}>
                          {templateSteps.length} 步
                        </Tag>
                        {savedTemplateId && (
                          <Tag color="success">已保存</Tag>
                        )}
                      </Space>
                    </Space>
                  ),
                  children: (
                <div style={{ background: isDarkTheme ? 'var(--bg-secondary)' : '#f6f8fa', borderRadius: 8, padding: 12, border: isDarkTheme ? '1px solid #334155' : 'none' }}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Space>
                      <Text strong style={{ fontSize: 13 }}>
                        <FileAddOutlined style={{ marginRight: 4 }} />
                        模版录制
                      </Text>
                    </Space>
                    <Space>
                      <Button
                        size="small"
                        icon={<RobotOutlined />}
                        onClick={handleAutoExtractTemplate}
                        disabled={history.length === 0}
                        title="从历史记录中自动提取确定性命令"
                      >
                        自动提取
                      </Button>
                      <Button
                        type="primary"
                        size="small"
                        icon={<CodeOutlined />}
                        onClick={handleCompileTemplate}
                        disabled={templateSteps.length === 0}
                      >
                        编译模版
                      </Button>
                      <Button
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={handleClearTemplate}
                        disabled={templateSteps.length === 0}
                      >
                        清空
                      </Button>
                    </Space>
                  </Space>

                  {savedTemplateId && (
                    <Space style={{ marginTop: 12, width: '100%' }}>
                      <Button
                        type="primary"
                        size="small"
                        icon={<BugOutlined />}
                        onClick={() => {
                          void handleTestSavedTemplate();
                        }}
                        loading={testLoading}
                      >
                        测试模版
                      </Button>
                      <Button
                        size="small"
                        icon={<ReloadOutlined />}
                        onClick={() => {
                          void handleResetWorkers();
                        }}
                        loading={resetLoading}
                      >
                        重置 Worker
                      </Button>
                    </Space>
                  )}

                  {templateSteps.length > 0 && (
                    <List
                      size="small"
                      style={{
                        marginTop: 12,
                        background: isDarkTheme ? 'var(--bg-primary)' : '#fff',
                        borderRadius: 4,
                        border: isDarkTheme ? '1px solid #334155' : '1px solid #e8e8e8'
                      }}
                      dataSource={templateSteps}
                      renderItem={(step, index) => (
                        <List.Item
                          actions={[
                            <Button
                              key="remove"
                              type="text"
                              size="small"
                              danger
                              icon={<DeleteOutlined />}
                              onClick={() => handleRemoveTemplateStep(step.id)}
                            />,
                          ]}
                        >
                          <Space>
                            <Tag color="blue">{index + 1}</Tag>
                            <Tag>{step.tool}</Tag>
                            <Text style={{ fontSize: 11 }}>{step.description}</Text>
                          </Space>
                        </List.Item>
                      )}
                    />
                  )}

                  {templateSteps.length === 0 && (
                    <div style={{ marginTop: 12, textAlign: 'center', color: isDarkTheme ? '#64748b' : '#999', fontSize: 12 }}>
                      执行命令后，点击"添加到模版"按钮将确定性命令添加到模版中
                    </div>
                  )}
                </div>
                  ),
                },
              ]}
            />
          </>
        )}

        {/* Template save modal */}
        <Modal
          title="保存模版"
          open={showTemplateModal}
          onOk={() => {
            void handleConfirmSaveTemplate();
          }}
          onCancel={() => setShowTemplateModal(false)}
          okText="保存"
          cancelText="取消"
          width={600}
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text>模版名称：</Text>
            <Input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder={`模版 ${new Date().toLocaleString()}`}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              包含 {templateSteps.length} 个步骤
            </Text>

            {/* Parameter editing section */}
            {Object.keys(extractParameters(templateSteps)).length > 0 && (
              <>
                <Divider style={{ margin: '12px 0' }} />
                <Text strong>可替换参数：</Text>
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
                  修改参数名称使其更具语义化（如将 step2_value 改为 query），取消勾选可排除不需要替换的参数
                </Text>
                <List
                  size="small"
                  bordered
                  dataSource={Object.entries(extractParameters(templateSteps))}
                  renderItem={([originalName, schema]) => (
                    <List.Item style={{ padding: '8px 12px' }}>
                      <Space direction="vertical" style={{ width: '100%' }} size={4}>
                        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                          <Switch
                            size="small"
                            checked={paramEnabled[originalName] !== false}
                            onChange={(checked) => {
                              setParamEnabled(prev => ({ ...prev, [originalName]: checked }));
                            }}
                          />
                          <Text code style={{ fontSize: 11 }}>{originalName}</Text>
                          <Text type="secondary" style={{ fontSize: 11 }}>→</Text>
                          <Input
                            size="small"
                            value={paramNames[originalName] || originalName}
                            onChange={(e) => {
                              setParamNames(prev => ({ ...prev, [originalName]: e.target.value }));
                            }}
                            style={{ width: 120 }}
                            placeholder="参数名"
                          />
                        </Space>
                        <Space>
                          <Tag color="blue">{schema.type}</Tag>
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            默认值: {String(schema.default || '-')}
                          </Text>
                        </Space>
                      </Space>
                    </List.Item>
                  )}
                />
              </>
            )}
          </Space>
        </Modal>

        {/* Compiled script modal */}
        <Modal
          title="编译后的脚本"
          open={showScriptModal}
          onCancel={() => setShowScriptModal(false)}
          width={700}
          footer={[
            <Button key="copy" icon={<CopyOutlined />} onClick={handleCopyScript}>
              复制
            </Button>,
            <Button key="download" icon={<DownloadOutlined />} onClick={handleDownloadScript}>
              下载
            </Button>,
            <Button key="save" type="primary" icon={<SaveOutlined />} onClick={() => {
              void handleSaveCompiledTemplate();
            }}>
              保存模版
            </Button>,
          ]}
        >
          <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
            <Text>模版名称：</Text>
            <Input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder={`编译模版 ${new Date().toLocaleString()}`}
              style={{ marginBottom: 8 }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              包含 {templateSteps.length} 个步骤，可修改参数后保存
            </Text>
          </Space>
          <pre
            style={{
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              padding: 16,
              borderRadius: 8,
              maxHeight: 400,
              overflow: 'auto',
              fontSize: 12,
            }}
          >
            {compiledScript}
          </pre>
        </Modal>
      </div>
      ) : (
        // Manual Mode Content
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Connection Controls */}
          <Space>
            {!isConnected ? (
              <Button
                type="primary"
                icon={<ApiOutlined />}
                onClick={onConnect}
                loading={recorderStatus === 'connecting'}
              >
                {t('recorder:connect') || '连接'}
              </Button>
            ) : (
              <Button icon={<DisconnectOutlined />} onClick={onDisconnect} danger>
                {t('recorder:disconnect') || '断开'}
              </Button>
            )}
          </Space>

          {/* URL Input */}
          <Input
            placeholder={t('recorder:urlPlaceholder') || '输入网址开始录制'}
            prefix={<LinkOutlined />}
            value={recordUrl}
            onChange={(e) => setRecordUrl(e.target.value)}
            disabled={!isConnected || isRecording}
            onPressEnter={handleManualStart}
            size="large"
          />

          {/* Recording Controls */}
          <Space wrap>
            <Button
              type="primary"
              size="large"
              icon={<PlayCircleOutlined />}
              onClick={handleManualStart}
              disabled={!isConnected || isRecording || isPaused}
            >
              {t('recorder:start') || '开始录制'}
            </Button>

            {isRecording && (
              <Button
                size="large"
                icon={<PauseCircleOutlined />}
                onClick={onPauseRecording}
              >
                {t('recorder:pause') || '暂停'}
              </Button>
            )}

            {isPaused && (
              <Button
                type="primary"
                size="large"
                icon={<PlayCircleOutlined />}
                onClick={onResumeRecording}
              >
                {t('recorder:resume') || '继续'}
              </Button>
            )}

            {(isRecording || isPaused) && (
              <Button
                size="large"
                icon={<StopOutlined />}
                onClick={onStopRecording}
                danger
              >
                {t('recorder:stop') || '停止'}
              </Button>
            )}
          </Space>

          {/* Recorded Script Preview */}
          {recordedScript && (
            <div style={{ marginTop: 16 }}>
              <Text strong style={{ fontSize: 13 }}>
                {t('recorder:script') || '录制脚本'}：
              </Text>
              <pre
                style={{
                  background: 'var(--bg-secondary)',
                  padding: 12,
                  borderRadius: 8,
                  maxHeight: 200,
                  overflow: 'auto',
                  fontSize: 11,
                  marginTop: 8,
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                }}
              >
                {recordedScript}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AIControls;
