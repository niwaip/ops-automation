/**
 * ChatMessage
 * 单条消息渲染组件 - 支持Markdown渲染和思考折叠
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Avatar, Tag, message as antdMessage } from 'antd';
import { UserOutlined, RobotOutlined, FileTextOutlined } from '@ant-design/icons';
import { ChatMessage } from './types';
import { useAuthStore } from '@/shared/store/authStore';
import { replaceLocalhostWithCurrentHost } from '@/shared/lib/publicUrl';
import {
  buildWaitingInputDisplayGroups,
  dedupeWaitingInputDisplayFields,
  resolveWaitingInputDisplayLabel,
} from '@/shared/lib/waitingInputDisplay';
import PromptDebugModal from './components/PromptDebugModal';
import ChatMessageActions from '@chat-web/components/ChatMessageActions';
import ContentPartsRenderer from '@chat-web/components/ContentPartsRenderer';
import { findDeeplinkByLabel, resolveTaskParts } from '@chat-web/lib/contentParts';
import MessageContentRenderer from '@chat-web/components/MessageContentRenderer';
import ThoughtProcessPanel from '@chat-web/components/ThoughtProcessPanel';
import TaskOutcomeCard from '@chat-web/components/TaskOutcomeCard';
import TaskProgressCard from '@chat-web/components/TaskProgressCard';
import {
  beautifyText,
  buildPromptDebugClipboardText,
  compactExecutionText,
  formatExecutionStatus,
  getExecutionStepCount,
  isBrowserExecutionResult,
  parseMessageContent,
  stripThinkingContent,
  summarizeOutcomeFinalResult,
  toStructuredResultText,
} from './lib/chatMessagePresentation';
import './ChatMessage.css';

interface ChatMessageProps {
  message: ChatMessage;
  isStreaming?: boolean;
  streamingContent?: string;
  onRetry?: (messageId: string) => void;
  onApproveExecution?: (messageId: string, executionId: string) => Promise<void> | void;
  onRejectExecution?: (messageId: string, executionId: string) => Promise<void> | void;
  onResumeExecution?: (messageId: string, executionId: string) => Promise<void> | void;
}

interface WaitingInputField {
  name: string;
  description?: string;
  group_label?: string;
  display_name?: string;
  missing?: boolean;
}

const fixLocalhostLink = (url?: string): string | undefined => replaceLocalhostWithCurrentHost(url);

const normalizeComparableText = (value?: string): string =>
  String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[`*_#>\-\[\]\(\)!]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const resolveTaskStatusFromExecutionStatus = (
  executionStatus?: string
): 'waiting_input' | 'pending_approval' | 'human_control' | 'failed' | 'completed' | 'running' | undefined => {
  switch (executionStatus) {
    case 'waiting_input':
      return 'waiting_input';
    case 'pending_approval':
      return 'pending_approval';
    case 'human_control':
      return 'human_control';
    case 'failed':
    case 'cancelled':
    case 'rolled_back':
      return 'failed';
    case 'succeeded':
    case 'completed':
      return 'completed';
    case 'draft':
    case 'queued':
    case 'running':
    case 'paused':
      return 'running';
    default:
      return undefined;
  }
};

const ChatMessageComponent: React.FC<ChatMessageProps> = ({
  message,
  isStreaming,
  streamingContent,
  onRetry,
  onApproveExecution,
  onRejectExecution,
  onResumeExecution,
}) => {
  const [thoughtsExpanded, setThoughtsExpanded] = useState(true); // 默认展开思考内容
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reject' | 'resume' | null>(
    null
  );
  const [promptViewerOpen, setPromptViewerOpen] = useState(false);
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const isUser = message.role === 'user';
  const isTaskMode = message.metadata?.mode === 'task';
  const taskParts = useMemo(() => resolveTaskParts(message.contentParts), [message.contentParts]);
  const rawContent = isStreaming && streamingContent ? streamingContent : message.content;
  const taskStatus =
    resolveTaskStatusFromExecutionStatus(
      typeof message.metadata?.executionStatus === 'string'
        ? message.metadata.executionStatus
        : undefined
    ) ||
    message.metadata?.taskStatus ||
    taskParts.taskStatus;
  const isWaitingInput = isTaskMode && taskStatus === 'waiting_input';
  const isPendingApproval = isTaskMode && taskStatus === 'pending_approval';
  const finalResult = message.metadata?.finalResult?.trim();
  const finalResultData = message.metadata?.finalResultData;
  const finalSummary = message.metadata?.finalSummary?.trim();
  const errorMessage = message.metadata?.errorMessage?.trim();
  const failureReason =
    typeof message.metadata?.failureReason === 'string'
      ? message.metadata.failureReason.trim()
      : undefined;
  const hasBusinessResult = message.metadata?.hasBusinessResult;
  const executionId = message.metadata?.executionId || taskParts.executionId;
  const executionStatus = formatExecutionStatus(message.metadata?.executionStatus);
  const metadataRecord =
    message.metadata && typeof message.metadata === 'object'
      ? (message.metadata as Record<string, unknown>)
      : undefined;
  const executionRuntimeType =
    typeof metadataRecord?.runtimeType === 'string' ? metadataRecord.runtimeType : undefined;
  const usage = message.metadata?.usage;
  const promptDebug = message.metadata?.promptDebug;
  const progressLogs = message.metadata?.progressLogs || [];
  const showThinking = message.metadata?.showThinking !== false;
  const isRunning = isTaskMode && taskStatus === 'running';
  const showRunningState =
    isTaskMode &&
    (isRunning || (Boolean(isStreaming) && !isWaitingInput && !isPendingApproval && !errorMessage));
  const shouldShowTakeoverCard = isTaskMode && taskStatus === 'human_control';
  const shouldShowErrorCard = isTaskMode && taskStatus === 'failed';
  const missingInputs = useMemo(
    () =>
      dedupeWaitingInputDisplayFields(
        ((message.metadata?.missingInputs || []) as WaitingInputField[]).filter(
          (item) => item?.missing !== false
        )
      ),
    [message.metadata?.missingInputs]
  );
  const missingInputGroups = useMemo(
    () => buildWaitingInputDisplayGroups(missingInputs),
    [missingInputs]
  );
  const waitingInputLabels = useMemo(
    () => missingInputs.map((item) => resolveWaitingInputDisplayLabel(item).trim()).filter(Boolean),
    [missingInputs]
  );
  const waitingInputGroupCards = useMemo(
    () =>
      missingInputGroups.map((group) => ({
        label: group.label,
        items: group.items.map((item, index) => ({
          key: `${group.label}-${item.name || 'missing'}-${index}`,
          label: resolveWaitingInputDisplayLabel(item),
        })),
      })),
    [missingInputGroups]
  );
  const waitingInputItems = useMemo(
    () =>
      missingInputs.map((item, index) => ({
        key: `${item.name || 'missing'}-${index}`,
        label: resolveWaitingInputDisplayLabel(item),
      })),
    [missingInputs]
  );
  const waitingInputSummary = useMemo(() => {
    if (!isWaitingInput) {
      return finalSummary;
    }
    if (waitingInputLabels.length === 0) {
      return (
        finalSummary || '还需要你补充信息，请直接在下方聊天框回复，任务会继续执行。'
      );
    }
    return '还需要你补充以下信息，请直接在下方聊天框回复，任务会继续执行。';
  }, [finalSummary, isWaitingInput, waitingInputLabels]);
  const structuredResultText = useMemo(
    () => toStructuredResultText(finalResultData),
    [finalResultData]
  );
  const shouldShowStructuredResult = Boolean(
    structuredResultText &&
    finalResultData &&
    typeof finalResultData !== 'string' &&
    structuredResultText !== finalResult
  );
  const canViewPrompt = Boolean(
    !isUser &&
      !isTaskMode &&
      isAdmin &&
      promptDebug &&
      (promptDebug.systemPrompt || promptDebug.userPrompt)
  );
  const hasDetailedLlmCalls = Boolean(promptDebug?.llmCalls?.length);
  const combinedPromptText = useMemo(
    () => buildPromptDebugClipboardText(promptDebug),
    [promptDebug]
  );
  const hasRenderableContentParts = useMemo(
    () =>
      Boolean(
        message.contentParts?.some((part) =>
          ['text', 'markdown', 'structured_result', 'deeplink', 'file_ref'].includes(part.type)
        )
      ),
    [message.contentParts]
  );

  // 解析内容
  const { thoughts, answer } = parseMessageContent(rawContent);
  const displayThoughts = useMemo(
    () => thoughts.map((thought) => beautifyText(thought, false)),
    [thoughts]
  );
  const answerWithoutTaskCheckbox = useMemo(() => {
    const cleaned = answer.replace(/\n?- \[x\]\s*任务完成（可改为未完成）\s*$/m, '').trim();
    return beautifyText(fixLocalhostLink(cleaned) || '');
  }, [answer]);
  const hasExecutionContext = Boolean(
    message.metadata?.executionId ||
    message.metadata?.executionStatus ||
    message.metadata?.temporalLink ||
    message.metadata?.taskStatus
  );
  const compactAnswer = useMemo(
    () =>
      hasExecutionContext
        ? compactExecutionText(answerWithoutTaskCheckbox, finalResultData)
        : answerWithoutTaskCheckbox,
    [hasExecutionContext, answerWithoutTaskCheckbox, finalResultData]
  );
  const executionStepCount = useMemo(
    () => getExecutionStepCount(finalResultData),
    [finalResultData]
  );
  const browserExecutionMode = useMemo(
    () =>
      isBrowserExecutionResult(executionId, answerWithoutTaskCheckbox, finalResultData, {
        taskStatus,
        executionStatus: message.metadata?.executionStatus
          ? String(message.metadata.executionStatus)
          : undefined,
        runtimeType: executionRuntimeType,
      }),
    [
      executionId,
      answerWithoutTaskCheckbox,
      finalResultData,
      taskStatus,
      message.metadata?.executionStatus,
      executionRuntimeType,
    ]
  );
  const hasStructuredProgressLogs = !isUser && isTaskMode && progressLogs.length > 0;
  const currentProgressLog = hasStructuredProgressLogs
    ? progressLogs[progressLogs.length - 1]
    : undefined;
  const partDownloadUrl =
    findDeeplinkByLabel(taskParts.deeplinks, /下载|download/i) || taskParts.deeplinks[0]?.url;
  const partDetailUrl = findDeeplinkByLabel(taskParts.deeplinks, /详情|detail|执行/i);
  const downloadUrl = fixLocalhostLink(message.metadata?.downloadUrl || partDownloadUrl);
  const temporalLink = fixLocalhostLink(message.metadata?.temporalLink || partDetailUrl);
  const executionDetailLink = executionId ? `/executions/${executionId}` : undefined;
  const outcomeFinalResult = useMemo(() => {
    return summarizeOutcomeFinalResult(
      finalResult
        ? beautifyText(fixLocalhostLink(stripThinkingContent(finalResult)) || '')
        : undefined,
      finalResultData ?? taskParts.structuredResultData,
      downloadUrl
    );
  }, [downloadUrl, finalResult, finalResultData, taskParts.structuredResultData]);
  const sanitizedOutcomeSummary = useMemo(() => {
    const source = waitingInputSummary || finalSummary;
    if (!source) {
      return undefined;
    }

    const stripped = stripThinkingContent(source);
    if (!stripped) {
      return undefined;
    }

    return compactExecutionText(beautifyText(stripped), finalResultData);
  }, [finalResultData, finalSummary, waitingInputSummary]);
  const outcomeSummary = useMemo(() => {
    if (!sanitizedOutcomeSummary) {
      return undefined;
    }
    const normalizedSummary = normalizeComparableText(sanitizedOutcomeSummary);
    const normalizedAnswer = normalizeComparableText(compactAnswer);
    if (normalizedSummary && normalizedAnswer && normalizedSummary === normalizedAnswer) {
      return undefined;
    }
    return sanitizedOutcomeSummary;
  }, [compactAnswer, sanitizedOutcomeSummary]);
  const shouldShowProgressCard = Boolean(
    showThinking &&
      hasStructuredProgressLogs &&
      isRunning &&
      !isWaitingInput &&
      !isPendingApproval &&
      !shouldShowErrorCard &&
      !shouldShowTakeoverCard
  );

  useEffect(() => {
    if (isRunning) {
      setThoughtsExpanded(true);
    }
  }, [isRunning, progressLogs.length, message.id]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(answerWithoutTaskCheckbox || rawContent);
      void antdMessage.success('已复制');
    } catch {
      void antdMessage.error('复制失败');
    }
  };

  const handleCopyPrompt = async () => {
    if (!combinedPromptText) {
      return;
    }
    try {
      await navigator.clipboard.writeText(combinedPromptText);
      void antdMessage.success('Prompt 已复制');
    } catch {
      void antdMessage.error('Prompt 复制失败');
    }
  };

  const handleApproveExecution = async () => {
    if (!executionId || !onApproveExecution) return;

    try {
      setApprovalAction('approve');
      await onApproveExecution(message.id, executionId);
    } finally {
      setApprovalAction(null);
    }
  };

  const handleRejectExecution = async () => {
    if (!executionId || !onRejectExecution) return;

    try {
      setApprovalAction('reject');
      await onRejectExecution(message.id, executionId);
    } finally {
      setApprovalAction(null);
    }
  };

  const handleResumeExecution = async () => {
    if (!executionId || !onResumeExecution) return;

    try {
      setApprovalAction('resume');
      await onResumeExecution(message.id, executionId);
    } finally {
      setApprovalAction(null);
    }
  };

  // 渲染文件附件
  const renderFiles = () => {
    if (!message.metadata?.files?.length) return null;

    return (
      <div className="chat-message-files">
        {message.metadata.files.map((fileName, idx) => (
          <div key={idx} className="chat-message-file">
            <FileTextOutlined />
            <span>{fileName}</span>
          </div>
        ))}
      </div>
    );
  };

  // 渲染下载链接
  const renderDownloadLink = () => {
    return null; // 已集成到 renderOutcomeCard 中
  };

  // 渲染Markdown内容
  const renderContent = () => {
    if (isUser) {
      if (hasRenderableContentParts) {
        return <ContentPartsRenderer parts={message.contentParts} isStreaming={Boolean(isStreaming)} />;
      }
      return <MessageContentRenderer content={answerWithoutTaskCheckbox} mode="plain" />;
    }

    const hasStructuredWaitingInputCard = Boolean(
      isWaitingInput && (waitingInputItems.length > 0 || outcomeSummary)
    );

    if (
      isTaskMode &&
      (Boolean(outcomeFinalResult) ||
        Boolean(outcomeSummary) ||
        showRunningState ||
        hasStructuredWaitingInputCard ||
        isPendingApproval ||
        shouldShowErrorCard ||
        shouldShowTakeoverCard)
    ) {
      return null;
    }

    if (isWaitingInput && missingInputs.length > 0) {
      return null;
    }

    if (
      !compactAnswer ||
      (hasStructuredProgressLogs &&
        !finalResult &&
        !finalSummary &&
        !isWaitingInput &&
        !isPendingApproval &&
        !shouldShowErrorCard)
    ) {
      return null;
    }

    if (hasRenderableContentParts) {
      return (
        <ContentPartsRenderer
          parts={message.contentParts}
          isStreaming={Boolean(isStreaming)}
          renderStructuredResult={!isTaskMode}
          renderDeeplink={!isTaskMode}
        />
      );
    }

    return (
      <MessageContentRenderer
        content={compactAnswer}
        mode="markdown"
        isStreaming={Boolean(isStreaming)}
      />
    );
  };

  return (
    <>
      <div className={`chat-message ${isUser ? 'user' : 'assistant'}`}>
        {!isUser && <Avatar icon={<RobotOutlined />} className="chat-message-avatar assistant" />}

        <div className={`chat-message-stack ${isUser ? 'user' : 'assistant'}`}>
          <div className={`chat-message-content ${isUser ? 'user' : 'assistant'}`}>
            {!isUser && showThinking && !hasStructuredProgressLogs ? (
              <ThoughtProcessPanel
                thoughts={displayThoughts}
                expanded={thoughtsExpanded}
                onToggle={() => setThoughtsExpanded(!thoughtsExpanded)}
              />
            ) : null}
            {isWaitingInput && (
              <Tag color="gold" className="chat-waiting-tag">
                等待你输入
              </Tag>
            )}
            {isPendingApproval && (
              <Tag color="orange" className="chat-waiting-tag">
                等待你审批
              </Tag>
            )}
            <TaskOutcomeCard
              executionStatus={executionStatus}
              executionId={executionId}
              executionStepCount={executionStepCount}
              downloadUrl={downloadUrl}
              temporalLink={temporalLink}
              executionDetailLink={executionDetailLink}
              browserExecutionMode={browserExecutionMode}
              shouldShowTakeoverCard={shouldShowTakeoverCard}
              shouldShowErrorCard={shouldShowErrorCard}
              errorMessage={errorMessage}
              failureReason={failureReason}
              finalResult={outcomeFinalResult}
              hasBusinessResult={hasBusinessResult}
              shouldShowStructuredResult={shouldShowStructuredResult}
              structuredResultText={structuredResultText}
              waitingInputSummary={waitingInputSummary}
              isWaitingInput={isWaitingInput}
              isPendingApproval={isPendingApproval}
              showRunningState={showRunningState}
              summaryToDisplay={outcomeSummary}
              waitingInputGroups={waitingInputGroupCards}
              waitingInputItems={waitingInputItems}
              approvalAction={
                approvalAction === 'approve' || approvalAction === 'reject' ? approvalAction : null
              }
              takeoverAction={approvalAction === 'resume' ? 'resume' : null}
              onApproveExecution={() => {
                void handleApproveExecution();
              }}
              onRejectExecution={() => {
                void handleRejectExecution();
              }}
              onResumeExecution={() => {
                void handleResumeExecution();
              }}
            />
            {shouldShowProgressCard ? (
              <TaskProgressCard currentProgressLog={currentProgressLog} isRunning={isRunning} />
            ) : null}
            {renderContent()}
            {renderDownloadLink()}
            {renderFiles()}
          </div>

          <div className={`chat-message-meta ${isUser ? 'user' : 'assistant'}`}>
            {!isUser && (
              <ChatMessageActions
                usage={usage}
                canViewPrompt={canViewPrompt}
                onOpenPrompt={() => setPromptViewerOpen(true)}
                onCopy={() => {
                  void handleCopy();
                }}
                onRetry={
                  onRetry
                    ? () => {
                        onRetry(message.id);
                      }
                    : undefined
                }
              />
            )}

            <div className="chat-message-time">{message.timestamp.toLocaleTimeString()}</div>
          </div>
        </div>

        {isUser && <Avatar icon={<UserOutlined />} className="chat-message-avatar user" />}
      </div>
      <PromptDebugModal
        promptDebug={promptDebug}
        open={promptViewerOpen}
        hasDetailedLlmCalls={hasDetailedLlmCalls}
        onClose={() => setPromptViewerOpen(false)}
        onCopy={() => {
          void handleCopyPrompt();
        }}
      />
    </>
  );
};

export default ChatMessageComponent;
