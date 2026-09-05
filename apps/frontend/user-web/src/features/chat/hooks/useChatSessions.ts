import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage, ChatProgressLog, ChatSession } from '@ops/user-core';
import { buildPatchedMessage, dedupeThoughtTexts, mergeHistoryMessages } from '../lib/messageState';
import { parseMessageContent } from '../lib/messageContent';
import { createChatSessionId } from '../lib/session';
import {
  getSessionSortTime,
  isSameSession,
} from '../lib/sessionView';

interface UseChatSessionsOptions {
  currentSession: ChatSession | null;
  embedded: boolean;
  remoteSessions: ChatSession[];
  selectedModel: string;
  setCurrentSession: (session: ChatSession | null) => void;
}

export function useChatSessions({
  currentSession,
  embedded,
  remoteSessions,
  selectedModel,
  setCurrentSession,
}: UseChatSessionsOptions) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    () => currentSession?.id ?? null
  );
  const [isSessionListCollapsed, setIsSessionListCollapsed] = useState(true);
  const [draftSessions, setDraftSessions] = useState<ChatSession[]>([]);
  const [sessionOverrides, setSessionOverrides] = useState<Record<string, Partial<ChatSession>>>(
    {}
  );
  const [sessionMessages, setSessionMessages] = useState<Record<string, ChatMessage[]>>({});
  const sessionMessagesRef = useRef<Record<string, ChatMessage[]>>({});

  const remoteSessionIds = useMemo(
    () => new Set(remoteSessions.map((session) => session.id)),
    [remoteSessions]
  );

  const sessions = useMemo(() => {
    const merged = new Map<string, ChatSession>();
    [...draftSessions, ...remoteSessions].forEach((session) => {
      merged.set(session.id, {
        ...session,
        ...(sessionOverrides[session.id] || {}),
      });
    });
    return [...merged.values()].sort(
      (left, right) => getSessionSortTime(right) - getSessionSortTime(left)
    );
  }, [draftSessions, remoteSessions, sessionOverrides]);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) || null,
    [selectedSessionId, sessions]
  );

  const activeMessages = selectedSessionId ? sessionMessages[selectedSessionId] || [] : [];
  const showSessionSidebar = !embedded && !isSessionListCollapsed;

  useEffect(() => {
    sessionMessagesRef.current = sessionMessages;
  }, [sessionMessages]);

  useEffect(() => {
    if (embedded) {
      setIsSessionListCollapsed(true);
    }
  }, [embedded]);

  useEffect(() => {
    if (!currentSession) {
      return;
    }

    setDraftSessions((existing) => {
      const hasCurrentSession = existing.some((session) => session.id === currentSession.id);
      if (hasCurrentSession) {
        let changed = false;
        const next = existing.map((session) => {
          if (session.id !== currentSession.id) {
            return session;
          }
          if (isSameSession(session, currentSession)) {
            return session;
          }
          changed = true;
          return { ...session, ...currentSession };
        });
        return changed ? next : existing;
      }
      return [currentSession, ...existing];
    });
    setSelectedSessionId((existing) =>
      existing === currentSession.id ? existing : currentSession.id
    );
    setSessionMessages((existing) =>
      existing[currentSession.id]
        ? existing
        : {
            ...existing,
            [currentSession.id]: [],
          }
    );
  }, [currentSession]);

  useEffect(() => {
    if (selectedSessionId || currentSession || !sessions[0]?.id) {
      return;
    }
    setSelectedSessionId(sessions[0].id);
  }, [currentSession, selectedSessionId, sessions]);

  useEffect(() => {
    if (!selectedSession) {
      return;
    }
    if (isSameSession(currentSession, selectedSession)) {
      return;
    }
    setCurrentSession(selectedSession);
  }, [currentSession, selectedSession, setCurrentSession]);

  useEffect(() => {
    if (!remoteSessions.length) {
      return;
    }
    setDraftSessions((current) => current.filter((session) => !remoteSessionIds.has(session.id)));
  }, [remoteSessionIds, remoteSessions.length]);

  const updateSessionMessages = useCallback((
    sessionId: string,
    updater: (messages: ChatMessage[]) => ChatMessage[]
  ) => {
    setSessionMessages((current) => ({
      ...current,
      [sessionId]: updater(current[sessionId] || []),
    }));
  }, []);

  const updateMessage = useCallback((sessionId: string, messageId: string, patch: Partial<ChatMessage>) => {
    updateSessionMessages(sessionId, (messages) =>
      messages.map((message) =>
        message.id === messageId ? buildPatchedMessage(message, patch) : message
      )
    );
  }, [updateSessionMessages]);

  const mergeSessionHistory = useCallback((
    sessionId: string,
    history: ChatMessage[],
    skipWhileStreaming = false
  ) => {
    if (skipWhileStreaming) {
      return;
    }

    setSessionMessages((current) => {
      const existing = current[sessionId] || [];
      if (history.length === 0 && existing.length > 0) {
        return current;
      }
      return {
        ...current,
        [sessionId]: mergeHistoryMessages(history, existing),
      };
    });
  }, []);

  const snapshotMessageThoughts = useCallback((sessionId: string, messageId: string) => {
    setSessionMessages((current) => {
      const currentMessages = current[sessionId] || [];
      const nextMessages = currentMessages.map((message) => {
        if (message.id !== messageId) {
          return message;
        }

        const parsedThoughtLogs =
          message.role === 'assistant' ? parseMessageContent(message.content).thoughts : [];
        const progressThoughtLogs = (message.metadata?.progressLogs || [])
          .filter((log) => log.stage === 'thought')
          .map((log) => log.text.trim())
          .filter(Boolean);
        const persistedThoughtLogs = message.metadata?.thoughtLogsSnapshot || [];
        const mergedThoughtLogs = dedupeThoughtTexts([
          ...persistedThoughtLogs,
          ...progressThoughtLogs,
          ...parsedThoughtLogs,
        ]);

        if (mergedThoughtLogs.length === 0) {
          return message;
        }

        return {
          ...message,
          metadata: {
            ...(message.metadata || {}),
            thoughtLogsSnapshot: mergedThoughtLogs,
          },
        };
      });

      return {
        ...current,
        [sessionId]: nextMessages,
      };
    });
  }, []);

  const appendProgressLog = useCallback((
    sessionId: string,
    messageId: string,
    progressLog: ChatProgressLog
  ) => {
    updateSessionMessages(sessionId, (messages) =>
      messages.map((message) => {
        if (message.id !== messageId) {
          return message;
        }
        const currentLogs = message.metadata?.progressLogs || [];
        const lastLog = currentLogs[currentLogs.length - 1];
        if (lastLog?.stage === progressLog.stage && lastLog.text === progressLog.text) {
          return message;
        }
        return {
          ...message,
          metadata: {
            ...(message.metadata || {}),
            progressLogs: [...currentLogs, progressLog].slice(-12),
          },
        };
      })
    );
  }, [updateSessionMessages]);

  const updateSessionMeta = useCallback((sessionId: string, patch: Partial<ChatSession>) => {
    setDraftSessions((current) =>
      current.map((session) => (session.id === sessionId ? { ...session, ...patch } : session))
    );
    setSessionOverrides((current) => ({
      ...current,
      [sessionId]: {
        ...(current[sessionId] || {}),
        ...patch,
      },
    }));
  }, []);

  const createDraftSession = useCallback((initialTitle = '新对话', now: string): ChatSession => {
    const nextSession: ChatSession = {
      id: createChatSessionId(),
      title: initialTitle,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      modelId: selectedModel,
    };
    setDraftSessions((current) => [nextSession, ...current]);
    setSelectedSessionId(nextSession.id);
    setSessionMessages((current) => ({
      ...current,
      [nextSession.id]: current[nextSession.id] || [],
    }));
    setCurrentSession(nextSession);
    return nextSession;
  }, [selectedModel, setCurrentSession]);

  const ensureSession = useCallback((now: string): ChatSession => {
    if (selectedSession) {
      return selectedSession;
    }
    return createDraftSession('新对话', now);
  }, [createDraftSession, selectedSession]);

  const deleteSession = useCallback((sessionId: string) => {
    setDraftSessions((current) => current.filter((session) => session.id !== sessionId));
    setSessionOverrides((current) => {
      const next = { ...current };
      delete next[sessionId];
      return next;
    });
    setSessionMessages((current) => {
      const next = { ...current };
      delete next[sessionId];
      return next;
    });
    setSelectedSessionId((current) => (current === sessionId ? null : current));
  }, []);

  return {
    activeMessages,
    createDraftSession,
    deleteSession,
    ensureSession,
    selectedSession,
    selectedSessionId,
    sessionMessages,
    sessionMessagesRef,
    sessions,
    showSessionSidebar,
    updateMessage,
    updateSessionMessages,
    updateSessionMeta,
    appendProgressLog,
    mergeSessionHistory,
    snapshotMessageThoughts,
    isSessionListCollapsed,
    setIsSessionListCollapsed,
    setSelectedSessionId,
  };
}
