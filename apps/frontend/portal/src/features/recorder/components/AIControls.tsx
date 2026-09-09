import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { message } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { useTranslation } from 'react-i18next';
import { useMutation } from 'react-query';
import { apiClient } from '@/shared/api/http/client';
import BranchGateModal from '@/features/recorder/components/BranchGateModal';
import { useAuthStore } from '@/shared/store/authStore';
import { usePreferencesStore } from '@/shared/store/preferencesStore';
import type {
  AICommandResponse,
  AIControlsProps,
  BrowserCommandExecutionResponse,
  BrowserCommandExecutionResult,
  BrowserInitResponse,
  CommandHistoryEntry,
  CommandHistoryResult,
  ExecutionBackend,
  MCPCommand,
  ParseBrowserCommandPayload,
  RecorderDebugChatResponse,
  RecorderDebugObservation,
} from './AIControls.types';
import {
  PREDEFINED_COMMANDS,
  buildCompactAiReply,
  createIdleTakeoverState,
  createRuntimeSessionId,
  getFailedExecutionMessage,
  getPrimaryExecutionResult,
  isExecutionFailed,
  pickFailedCommand,
  resolveErrorMessage,
} from './AIControls.utils';
import {
  CompiledScriptModal,
  RollbackConfirmationModal,
  TemplateSaveModal,
} from './TemplateExportModals';
import { ManualControls } from './ManualControls';
import { QuickActionsBar } from './QuickActionsBar';
import { TemplateRecordingSection } from './TemplateRecordingSection';
import { useRecorderTemplate } from '../hooks/useRecorderTemplate';
import { useRecorderTakeover } from '../hooks/useRecorderTakeover';
import { useRecorderRollback } from '../hooks/useRecorderRollback';
import { useRecorderSpeech } from '../hooks/useRecorderSpeech';
import { AIControlsHistoryList } from './AIControlsHistoryList';
import { AIControlsInputArea } from './AIControlsInputArea';
import { AIControlsConfigBar } from './AIControlsConfigBar';

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

  const predefinedCommands = PREDEFINED_COMMANDS;

  const [selectedCommand, setSelectedCommand] = useState<string>('navigate');
  const [paramInput, setParamInput] = useState('');
  const [isReplaceable, setIsReplaceable] = useState(true);
  const [history, setHistory] = useState<CommandHistoryEntry[]>([]);
  const [isBrowserReady, setIsBrowserReady] = useState(false);
  const [waitDuration, setWaitDuration] = useState(0.5);
  const [autoAppendScreenshots, setAutoAppendScreenshots] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<TextAreaRef>(null);
  const isComposingRef = useRef(false);
  const suppressInputChangeRef = useRef(false);

  // Manual recording URL input
  const [recordUrl, setRecordUrl] = useState('https://');

  // Recording mode: true = AI mode, false = Manual mode
  const [isAIMode, setIsAIMode] = useState(true);
  const [executionBackend, setExecutionBackend] = useState<ExecutionBackend>('cli');
  const [currentPageUrl, setCurrentPageUrl] = useState<string>();
  const [isReactChatMode, setIsReactChatMode] = useState(true);
  const [recorderDebugSessionId, setRecorderDebugSessionId] = useState<string>();
  const [recorderDebugRuntimeSessionId, setRecorderDebugRuntimeSessionId] = useState<string>();
  const [browserRuntimeSessionId, setBrowserRuntimeSessionId] =
    useState<string>(createRuntimeSessionId);
  const latestBrowserSessionRef = useRef<{
    browserRuntimeSessionId?: string;
    recorderDebugRuntimeSessionId?: string;
    executionBackend: ExecutionBackend;
  }>({
    browserRuntimeSessionId: undefined,
    recorderDebugRuntimeSessionId: undefined,
    executionBackend: 'cli',
  });

  const {
    rollbackLoading,
    rollbackConfirmation,
    setRollbackConfirmation,
    handleRollbackLastStep,
    handleConfirmRollback,
  } = useRecorderRollback({
    recorderDebugSessionId,
    setHistory,
    setCurrentPageUrl,
  });

  const {
    isListening,
    isTranscribing,
    speechSupported,
    handleSpeechToggle,
  } = useRecorderSpeech({
    setParamInput,
    inputRef,
  });

  const {
    takeoverState,
    setTakeoverState,
    resetTakeoverState,
    markTakeoverRequired,
    handleStartTakeover,
    handleStopTakeover,
    handleResumeAfterTakeover,
  } = useRecorderTakeover({
    executionBackend,
    recorderDebugSessionId,
    setHistory,
    setCurrentPageUrl,
    onBrowserEndpoints,
    onTakeoverStateChange,
  });

  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  useEffect(() => {
    latestBrowserSessionRef.current = {
      browserRuntimeSessionId,
      recorderDebugRuntimeSessionId,
      executionBackend,
    };
  }, [browserRuntimeSessionId, recorderDebugRuntimeSessionId, executionBackend]);

  const cleanupBrowserSessions = async (
    sessions: Array<{ runtimeSessionId?: string; backend: ExecutionBackend }>
  ) => {
    const uniqueSessions = new Map<
      string,
      { runtimeSessionId: string; backend: ExecutionBackend }
    >();

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
          await apiClient.post('/browser-runtime/reset', {
            runtimeSessionId,
            backend,
          });
        } catch (error) {
          if (import.meta.env.DEV) {
            console.warn(`Failed to cleanup browser session ${runtimeSessionId}:`, error);
          }
        }
      })
    );
  };

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

  const getScreenshotModeLabel = () => (autoAppendScreenshots ? '含自动截图' : '不含自动截图');



  const isStaleRecorderRuntimeFailure = (
    execution?: BrowserCommandExecutionResponse,
    observation?: RecorderDebugObservation
  ): boolean => {
    const failedResults = execution?.results?.filter((item) => item.status === 'error') || [];
    if (!failedResults.length) {
      return false;
    }
    const snapshotOnlyFailure = failedResults.every((item) =>
      String(item.message || '').includes('snapshot')
    );
    if (!snapshotOnlyFailure) {
      return false;
    }
    const hasObservationSignals = Boolean(
      observation?.text ||
        observation?.inputs?.length ||
        observation?.buttons?.length ||
        observation?.headings?.length ||
        observation?.links?.length ||
        observation?.suggestedParameters?.length
    );
    return !hasObservationSignals;
  };

  // Execute MCP commands directly
  const executeCommandMutation = useMutation(
    async (commands: MCPCommand[]): Promise<BrowserCommandExecutionResponse> => {
      const commandsWithWait = appendDefaultWaitCommands(commands);
      if (import.meta.env.DEV) {
        console.log('[AIControls] Executing commands:', commands, 'backend:', executionBackend);
      }
      return apiClient.post('/browser-runtime/execute', {
        commands: commandsWithWait,
        backend: executionBackend,
        runtimeSessionId: browserRuntimeSessionId,
      });
    },
    {
      onSuccess: (data, commands) => {
        const executionFailed = isExecutionFailed(data);
        const resultMessage = getFailedExecutionMessage(data);
        if (import.meta.env.DEV) {
          console.log('[AIControls] Commands executed:', data);
        }
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
        if (import.meta.env.DEV) {
          console.error('[AIControls] Command execution failed:', error);
        }
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
      if (import.meta.env.DEV) {
        console.log(
          '[AIControls] Parsing command:',
          userInput,
          'commandType:',
          commandType,
          'currentPageUrl:',
          currentPageUrl
        );
      }
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
        if (import.meta.env.DEV) {
          console.log('[AIControls] Parse result:', data);
        }
        if (data.success && data.commands.length > 0) {
          // Get replaceable info from the last user entry
          setHistory((prev) => {
            const lastUserEntry = [...prev].reverse().find((e) => e.type === 'user');
            const replaceableInfo = lastUserEntry
              ? {
                  replaceable: lastUserEntry.replaceable,
                  commandType: lastUserEntry.commandType,
                  rawParam: lastUserEntry.rawParam,
                }
              : {};

            return [
              ...prev,
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
              content:
                data.explanation ||
                t('recorder:ai.parseFailed') ||
                '无法解析命令，请尝试其他表达方式',
              timestamp: new Date(),
              backend: executionBackend,
            },
          ]);
        }
      },
      onError: (error: unknown) => {
        if (import.meta.env.DEV) {
          console.error('[AIControls] Parse command failed:', error);
        }
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
      if (import.meta.env.DEV) {
        console.log('[AIControls] Initializing browser with backend:', executionBackend);
      }
      return apiClient.post('/browser-runtime/init', {
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
        onBrowserReady?.(true, executionBackend);
        if (data.endpoints) {
          onBrowserEndpoints?.(data.endpoints);
        }
      },
      onError: (error: unknown) => {
        if (import.meta.env.DEV) {
          console.error('[AIControls] Browser init failed:', error);
        }
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
    const commandConfig = predefinedCommands.find((c) => c.value === selectedCommand);
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

    // Add progressive parsing status message
    const parsingId = 'parsing-' + Date.now();
    setHistory((prev) => [
      ...prev,
      {
        id: parsingId,
        type: 'system',
        content: '⏳ 正在解析命令与生成动作...',
        timestamp: new Date(),
        backend: executionBackend,
      },
    ]);

    const progressTimer1 = setTimeout(() => {
      setHistory((prev) =>
        prev.map((h) =>
          h.id === parsingId ? { ...h, content: '⚡ 指令已解析，正在驱动浏览器执行动作...' } : h
        )
      );
    }, 1800);

    const progressTimer2 = setTimeout(() => {
      setHistory((prev) =>
        prev.map((h) =>
          h.id === parsingId
            ? { ...h, content: '🔍 页面已响应，正在同步新页面状态与元素定位...' }
            : h
        )
      );
    }, 4500);

    const progressTimer3 = setTimeout(() => {
      setHistory((prev) =>
        prev.map((h) =>
          h.id === parsingId
            ? { ...h, content: '🧠 正在执行智能对齐与定位器收敛，请稍候...' }
            : h
        )
      );
    }, 10000);

    const clearProgressTimers = () => {
      clearTimeout(progressTimer1);
      clearTimeout(progressTimer2);
      clearTimeout(progressTimer3);
    };

    if (isReactChatMode) {
      try {
        const activeRuntimeSessionId = browserRuntimeSessionId || recorderDebugRuntimeSessionId;
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
          loopDraft: data.loopDraft,
          loopState: data.loopState,
          outcomeVersion: data.outcomeVersion,
          outcome: data.outcome,
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
        if (
          data.execution &&
          isExecutionFailed(data.execution as BrowserCommandExecutionResponse)
        ) {
          if (
            isStaleRecorderRuntimeFailure(
              data.execution as BrowserCommandExecutionResponse,
              data.observation
            )
          ) {
            setIsBrowserReady(false);
            onBrowserReady?.(false);
            setRecorderDebugRuntimeSessionId(undefined);
            setCurrentPageUrl(undefined);
            void message.warning(
              '浏览器录制会话已失效，下一次发送命令时会自动重新初始化浏览器会话'
            );
          }
          setTakeoverState(createIdleTakeoverState());
        } else {
          setTakeoverState(createIdleTakeoverState());
        }
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
      } finally {
        clearProgressTimers();
      }
      return;
    }
    parseCommandMutation.mutate(
      { userInput: userMessage, commandType: selectedCommand },
      {
        onSettled: () => {
          clearProgressTimers();
          setHistory((prev) => prev.filter((h) => h.id !== parsingId));
        },
      }
    );
  };

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== 'Enter' || e.shiftKey) {
        return;
      }

      if (e.nativeEvent.isComposing || isComposingRef.current) {
        return;
      }

      e.preventDefault();
      void handleSend();
    },
    [handleSend]
  );

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

    const handleCopyCommand = (command: MCPCommand) => {
    void navigator.clipboard.writeText(JSON.stringify(command, null, 2));
    void message.success(t('common:copied'));
  };

  const {
    templateSteps,
    savedTemplateId,
    showTemplateModal,
    setShowTemplateModal,
    showScriptModal,
    setShowScriptModal,
    templateName,
    setTemplateName,
    compiledScript,
    paramNames,
    setParamNames,
    paramEnabled,
    setParamEnabled,
    isTemplatePanelExpanded,
    setIsTemplatePanelExpanded,
    testLoading,
    resetLoading,
    exportTemplateLoading,
    showBranchGateModal,
    setShowBranchGateModal,
    setBranchInsertAfterStepId,
    openBranchGateModal,
    handleConfirmBranchGate,
    handleRemoveTemplateStep,
    handleUpdateTemplateStepPolicy,
    handleClearTemplate,
    handleCompileTemplate,
    handleSaveCompiledTemplate,
    handleConfirmSaveTemplate,
    handleTestSavedTemplate,
    handleResetWorkers,
    handleCopyScript,
    handleDownloadScript,
    handleAutoExtractTemplate,
    handleExportTemplateFromRecorder,
  } = useRecorderTemplate({
    user,
    history,
    setHistory,
    autoAppendScreenshots,
    waitDuration,
    executionBackend,
    isReactChatMode,
    recorderDebugSessionId,
    recorderDebugRuntimeSessionId,
    getScreenshotModeLabel,
    navigate,
  });

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
  const canUseSpeech = speechSupported && !isLoading && !isTranscribing;
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

    const latestReactSuggestedParameters = [...history]
    .reverse()
    .find(
      (entry) =>
        entry.type === 'ai' &&
        Array.isArray(entry.result?.observation?.suggestedParameters) &&
        entry.result.observation.suggestedParameters.length > 0
    )?.result?.observation?.suggestedParameters;

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

  const handleInsertRecorderControlToken = useCallback((token: string) => {
    setParamInput((prev) => {
      const normalizedToken = token.trim();
      if (!normalizedToken) {
        return prev;
      }

      const lines = prev
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => {
          if (normalizedToken.startsWith('[循环对象:')) {
            return !line.startsWith('[循环对象:');
          }
          if (normalizedToken === '[条件分歧]') {
            return line !== '[条件分歧]';
          }
          return line !== normalizedToken;
        });

      return [normalizedToken, ...lines].join('\n');
    });
    window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  }, []);

  const isRecording = recorderStatus === 'recording';
  const isPaused = recorderStatus === 'paused';
  const canSend = Boolean(
    isReactChatMode
      ? paramInput.trim()
      : (
          predefinedCommands.find((c) => c.value === selectedCommand)?.prefix + paramInput.trim()
        ).trim()
  );
  const canExport = Boolean(recorderDebugSessionId && recorderDebugRuntimeSessionId);
  const buildRecorderDebugDetailPath = (sessionId: string) => `/recorder-debug/${sessionId}`;
  const actionColumnHeight = 84;
  const primaryActionButtonStyle = {
    height: 38,
    borderRadius: 12,
    width: 90,
    paddingInline: 12,
    border: isDarkTheme ? '1px solid #7c83ff' : '1px solid #4f46e5',
    color: '#ffffff',
    fontWeight: 600,
    background: isDarkTheme ? '#4f46e5' : '#4f46e5',
    boxShadow: isDarkTheme
      ? '0 6px 16px rgba(79, 70, 229, 0.3)'
      : '0 4px 12px rgba(79, 70, 229, 0.2)',
  } satisfies React.CSSProperties;
  const secondaryActionButtonStyle = {
    height: 38,
    borderRadius: 12,
    width: 90,
    paddingInline: 12,
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
      <AIControlsConfigBar
        isAIMode={isAIMode}
        setIsAIMode={setIsAIMode}
        executionBackend={executionBackend}
        handleExecutionBackendChange={handleExecutionBackendChange}
        backendButtonLabels={backendButtonLabels}
        isReactChatMode={isReactChatMode}
        setIsReactChatMode={setIsReactChatMode}
        waitDuration={waitDuration}
        setWaitDuration={setWaitDuration}
        autoAppendScreenshots={autoAppendScreenshots}
        setAutoAppendScreenshots={setAutoAppendScreenshots}
      />

      {isAIMode ? (
        // AI Mode Content
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* Message history */}
          <AIControlsHistoryList
            history={history}
            isDarkTheme={isDarkTheme}
            isReactChatMode={isReactChatMode}
            backendLabels={backendLabels}
            backendTagColors={backendTagColors}
            messagesEndRef={messagesEndRef}
            navigate={navigate}
            buildRecorderDebugDetailPath={buildRecorderDebugDetailPath}
            handleCopyCommand={handleCopyCommand}
            handleExecuteCommands={handleExecuteCommands}
            t={t}
          />

          {/* Input area */}
          <AIControlsInputArea
            isReactChatMode={isReactChatMode}
            isAIMode={isAIMode}
            takeoverState={takeoverState}
            isDarkTheme={isDarkTheme}
            onStartTakeover={handleStartTakeover}
            onStopTakeover={handleStopTakeover}
            onResumeAfterTakeover={handleResumeAfterTakeover}
            onResetTakeover={resetTakeoverState}
            predefinedCommands={predefinedCommands}
            selectedCommand={selectedCommand}
            setSelectedCommand={setSelectedCommand}
            inputRef={inputRef}
            paramInput={paramInput}
            handleParamInputChange={handleParamInputChange}
            isComposingRef={isComposingRef}
            handleInputKeyDown={handleInputKeyDown}
            isLoading={isLoading}
            isTranscribing={isTranscribing}
            actionColumnHeight={actionColumnHeight}
            handleSend={handleSend}
            canSend={canSend}
            primaryActionButtonStyle={primaryActionButtonStyle}
            secondaryActionButtonStyle={secondaryActionButtonStyle}
            mutedActionButtonStyle={mutedActionButtonStyle}
            handleSpeechToggle={handleSpeechToggle}
            canUseSpeech={canUseSpeech}
            isListening={isListening}
            speechSupported={speechSupported}
            handleExportTemplateFromRecorder={handleExportTemplateFromRecorder}
            exportTemplateLoading={exportTemplateLoading}
            canExport={canExport}
            isReplaceable={isReplaceable}
            setIsReplaceable={setIsReplaceable}
            recorderDebugSessionId={recorderDebugSessionId}
            recorderDebugRuntimeSessionId={recorderDebugRuntimeSessionId}
            executionBackend={executionBackend}
            currentPageUrl={currentPageUrl}
            templateSteps={templateSteps}
            setRecorderDebugSessionId={setRecorderDebugSessionId}
            setRecorderDebugRuntimeSessionId={setRecorderDebugRuntimeSessionId}
            handleInsertRecorderControlToken={handleInsertRecorderControlToken}
            latestReactSuggestedParameters={latestReactSuggestedParameters}
            handleInsertSuggestedParameter={handleInsertSuggestedParameter}
            history={history}
            rollbackLoading={rollbackLoading}
            handleRollbackLastStep={handleRollbackLastStep}
            handleClearHistory={handleClearHistory}
            t={t}
          />

          {/* Quick action buttons */}
          {!isReactChatMode && (
            <QuickActionsBar
              isLoading={isLoading && executeCommandMutation.isLoading}
              waitDuration={waitDuration}
              t={t}
              onQuickAction={handleQuickAction}
            />
          )}

          {/* Template section */}
          {!isReactChatMode && (
            <TemplateRecordingSection
              isTemplatePanelExpanded={isTemplatePanelExpanded}
              setIsTemplatePanelExpanded={setIsTemplatePanelExpanded}
              templateSteps={templateSteps}
              savedTemplateId={savedTemplateId}
              isDarkTheme={isDarkTheme}
              historyLength={history.length}
              testLoading={testLoading}
              resetLoading={resetLoading}
              onAutoExtract={handleAutoExtractTemplate}
              onOpenBranchGate={openBranchGateModal}
              onCompile={handleCompileTemplate}
              onClear={handleClearTemplate}
              onTest={handleTestSavedTemplate}
              onResetWorkers={handleResetWorkers}
              onRemoveStep={handleRemoveTemplateStep}
              onUpdatePolicy={handleUpdateTemplateStepPolicy}
            />
          )}

          <TemplateSaveModal
            open={showTemplateModal}
            templateName={templateName}
            setTemplateName={setTemplateName}
            templateSteps={templateSteps}
            paramEnabled={paramEnabled}
            setParamEnabled={setParamEnabled}
            paramNames={paramNames}
            setParamNames={setParamNames}
            onOk={handleConfirmSaveTemplate}
            onCancel={() => setShowTemplateModal(false)}
          />

          <CompiledScriptModal
            open={showScriptModal}
            templateName={templateName}
            setTemplateName={setTemplateName}
            templateSteps={templateSteps}
            compiledScript={compiledScript}
            onCopyScript={handleCopyScript}
            onDownloadScript={handleDownloadScript}
            onSaveTemplate={handleSaveCompiledTemplate}
            onCancel={() => setShowScriptModal(false)}
          />

          <BranchGateModal
            open={showBranchGateModal}
            runtimeSessionId={
              recorderDebugRuntimeSessionId ||
              (isBrowserReady ? browserRuntimeSessionId : undefined)
            }
            onCancel={() => {
              setShowBranchGateModal(false);
              setBranchInsertAfterStepId(undefined);
            }}
            onConfirm={handleConfirmBranchGate}
          />
          <RollbackConfirmationModal
            rollbackConfirmation={rollbackConfirmation}
            rollbackLoading={rollbackLoading}
            isDarkTheme={isDarkTheme}
            t={t}
            onConfirm={handleConfirmRollback}
            onCancel={() => setRollbackConfirmation(null)}
          />
        </div>
      ) : (
        // Manual Mode Content
        <ManualControls
          isConnected={isConnected}
          recorderStatus={recorderStatus}
          recordUrl={recordUrl}
          setRecordUrl={setRecordUrl}
          isRecording={isRecording}
          isPaused={isPaused}
          recordedScript={recordedScript}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
          onStart={handleManualStart}
          onPauseRecording={onPauseRecording}
          onResumeRecording={onResumeRecording}
          onStopRecording={onStopRecording}
          t={t}
        />
      )}
    </div>
  );
};

export default AIControls;
