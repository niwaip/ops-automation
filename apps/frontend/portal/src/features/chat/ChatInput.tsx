/**
 * ChatInput
 * 聊天输入框组件 - 包含模式切换和停止按钮
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Input, Button, Upload, Tag, Switch, Select, message as antdMessage } from 'antd';
import {
  SendOutlined,
  PaperClipOutlined,
  StopOutlined,
  PlusOutlined,
  MessageOutlined,
  RobotOutlined,
  AudioOutlined,
} from '@ant-design/icons';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import type { RcFile } from 'antd/es/upload';
import type { UploadedFile, AIModel } from './types';
import { uploadFile, transcribeAudio } from './chatApi';
import { useChatStore } from './chatStore';
import './ChatInput.css';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  uploadedFiles: UploadedFile[];
  onNewSession?: () => void;
  selectedModel: string | null;
  availableModels: AIModel[];
  onModelChange: (modelId: string) => void;
}

const SPEECH_LANGUAGE_STORAGE_KEY = 'chat.speech.lang';

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

const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  disabled,
  uploadedFiles,
  onNewSession,
  selectedModel,
  availableModels,
  onModelChange,
}) => {
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);
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
  const inputRef = useRef<TextAreaRef>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const {
    addUploadedFile,
    removeUploadedFile,
    chatMode,
    toggleChatMode,
    isLoading,
    abortCurrentStreaming,
    enableThinking,
    enableWebSearch,
    setEnableThinking,
    setEnableWebSearch,
    draftMessage,
    setDraftMessage,
  } = useChatStore();

  const getSpeechRecognitionConstructor = useCallback(() => {
    if (typeof window === 'undefined') {
      return null;
    }
    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition || null;
  }, []);

  const mergeSpeechText = useCallback((baseText: string, speechText: string) => {
    const normalizedSpeechText = speechText.trim();
    if (!normalizedSpeechText) {
      return baseText;
    }
    if (!baseText.trim()) {
      return normalizedSpeechText;
    }
    return `${baseText.replace(/\s+$/, '')}\n${normalizedSpeechText}`;
  }, []);

  const stopRecognition = useCallback((abort = false) => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    const recognition = recognitionRef.current;
    if (!recognition) {
      return;
    }
    if (abort) {
      recognition.abort();
    } else {
      recognition.stop();
    }
  }, []);

  useEffect(() => {
    if (!draftMessage) {
      return;
    }
    setMessage(draftMessage);
    setDraftMessage('');
    inputRef.current?.focus();
  }, [draftMessage, setDraftMessage]);

  useEffect(() => {
    // 只有当不支持 MediaRecorder 和 SpeechRecognition 都不支持时才禁用
    const hasMediaRecorder = typeof window !== 'undefined' && 'MediaRecorder' in window;
    setSpeechSupported(Boolean(getSpeechRecognitionConstructor()) || hasMediaRecorder);
  }, [getSpeechRecognitionConstructor]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(SPEECH_LANGUAGE_STORAGE_KEY, speechLanguage);
  }, [speechLanguage]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
      }
      stopRecognition(true);
    };
  }, [stopRecognition]);

  // 发送消息
  const handleSend = () => {
    if (message.trim() || uploadedFiles.length > 0) {
      if (isListening) {
        stopRecognition();
      }
      onSend(message);
      setMessage('');
    }
  };

  // 停止执行
  const handleStop = () => {
    abortCurrentStreaming();
  };

  // 处理文件上传
  const handleFileUpload = async (file: RcFile) => {
    setUploading(true);
    try {
      const uploaded = await uploadFile(file as unknown as File);
      addUploadedFile(uploaded);
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setUploading(false);
    }
    return false; // 阻止默认上传行为
  };

  // 键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSpeechToggle = async () => {
    // 始终使用后端的录音转写服务，如果不指定模型则使用默认语音识别模型
    if (isListening) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstart = () => {
        setIsListening(true);
        void antdMessage.info('正在录音，请开始说话，再次点击按钮停止并转写...');
      };

      mediaRecorder.onstop = async () => {
        setIsListening(false);
        setIsTranscribing(true);
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

        // 释放麦克风资源
        stream.getTracks().forEach((track) => track.stop());

        try {
          const text = await transcribeAudio(audioBlob, 'default');
          if (!text.trim()) {
            void antdMessage.warning('未识别到语音内容，请重试并靠近麦克风。');
            return;
          }
          setMessage((prev) => mergeSpeechText(prev, text));
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
  };

  return (
    <div className="chat-input-container">
      {/* 已上传文件显示 */}
      {uploadedFiles.length > 0 && (
        <div className="chat-uploaded-files">
          <div className="chat-uploaded-files-header">
            <span className="chat-uploaded-files-title">附件</span>
            <span className="chat-uploaded-files-count">{uploadedFiles.length}</span>
          </div>
          <div className="chat-uploaded-files-list">
            {uploadedFiles.map((file) => (
              <Tag
                key={file.fileId}
                closable
                onClose={() => removeUploadedFile(file.fileId)}
                icon={<PaperClipOutlined />}
                className="chat-uploaded-file-tag"
              >
                {file.fileName}
              </Tag>
            ))}
          </div>
        </div>
      )}

      <div className="chat-input-shell">
        <div className="chat-input-editor">
          <Input.TextArea
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息，按 Enter 发送..."
            autoSize={{ minRows: 4, maxRows: 8 }}
            disabled={disabled || uploading}
            className="chat-input-textarea"
          />
        </div>

        <div className="chat-input-toolbar">
          <Button
            size="small"
            type={chatMode === 'task' ? 'primary' : 'default'}
            icon={chatMode === 'task' ? <RobotOutlined /> : <MessageOutlined />}
            onClick={toggleChatMode}
            className="chat-input-mode-toggle-btn"
          >
            {chatMode === 'chat' ? '聊天' : '任务'}
          </Button>

          <div className="chat-input-controls">
            <div className="chat-control-item">
              <span className="chat-control-label">联网</span>
              <Switch
                size="small"
                checked={enableWebSearch}
                onChange={setEnableWebSearch}
                className="chat-input-dot-switch"
              />
            </div>
            <div className="chat-control-item">
              <span className="chat-control-label">思考</span>
              <Switch
                size="small"
                checked={enableThinking}
                onChange={setEnableThinking}
                className="chat-input-dot-switch"
              />
            </div>
          </div>
          {chatMode === 'task' && <Tag color="processing">ReAct</Tag>}

          <div className="chat-input-toolbar-spacer" />

          <Button
            type="default"
            icon={<PlusOutlined />}
            onClick={onNewSession}
            size="small"
            title="新对话"
            className="chat-input-new-btn"
          >
            新建
          </Button>

          <Select
            value={selectedModel || undefined}
            onChange={onModelChange}
            style={{ width: 150 }}
            options={[
              { value: 'default', label: 'Auto / 系统默认' },
              ...availableModels.map((m) => ({
                value: m.id,
                label: m.config?.display_name || m.name,
              })),
            ]}
            placeholder="模型策略"
            size="small"
            className="chat-input-model-select"
          />

          <Upload
            beforeUpload={handleFileUpload}
            showUploadList={false}
            disabled={disabled || uploading}
          >
            <Button
              type="text"
              icon={<PaperClipOutlined />}
              loading={uploading}
              disabled={disabled}
              title="上传文件"
            />
          </Upload>

          <Select
            value={speechLanguage}
            onChange={setSpeechLanguage}
            style={{ width: 96 }}
            options={SPEECH_LANGUAGE_OPTIONS}
            size="small"
            disabled={disabled || uploading || isListening || !speechSupported}
            title="语音识别语言"
          />

          <Button
            type="text"
            icon={<AudioOutlined />}
            loading={isTranscribing}
            onClick={() => void handleSpeechToggle()}
            disabled={disabled || uploading || (!speechSupported && !isTranscribing)}
            title={
              speechSupported
                ? isListening
                  ? '停止语音输入'
                  : '开始语音输入'
                : '当前浏览器不支持语音输入'
            }
            className={`chat-input-voice-btn ${isListening ? 'chat-input-voice-btn-active' : ''} ${isTranscribing ? 'transcribing' : ''}`}
          />

          {isLoading ? (
            <Button
              type="primary"
              danger
              icon={<StopOutlined />}
              onClick={handleStop}
              title="停止执行"
            />
          ) : (
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSend}
              disabled={disabled || (!message.trim() && uploadedFiles.length === 0)}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
