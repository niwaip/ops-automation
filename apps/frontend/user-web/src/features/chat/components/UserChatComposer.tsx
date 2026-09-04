import {
  AudioOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  GlobalOutlined,
  PaperClipOutlined,
  PlusOutlined,
  RobotOutlined,
  SendOutlined,
  StopOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Button, Input, Select, Segmented, Switch, Tag, Tooltip, Upload, message as antdMessage } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import type { AIModel, UploadedFileDescriptor } from '@ops/user-core';
import { WorkspaceMentionDropdown } from './WorkspaceMentionDropdown';
import { SlashCommandDropdown } from './SlashCommandDropdown';
import type { SlashCommandDefinition } from '../lib/slashCommands';
import type { WorkspaceNode } from '../../../api/workspace';
import { supportsNativeReasoning } from '@/shared/lib/aiModelReasoning';
import { shouldSubmitChatComposerOnEnter } from '../lib/chatComposerKeyboard';
import {
  SPEECH_LANGUAGE_STORAGE_KEY,
  normalizeSpeechLanguage,
  mergeSpeechText,
  uploadChatFile,
  transcribeAudio,
} from '../lib/chatComposerMedia';

import styles from '../pages/ChatPage.module.css';

const { TextArea } = Input;

interface UserChatComposerProps {
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: (files?: UploadedFileDescriptor[], contentOverride?: string) => void;
  onStop?: () => void;
  onNewSession: () => void;
  chatMode: 'chat' | 'task';
  onChatModeChange: (mode: 'chat' | 'task') => void;
  enableThinking: boolean;
  onEnableThinkingChange: (enabled: boolean) => void;
  enableWebSearch?: boolean;
  onEnableWebSearchChange?: (enabled: boolean) => void;
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
    enableWebSearch = false,
    onEnableWebSearchChange,
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
  const [speechLanguage] = useState(() => {
    if (typeof window === 'undefined') {
      return 'zh-CN';
    }
    const saved = window.localStorage.getItem(SPEECH_LANGUAGE_STORAGE_KEY);
    return normalizeSpeechLanguage(saved || navigator.language);
  });

  // 工作空间全局检索状态（状态按钮，默认关闭）
  const [workspaceSearchEnabled, setWorkspaceSearchEnabled] = useState(false);

  const inputRef = useRef<TextAreaRef | null>(null);
  const compositionActiveRef = useRef(false);
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

  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileDescriptor[]>([]);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  // @ 选文件浮层状态
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [filteredMentionNodes, setFilteredMentionNodes] = useState<WorkspaceNode[]>([]);

  const handleSelectWorkspaceNode = useCallback(
    (node: WorkspaceNode) => {
      const alreadyAdded = uploadedFiles.some(
        (f) => f.fileId === node.id || (f.fileName === node.name && f.source === 'workspace')
      );
      if (!alreadyAdded) {
        setUploadedFiles((prev) => [
          ...prev,
          {
            fileId: node.id,
            fileName: node.name,
            mimeType: node.mimeType || 'application/octet-stream',
            size: Number(node.fileSize),
            source: 'workspace',
            workspaceNodeId: node.id,
            workspaceId: node.workspaceId,
            workspaceType: node.workspaceType,
            storagePath: (node as any).storagePath,
          },
        ]);
        void antdMessage.success(`已引用工作空间文件: ${node.name}`);
      }

      // 清除输入框内尾部的 @query
      const text = draft;
      const textarea = inputRef.current?.resizableTextArea?.textArea;
      const cursorPos = textarea?.selectionStart ?? text.length;
      const textBefore = text.slice(0, cursorPos);
      const textAfter = text.slice(cursorPos);
      const newBefore = textBefore.replace(/[@＠]([^\s@＠]*)$/, '');
      onDraftChange(newBefore + textAfter);
      setMentionOpen(false);

      setTimeout(() => {
        textarea?.focus();
      }, 50);
    },
    [draft, onDraftChange, uploadedFiles]
  );

  // / 触发 Slash 命令浮层状态
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [filteredSlashCommands, setFilteredSlashCommands] = useState<SlashCommandDefinition[]>([]);

  const handleSelectSlashCommand = useCallback(
    (cmd: SlashCommandDefinition) => {
      const text = draft;
      const textarea = inputRef.current?.resizableTextArea?.textArea;
      const cursorPos = textarea?.selectionStart ?? text.length;
      const textBefore = text.slice(0, cursorPos);
      const textAfter = text.slice(cursorPos);
      const newBefore = textBefore.replace(/(?:^|\s)[/、]([^\s/、]*)$/, (match) => {
        const leading = match.startsWith(' ') ? ' ' : '';
        return `${leading}${cmd.command} `;
      });
      onDraftChange(newBefore + textAfter);
      setSlashOpen(false);

      setTimeout(() => {
        textarea?.focus();
      }, 50);
    },
    [draft, onDraftChange]
  );

  const handleFileUpload = useCallback(async (file: File) => {
    setIsUploadingFile(true);
    try {
      const uploaded = await uploadChatFile(file);
      setUploadedFiles((prev) => [...prev, uploaded]);
      void antdMessage.success(`已添加附件: ${file.name}`);
    } catch (err: unknown) {
      console.error('File upload failed:', err);
      void antdMessage.error(err instanceof Error ? err.message : '附件上传失败');
    } finally {
      setIsUploadingFile(false);
    }
    return false;
  }, []);

  const handleRemoveFile = useCallback((fileId?: string, fileName?: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.fileId !== fileId || f.fileName !== fileName));
  }, []);

  const handleTriggerSend = useCallback(() => {
    const filesToSend = [...uploadedFiles];
    setUploadedFiles([]);
    const trimmed = draft.trim();
    if (workspaceSearchEnabled && trimmed && !trimmed.startsWith('/')) {
      onSend(filesToSend, `/doc ${trimmed}`);
      return;
    }
    onSend(filesToSend);
  }, [onSend, uploadedFiles, workspaceSearchEnabled, draft]);

  return (
    <div className={styles['user-chat-input-container']} style={{ position: 'relative' }}>
      <WorkspaceMentionDropdown
        open={mentionOpen}
        searchQuery={mentionQuery}
        selectedIndex={mentionIndex}
        onHoverIndex={setMentionIndex}
        onFilteredNodesChange={setFilteredMentionNodes}
        onSelect={handleSelectWorkspaceNode}
        onClose={() => setMentionOpen(false)}
      />
      <SlashCommandDropdown
        open={slashOpen}
        searchQuery={slashQuery}
        selectedIndex={slashIndex}
        onHoverIndex={setSlashIndex}
        onFilteredCommandsChange={setFilteredSlashCommands}
        onSelect={handleSelectSlashCommand}
        onClose={() => setSlashOpen(false)}
      />
      <div className={styles['user-chat-input-shell']}>
        {uploadedFiles.length > 0 && (
          <div className={styles['user-chat-input-attachments-bar']}>
            {uploadedFiles.map((file, idx) => (
              <Tag
                key={file.fileId || `${file.fileName}-${idx}`}
                closable
                onClose={() => handleRemoveFile(file.fileId, file.fileName)}
                icon={file.source === 'workspace' ? <FolderOutlined /> : <PaperClipOutlined />}
                className={styles['user-chat-input-file-tag']}
              >
                {file.source === 'workspace' && (
                  <span style={{ color: 'var(--primary-color)', marginRight: 4, fontWeight: 600 }}>
                    [{file.workspaceType === 'personal' ? '我的' : file.workspaceType === 'department' ? '部门' : '公共'}]
                  </span>
                )}
                {file.fileName}
              </Tag>
            ))}
          </div>
        )}
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
              const text = event.target.value;
              onDraftChange(text);

              // 探测光标处是否有 @ 触发词（支持英文半角 @ 与中文全角 ＠）
              const cursorPos = event.target.selectionStart ?? text.length;
              const textBeforeCursor = text.slice(0, cursorPos);
              const atMatch = textBeforeCursor.match(/[@＠]([^\s@＠]*)$/);
              if (atMatch) {
                setMentionOpen(true);
                setMentionQuery(atMatch[1]);
                setMentionIndex(0);
                setSlashOpen(false);
              } else {
                setMentionOpen(false);
                // 探测光标处是否有 / 或 、 触发词
                const slashMatch = textBeforeCursor.match(/(?:^|\s)[/、]([^\s/、]*)$/);
                if (slashMatch) {
                  setSlashOpen(true);
                  setSlashQuery(slashMatch[1]);
                  setSlashIndex(0);
                } else {
                  setSlashOpen(false);
                }
              }
            }}
            placeholder={
              workspaceSearchEnabled && enableWebSearch
                ? '已开启联网与知识库检索，输入问题直接提问...（输入 / 唤起技能指令，@ 引用文件）'
                : workspaceSearchEnabled
                  ? '已开启知识库检索，输入问题直接研读空间文档...（输入 / 唤起技能指令，@ 引用文件）'
                  : enableWebSearch
                    ? '已开启全网实时搜索，输入问题直接检索...（输入 / 唤起技能指令，@ 引用文件）'
                    : placeholder || '输入消息，Enter 发送，Shift+Enter 换行（输入 / 唤起技能指令，@ 引用文件）'
            }
            className={styles['user-chat-input-textarea']}
            disabled={disabled || isTranscribing || isUploadingFile}
            onCompositionStart={() => {
              compositionActiveRef.current = true;
            }}
            onCompositionEnd={() => {
              compositionActiveRef.current = false;
            }}
            onKeyDown={(e) => {
              if (mentionOpen && filteredMentionNodes.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setMentionIndex((prev) => (prev + 1) % filteredMentionNodes.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setMentionIndex(
                    (prev) => (prev - 1 + filteredMentionNodes.length) % filteredMentionNodes.length
                  );
                  return;
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSelectWorkspaceNode(filteredMentionNodes[mentionIndex]);
                  return;
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setMentionOpen(false);
                  return;
                }
              }

              if (slashOpen && filteredSlashCommands.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setSlashIndex((prev) => (prev + 1) % filteredSlashCommands.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setSlashIndex(
                    (prev) => (prev - 1 + filteredSlashCommands.length) % filteredSlashCommands.length
                  );
                  return;
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSelectSlashCommand(filteredSlashCommands[slashIndex]);
                  return;
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setSlashOpen(false);
                  return;
                }
              }

              // Arrow-key history navigation (no modifier keys)
              if (
                !mentionOpen &&
                !slashOpen &&
                (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
                !e.shiftKey &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey
              ) {
                handleHistoryKeyDown(e as React.KeyboardEvent<HTMLTextAreaElement>);
              }
            }}
            onPressEnter={(event) => {
              if (
                (mentionOpen && filteredMentionNodes.length > 0) ||
                (slashOpen && filteredSlashCommands.length > 0)
              ) {
                return;
              }
              if (
                shouldSubmitChatComposerOnEnter(
                  event as React.KeyboardEvent<HTMLTextAreaElement>,
                  compositionActiveRef.current
                )
              ) {
                event.preventDefault();
                handleTriggerSend();
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
              { label: '个人', value: 'chat', icon: <UserOutlined /> },
              { label: '工作', value: 'task', icon: <RobotOutlined /> },
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
            <div
              className={styles['user-chat-control-item']}
              title={
                enableWebSearch
                  ? '联网搜索：已开启（允许 AI 检索互联网公开资讯，点击关闭）'
                  : '联网搜索：已关闭（可选开启，开启后允许 AI 检索互联网公开资讯）'
              }
            >
              <span className={styles['user-chat-control-label']}>
                <GlobalOutlined
                  style={{
                    marginRight: 4,
                    color: enableWebSearch ? '#6366f1' : undefined,
                  }}
                />
                联网
              </span>
              <Switch
                size="small"
                checked={enableWebSearch}
                onChange={onEnableWebSearchChange}
                className={styles['user-chat-input-dot-switch']}
              />
            </div>
            <div
              className={styles['user-chat-control-item']}
              title={
                workspaceSearchEnabled
                  ? '工作空间知识检索：已开启（提问将自动探查并研读空间文档，点击关闭）'
                  : '工作空间知识检索：已关闭（可选开启，开启后提问将自动探查并研读空间文档）'
              }
            >
              <span className={styles['user-chat-control-label']}>
                {workspaceSearchEnabled ? (
                  <FolderOpenOutlined style={{ marginRight: 4, color: '#6366f1' }} />
                ) : (
                  <FolderOutlined style={{ marginRight: 4 }} />
                )}
                知识
              </span>
              <Switch
                size="small"
                checked={workspaceSearchEnabled}
                onChange={setWorkspaceSearchEnabled}
                className={styles['user-chat-input-dot-switch']}
              />
            </div>
          </div>
          <div className={styles['user-chat-input-toolbar-spacer']} />
          <div className={styles['user-chat-input-actions-group']}>
            <Select
              size="small"
              className={styles['user-chat-input-model-select']}
              style={{ width: 205 }}
              value={selectedModel}
              placeholder="选择模型策略"
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
            <Upload
              beforeUpload={(file) => {
                void handleFileUpload(file as unknown as File);
                return false;
              }}
              showUploadList={false}
              disabled={disabled || isTranscribing || isUploadingFile}
            >
              <Tooltip title="添加本地附件">
                <Button
                  size="small"
                  icon={<PaperClipOutlined />}
                  loading={isUploadingFile}
                  disabled={disabled || isTranscribing}
                  className={styles['user-chat-input-icon-btn']}
                />
              </Tooltip>
            </Upload>
            <Tooltip
              title={
                speechSupported
                  ? isListening
                    ? '点击停止语音录制'
                    : isTranscribing
                      ? '语音转写中...'
                      : '语音输入'
                  : '语音输入'
              }
            >
              <Button
                size="small"
                icon={<AudioOutlined />}
                onClick={() => {
                  void handleSpeechToggle();
                }}
                disabled={disabled || (!speechSupported && !isTranscribing)}
                loading={isTranscribing}
                className={`${styles['user-chat-input-icon-btn']}${isListening ? ` ${styles.active}` : ''}`}
              />
            </Tooltip>
            <Tooltip title="新建对话">
              <Button
                size="small"
                onClick={onNewSession}
                className={styles['user-chat-input-icon-btn']}
                icon={<PlusOutlined />}
              />
            </Tooltip>
            <Button
              type="primary"
              size="small"
              icon={isStreaming ? <StopOutlined /> : <SendOutlined />}
              onClick={() => {
                if (isStreaming) {
                  onStop?.();
                  return;
                }
                handleTriggerSend();
              }}
              disabled={
                disabled ||
                isTranscribing ||
                isUploadingFile ||
                (!isStreaming && !draft.trim() && uploadedFiles.length === 0)
              }
              className={styles['user-chat-input-send-btn']}
            >
              {isStreaming ? '停止' : '发送'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
