import {
  AudioOutlined,
  CloudSyncOutlined,
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
import { useCallback, useMemo, useRef, useState } from 'react';
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
import { isWorkSlashCommand, type SlashCommandDefinition } from '../lib/slashCommands';
import type { WorkspaceNode } from '../../../api/workspace';
import { supportsNativeReasoning } from '@/shared/lib/aiModelReasoning';
import { shouldSubmitChatComposerOnEnter } from '../lib/chatComposerKeyboard';
import { uploadChatFile } from '../lib/chatComposerMedia';

import styles from '../pages/ChatPage.module.css';

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

  // @ 选人后敲空格唤起工作流流程选择卡片浮层状态
  const [workflowSelectionOpen, setWorkflowSelectionOpen] = useState(false);
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
            storagePath: (node as any).storagePath,
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

  const [cardInitialTemplateId, setCardInitialTemplateId] = useState<string>('general.coordination');
  const [cardInitialValues, setCardInitialValues] = useState<Record<string, any>>({});

  // 智能嗅探自然语言协同意图
  const detectedWorkflowIntent = useMemo(() => {
    if (!draft || !draft.includes('@')) return null;
    const lower = draft.toLowerCase();
    if (/请假|休假|事假|病假|年假|调休/i.test(lower)) {
      return {
        templateId: 'hr.leave.request',
        name: '员工请假申请',
        tag: 'HRMS 考勤',
      };
    }
    if (/报销|发票|差旅|打车|支出/i.test(lower)) {
      return {
        templateId: 'oa.expense.claim',
        name: '费用报销审批',
        tag: '财务/ERP',
      };
    }
    return null;
  }, [draft]);

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
        const lower = text.toLowerCase();
        if (/请假|休假|事假|病假|年假|调休/i.test(lower)) {
          setCardInitialTemplateId('hr.leave.request');
          setCardInitialValues({
            leaveType: /病假/i.test(lower) ? '病假' : /年假/i.test(lower) ? '年假' : '事假',
            durationHours: /下午|半天/i.test(lower) ? 4 : /一天|整天/i.test(lower) ? 8 : 4,
            reason: text.replace(/[@＠][^\s@＠]+/g, '').trim() || '个人私事请假',
          });
        } else if (/报销|发票|支出/i.test(lower)) {
          setCardInitialTemplateId('oa.expense.claim');
          setCardInitialValues({});
        } else {
          setCardInitialTemplateId('general.coordination');
          setCardInitialValues({});
        }
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
    (templateId: string, isModalAction?: boolean) => {
      setWorkflowSelectionOpen(false);
      const targetUser = lastMentionedUser || {
        id: '',
        username: workflowSelectionUser || '协同成员',
        email: null,
      };
      setSelectedAssignee(targetUser);

      const text = draft;
      const lower = text.toLowerCase();
      if (templateId === 'hr.leave.request' || /请假|休假|事假|病假|年假|调休/i.test(lower)) {
        setCardInitialTemplateId('hr.leave.request');
        setCardInitialValues({
          leaveType: /病假/i.test(lower) ? '病假' : /年假/i.test(lower) ? '年假' : '事假',
          durationHours: /下午|半天/i.test(lower) ? 4 : /一天|整天/i.test(lower) ? 8 : 4,
          reason: text.replace(/[@＠][^\s@＠]+/g, '').trim() || '个人私事请假',
        });
      } else if (templateId === 'oa.expense.claim' || /报销|发票|支出/i.test(lower)) {
        setCardInitialTemplateId('oa.expense.claim');
        setCardInitialValues({});
      } else {
        setCardInitialTemplateId(isModalAction ? 'general.coordination' : templateId);
        setCardInitialValues({});
      }
      setCardModalOpen(true);
    },
    [draft, lastMentionedUser, workflowSelectionUser]
  );

  // / 触发 Slash 命令浮层状态
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [filteredSlashCommands, setFilteredSlashCommands] = useState<SlashCommandDefinition[]>([]);

  const handleSelectSlashCommand = useCallback(
    (cmd: SlashCommandDefinition) => {
      if (cmd.disabled || (chatMode === 'chat' && cmd.scope === 'work')) {
        void antdMessage.warning(
          cmd.disabledReason ||
            '个人模式下不能调用工作能力。如需使用企业技能，请在左下方切换至「工作模式」。'
        );
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
    [chatMode, draft, onDraftChange]
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
    const trimmed = draft.trim();
    if (chatMode === 'chat' && isWorkSlashCommand(trimmed)) {
      void antdMessage.warning(
        '个人模式下不能调用工作能力（如 /doc、/email、/extract 等）。如需使用企业技能，请切换到「工作模式」。'
      );
      return;
    }
    const filesToSend = [...uploadedFiles];
    setUploadedFiles([]);

    if (lastMentionedUser) {
      setLastMentionedUser(null);
    }

    if (chatMode === 'task' && workspaceSearchEnabled && trimmed && !trimmed.startsWith('/')) {
      onSend(filesToSend, `/doc ${trimmed}`);
      return;
    }
    onSend(filesToSend);
  }, [chatMode, draft, lastMentionedUser, onSend, uploadedFiles, workspaceSearchEnabled]);

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
        {detectedWorkflowIntent && !workflowSelectionOpen ? (
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

              // 1. 探测光标处是否有 @ 人员协同触发词（半角 @ 与全角 ＠，未输入空格）
              const cursorPos = event.target.selectionStart ?? text.length;
              const textBeforeCursor = text.slice(0, cursorPos);
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

              // 2. 探测光标处是否刚刚在 @username 后面输入了空格（触发流程选择卡片）
              const atSpaceMatch = textBeforeCursor.match(/(?:^|\s)[@＠]([^\s@＠]+)\s$/);
              if (atSpaceMatch) {
                setWorkflowSelectionUser(atSpaceMatch[1]);
                setWorkflowSelectionOpen(true);
                setWorkflowSelectionIndex(0);
                setWorkspaceMentionOpen(false);
                setSlashOpen(false);
                return;
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
                ? '已开启联网与知识库检索，输入问题直接提问...（输入 / 唤起技能指令，# 关联文件，@ 协同成员）'
                : workspaceSearchEnabled
                  ? '已开启知识库检索，输入问题直接研读空间文档...（输入 / 唤起技能指令，# 关联文件，@ 协同成员）'
                  : enableWebSearch
                    ? '已开启全网实时搜索，输入问题直接检索...（输入 / 唤起技能指令，# 关联文件，@ 协同成员）'
                    : placeholder || '输入消息，Enter 发送，Shift+Enter 换行（输入 / 唤起技能指令，# 关联文件，@ 协同成员）'
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
                    handleSelectWorkflow(targetItem.id, targetItem.isModalAction);
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
                style={chatMode === 'chat' ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
                title={
                  chatMode === 'chat'
                    ? '工作空间知识检索（/doc）为工作模式专属技能，个人模式下已禁用（个人沙箱已直接挂载 /knowledge）'
                    : workspaceSearchEnabled
                      ? '工作空间知识检索：已开启（提问将自动探查并研读空间文档，点击关闭）'
                      : '工作空间知识检索：已关闭（可选开启，开启后提问将自动探查并研读空间文档）'
                }
              >
                <span className={styles['user-chat-control-label']}>
                  {workspaceSearchEnabled && chatMode === 'task' ? (
                    <FolderOpenOutlined style={{ marginRight: 4, color: '#6366f1' }} />
                  ) : (
                    <FolderOutlined style={{ marginRight: 4 }} />
                  )}
                  知识
                </span>
                <Switch
                  size="small"
                  disabled={disabled || isTranscribing || isUploadingFile || chatMode === 'chat'}
                  checked={chatMode === 'task' && workspaceSearchEnabled}
                  onChange={setWorkspaceSearchEnabled}
                  className={styles['user-chat-input-dot-switch']}
                />
              </div>
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
            <Tooltip title="快捷发起协同流程卡片">
              <Button
                size="small"
                icon={<ThunderboltOutlined style={{ color: '#722ed1' }} />}
                onClick={() => {
                  setSelectedAssignee(lastMentionedUser);
                  setWorkflowSelectionOpen(true);
                  setWorkflowSelectionUser(lastMentionedUser?.username || '协同成员');
                }}
                disabled={disabled}
                className={styles['user-chat-input-icon-btn']}
              />
            </Tooltip>
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
            {isStreaming && onRunInBackground ? (
              <Tooltip title="将当前任务转入后台异步运行，无需等待；任务完成后将自动通知并同步至 GTD 收集箱">
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
            <Button
              type="primary"
              danger={isStreaming}
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
