import { useState, useEffect, useCallback } from 'react';
import { message } from 'antd';
import type { RecorderTakeoverViewState } from '@/features/recorder/lib/types';
import recorderRuntimeService from '@/services/recorder.service';
import type {
  CommandHistoryEntry,
  ExecutionBackend,
  MCPCommand,
  TakeoverUiState,
} from '../components/AIControls.types';
import { createIdleTakeoverState, resolveErrorMessage } from '../components/AIControls.utils';

export interface UseRecorderTakeoverParams {
  executionBackend: ExecutionBackend;
  recorderDebugSessionId?: string;
  setHistory: React.Dispatch<React.SetStateAction<CommandHistoryEntry[]>>;
  setCurrentPageUrl: (url: string) => void;
  onBrowserEndpoints?: (endpoints: { novnc?: string; cdp?: string }) => void;
  onTakeoverStateChange?: (state: RecorderTakeoverViewState) => void;
}

export const useRecorderTakeover = ({
  executionBackend,
  recorderDebugSessionId,
  setHistory,
  setCurrentPageUrl,
  onBrowserEndpoints,
  onTakeoverStateChange,
}: UseRecorderTakeoverParams) => {
  const [takeoverState, setTakeoverState] = useState<TakeoverUiState>(createIdleTakeoverState);

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

  const resetTakeoverState = useCallback(() => {
    setTakeoverState(createIdleTakeoverState());
  }, []);

  const markTakeoverRequired = useCallback(
    (input: {
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
        if (
          prev.mode === 'recording' ||
          prev.mode === 'reconciling' ||
          prev.mode === 'ready_to_resume' ||
          prev.mode === 'resuming'
        ) {
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
    },
    []
  );

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
      takeoverState.mode !== 'recording' ||
      !takeoverState.runtimeSessionId ||
      !takeoverState.takeoverSessionId
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
      takeoverState.mode !== 'ready_to_resume' ||
      !takeoverState.runtimeSessionId ||
      takeoverState.resumeCommands.length === 0
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

  return {
    takeoverState,
    setTakeoverState,
    resetTakeoverState,
    markTakeoverRequired,
    handleStartTakeover,
    handleStopTakeover,
    handleResumeAfterTakeover,
  };
};
