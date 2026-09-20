import { create } from 'zustand';
import type { ChatSession } from '@ops/user-core';
import { createChatSessionId } from './lib/session';

export type ChatMode = 'chat' | 'task';

export interface ChatTaskAttachment {
  name: string;
  url?: string;
  size?: number;
  mimeType?: string;
}

export interface ChatTaskContext {
  taskId?: string;
  taskTitle: string;
  workflowId?: string;
  taskContent?: string;
  parameters?: Record<string, any>;
  attachments?: ChatTaskAttachment[];
}

export interface ChatStoreState {
  currentSession: ChatSession | null;
  isOpen: boolean;
  chatMode: ChatMode;
  draftMessage: string;
  draftExecutionId: string | null;
  taskContext: ChatTaskContext | null;
  autoSend?: boolean;
  createSession: () => ChatSession;
  setCurrentSession: (session: ChatSession | null) => void;
  setOpen: (isOpen: boolean) => void;
  setChatMode: (mode: ChatMode) => void;
  setDraftMessage: (message: string) => void;
  setDraftExecutionId: (executionId: string | null) => void;
  setTaskContext: (context: ChatTaskContext | null) => void;
  openWithPrompt: (
    message: string,
    mode?: ChatMode,
    executionId?: string | null,
    autoSend?: boolean
  ) => void;
  openWithTaskContext: (
    context: ChatTaskContext,
    defaultDraft?: string
  ) => void;
  clearDraftContext: () => void;
}

export const STORAGE_KEY_CHAT_MODE = 'ops_user_chat_mode';

const getStoredChatMode = (): ChatMode => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_CHAT_MODE);
    if (saved === 'chat' || saved === 'task') {
      return saved;
    }
  } catch {
    // fallback
  }
  return 'task';
};

export const useChatStore = create<ChatStoreState>((set, get) => ({
  currentSession: null,
  isOpen: false,
  chatMode: getStoredChatMode(),
  draftMessage: '',
  draftExecutionId: null,
  taskContext: null,
  autoSend: false,
  createSession: () => {
    const now = new Date().toISOString();
    const nextSession: ChatSession = {
      id: createChatSessionId(),
      title: '新对话',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    set({
      currentSession: nextSession,
      draftExecutionId: null,
    });
    return nextSession;
  },
  setCurrentSession: (currentSession) => set({ currentSession }),
  setOpen: (isOpen) => set({ isOpen }),
  setChatMode: (chatMode) => {
    const prevMode = get().chatMode;
    try {
      localStorage.setItem(STORAGE_KEY_CHAT_MODE, chatMode);
    } catch {
      // ignore
    }
    if (prevMode !== chatMode) {
      const nextSession = get().createSession();
      set({ chatMode, currentSession: nextSession, draftExecutionId: null });
    }
  },
  setDraftMessage: (draftMessage) => set({ draftMessage }),
  setDraftExecutionId: (draftExecutionId) => set({ draftExecutionId }),
  setTaskContext: (taskContext) => set({ taskContext }),
  openWithPrompt: (
    draftMessage,
    mode,
    draftExecutionId = null,
    autoSend = false
  ) => {
    const nextSession = get().createSession();
    const chatMode = mode || get().chatMode;
    set({
      isOpen: true,
      draftMessage,
      chatMode,
      draftExecutionId,
      autoSend,
      currentSession: nextSession,
    });
  },
  openWithTaskContext: (taskContext, defaultDraft = '') => {
    const nextSession = get().createSession();
    set({
      isOpen: true,
      chatMode: 'task',
      draftMessage: defaultDraft,
      draftExecutionId: null,
      taskContext,
      autoSend: false,
      currentSession: nextSession,
    });
  },
  clearDraftContext: () =>
    set({
      draftMessage: '',
      draftExecutionId: null,
      autoSend: false,
    }),
}));
