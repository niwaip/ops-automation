import {
  AudioOutlined,
  CloudSyncOutlined,
  CompassOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  GlobalOutlined,
  PaperClipOutlined,
  PlusOutlined,
  RobotOutlined,
  SendOutlined,
  StopOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Button, Input, Select, Segmented, Space, Switch, Tag, Tooltip, Upload, message as antdMessage } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import type { AIModel, UploadedFileDescriptor } from '@ops/user-core';
import { WorkspaceMentionDropdown } from './WorkspaceMentionDropdown';
import { UserCoordinationMentionDropdown } from './UserCoordinationMentionDropdown';
import { CoordinationTaskCardModal } from './CoordinationTaskCardModal';
import { WorkflowSelectionDropdown, type WorkflowOptionItem } from './WorkflowSelectionDropdown';
import type { CollaboratorUser } from '../../../api/workbenchCoordination';
import { useChatComposerHistory } from '../hooks/useChatComposerHistory';
import { useChatSpeechRecorder } from '../hooks/useChatSpeechRecorder';
import { SlashCommandDropdown } from './SlashCommandDropdown';
import { isWorkSlashCommand, isPersonalSlashCommand, type SlashCommandDefinition } from '../lib/slashCommands';
import type { WorkspaceNode } from '../../../api/workspace';
import { supportsNativeReasoning } from '@/shared/lib/aiModelReasoning';
import { shouldSubmitChatComposerOnEnter } from '../lib/chatComposerKeyboard';
import { uploadChatFile } from '../lib/chatComposerMedia';
import { useChatStore } from '../chatStore';

import styles from '../pages/ChatPage.module.css';

import { UserChatTaskContextBar } from './UserChatTaskContextBar';
import {
  PARAM_LABEL_MAP,
  IGNORED_TASK_CONTEXT_PARAM_KEYS,
} from '../lib/chatComposerConstants';

const { TextArea } = Input;

interface UserChatComposerProps {
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: (files?: UploadedFileDescriptor[], contentOverride?: string) => void;
  onStop?: () => void;
  onRunInBackground?: () => void;
  onNewSession: () => void;
  chatMode: 'chat' | 'task';
  onChatModeChange: (mode: 'chat' | 'task') => void;
  enableThinking: boolean;
  onEnableThinkingChange: (enabled: boolean) => void;
  enableWebSearch?: boolean;
  onEnableWebSearchChange?: (enabled: boolean) => void;
  enableResearch?: boolean;
  onEnableResearchChange?: (enabled: boolean) => void;
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
    onRunInBackground,
    onNewSession,
    chatMode,
    onChatModeChange,
    enableThinking,
    onEnableThinkingChange,
    enableWebSearch = false,
    onEnableWebSearchChange,
    enableResearch = false,
    onEnableResearchChange,
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

  // Speech recorder hook
  const {
    isListening,
    isTranscribing,
    speechSupported,
    handleSpeechToggle,
  } = useChatSpeechRecorder({
    draft,
    onDraftChange,
    onFocusInput: () => inputRef.current?.focus(),
  });

  // 工作空间全局检索状态（状态按钮，默认关闭）
  const [workspaceSearchEnabled, setWorkspaceSearchEnabled] = useState(false);

  const inputRef = useRef<TextAreaRef | null>(null);
  const compositionActiveRef = useRef(false);

  // History navigation hook
  const {
    resetHistoryIndex,
    handleHistoryKeyDown,
  } = useChatComposerHistory({
    draft,
    onDraftChange,
    sentHistory,
  });

  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileDescriptor[]>([]);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  const taskContext = useChatStore((state) => state.taskContext);
  const setTaskContext = useChatStore((state) => state.setTaskContext);

  // 自动将任务上下文关联的文档载入为附件
  useEffect(() => {
    if (!taskContext?.attachments || taskContext.attachments.length === 0) return;
    const newFiles: UploadedFileDescriptor[] = taskContext.attachments.map((att, i) => ({
      fileId: `task-att-${i}-${att.name}`,
      fileName: att.name,
      mimeType: att.mimeType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: att.size || 0,
      storagePath: att.url,
      url: att.url,
      downloadUrl: att.url,
      fileUrl: att.url,
      source: 'workspace',
    }));
    if (taskContext.workflowId === 'platform.document.contract-comparator') {
      // 合同比对场景：严格只保留待比对的基准与修订两份文档
      setUploadedFiles(newFiles);
    } else {
      setUploadedFiles((prev) => {
        const existingNames = new Set(prev.map((f) => f.fileName));
        const toAdd = newFiles.filter((f) => !existingNames.has(f.fileName));
        return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
      });
    }
  }, [taskContext]);

  // # 选空间文件浮层状态
  const [workspaceMentionOpen, setWorkspaceMentionOpen] = useState(false);
  const [workspaceMentionQuery, setWorkspaceMentionQuery] = useState('');
  const [workspaceMentionIndex, setWorkspaceMentionIndex] = useState(0);
  const [filteredMentionNodes, setFilteredMentionNodes] = useState<WorkspaceNode[]>([]);

  // @ 选人员协同浮层状态
  const [userMentionOpen, setUserMentionOpen] = useState(false);
  const [userMentionQuery, setUserMentionQuery] = useState('');
  const [userMentionIndex, setUserMentionIndex] = useState(0);
  const [filteredUsers, setFilteredUsers] = useState<CollaboratorUser[]>([]);
  const [lastMentionedUser, setLastMentionedUser] = useState<CollaboratorUser | null>(null);
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [selectedAssignee, setSelectedAssignee] = useState<CollaboratorUser | null>(null);

  // 工作流选择浮层状态（支持 ! / ！与 @空格 唤起）
  const [workflowSelectionOpen, setWorkflowSelectionOpen] = useState(false);
  const [workflowSelectionMode, setWorkflowSelectionMode] = useState<'bang' | 'at'>('bang');
  const [workflowSelectionQuery, setWorkflowSelectionQuery] = useState<string>('');
  const [workflowSelectionUser, setWorkflowSelectionUser] = useState<string>('');
  const [workflowSelectionIndex, setWorkflowSelectionIndex] = useState(0);
  const [filteredWorkflowItems, setFilteredWorkflowItems] = useState<WorkflowOptionItem[]>([]);

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
            storagePath: (node as any).storagePath || (node as any).url,
            url: (node as any).url || (node as any).downloadUrl || (node as any).storagePath,
            downloadUrl: (node as any).downloadUrl || (node as any).url || (node as any).storagePath,
            fileUrl: (node as any).fileUrl || (node as any).storagePath,
          },
        ]);
        void antdMessage.success(`已引用工作空间文件: ${node.name}`);
      }

      // 清除输入框内尾部的 #query
      const text = draft;
      const textarea = inputRef.current?.resizableTextArea?.textArea;
      const cursorPos = textarea?.selectionStart ?? text.length;
      const textBefore = text.slice(0, cursorPos);
      const textAfter = text.slice(cursorPos);
      const newBefore = textBefore.replace(/[#＃]([^\s#＃]*)$/, '');
      onDraftChange(newBefore + textAfter);
      setWorkspaceMentionOpen(false);

      setTimeout(() => {
        textarea?.focus();
      }, 50);
    },
    [draft, onDraftChange, uploadedFiles]
  );

  const [cardInitialTemplateId, setCardInitialTemplateId] = useState<string>('legal.contract.review_flow');
  const [cardInitialValues, setCardInitialValues] = useState<Record<string, any>>({});

  // 智能嗅探自然语言协同意图（仅协同任务模式生效）
  const detectedWorkflowIntent = useMemo(() => {
    if (chatMode !== 'task' || !draft || !draft.includes('@')) return null;
    const lower = draft.toLowerCase();
    if (/保密|nda/i.test(lower)) {
      return {
        templateId: 'legal.nda.generation_and_review_flow',
        name: '保密合同起草与法务审查闭环流',
        tag: '法务风控',
      };
    }
    if (/合同|协议|审查|法务/i.test(lower)) {
      return {
        templateId: 'legal.contract.review_flow',
        name: '标准合同起草与法务审查闭环流',
        tag: '法务风控',
      };
    }
    return null;
  }, [chatMode, draft]);

  const handleSelectUser = useCallback(
    (user: CollaboratorUser, mode: 'freeform' | 'card' = 'freeform') => {
      if (!user || !user.username) return;
      setLastMentionedUser(user);
      setSelectedAssignee(user);
      const text = draft;
      const textarea = inputRef.current?.resizableTextArea?.textArea;
      const cursorPos = textarea?.selectionStart ?? text.length;
      const textBefore = text.slice(0, cursorPos);
      const textAfter = text.slice(cursorPos);
      // 注意：@ 选择用户后不要带空格，用户后续输入空格时才触发流程卡片选择
      const newBefore = textBefore.replace(/[@＠]([^\s@＠]*)$/, `@${user.username}`);
      onDraftChange(newBefore + textAfter);
      setUserMentionOpen(false);

      if (mode === 'card') {
        setCardInitialTemplateId('legal.contract.review_flow');
        setCardInitialValues({});
        setCardModalOpen(true);
      } else {
        const newPos = newBefore.length;
        setTimeout(() => {
          if (textarea) {
            textarea.focus();
            textarea.setSelectionRange(newPos, newPos);
          }
        }, 50);
      }
    },
    [draft, onDraftChange]
  );

  const handleSelectWorkflow = useCallback(
    (templateId: string, isModalAction?: boolean, workflowItem?: WorkflowOptionItem) => {
      setWorkflowSelectionOpen(false);

      // 如果用户主动选择打开卡片弹窗，保持原有弹窗体验
      if (isModalAction) {
        const targetUser = lastMentionedUser || {
          id: '',
          username: workflowSelectionUser || '协同成员',
          email: null,
        };
        setSelectedAssignee(targetUser);

        const text = draft;
        const lower = text.toLowerCase();
        if (templateId === 'legal.nda.generation_and_review_flow' || /保密|nda/i.test(lower)) {
          setCardInitialTemplateId('legal.nda.generation_and_review_flow');
          setCardInitialValues({});
        } else {
          setCardInitialTemplateId(templateId || 'legal.contract.review_flow');
          setCardInitialValues({});
        }
        setCardModalOpen(true);
        return;
      }

      // 自然语言调用工作流模式（核心体验）：在输入框带入 !工作流名称 ，让用户直接输入自然语言，不需要卡片
      const text = draft;
      const textarea = inputRef.current?.resizableTextArea?.textArea;
      const cursorPos = textarea?.selectionStart ?? text.length;
      const textBefore = text.slice(0, cursorPos);
      const textAfter = text.slice(cursorPos);

      const workflowLabel = workflowItem?.name || templateId;

      let newBefore = textBefore;
      if (workflowSelectionMode === 'bang') {
        newBefore = textBefore.replace(/(?:^|\s)[!！]([^\s!！]*)$/, (match) => {
          const leading = match.startsWith(' ') ? ' ' : '';
          return `${leading}!${workflowLabel} `;
        });
      } else {
        newBefore = `${textBefore}!${workflowLabel} `;
      }

      onDraftChange(newBefore + textAfter);

      setTimeout(() => {
        if (textarea) {
          textarea.focus();
          const newPos = newBefore.length;
          textarea.setSelectionRange(newPos, newPos);
        }
      }, 50);
    },
    [draft, onDraftChange, workflowSelectionMode, lastMentionedUser, workflowSelectionUser]
  );

  // / 触发 Slash 命令浮层状态
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [filteredSlashCommands, setFilteredSlashCommands] = useState<SlashCommandDefinition[]>([]);

  const handleSelectSlashCommand = useCallback(
    (cmd: SlashCommandDefinition) => {
      if (cmd.disabled) {
        void antdMessage.warning(cmd.disabledReason || '当前指令暂不可用');
        return;
      }
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

  const activeUploadsCountRef = useRef(0);
  const handleFileUpload = useCallback(async (file: File) => {
    activeUploadsCountRef.current += 1;
    setIsUploadingFile(true);
    try {
      const uploaded = await uploadChatFile(file);
      setUploadedFiles((prev) => [...prev, uploaded]);
    } catch (err: unknown) {
      console.error('File upload failed:', err);
      let msg = err instanceof Error ? err.message : '附件上传失败';
      if (msg === 'Failed to fetch') {
        msg = '附件上传失败：网络连接中断或服务异常';
      }
      void antdMessage.error(msg);
    } finally {
      activeUploadsCountRef.current -= 1;
      if (activeUploadsCountRef.current <= 0) {
        activeUploadsCountRef.current = 0;
        setIsUploadingFile(false);
      }
    }
    return false;
  }, []);

  const handleRemoveFile = useCallback((fileId?: string, fileName?: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.fileId !== fileId || f.fileName !== fileName));
  }, []);

  const handleTriggerSend = useCallback(() => {
    const trimmed = draft.trim();
    if (chatMode === 'chat' && isWorkSlashCommand(trimmed)) {
      void antdMessage.warning(
        '提示：/doc、/email、/extract 为工作模式专属企业技能。个人模式请使用 /ppt、/research、/excel、/word 等独立沙箱指令，如需企业知识协同请在左下方切换至「工作模式」。'
      );
      return;
    }
    if (chatMode === 'task' && isPersonalSlashCommand(trimmed)) {
      void antdMessage.warning(
        '提示：/ppt、/research 等为个人模式沙箱专属工具链。如需体验深度技术调研或PPT生成，请在左下方切换至「个人模式」。'
      );
      return;
    }
    const filesToSend = [...uploadedFiles];
    setUploadedFiles([]);

    if (lastMentionedUser) {
      setLastMentionedUser(null);
    }

    let finalMessage = trimmed;
    if (taskContext && trimmed) {
      const contextLines: string[] = [
        '',
        '---',
        '📋 **【关联协同任务上下文】**',
        `- **任务标题**：${taskContext.taskTitle}`,
      ];
      if (taskContext.workflowId) {
        contextLines.push(`- **业务流程**：${taskContext.workflowId}`);
      }
      if (taskContext.taskContent && taskContext.taskContent !== taskContext.taskTitle) {
        contextLines.push(`- **任务要求**：${taskContext.taskContent}`);
      }
      if (taskContext.parameters && Object.keys(taskContext.parameters).length > 0) {
        const paramStrs = Object.entries(taskContext.parameters)
          .filter(([k]) => !IGNORED_TASK_CONTEXT_PARAM_KEYS.has(k))
          .map(([k, v]) => `${PARAM_LABEL_MAP[k] || k}: ${v}`);
        if (paramStrs.length > 0) {
          contextLines.push(`- **业务要件**：${paramStrs.join('； ')}`);
        }
      }
      if (taskContext.attachments && taskContext.attachments.length > 0) {
        contextLines.push(
          `- **关联文档**：${taskContext.attachments.map((a) => (a.url ? `[${a.name}](${a.url})` : a.name)).join(', ')}`
        );
      }
      finalMessage = `${trimmed}\n${contextLines.join('\n')}`;
      setTaskContext(null);
    }

    if (chatMode === 'task' && workspaceSearchEnabled && trimmed && !trimmed.startsWith('/')) {
      onSend(filesToSend, `/doc ${finalMessage}`);
      return;
    }
    onSend(filesToSend, finalMessage !== trimmed ? finalMessage : undefined);
  }, [chatMode, draft, lastMentionedUser, onSend, setTaskContext, taskContext, uploadedFiles, workspaceSearchEnabled]);

  return (
    <div className={styles['user-chat-input-container']} style={{ position: 'relative' }}>
      <UserCoordinationMentionDropdown
        open={userMentionOpen}
        searchQuery={userMentionQuery}
        selectedIndex={userMentionIndex}
        onHoverIndex={setUserMentionIndex}
        onFilteredUsersChange={setFilteredUsers}
        onSelectUser={handleSelectUser}
        onClose={() => setUserMentionOpen(false)}
      />
      <WorkflowSelectionDropdown
        open={workflowSelectionOpen}
        mode={workflowSelectionMode}
        searchQuery={workflowSelectionQuery}
        username={workflowSelectionUser}
        targetUser={lastMentionedUser}
        selectedIndex={workflowSelectionIndex}
        onHoverIndex={setWorkflowSelectionIndex}
        onFilteredItemsChange={setFilteredWorkflowItems}
        onSelectWorkflow={handleSelectWorkflow}
        onClose={() => setWorkflowSelectionOpen(false)}
      />
      <WorkspaceMentionDropdown
        open={workspaceMentionOpen}
        searchQuery={workspaceMentionQuery}
        chatMode={chatMode}
        selectedIndex={workspaceMentionIndex}
        onHoverIndex={setWorkspaceMentionIndex}
        onFilteredNodesChange={setFilteredMentionNodes}
        onSelect={handleSelectWorkspaceNode}
        onClose={() => setWorkspaceMentionOpen(false)}
      />
      <SlashCommandDropdown
        open={slashOpen}
        searchQuery={slashQuery}
        selectedIndex={slashIndex}
        chatMode={chatMode}
        onHoverIndex={setSlashIndex}
        onFilteredCommandsChange={setFilteredSlashCommands}
        onSelect={handleSelectSlashCommand}
        onClose={() => setSlashOpen(false)}
      />
      <CoordinationTaskCardModal
        open={cardModalOpen}
        initialAssignee={selectedAssignee}
        initialTemplateId={cardInitialTemplateId}
        initialValues={cardInitialValues}
        onClose={() => setCardModalOpen(false)}
        onSuccess={(_task, markdownCard) => {
          setCardModalOpen(false);
          setSelectedAssignee(null);
          if (markdownCard) {
            onSend([], markdownCard);
          }
        }}
      />
      <div className={styles['user-chat-input-shell']}>
        {chatMode === 'task' && detectedWorkflowIntent && !workflowSelectionOpen ? (
          <div
            style={{
              padding: '6px 14px',
              background: 'linear-gradient(90deg, rgba(114, 46, 209, 0.08) 0%, rgba(22, 119, 255, 0.08) 100%)',
              borderBottom: '1px solid rgba(114, 46, 209, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 12,
            }}
          >
            <Space size={8} align="center">
              <ThunderboltOutlined style={{ color: '#722ed1', fontSize: 14 }} />
              <span>
                智能识别到工作流意图：<strong>{detectedWorkflowIntent.name}</strong>
              </span>
              <Tag color="purple" style={{ margin: 0, fontSize: 11 }}>
                {detectedWorkflowIntent.tag}
              </Tag>
            </Space>
            <Button
              size="small"
              type="primary"
              ghost
              style={{ height: 24, fontSize: 12, borderRadius: 12 }}
              onClick={() => handleSelectWorkflow(detectedWorkflowIntent.templateId)}
            >
              一键带入参数填单 →
            </Button>
          </div>
        ) : null}

        {taskContext ? (
          <UserChatTaskContextBar
            taskContext={taskContext}
            onClear={() => setTaskContext(null)}
            onSelectSuggestion={(suggestion) => {
              onDraftChange(suggestion);
              setTimeout(() => {
                inputRef.current?.focus();
              }, 50);
            }}
          />
        ) : null}

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
              resetHistoryIndex();
              const text = event.target.value;
              onDraftChange(text);

              const cursorPos = event.target.selectionStart ?? text.length;
              const textBeforeCursor = text.slice(0, cursorPos);

              // 0. 探测光标处是否有 ! 或 ！工作流触发词（仅协同任务模式生效）
              if (chatMode === 'task') {
                const bangMatch = textBeforeCursor.match(/(?:^|\s)[!！]([^\s!！]*)$/);
                if (bangMatch) {
                  setWorkflowSelectionMode('bang');
                  setWorkflowSelectionQuery(bangMatch[1]);
                  setWorkflowSelectionOpen(true);
                  setWorkflowSelectionIndex(0);
                  setUserMentionOpen(false);
                  setWorkspaceMentionOpen(false);
                  setSlashOpen(false);
                  return;
                }
              }

              // 1. 探测光标处是否有 @ 人员协同触发词（半角 @ 与全角 ＠，未输入空格）
              const atMatch = textBeforeCursor.match(/[@＠]([^\s@＠]*)$/);
              if (atMatch) {
                setUserMentionOpen(true);
                setUserMentionQuery(atMatch[1]);
                setUserMentionIndex(0);
                setWorkflowSelectionOpen(false);
                setWorkspaceMentionOpen(false);
                setSlashOpen(false);
                return;
              }
              setUserMentionOpen(false);

              // 2. 探测光标处是否刚刚在 @username 后面输入了空格（触发流程选择，仅协同任务模式生效）
              if (chatMode === 'task') {
                const atSpaceMatch = textBeforeCursor.match(/(?:^|\s)[@＠]([^\s@＠]+)\s$/);
                if (atSpaceMatch) {
                  setWorkflowSelectionMode('at');
                  setWorkflowSelectionUser(atSpaceMatch[1]);
                  setWorkflowSelectionQuery('');
                  setWorkflowSelectionOpen(true);
                  setWorkflowSelectionIndex(0);
                  setWorkspaceMentionOpen(false);
                  setSlashOpen(false);
                  return;
                }
              }
              setWorkflowSelectionOpen(false);

              // 3. 探测光标处是否有 # 空间文件触发词（半角 # 与全角 ＃）
              const hashMatch = textBeforeCursor.match(/[#＃]([^\s#＃]*)$/);
              if (hashMatch) {
                setWorkspaceMentionOpen(true);
                setWorkspaceMentionQuery(hashMatch[1]);
                setWorkspaceMentionIndex(0);
                setSlashOpen(false);
                return;
              }
              setWorkspaceMentionOpen(false);

              // 4. 探测光标处是否有 / 或 、 技能触发词
              const slashMatch = textBeforeCursor.match(/(?:^|\s)[/、]([^\s/、]*)$/);
              if (slashMatch) {
                setSlashOpen(true);
                setSlashQuery(slashMatch[1]);
                setSlashIndex(0);
              } else {
                setSlashOpen(false);
              }
            }}
            placeholder={
              workspaceSearchEnabled && enableWebSearch
                ? '已开启联网与知识库检索，输入问题直接提问...（输入 ! 唤起工作流，/ 唤起技能，# 关联文件，@ 协同成员）'
                : workspaceSearchEnabled
                  ? '已开启知识库检索，输入问题直接研读空间文档...（输入 ! 唤起工作流，/ 唤起技能，# 关联文件，@ 协同成员）'
                  : enableWebSearch
                    ? '已开启全网实时搜索，输入问题直接检索...（输入 ! 唤起工作流，/ 唤起技能，# 关联文件，@ 协同成员）'
                    : placeholder || (chatMode === 'chat'
                      ? '输入消息，Enter 发送（输入 / 唤起 /ppt, /research 等沙箱生产力工具）'
                      : '输入消息，Enter 发送（输入 / 唤起工作模式企业技能，! 唤起工作流）')
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
              if (userMentionOpen && Array.isArray(filteredUsers) && filteredUsers.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setUserMentionIndex((prev) => (prev + 1) % filteredUsers.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setUserMentionIndex(
                    (prev) => (prev - 1 + filteredUsers.length) % filteredUsers.length
                  );
                  return;
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  const targetUser = filteredUsers[userMentionIndex];
                  if (targetUser) {
                    handleSelectUser(targetUser, 'freeform');
                  }
                  return;
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setUserMentionOpen(false);
                  return;
                }
              }

              if (workflowSelectionOpen && filteredWorkflowItems.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setWorkflowSelectionIndex((prev) => (prev + 1) % filteredWorkflowItems.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setWorkflowSelectionIndex(
                    (prev) => (prev - 1 + filteredWorkflowItems.length) % filteredWorkflowItems.length
                  );
                  return;
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  const targetItem = filteredWorkflowItems[workflowSelectionIndex];
                  if (targetItem) {
                    handleSelectWorkflow(targetItem.id, targetItem.isModalAction, targetItem);
                  }
                  return;
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setWorkflowSelectionOpen(false);
                  return;
                }
              }

              if (workspaceMentionOpen && filteredMentionNodes.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setWorkspaceMentionIndex((prev) => (prev + 1) % filteredMentionNodes.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setWorkspaceMentionIndex(
                    (prev) => (prev - 1 + filteredMentionNodes.length) % filteredMentionNodes.length
                  );
                  return;
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSelectWorkspaceNode(filteredMentionNodes[workspaceMentionIndex]);
                  return;
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setWorkspaceMentionOpen(false);
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
                !userMentionOpen &&
                !workflowSelectionOpen &&
                !workspaceMentionOpen &&
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
                (userMentionOpen && Array.isArray(filteredUsers) && filteredUsers.length > 0) ||
                (workflowSelectionOpen && filteredWorkflowItems.length > 0) ||
                (workspaceMentionOpen && filteredMentionNodes.length > 0) ||
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
          <div className={styles['user-chat-input-left-group']}>
            <Segmented
              className={`${styles['user-chat-mode-switch']} ${styles[`mode-${chatMode}`] || ''}`}
              size="small"
              value={chatMode}
              onChange={(value) => {
                const nextMode = value as 'chat' | 'task';
                if (nextMode === 'chat' && workspaceSearchEnabled) {
                  setWorkspaceSearchEnabled(false);
                }
                onChatModeChange(nextMode);
              }}
              options={[
                {
                  label: (
                    <span>
                      {chatMode === 'chat' && <span className={styles['user-chat-mode-dot']} />}
                      个人
                    </span>
                  ),
                  value: 'chat',
                  icon: <UserOutlined />,
                },
                {
                  label: (
                    <span>
                      {chatMode === 'task' && <span className={styles['user-chat-mode-dot']} />}
                      工作
                    </span>
                  ),
                  value: 'task',
                  icon: <RobotOutlined />,
                },
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
              {chatMode === 'chat' ? (
                <div
                  className={styles['user-chat-control-item']}
                  title={
                    enableResearch
                      ? '深度调研：已开启（支持多源网络情报、GitHub动态与近30天事实分析）'
                      : '深度调研：已关闭（默认关闭。常规查看与问询不走调研；开启或输入 /research 启用多源深度调研）'
                  }
                >
                  <span className={styles['user-chat-control-label']}>
                    <CompassOutlined
                      style={{
                        marginRight: 4,
                        color: enableResearch ? '#10b981' : undefined,
                      }}
                    />
                    调研
                  </span>
                  <Switch
                    size="small"
                    checked={Boolean(enableResearch)}
                    onChange={onEnableResearchChange}
                    className={styles['user-chat-input-dot-switch']}
                  />
                </div>
              ) : null}
              {chatMode === 'task' ? (
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
              ) : null}
              {chatMode === 'task' ? (
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
                    disabled={disabled || isTranscribing || isUploadingFile}
                    checked={workspaceSearchEnabled}
                    onChange={setWorkspaceSearchEnabled}
                    className={styles['user-chat-input-dot-switch']}
                  />
                </div>
              ) : null}
            </div>
          </div>
          <div className={styles['user-chat-input-toolbar-spacer']} />
          <div className={styles['user-chat-input-actions-group']}>
            <Select
              size="small"
              className={styles['user-chat-input-model-select']}
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
            {chatMode === 'task' && (
              <Tooltip title="快捷唤起企业组织工作流 (!)">
                <Button
                  size="small"
                  icon={<ThunderboltOutlined style={{ color: '#722ed1' }} />}
                  onClick={() => {
                    setWorkflowSelectionMode('bang');
                    setWorkflowSelectionQuery('');
                    setWorkflowSelectionOpen(true);
                  }}
                  disabled={disabled}
                  className={styles['user-chat-input-icon-btn']}
                />
              </Tooltip>
            )}
            <Upload
              multiple
              beforeUpload={(file) => {
                void handleFileUpload(file as unknown as File);
                return false;
              }}
              showUploadList={false}
              disabled={disabled || isTranscribing}
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
            {/* 后台运行按钮：无论任务模式还是个人模式，正在流式输出时均可见 */}
            {isStreaming && onRunInBackground ? (
              <Tooltip
                title={
                  chatMode === 'task'
                    ? '将当前任务转入后台异步运行，无需等待；任务完成后将自动通知并同步至 GTD 收集箱'
                    : '将当前回答转入后台继续生成，解锁输入框，您可在当前页面继续提问'
                }
              >
                <Button
                  size="small"
                  icon={<CloudSyncOutlined />}
                  onClick={onRunInBackground}
                  className={styles['user-chat-bg-task-btn']}
                >
                  后台运行
                </Button>
              </Tooltip>
            ) : null}
            {/* 发送 / 停止按钮：个人模式下有文字时展示发送（无缝开新会话），无文字且输出中时展示停止 */}
            {(() => {
              const hasDraftContent = Boolean(draft.trim()) || uploadedFiles.length > 0;
              const isTaskStreaming = isStreaming && chatMode !== 'chat';
              const isChatStreamingWithoutInput = isStreaming && chatMode === 'chat' && !hasDraftContent;
              const shouldShowStop = isTaskStreaming || isChatStreamingWithoutInput;

              return (
                <Tooltip
                  title={
                    isStreaming && chatMode === 'chat' && hasDraftContent
                      ? '当前对话将在后台继续输出，新内容将作为新对话立即发送'
                      : undefined
                  }
                >
                  <Button
                    type="primary"
                    danger={shouldShowStop}
                    size="small"
                    icon={shouldShowStop ? <StopOutlined /> : <SendOutlined />}
                    onClick={() => {
                      if (shouldShowStop) {
                        onStop?.();
                        return;
                      }
                      handleTriggerSend();
                    }}
                    disabled={
                      disabled ||
                      isTranscribing ||
                      isUploadingFile ||
                      (!shouldShowStop && !hasDraftContent)
                    }
                    className={styles['user-chat-input-send-btn']}
                  >
                    {shouldShowStop ? '停止' : '发送'}
                  </Button>
                </Tooltip>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
