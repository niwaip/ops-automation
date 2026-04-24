/**
 * Chat Store
 * 聊天状态管理（zustand）
 */

import { create } from 'zustand';
import { ChatMessage, ChatSession, UploadedFile, AIModel, StreamEvent } from './types';
import { v4 as uuidv4 } from 'uuid';

interface ChatState {
  // 会话相关
  currentSession: ChatSession | null;
  sessions: ChatSession[];
  messages: ChatMessage[];

  // UI状态
  isOpen: boolean;
  isLoading: boolean;
  streamingContent: string;
  streamingEvents: StreamEvent[];

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
  updateMessageMetadataById: (messageId: string, metadata: NonNullable<ChatMessage['metadata']>) => void;
  clearMessages: () => void;

  // 流式处理
  setStreaming: (isStreaming: boolean) => void;
  setAbortStreaming: (abort: (() => void) | null) => void;
  abortCurrentStreaming: () => void;
  appendStreamingContent: (content: string) => void;
  addStreamEvent: (event: StreamEvent) => void;
  clearStreaming: () => void;

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
  isOpen: false,
  isLoading: false,
  streamingContent: '',
  streamingEvents: [],
  chatMode: 'chat',  // 默认普通聊天模式
  enableThinking: true,
  enableWebSearch: false,
  uploadedFiles: [],
  selectedModel: null,
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
    });
  },

  setCurrentSession: (session) => {
    set({ currentSession: session, messages: [] });
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
    set({
      messages: messages.map((msg) =>
        msg.id === messageId
          ? { ...msg, metadata: { ...(msg.metadata || {}), ...metadata } }
          : msg
      ),
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

  // UI控制
  toggleChat: () => {
    set({ isOpen: !get().isOpen });
    if (!get().isOpen && !get().currentSession) {
      get().createSession();
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
