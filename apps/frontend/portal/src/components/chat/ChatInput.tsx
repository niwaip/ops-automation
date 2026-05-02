/**
 * ChatInput
 * 聊天输入框组件 - 包含模式切换和停止按钮
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Input, Button, Upload, Space, Tag, Switch, Select, message as antdMessage } from 'antd';
import { SendOutlined, PaperClipOutlined, StopOutlined, PlusOutlined, MessageOutlined, RobotOutlined, AudioOutlined } from '@ant-design/icons';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { RcFile } from 'antd/es/upload';
import { UploadedFile, AIModel } from './types';
import { uploadFile } from './chatApi';
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
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const inputRef = useRef<TextAreaRef>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const speechBaseMessageRef = useRef('');
  const finalTranscriptRef = useRef('');

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

  const resolveSpeechErrorMessage = useCallback((error: string) => {
    const isSecureContextUnavailable =
      typeof window !== 'undefined'
      && !window.isSecureContext
      && window.location.hostname !== 'localhost'
      && window.location.hostname !== '127.0.0.1';

    if (error === 'not-allowed') {
      if (isSecureContextUnavailable) {
        return '当前页面不是安全上下文，请改用 localhost 或 HTTPS 后再启用语音输入。';
      }
      return '麦克风权限被拒绝，请先在浏览器站点权限和系统设置里允许麦克风访问。';
    }

    const errorTextMap: Record<string, string> = {
      'audio-capture': '未检测到可用麦克风，请检查设备是否连接并已授予系统权限。',
      'service-not-allowed': '当前浏览器或系统禁止语音识别服务，请检查浏览器站点权限和系统麦克风权限。',
      'network': '语音识别网络异常，请稍后重试。',
      'no-speech': '没有检测到语音，请靠近麦克风后重试。',
      'aborted': '语音识别已取消。',
    };

    return errorTextMap[error] || `语音识别失败: ${error}`;
  }, []);

  const stopRecognition = useCallback((abort = false) => {
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
    setSpeechSupported(Boolean(getSpeechRecognitionConstructor()));
  }, [getSpeechRecognitionConstructor]);

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

  const handleSpeechToggle = () => {
    const SpeechRecognitionConstructor = getSpeechRecognitionConstructor();
    if (!SpeechRecognitionConstructor) {
      const isSecureContextUnavailable =
        typeof window !== 'undefined'
        && !window.isSecureContext
        && window.location.hostname !== 'localhost'
        && window.location.hostname !== '127.0.0.1';
      void antdMessage.warning(
        isSecureContextUnavailable
          ? '当前页面不是安全上下文，请改用 localhost 或 HTTPS 访问后再使用语音输入。'
          : '当前浏览器不支持语音识别，请使用 Chromium 系浏览器。'
      );
      return;
    }

    if (isListening) {
      stopRecognition();
      return;
    }

    finalTranscriptRef.current = '';
    speechBaseMessageRef.current = message;

    const recognition = new SpeechRecognitionConstructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'zh-CN';

    recognition.onstart = () => {
      setIsListening(true);
      void antdMessage.info('语音识别已开始，请开始说话。');
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let nextFinalTranscript = finalTranscriptRef.current;
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0]?.transcript || '';
        if (event.results[i].isFinal) {
          nextFinalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      finalTranscriptRef.current = nextFinalTranscript;
      setMessage(
        mergeSpeechText(
          speechBaseMessageRef.current,
          `${nextFinalTranscript}${interimTranscript}`
        )
      );
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setIsListening(false);
      const errorMessage = resolveSpeechErrorMessage(event.error);
      if (event.error !== 'aborted') {
        void antdMessage.error(errorMessage);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  return (
    <div className="chat-input-container">
      {/* 已上传文件显示 */}
      {uploadedFiles.length > 0 && (
        <div className="chat-uploaded-files">
          <Space>
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
          </Space>
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

          <Button
            type="text"
            icon={<AudioOutlined />}
            onClick={handleSpeechToggle}
            disabled={disabled || uploading || !speechSupported}
            title={speechSupported ? (isListening ? '停止语音输入' : '开始语音输入') : '当前浏览器不支持语音输入'}
            className={isListening ? 'chat-input-voice-btn chat-input-voice-btn-active' : 'chat-input-voice-btn'}
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
