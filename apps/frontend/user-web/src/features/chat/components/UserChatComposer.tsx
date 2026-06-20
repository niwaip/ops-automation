import {
  AudioOutlined,
  MessageOutlined,
  PlusOutlined,
  RobotOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { Button, Input, Select, Segmented, Typography, message as antdMessage } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import type { AIModel } from '@ops/user-core';
import { apiClient, runtimeConfig } from '../../../api';
import { authStore } from '../../../adapters/auth/authStore';

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
  onNewSession: () => void;
  chatMode: 'chat' | 'task';
  onChatModeChange: (mode: 'chat' | 'task') => void;
  selectedModel?: string;
  availableModels: AIModel[];
  onModelChange: (modelId: string) => void;
  isStreaming: boolean;
  modelsLoading?: boolean;
  disabled?: boolean;
  placeholder: string;
}

export function UserChatComposer(props: UserChatComposerProps) {
  const {
    draft,
    onDraftChange,
    onSend,
    onNewSession,
    chatMode,
    onChatModeChange,
    selectedModel,
    availableModels,
    onModelChange,
    isStreaming,
    modelsLoading = false,
    disabled = false,
    placeholder,
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
    <div className="user-chat-input-container">
      <div className="user-chat-input-shell">
        <div className="user-chat-input-editor">
          <TextArea
            ref={inputRef}
            rows={4}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder={placeholder}
            className="user-chat-input-textarea"
            disabled={disabled || isTranscribing}
            onPressEnter={(event) => {
              if (!event.shiftKey) {
                event.preventDefault();
                onSend();
              }
            }}
          />
        </div>
        <div className="user-chat-input-toolbar">
          <Segmented
            size="small"
            value={chatMode}
            onChange={(value) => onChatModeChange(value as 'chat' | 'task')}
            options={[
              { label: '聊天', value: 'chat', icon: <MessageOutlined /> },
              { label: '任务', value: 'task', icon: <RobotOutlined /> },
            ]}
          />
          <Button
            size="small"
            onClick={onNewSession}
            className="user-chat-input-new-btn"
            icon={<PlusOutlined />}
          >
            新建会话
          </Button>
          <Select
            size="small"
            className="user-chat-input-model-select"
            style={{ minWidth: 220 }}
            value={selectedModel}
            placeholder="模型策略"
            onChange={onModelChange}
            loading={modelsLoading}
            notFoundContent={modelsLoading ? '模型加载中...' : '暂无可用模型'}
            options={[
              { label: 'Auto / 系统默认', value: 'default' },
              ...availableModels.map((model) => ({
                label: `${model.name} (${model.provider})`,
                value: model.id,
              })),
            ]}
          />
          <Select
            size="small"
            value={speechLanguage}
            onChange={setSpeechLanguage}
            style={{ width: 104 }}
            options={SPEECH_LANGUAGE_OPTIONS}
            disabled={disabled || isTranscribing || isListening || !speechSupported}
            className="user-chat-input-language-select"
          />
          <div className="user-chat-input-toolbar-spacer" />
          <Typography.Text type="secondary">Enter 发送，Shift + Enter 换行</Typography.Text>
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
            className={`user-chat-input-voice-btn ${isListening ? 'active' : ''}`}
          >
            {isListening ? '录音中' : isTranscribing ? '转写中' : '语音'}
          </Button>
          <Button
            type="primary"
            size="small"
            icon={<SendOutlined />}
            onClick={() => void onSend()}
            loading={isStreaming}
            disabled={disabled || isTranscribing || !draft.trim()}
          >
            发送
          </Button>
        </div>
      </div>
    </div>
  );
}
