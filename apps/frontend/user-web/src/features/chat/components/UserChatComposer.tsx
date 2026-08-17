import {
  AudioOutlined,
  MessageOutlined,
  PlusOutlined,
  RobotOutlined,
  SendOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { Button, Input, Select, Segmented, Switch, Typography, message as antdMessage } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import type { AIModel } from '@ops/user-core';
import { apiClient, runtimeConfig } from '../../../api';
import { authStore } from '../../../adapters/auth/authStore';
import { supportsNativeReasoning } from '@/shared/lib/aiModelReasoning';

import styles from '../pages/ChatPage.module.css';


const { TextArea } = Input;

const SPEECH_LANGUAGE_STORAGE_KEY = 'user-chat.speech.lang';

const SPEECH_LANGUAGE_OPTIONS = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en-US', label: 'English' },
  { value: 'ja-JP', label: '日本語' },
];

const normalizeSpeechLanguage = (value?: string | null): string => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (normalized.startsWith('zh')) {
    return 'zh-CN';
  }
  if (normalized.startsWith('en')) {
    return 'en-US';
  }
  if (normalized.startsWith('ja')) {
    return 'ja-JP';
  }
  return 'zh-CN';
};

const resolveAiPath = (path: string): string => {
  const baseUrl = runtimeConfig.aiApiBaseUrl?.trim() || '/api/ai';
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
};

const mergeSpeechText = (baseText: string, speechText: string): string => {
  const normalizedSpeechText = speechText.trim();
  if (!normalizedSpeechText) {
    return baseText;
  }
  if (!baseText.trim()) {
    return normalizedSpeechText;
  }
  return `${baseText.replace(/\s+$/, '')}\n${normalizedSpeechText}`;
};

async function transcribeAudio(file: Blob | File, modelId: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', file, 'audio.webm');
  formData.append('modelId', modelId);

  const token = (await apiClient.ensureFreshAccessToken()) || authStore.getState().accessToken;
  const response = await fetch(resolveAiPath('/chat/audio/transcriptions'), {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`HTTP error: ${response.status} ${errText}`);
  }

  const payload = (await response.json()) as { text?: string };
  if (typeof payload.text !== 'string') {
    throw new Error('Invalid transcription response');
  }

  return payload.text;
}

interface UserChatComposerProps {
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  onNewSession: () => void;
  chatMode: 'chat' | 'task';
  onChatModeChange: (mode: 'chat' | 'task') => void;
  enableThinking: boolean;
  onEnableThinkingChange: (enabled: boolean) => void;
  thinkingLabel: string;
  thinkingHint: string;
  nativeReasoningSupported: boolean;
  selectedModel?: string;
  availableModels: AIModel[];
  onModelChange: (modelId: string) => void;
  isStreaming: boolean;
  modelsLoading?: boolean;
  disabled?: boolean;
  placeholder: string;
  /** 已发送的历史消息列表，由父组件传入 */
  sentHistory?: string[];
}

export function UserChatComposer(props: UserChatComposerProps) {
  const {
    draft,
    onDraftChange,
    onSend,
    onStop,
    onNewSession,
    chatMode,
    onChatModeChange,
    enableThinking,
    onEnableThinkingChange,
    thinkingLabel,
    thinkingHint,
    nativeReasoningSupported,
    selectedModel,
    availableModels,
    onModelChange,
    isStreaming,
    modelsLoading = false,
    disabled = false,
    placeholder,
    sentHistory = [],
  } = props;

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechLanguage, setSpeechLanguage] = useState(() => {
    if (typeof window === 'undefined') {
      return 'zh-CN';
    }
    const saved = window.localStorage.getItem(SPEECH_LANGUAGE_STORAGE_KEY);
    return normalizeSpeechLanguage(saved || navigator.language);
  });

  const inputRef = useRef<TextAreaRef | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // History navigation state
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const savedDraftRef = useRef<string>('');
  const isNavigatingHistoryRef = useRef<boolean>(false);

  const effectiveHistory = useMemo(() => {
    const list: string[] = [];
    for (const item of sentHistory) {
      const trimmed = (item || '').trim();
      if (trimmed && list[list.length - 1] !== trimmed) {
        list.push(trimmed);
      }
    }
    return list;
  }, [sentHistory]);

  // Reset history cursor when history list changes (new message sent)
  useEffect(() => {
    setHistoryIndex(-1);
  }, [effectiveHistory.length]);

  const moveCaretToEnd = useCallback((el: HTMLTextAreaElement) => {
    requestAnimationFrame(() => {
      try {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      } catch {
        // ignore
      }
    });
  }, []);

  const handleHistoryKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (
        (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') ||
        e.shiftKey ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      ) {
        return;
      }

      // Only navigate when caret is at first/last line
      const el = e.currentTarget;
      const { selectionStart, value } = el;
      const lines = value.split('\n');

      if (e.key === 'ArrowUp') {
        // Navigate back into history only if caret is on the first line
        const firstLineEnd = lines[0]?.length ?? 0;
        if (selectionStart > firstLineEnd) return;

        const nextIndex = historyIndex + 1;
        if (nextIndex >= effectiveHistory.length) return;
        e.preventDefault();
        isNavigatingHistoryRef.current = true;
        if (historyIndex === -1) {
          savedDraftRef.current = draft;
        }
        setHistoryIndex(nextIndex);
        const nextText = effectiveHistory[effectiveHistory.length - 1 - nextIndex] ?? '';
        onDraftChange(nextText);
        moveCaretToEnd(el);
      } else if (e.key === 'ArrowDown') {
        if (historyIndex === -1) return;

        // Navigate forward in history only if caret is on the last line
        const lastLineStart = value.length - (lines[lines.length - 1]?.length ?? 0);
        if (selectionStart < lastLineStart) return;

        e.preventDefault();
        isNavigatingHistoryRef.current = true;
        const nextIndex = historyIndex - 1;
        if (nextIndex < 0) {
          setHistoryIndex(-1);
          onDraftChange(savedDraftRef.current);
        } else {
          setHistoryIndex(nextIndex);
          const nextText = effectiveHistory[effectiveHistory.length - 1 - nextIndex] ?? '';
          onDraftChange(nextText);
        }
        moveCaretToEnd(el);
      }
    },
    [draft, effectiveHistory, historyIndex, moveCaretToEnd, onDraftChange]
  );

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  useEffect(() => {
    setSpeechSupported(typeof window !== 'undefined' && 'MediaRecorder' in window);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(SPEECH_LANGUAGE_STORAGE_KEY, speechLanguage);
  }, [speechLanguage]);

  useEffect(
    () => () => {
      stopListening();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [stopListening]
  );

  const handleSpeechToggle = useCallback(async () => {
    if (isListening) {
      stopListening();
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
        void antdMessage.info(`正在录音（${speechLanguage}），再次点击按钮停止并转写...`);
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
            void antdMessage.warning('未识别到语音内容，请重试并靠近麦克风。');
            return;
          }
          onDraftChange(mergeSpeechText(draft, text));
          inputRef.current?.focus();
        } catch (error: unknown) {
          void antdMessage.error(error instanceof Error ? error.message : '语音识别失败');
        } finally {
          setIsTranscribing(false);
          mediaRecorderRef.current = null;
        }
      };

      mediaRecorder.start();
    } catch (error) {
      console.error('Failed to start MediaRecorder:', error);
      void antdMessage.error('无法访问麦克风，请检查浏览器权限设置。');
    }
  }, [draft, isListening, onDraftChange, speechLanguage, stopListening]);

  return (
    <div className={styles['user-chat-input-container']}>
      <div className={styles['user-chat-input-shell']}>
        <div className={styles['user-chat-input-editor']}>
          <TextArea
            ref={inputRef}
            autoSize={{ minRows: 2, maxRows: 6 }}
            value={draft}
            onChange={(event) => {
              if (!isNavigatingHistoryRef.current) {
                setHistoryIndex(-1);
              }
              isNavigatingHistoryRef.current = false;
              onDraftChange(event.target.value);
            }}
            placeholder={placeholder}
            className={styles['user-chat-input-textarea']}
            disabled={disabled || isTranscribing}
            onKeyDown={(e) => {
              // Arrow-key history navigation (no modifier keys)
              if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
                handleHistoryKeyDown(e as React.KeyboardEvent<HTMLTextAreaElement>);
              }
            }}
            onPressEnter={(event) => {
              if (!event.shiftKey) {
                event.preventDefault();
                onSend();
              }
            }}
          />
        </div>
        <div className={styles['user-chat-input-toolbar']}>
          <Segmented
            className={`${styles['user-chat-mode-switch']} ${styles[`mode-${chatMode}`] || ''}`}
            size="small"
            value={chatMode}
            onChange={(value) => onChatModeChange(value as 'chat' | 'task')}
            options={[
              { label: '聊天', value: 'chat', icon: <MessageOutlined /> },
              { label: '任务', value: 'task', icon: <RobotOutlined /> },
            ]}
          />
          <div className={styles['user-chat-input-controls']}>
            <div className={styles['user-chat-control-item']} title={thinkingHint}>
              <span className={styles['user-chat-control-label']}>{thinkingLabel}</span>
              {chatMode === 'chat' && nativeReasoningSupported ? (
                <span className={styles['user-chat-control-badge']}>原生</span>
              ) : null}
              <Switch
                size="small"
                checked={enableThinking}
                onChange={onEnableThinkingChange}
                className={styles['user-chat-input-dot-switch']}
              />
            </div>
          </div>
          <Button
            size="small"
            onClick={onNewSession}
            className={styles['user-chat-input-new-btn']}
            icon={<PlusOutlined />}
          >
            新建
          </Button>
          <Select
            size="small"
            className={styles['user-chat-input-model-select']}
            style={{ width: 140 }}
            value={selectedModel}
            placeholder="模型策略"
            onChange={onModelChange}
            loading={modelsLoading}
            notFoundContent={modelsLoading ? '模型加载中...' : '暂无可用模型'}
            options={[
              { label: 'Auto / 系统默认', value: 'default' },
              ...availableModels.map((model) => ({
                label: supportsNativeReasoning(model)
                  ? `${model.name} (${model.provider}) · 推理`
                  : `${model.name} (${model.provider})`,
                value: model.id,
              })),
            ]}
          />
          <div className={styles['user-chat-input-toolbar-spacer']} />
          <Typography.Text type="secondary" className={styles['user-chat-input-shortcut-hint']}>
            Enter 发送，Shift + Enter 换行，↑↓ 切换历史
          </Typography.Text>
          <div className={styles['user-chat-input-voice-group']}>
            <Select
              size="small"
              value={speechLanguage}
              onChange={setSpeechLanguage}
              style={{ width: 84 }}
              options={SPEECH_LANGUAGE_OPTIONS}
              disabled={disabled || isTranscribing || isListening || !speechSupported}
              className={styles['user-chat-input-language-select']}
            />
            <Button
              size="small"
              icon={<AudioOutlined />}
              onClick={() => {
                void handleSpeechToggle();
              }}
              disabled={disabled || (!speechSupported && !isTranscribing)}
              loading={isTranscribing}
              title={
                speechSupported
                  ? isListening
                    ? '停止语音输入'
                    : '开始语音输入'
                  : '当前浏览器不支持语音输入'
              }
              className={`${styles['user-chat-input-voice-btn']}${isListening ? ` ${styles.active}` : ''}`}
            >
              {isListening ? '录音中' : isTranscribing ? '转写中' : '语音'}
            </Button>
          </div>
          <Button
            type="primary"
            size="small"
            icon={isStreaming ? <StopOutlined /> : <SendOutlined />}
            onClick={() => {
              if (isStreaming) {
                onStop?.();
                return;
              }
              void onSend();
            }}
            disabled={disabled || isTranscribing || (!isStreaming && !draft.trim())}
          >
            {isStreaming ? '停止' : '发送'}
          </Button>
        </div>
      </div>
    </div>
  );
}
