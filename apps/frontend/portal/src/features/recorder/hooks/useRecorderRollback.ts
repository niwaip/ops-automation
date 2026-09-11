import { useState } from 'react';
import { message } from 'antd';
import { apiClient } from '@/shared/api/http/client';
import type { CommandHistoryEntry, RollbackConfirmationState } from '../components/AIControls.types';

export interface UseRecorderRollbackOptions {
  recorderDebugSessionId?: string;
  setHistory: React.Dispatch<React.SetStateAction<CommandHistoryEntry[]>>;
  setCurrentPageUrl: (url?: string) => void;
}

export const useRecorderRollback = ({
  recorderDebugSessionId,
  setHistory,
  setCurrentPageUrl,
}: UseRecorderRollbackOptions) => {
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [rollbackConfirmation, setRollbackConfirmation] =
    useState<RollbackConfirmationState | null>(null);

  // v4.1 P0 (doc §5.1.6-7): rollback the last recorder execution step.
  // Handles requires_confirmation (persist-level side effects) + partial restore.
  const handleRollbackResponse = (
    result: Record<string, unknown>,
    sessionId: string
  ): boolean => {
    const status = result?.status as string | undefined;
    if (status === 'succeeded') {
      // Remove the last assistant turn from local history (server already truncated it)
      setHistory((prev) => {
        const lastAssistantIdx = [...prev].reverse().findIndex((h) => h.type === 'ai');
        if (lastAssistantIdx === -1) return prev;
        const realIdx = prev.length - 1 - lastAssistantIdx;
        return prev.filter((_, i) => i !== realIdx);
      });
      const browserRestore = (result?.browserRestore ?? {}) as {
        partial?: boolean;
        reason?: string;
        url?: string;
      };
      setCurrentPageUrl(browserRestore.url);
      if (browserRestore.partial) {
        void message.warning(
          `浏览器状态已部分恢复（${browserRestore.reason || '原因未知'}）。跨域 iframe 内的状态可能需要手动恢复。`
        );
      } else {
        void message.success('已撤销上一步操作');
      }
      setRollbackConfirmation(null);
      return true;
    }
    if (status === 'requires_confirmation') {
      setRollbackConfirmation({
        sessionId,
        targetExecutionIndex: result?.targetExecutionIndex as number,
        sessionRevision: result?.sessionRevision as number,
        sideEffectDigest: result?.sideEffectDigest as string,
        sideEffects: (result?.sideEffects ?? []) as Array<{
          executionIndex: number;
          classifiedLevel: string;
          description: string;
          matchedKeyword?: string;
        }>,
        message: (result?.message as string) || '回退将跨越后端持久化操作，是否继续？',
      });
      return false;
    }
    if (status === 'noop') {
      void message.info(
        result?.reason === 'target-before-first-execution'
          ? '没有可撤销的步骤'
          : '已在起始位置，无法继续撤销'
      );
      setRollbackConfirmation(null);
      return false;
    }
    if (status === 'failed') {
      void message.error(`撤销失败：${result?.reason || '未知原因'}。浏览器历史已回退，但状态恢复未完成。`);
      // History was still truncated server-side — reflect locally
      setHistory((prev) => {
        const lastAssistantIdx = [...prev].reverse().findIndex((h) => h.type === 'ai');
        if (lastAssistantIdx === -1) return prev;
        const realIdx = prev.length - 1 - lastAssistantIdx;
        return prev.filter((_, i) => i !== realIdx);
      });
      const browserRestore = (result?.browserRestore ?? {}) as {
        url?: string;
      };
      setCurrentPageUrl(browserRestore.url);
      setRollbackConfirmation(null);
      return false;
    }
    void message.error('撤销失败：未知响应');
    return false;
  };

  const handleRollbackLastStep = async () => {
    const sessionId = recorderDebugSessionId;
    if (!sessionId) {
      void message.warning('没有活跃的录制会话，无法撤销');
      return;
    }
    setRollbackLoading(true);
    try {
      const result = await apiClient.post('/ai/recorder-debug/rollback', { sessionId });
      handleRollbackResponse(result as Record<string, unknown>, sessionId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      void message.error(`撤销请求失败：${reason}`);
    } finally {
      setRollbackLoading(false);
    }
  };

  const handleConfirmRollback = async () => {
    if (!rollbackConfirmation) return;
    setRollbackLoading(true);
    try {
      const result = await apiClient.post('/ai/recorder-debug/rollback/confirm', {
        sessionId: rollbackConfirmation.sessionId,
        targetExecutionIndex: rollbackConfirmation.targetExecutionIndex,
        sessionRevision: rollbackConfirmation.sessionRevision,
        sideEffectDigest: rollbackConfirmation.sideEffectDigest,
      });
      handleRollbackResponse(result as Record<string, unknown>, rollbackConfirmation.sessionId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      void message.error(`撤销确认失败：${reason}`);
    } finally {
      setRollbackLoading(false);
    }
  };

  return {
    rollbackLoading,
    rollbackConfirmation,
    setRollbackConfirmation,
    handleRollbackLastStep,
    handleConfirmRollback,
  };
};
