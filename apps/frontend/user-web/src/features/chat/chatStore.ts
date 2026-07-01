import { create } from 'zustand';

type ChatMode = 'chat' | 'task';

interface ChatSession {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ChatStoreState {
  currentSession: ChatSession | null;
  isOpen: boolean;
  chatMode: ChatMode;
  draftMessage: string;
  draftExecutionId: string | null;
  createSession: () => void;
  setOpen: (isOpen: boolean) => void;
  setChatMode: (mode: ChatMode) => void;
  setDraftMessage: (message: string) => void;
  setDraftExecutionId: (executionId: string | null) => void;
  openWithPrompt: (message: string, mode?: ChatMode, executionId?: string | null) => void;
  clearDraftContext: () => void;
}

const buildSessionId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `chat-session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const useChatStore = create<ChatStoreState>((set) => ({
  currentSession: null,
  isOpen: false,
  chatMode: 'task',
  draftMessage: '',
  draftExecutionId: null,
  createSession: () =>
    set({
      currentSession: {
        id: buildSessionId(),
        title: '新对话',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      draftExecutionId: null,
    }),
  setOpen: (isOpen) => set({ isOpen }),
  setChatMode: (chatMode) => set({ chatMode }),
  setDraftMessage: (draftMessage) => set({ draftMessage }),
  setDraftExecutionId: (draftExecutionId) => set({ draftExecutionId }),
  openWithPrompt: (draftMessage, chatMode = 'task', draftExecutionId = null) =>
    set({
      isOpen: true,
      draftMessage,
      chatMode,
      draftExecutionId,
    }),
  clearDraftContext: () =>
    set({
      draftMessage: '',
      draftExecutionId: null,
      chatMode: 'task',
    }),
}));
