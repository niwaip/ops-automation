import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useQueryClient } from 'react-query';
import type { MessageInstance } from 'antd/es/message/interface';
import type { ChatMessage, ChatRequest, ChatSession, UploadedFileDescriptor } from '@ops/user-core';
import { executionApi, workbenchCoordinationApi } from '../../../api';
import {
  buildApprovedAssistantDraftMeta,
  buildApprovedTaskPatch,
  buildRejectedTaskPatch,
} from '@chat-web/controller/taskActionController';
import {
  buildChatRequest,
  buildResumeExecutionRequest,
} from '@chat-web/controller/chatRequestController';
import { isWorkflowCommand, handleWorkflowNaturalLanguage } from '../lib/workflowNaturalLanguageRouter';
import { upsertMessage } from '../lib/messageState';
import { summarizeSessionTitle } from '../lib/sessionView';
import { getLatestWaitingInputExecutionId } from '../lib/taskStatus';

const buildMessageId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const toChatTimestamp = (): string => new Date().toISOString();

interface UseChatPageActionsOptions {
  activeMessages: ChatMessage[];
  chatMode: 'chat' | 'task';
  clearError: () => void;
  createDraftSession: (initialTitle: string, now: string) => ChatSession;
  draft: string;
  enableThinking: boolean;
  enableWebSearch?: boolean;
  ensureSession: (now: string) => ChatSession;
  isStreaming: boolean;
  nativeReasoningEnabled: boolean;
  pendingExecutionId: string | null;
  runAssistantRequest: (
    session: ChatSession,
    request: ChatRequest,
    assistantMessageId: string
  ) => Promise<void>;
  selectedModel: string;
  selectedSession: ChatSession | null;
  setDraft: Dispatch<SetStateAction<string>>;
  setPendingExecutionId: Dispatch<SetStateAction<string | null>>;
  toast: MessageInstance;
  updateMessage: (sessionId: string, messageId: string, patch: Partial<ChatMessage>) => void;
  updateSessionMessages: (
    sessionId: string,
    updater: (messages: ChatMessage[]) => ChatMessage[]
  ) => void;
  updateSessionMeta: (sessionId: string, patch: Partial<ChatSession>) => void;
}

export function useChatPageActions({
  activeMessages,
  chatMode,
  clearError,
  createDraftSession,
  draft,
  enableThinking,
  enableWebSearch = false,
  ensureSession,
  isStreaming,
  nativeReasoningEnabled,
  pendingExecutionId,
  runAssistantRequest,
  selectedModel,
  selectedSession,
  setDraft,
  setPendingExecutionId,
  toast,
  updateMessage,
  updateSessionMessages,
  updateSessionMeta,
}: UseChatPageActionsOptions) {
  const queryClient = useQueryClient();
  const isSubmittingRef = useRef(false);
  const [actionLoadingByMessage, setActionLoadingByMessage] = useState<
    Record<string, 'approve' | 'reject' | undefined>
  >({});

  const syncRelatedQueries = useCallback(async (sessionId: string) => {
    await Promise.all([
      queryClient.invalidateQueries(['user-web-chat-sessions']),
      queryClient.invalidateQueries(['user-web-chat-history', sessionId]),
      queryClient.invalidateQueries(['user-web-executions']),
      queryClient.invalidateQueries(['user-web-notifications']),
    ]);
  }, [queryClient]);

  const handleSend = useCallback((filesToSend?: UploadedFileDescriptor[], contentOverride?: string) => {
    const content = (contentOverride !== undefined ? contentOverride : draft).trim();
    const hasFiles = (filesToSend || []).length > 0;
    if ((!content && !hasFiles) || isStreaming || isSubmittingRef.current) {
      return;
    }

    isSubmittingRef.current = true;
    setTimeout(() => {
      isSubmittingRef.current = false;
    }, 400);

    const resolvedModelId =
      selectedModel && selectedModel !== 'default' ? selectedModel : undefined;
    const continuedExecutionId = hasFiles
      ? undefined
      : (pendingExecutionId || getLatestWaitingInputExecutionId(activeMessages));
    const now = toChatTimestamp();
    const session = ensureSession(now);
    const userMessageId = buildMessageId();
    const userMessage: ChatMessage = {
      id: userMessageId,
      sessionId: session.id,
      role: 'user',
      content,
      timestamp: now,
      metadata: {
        clientMessageId: userMessageId,
        files: filesToSend?.map((f) => f.fileName),
      },
    };
    const assistantMessageId = buildMessageId();
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      sessionId: session.id,
      role: 'assistant',
      content: '',
      timestamp: now,
      isStreaming: true,
      metadata: {
        mode: chatMode,
        showThinking: enableThinking,
        clientMessageId: assistantMessageId,
      },
    };

    updateSessionMessages(session.id, (current) => [...current, userMessage, assistantMessage]);
    updateSessionMeta(session.id, {
      title: summarizeSessionTitle(content || filesToSend?.[0]?.fileName || '附件消息'),
      updatedAt: now,
      modelId: resolvedModelId,
    });
    setDraft('');
    // 探测是否为规范协同卡片已生成的业务单据（制定/既定操作，已持久化，无需走 AI 能力匹配与模型规划）
    if (
      content.startsWith('### 📋') ||
      content.includes('业务协同卡片已发起') ||
      content.includes('业务规范单据') ||
      content.includes('协同审批申请已提交')
    ) {
      updateMessage(session.id, assistantMessageId, {
        content: `✅ **业务协同单已成功生效并派发**\n\n- 审批/承办人已在 **GTD 收集箱** 与待办看板收到此业务卡片；\n- 审批核准后将自动对接外部业务系统闭环，此制定操作已完成，无需进行 AI 能力匹配。`,
        isStreaming: false,
        metadata: {
          mode: chatMode,
          clientMessageId: assistantMessageId,
        } as any,
      });
      void queryClient.invalidateQueries(['user-web-notifications']);
      void queryClient.invalidateQueries(['workbench-inbox-items']);
      return;
    }

    // 探测是否为 ! / ！ 工作流自然语言连接器命令 (无需填写业务卡片，基于自然语言直接识别与阶段流转)
    if (isWorkflowCommand(content)) {
      const match = content.match(/^[!！]\s*([^\s:：]+)(?:[:：\s]+(.*))?$/s);
      const rawWorkflow = match ? match[1].trim() : '';
      const taskBody = match ? (match[2] || '').trim() : '';

      let orchestratorMessage = content;
      if (/比对|对比|差异|红线/i.test(rawWorkflow)) {
        orchestratorMessage = taskBody ? `合同比对 ${taskBody}` : '合同比对审查';
      } else if (/保密|nda|生成保密合同/i.test(rawWorkflow) || /保密|nda/i.test(taskBody)) {
        orchestratorMessage = taskBody ? `生成保密合同 ${taskBody}` : '生成保密合同';
      } else if (/起草|生成|填报/i.test(rawWorkflow) || (!filesToSend?.length && /(?:合同|协议).*(?:起草|生成|签订)/.test(taskBody))) {
        orchestratorMessage = taskBody ? `生成合同 ${taskBody}` : '生成合同';
      } else if (/审查|审核|合规/i.test(rawWorkflow)) {
        orchestratorMessage = taskBody ? `合同审查 ${taskBody}` : '合同审查';
      } else if (/合同|协议/i.test(rawWorkflow)) {
        orchestratorMessage = taskBody ? `生成合同 ${taskBody}` : '生成合同';
      } else if (/请假|休假|考勤/i.test(rawWorkflow)) {
        orchestratorMessage = taskBody ? `请假申请 ${taskBody}` : '请假申请';
      } else if (/报销|费用/i.test(rawWorkflow)) {
        orchestratorMessage = taskBody ? `费用报销 ${taskBody}` : '费用报销';
      } else {
        orchestratorMessage = taskBody ? `${rawWorkflow} ${taskBody}` : rawWorkflow;
      }

      // 企业流程作为连接器：在后台预建组织工作流协同流转工单（如法务部合规把关审查），异步推进不阻塞真实技能执行流
      void (async () => {
        try {
          const result = await handleWorkflowNaturalLanguage(content);
          if (result?.coordinationTask) {
            void queryClient.invalidateQueries(['user-web-notifications']);
            void queryClient.invalidateQueries(['workbench-inbox-items']);
          }
        } catch (err: any) {
          console.warn('[WorkflowRouter] Background coordination registration error:', err);
        }
      })();

      const request: ChatRequest = buildChatRequest({
        message: orchestratorMessage,
        clientMessageId: userMessageId,
        clientAssistantMessageId: assistantMessageId,
        sessionId: session.id,
        executionId: continuedExecutionId || undefined,
        modelId: resolvedModelId,
        files: filesToSend,
        mode: 'task', // 组织工作流连接的底层执行技能强制以 task 任务规划模式运行
        thinking: enableThinking,
        reasoning: nativeReasoningEnabled,
        webSearch: enableWebSearch,
      });

      if (pendingExecutionId) {
        setPendingExecutionId(null);
      }

      void runAssistantRequest(session, request, assistantMessageId);
      return;
    }

    // 探测是否为 @ 模式协同任务分发
    const atCoordinationMatch = content.match(/^[@＠]([^\s@＠]+)\s*(.*)$/s);
    if (atCoordinationMatch) {
      const rawTarget = atCoordinationMatch[1].replace(/[:：,，;；]$/, '').trim();
      const taskBody = (atCoordinationMatch[2] || '').replace(/^[:：]\s*/, '').trim();

      const isApproval = /承认|审批|review|approve/i.test(taskBody);
      const taskType = isApproval ? 'approval' : 'assignment';

      void (async () => {
        try {
          const collaborators = await workbenchCoordinationApi.searchCollaborators(rawTarget);
          const targetUser =
            collaborators.find((c) => c.username.toLowerCase() === rawTarget.toLowerCase()) ||
            collaborators[0];

          if (!targetUser) {
            throw new Error(`未找到协同成员 @${rawTarget}，请确认成员是否存在`);
          }

          const attachments = (filesToSend || []).map((f) => ({
            name: f.fileName,
            size: f.size,
            url: (f as any).storagePath,
          }));

          const taskTitle = taskBody.slice(0, 40) || '协同任务';

          const created = await workbenchCoordinationApi.createTask({
            assigneeId: targetUser.id,
            assigneeName: targetUser.username,
            taskType,
            title: taskTitle,
            content: taskBody || taskTitle,
            attachments,
          });

          const cardContent = [
            `### 📋 协同任务已下发给 @${targetUser.username}`,
            ``,
            `- **任务类型**：${taskType === 'approval' ? '审批承认' : '作业布置'}`,
            `- **任务标题**：${created.title}`,
            taskBody ? `- **具体要求**：${taskBody}` : '',
            `- **指派对象**：@${targetUser.username}${targetUser.role ? ` (${targetUser.role})` : ''}`,
            `- **流转状态**：已推入对方的 **GTD 收集箱** 与待办流转看板，等待执行处理。`,
          ]
            .filter(Boolean)
            .join('\n');

          updateMessage(session.id, assistantMessageId, {
            content: cardContent,
            isStreaming: false,
            metadata: {
              mode: chatMode,
              clientMessageId: assistantMessageId,
              coordinationTask: created,
            } as any,
          });
          void toast.success(`已成功向 @${targetUser.username} 派发协同任务`);
          void queryClient.invalidateQueries(['user-web-notifications']);
          void queryClient.invalidateQueries(['workbench-inbox-items']);
        } catch (err: any) {
          updateMessage(session.id, assistantMessageId, {
            content: `⚠️ **协同任务派发失败**\n\n原因：${err?.message || '网络或服务异常，请重试'}`,
            isStreaming: false,
          });
          void toast.error(err?.message || '协同任务派发失败');
        }
      })();
      return;
    }

    // 探测制定操作/规范卡片引导
    if (/(?:制定操作|规范卡片|业务卡片|协同卡片|流程卡片)/i.test(content.trim())) {
      const promptReply = [
        `### 📋 业务工作流协同规范卡片`,
        ``,
        `本平台所有业务卡片均为**独立制定操作**，直接由 Schema 契约驱动并持久化，无需走能力匹配模型：`,
        `- **合同起草与审查**：输入 \`!标准合同起草与法务审查闭环流\` 或在输入框选择工作流；`,
        `- **保密协议起草**：输入 \`!保密合同起草与法务审查闭环流\`；`,
        `- **协同指派**：输入 \`@成员 任务要求\` 派发协同作业。`,
      ].join('\n');

      updateMessage(session.id, assistantMessageId, {
        content: promptReply,
        isStreaming: false,
      });
      return;
    }

    const request: ChatRequest = buildChatRequest({
      message: content,
      clientMessageId: userMessageId,
      clientAssistantMessageId: assistantMessageId,
      sessionId: session.id,
      executionId: continuedExecutionId || undefined,
      modelId: resolvedModelId,
      files: filesToSend,
      mode: chatMode,
      thinking: enableThinking,
      reasoning: nativeReasoningEnabled,
      webSearch: enableWebSearch,
    });

    if (pendingExecutionId) {
      setPendingExecutionId(null);
    }

    void runAssistantRequest(session, request, assistantMessageId);
  }, [
    activeMessages,
    chatMode,
    clearError,
    draft,
    enableThinking,
    enableWebSearch,
    ensureSession,
    isStreaming,
    nativeReasoningEnabled,
    pendingExecutionId,
    queryClient,
    runAssistantRequest,
    selectedModel,
    setDraft,
    setPendingExecutionId,
    toast,
    updateMessage,
    updateSessionMessages,
    updateSessionMeta,
  ]);

  const handleCreateSession = useCallback(() => {
    clearError();
    createDraftSession('新对话', toChatTimestamp());
  }, [clearError, createDraftSession]);

  const handleApprove = useCallback(async (messageId: string, executionId: string) => {
    if (!selectedSession) {
      return;
    }
    setActionLoadingByMessage((current) => ({ ...current, [messageId]: 'approve' }));
    try {
      const execution = await executionApi.approve(executionId);
      updateMessage(selectedSession.id, messageId, {
        metadata: buildApprovedTaskPatch({
          executionId,
          executionStatus: execution.status,
        }),
      });
      void toast.success('已批准任务，继续观察执行结果');

      const assistantMessageId = buildMessageId();
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        sessionId: selectedSession.id,
        role: 'assistant',
        content: '',
        timestamp: toChatTimestamp(),
        isStreaming: true,
        metadata: buildApprovedAssistantDraftMeta({
          executionId,
          executionStatus: execution.status,
        }),
      };
      updateSessionMessages(selectedSession.id, (messages) =>
        upsertMessage(messages, assistantMessage)
      );
      void runAssistantRequest(
        selectedSession,
        buildResumeExecutionRequest({
          sessionId: selectedSession.id,
          executionId,
          modelId: selectedModel && selectedModel !== 'default' ? selectedModel : undefined,
          mode: 'task',
          thinking: enableThinking,
          reasoning: false,
        }),
        assistantMessageId
      );
    } catch (approveError) {
      void toast.error(approveError instanceof Error ? approveError.message : '批准执行失败');
    } finally {
      setActionLoadingByMessage((current) => ({ ...current, [messageId]: undefined }));
    }
  }, [
    enableThinking,
    runAssistantRequest,
    selectedModel,
    selectedSession,
    toast,
    updateMessage,
    updateSessionMessages,
  ]);

  const handleReject = useCallback(async (messageId: string, executionId: string) => {
    if (!selectedSession) {
      return;
    }
    setActionLoadingByMessage((current) => ({ ...current, [messageId]: 'reject' }));
    try {
      const execution = await executionApi.reject(executionId);
      updateMessage(selectedSession.id, messageId, {
        metadata: buildRejectedTaskPatch({
          executionId,
          executionStatus: execution.status,
        }),
      });
      await syncRelatedQueries(selectedSession.id);
      void toast.success('已驳回任务');
    } catch (rejectError) {
      void toast.error(rejectError instanceof Error ? rejectError.message : '驳回执行失败');
    } finally {
      setActionLoadingByMessage((current) => ({ ...current, [messageId]: undefined }));
    }
  }, [selectedSession, syncRelatedQueries, toast, updateMessage]);

  const handleRetry = useCallback(
    (targetMessage: ChatMessage) => {
      if (isStreaming || !selectedSession) return;

      let userContent = '';
      if (targetMessage.role === 'user') {
        userContent = targetMessage.content;
      } else {
        const idx = activeMessages.findIndex((m) => m.id === targetMessage.id);
        if (idx > 0 && activeMessages[idx - 1]?.role === 'user') {
          userContent = activeMessages[idx - 1].content;
        } else {
          const lastUser = [...activeMessages].reverse().find((m) => m.role === 'user');
          if (lastUser) userContent = lastUser.content;
        }
      }

      if (!userContent.trim()) return;

      const resolvedModelId =
        selectedModel && selectedModel !== 'default' ? selectedModel : undefined;
      const now = toChatTimestamp();
      const assistantMessageId = buildMessageId();
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        sessionId: selectedSession.id,
        role: 'assistant',
        content: '',
        timestamp: now,
        isStreaming: true,
        metadata: {
          mode: chatMode,
          showThinking: enableThinking,
        },
      };

      updateSessionMessages(selectedSession.id, (current) => [...current, assistantMessage]);
      clearError();

      const request: ChatRequest = buildChatRequest({
        message: userContent,
        clientAssistantMessageId: assistantMessageId,
        sessionId: selectedSession.id,
        modelId: resolvedModelId,
        mode: chatMode,
        thinking: enableThinking,
        reasoning: nativeReasoningEnabled,
        webSearch: enableWebSearch,
      });

      void runAssistantRequest(selectedSession, request, assistantMessageId);
    },
    [
      activeMessages,
      chatMode,
      clearError,
      enableThinking,
      enableWebSearch,
      isStreaming,
      nativeReasoningEnabled,
      runAssistantRequest,
      selectedModel,
      selectedSession,
      updateSessionMessages,
    ]
  );

  return {
    actionLoadingByMessage,
    handleApprove,
    handleCreateSession,
    handleReject,
    handleRetry,
    handleSend,
  };
}
