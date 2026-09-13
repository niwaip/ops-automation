import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useQueryClient } from 'react-query';
import dayjs from 'dayjs';
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

    // 探测是否为 @ 模式协同任务分发（支持通用协同与 hr.leave.request 请假审批等工作流）
    const atCoordinationMatch = content.match(/^[@＠]([^\s@＠]+)\s*(.*)$/s);
    if (atCoordinationMatch) {
      const rawTarget = atCoordinationMatch[1].replace(/[:：,，;；]$/, '').trim();
      const taskBody = (atCoordinationMatch[2] || '').replace(/^[:：]\s*/, '').trim();

      const isLeave = /请假|休假|事假|病假|年假|调休/i.test(taskBody);
      const isExpense = /报销|差旅费|发票/i.test(taskBody);
      const isApproval = isLeave || isExpense || /承认|审批|review|approve/i.test(taskBody);
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

          const workflowId = isLeave
            ? 'hr.leave.request'
            : isExpense
              ? 'oa.expense.claim'
              : 'general.coordination';

          let taskTitle = taskBody.slice(0, 40) || '协同任务';
          let parameters: Record<string, any> = {};

          if (isLeave) {
            const leaveType = /病假/i.test(taskBody)
              ? '病假'
              : /年假/i.test(taskBody)
                ? '年假'
                : '事假';
            const isAfternoon = /下午|半天/i.test(taskBody);
            const durationHours = isAfternoon ? 4 : /一天|整天/i.test(taskBody) ? 8 : 4;
            const todayStr = dayjs().format('YYYY-MM-DD');
            const startTime = isAfternoon ? `${todayStr} 14:00` : `${todayStr} 09:00`;
            const endTime = `${todayStr} 18:00`;
            const reason = taskBody || '个人私事请假';

            taskTitle = `[请假审批] ${leaveType} ${durationHours}小时`;
            parameters = {
              leaveType,
              startTime,
              endTime,
              durationHours,
              reason,
            };
          }

          const created = await workbenchCoordinationApi.createTask({
            assigneeId: targetUser.id,
            assigneeName: targetUser.username,
            taskType,
            workflowId,
            parameters,
            title: taskTitle,
            content: taskBody || taskTitle,
            attachments,
          });

          const cardContent = isLeave
            ? [
                `### 📋 [请假审批] 协同审批申请已提交并推送至 @${targetUser.username}`,
                ``,
                `- **业务工作流**：员工考勤请假流程 (\`hr.leave.request\`)`,
                `- **请假类型**：${parameters.leaveType}`,
                `- **起止时间**：${parameters.startTime} ~ ${parameters.endTime}`,
                `- **请假时长**：${parameters.durationHours} 小时`,
                `- **请假事由**：${parameters.reason}`,
                `- **审批对象**：@${targetUser.username}${targetUser.role ? ` (${targetUser.role})` : ''}`,
                `- **流转状态**：已推入对方的 **GTD 收集箱** 与待办流转看板；审批通过后将自动同步至人事考勤系统。`,
              ]
                .filter(Boolean)
                .join('\n')
            : [
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

    // 探测纯自然语言触发请假意图（未指定协同人时，给予智能引导）
    if (/(?:请假|休假|事假|病假|年假|调休)/i.test(content.trim())) {
      const isAfternoon = /下午|半天/i.test(content);
      const durationHours = isAfternoon ? 4 : /一天|整天/i.test(content) ? 8 : 4;
      const todayStr = dayjs().format('YYYY-MM-DD');
      const startTime = isAfternoon ? `${todayStr} 14:00` : `${todayStr} 09:00`;
      const endTime = `${todayStr} 18:00`;

      const promptReply = [
        `### 🏖️ 已自动识别意图：员工请假审批流程 (\`hr.leave.request\`)`,
        ``,
        `AI 已经为您提取了请假意图：`,
        `- **请假类型**：事假`,
        `- **起止时间**：${startTime} ~ ${endTime}`,
        `- **请假时长**：${durationHours} 小时`,
        `- **请假事由**：${content.trim()}`,
        ``,
        `> **下一步**：请在输入框输入 \`@审批人 请假事由\`（例如 \`@test 今天下午请假\`）直接提交；或点击输入框底栏左下角的 \`⚡\` 按钮打开「规范卡片」在表单中确认提交。`,
      ].join('\n');

      updateMessage(session.id, assistantMessageId, {
        content: promptReply,
        isStreaming: false,
      });
      return;
    }

    // 探测纯自然语言触发费用报销意图
    if (/(?:报销|差旅费|发票|费用申请)/i.test(content.trim())) {
      const promptReply = [
        `### 💰 已自动识别意图：差旅与费用报销流程 (\`oa.expense.claim\`)`,
        ``,
        `AI 已为您识别到费用报销意图：`,
        `- **说明**：${content.trim()}`,
        ``,
        `> **下一步**：请在输入框输入 \`@财务审批人 报销事由\` 直接提交；或点击底栏 \`⚡\` 按钮打开「费用报销规范卡片」在表单中确认提交。`,
      ].join('\n');

      updateMessage(session.id, assistantMessageId, {
        content: promptReply,
        isStreaming: false,
      });
      return;
    }

    // 探测制定操作/规范卡片引导
    if (/(?:制定操作|规范卡片|业务卡片|协同卡片|流程卡片)/i.test(content.trim())) {
      const promptReply = [
        `### 📋 业务工作流协同规范卡片`,
        ``,
        `本平台所有业务卡片均为**独立制定操作**，直接由 Schema 契约驱动并持久化，无需走能力匹配模型：`,
        `- **请假审批**：输入 \`@审批人 请假事由\` 或点击 \`⚡\` 选择「员工请假审批」；`,
        `- **费用报销**：输入 \`@审批人 报销说明\` 或点击 \`⚡\` 选择「费用报销审批」；`,
        `- **通用协同**：输入 \`@成员 任务要求\` 派发协同作业。`,
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
    runAssistantRequest,
    selectedModel,
    setDraft,
    setPendingExecutionId,
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
