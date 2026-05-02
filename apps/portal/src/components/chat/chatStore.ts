/**
 * Chat Store
 * 聊天状态管理（zustand）
 */

import { create } from 'zustand';
import {
  ChatMessage,
  ChatSession,
  UploadedFile,
  AIModel,
  StreamEvent,
  PromptDebugPayload,
  PromptDebugRecord,
} from './types';
import { v4 as uuidv4 } from 'uuid';

const PROMPT_DEBUG_STORAGE_KEY = 'portal-prompt-debug-history';

const loadPromptDebugHistory = (): PromptDebugRecord[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(PROMPT_DEBUG_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as PromptDebugRecord[] : [];
  } catch {
    return [];
  }
};

const persistPromptDebugHistory = (records: PromptDebugRecord[]): void => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(PROMPT_DEBUG_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Ignore storage failures and keep in-memory behavior.
  }
};

interface ChatState {
  // 会话相关
  currentSession: ChatSession | null;
  sessions: ChatSession[];
  messages: ChatMessage[];
  promptDebugHistory: PromptDebugRecord[];

  // UI状态
  isOpen: boolean;
  isLoading: boolean;
  streamingContent: string;
  streamingEvents: StreamEvent[];
  draftMessage: string;
  draftExecutionId: string | null;

  // 聊天模式：chat(普通聊天) | task(任务模式-ReAct)
  chatMode: 'chat' | 'task';
  enableThinking: boolean;
  enableWebSearch: boolean;

  // 文件上传
  uploadedFiles: UploadedFile[];

  // 模型选择
  selectedModel: string | null;
  availableModels: AIModel[];

  // Skill相关
  pendingParamsConfirm: Record<string, unknown> | null;
  pendingSkillName: string | null;

  // 中止函数（用于停止正在执行的任务）
  abortStreaming: (() => void) | null;
}

interface ChatActions {
  // 会话管理
  createSession: () => void;
  setCurrentSession: (session: ChatSession) => void;
  loadSessions: () => void;

  // 消息管理
  addMessage: (message: ChatMessage) => void;
  updateLastMessage: (content: string) => void;
  updateMessageById: (messageId: string, content: string, isStreaming?: boolean) => void;
  updateMessageMetadataById: (messageId: string, metadata: Partial<NonNullable<ChatMessage['metadata']>>) => void;
  upsertPromptDebugRecord: (record: {
    messageId: string;
    sessionId?: string;
    executionId?: string;
    mode?: 'chat' | 'task';
    taskStatus?: 'waiting_input' | 'pending_approval' | 'running' | 'completed' | 'failed';
    sourceEventType: PromptDebugRecord['sourceEventType'];
    promptDebug: PromptDebugPayload;
  }) => void;
  clearMessages: () => void;

  // 流式处理
  setStreaming: (isStreaming: boolean) => void;
  setAbortStreaming: (abort: (() => void) | null) => void;
  abortCurrentStreaming: () => void;
  appendStreamingContent: (content: string) => void;
  addStreamEvent: (event: StreamEvent) => void;
  clearStreaming: () => void;
  setDraftMessage: (message: string) => void;
  setDraftExecutionId: (executionId: string | null) => void;

  // UI控制
  toggleChat: () => void;
  setOpen: (isOpen: boolean) => void;
  setChatMode: (mode: 'chat' | 'task') => void;
  toggleChatMode: () => void;
  setEnableThinking: (enabled: boolean) => void;
  setEnableWebSearch: (enabled: boolean) => void;

  // 文件上传
  addUploadedFile: (file: UploadedFile) => void;
  removeUploadedFile: (fileId: string) => void;
  clearUploadedFiles: () => void;

  // 模型选择
  setSelectedModel: (modelId: string) => void;
  setAvailableModels: (models: AIModel[]) => void;

  // Skill参数确认
  setPendingParamsConfirm: (params: Record<string, unknown> | null, skillName: string | null) => void;
  confirmParams: () => void;
}

export const useChatStore = create<ChatState & ChatActions>((set, get) => ({
  // 初始状态
  currentSession: null,
  sessions: [],
  messages: [],
  promptDebugHistory: loadPromptDebugHistory(),
  isOpen: false,
  isLoading: false,
  streamingContent: '',
  streamingEvents: [],
  draftMessage: '',
  draftExecutionId: null,
  chatMode: 'chat',  // 默认普通聊天模式
  enableThinking: true,
  enableWebSearch: false,
  uploadedFiles: [],
  selectedModel: 'default',
  availableModels: [],
  pendingParamsConfirm: null,
  pendingSkillName: null,
  abortStreaming: null,

  // 会话管理
  createSession: () => {
    const newSession: ChatSession = {
      id: uuidv4(),
      title: '新对话',
      modelId: get().selectedModel || undefined,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    set({
      currentSession: newSession,
      sessions: [newSession, ...get().sessions],
      messages: [],
      draftExecutionId: null,
    });
  },

  setCurrentSession: (session) => {
    set({ currentSession: session, messages: [], draftExecutionId: null });
  },

  loadSessions: () => {
    // TODO: 从API加载历史会话
  },

  // 消息管理
  addMessage: (message) => {
    set({ messages: [...get().messages, message] });
  },

  updateLastMessage: (content) => {
    const messages = get().messages;
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant') {
        set({
          messages: [...messages.slice(0, -1), { ...lastMessage, content }],
        });
      }
    }
  },

  updateMessageById: (messageId, content, isStreaming) => {
    const messages = get().messages;
    set({
      messages: messages.map((msg) =>
        msg.id === messageId
          ? { ...msg, content, ...(isStreaming !== undefined ? { isStreaming } : {}) }
          : msg
      ),
    });
  },

  updateMessageMetadataById: (messageId, metadata) => {
    const messages = get().messages;
    const sanitizedMetadata = Object.fromEntries(
      Object.entries(metadata).filter(([, value]) => value !== undefined)
    ) as Partial<NonNullable<ChatMessage['metadata']>>;
    set({
      messages: messages.map((msg) =>
        msg.id === messageId
          ? { ...msg, metadata: { ...(msg.metadata || {}), ...sanitizedMetadata } }
          : msg
      ),
    });
  },

  upsertPromptDebugRecord: (record) => {
    const now = new Date().toISOString();
    const existing = get().promptDebugHistory;
    const nextRecord: PromptDebugRecord = {
      id: record.messageId,
      messageId: record.messageId,
      sessionId: record.sessionId,
      executionId: record.executionId,
      mode: record.mode,
      taskStatus: record.taskStatus,
      sourceEventType: record.sourceEventType,
      promptDebug: record.promptDebug,
      createdAt: existing.find((item) => item.id === record.messageId)?.createdAt || now,
      updatedAt: now,
    };

    const filtered = existing.filter((item) => item.id !== record.messageId);
    const nextHistory = [nextRecord, ...filtered].slice(0, 20);
    persistPromptDebugHistory(nextHistory);
    set({
      promptDebugHistory: nextHistory,
    });
  },

  clearMessages: () => {
    set({ messages: [] });
  },

  // 流式处理
  setStreaming: (isStreaming) => {
    set({ isLoading: isStreaming });
  },

  setAbortStreaming: (abort) => {
    set({ abortStreaming: abort });
  },

  abortCurrentStreaming: () => {
    const abort = get().abortStreaming;
    if (abort) {
      abort();
      set({
        isLoading: false,
        abortStreaming: null,
        streamingContent: '',
        streamingEvents: [],
        pendingParamsConfirm: null,
        pendingSkillName: null,
      });
    }
  },

  appendStreamingContent: (content) => {
    set({ streamingContent: get().streamingContent + content });
  },

  addStreamEvent: (event) => {
    set({ streamingEvents: [...get().streamingEvents, event] });
  },

  clearStreaming: () => {
    set({ streamingContent: '', streamingEvents: [] });
  },

  setDraftMessage: (message) => {
    set({ draftMessage: message });
  },

  setDraftExecutionId: (executionId) => {
    set({ draftExecutionId: executionId });
  },

  // UI控制
  toggleChat: () => {
    const isOpen = get().isOpen;
    if (isOpen) {
      // 如果已经打开，点击则是隐藏
      set({ isOpen: false });
    } else {
      // 如果是关闭的，点击则是显示
      set({ isOpen: true });
      // 只有在没有当前会话时才创建新会话
      if (!get().currentSession) {
        get().createSession();
      }
    }
  },

  setOpen: (isOpen) => {
    set({ isOpen });
    if (isOpen && !get().currentSession) {
      get().createSession();
    }
  },

  setChatMode: (mode) => {
    set({ chatMode: mode });
  },

  toggleChatMode: () => {
    const currentMode = get().chatMode;
    set({ chatMode: currentMode === 'chat' ? 'task' : 'chat' });
  },

  setEnableThinking: (enabled) => {
    set({ enableThinking: enabled });
  },

  setEnableWebSearch: (enabled) => {
    set({ enableWebSearch: enabled });
  },

  // 文件上传
  addUploadedFile: (file) => {
    set({ uploadedFiles: [...get().uploadedFiles, file] });
  },

  removeUploadedFile: (fileId) => {
    set({
      uploadedFiles: get().uploadedFiles.filter((f) => f.fileId !== fileId),
    });
  },

  clearUploadedFiles: () => {
    set({ uploadedFiles: [] });
  },

  // 模型选择
  setSelectedModel: (modelId) => {
    set({ selectedModel: modelId });
  },

  setAvailableModels: (models) => {
    set({ availableModels: models });
  },

  // Skill参数确认
  setPendingParamsConfirm: (params, skillName) => {
    set({ pendingParamsConfirm: params, pendingSkillName: skillName });
  },

  confirmParams: () => {
    // 确认后发送确认消息
    const params = get().pendingParamsConfirm;
    const skillName = get().pendingSkillName;

    if (params && skillName) {
      const confirmMessage: ChatMessage = {
        id: uuidv4(),
        sessionId: get().currentSession?.id || '',
        role: 'user',
        content: `确认生成 ${skillName}，参数已确认`,
        timestamp: new Date(),
        metadata: { params, skillUsed: skillName },
      };
      get().addMessage(confirmMessage);
    }

    set({ pendingParamsConfirm: null, pendingSkillName: null });
  },
}));
