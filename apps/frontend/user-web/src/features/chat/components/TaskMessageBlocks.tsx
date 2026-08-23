import { Button, Space } from 'antd';
import type { ChatMessage, ChatProgressLog } from '@ops/user-core';
import {
  isCompletionOnlyResultText,
  resolveChatOutcomePresentation,
  resolveWaitingInputDisplayLabel,
} from '@ops/user-core';
import { findDeeplinkByLabel, resolveTaskParts } from '@chat-web/lib/contentParts';
import SharedTaskOutcomeCard from '@chat-web/components/TaskOutcomeCard';
import SharedTaskProgressCard from '@chat-web/components/TaskProgressCard';
import {
  getMessageStatusLabel,
  resolveMessageExecutionId,
  resolveMessageTaskStatus,
  type ChatTaskStatus,
} from '../lib/taskStatus';

import styles from '../pages/ChatPage.module.css';

interface TaskOutcomeBlockProps {
  message: ChatMessage;
  actionLoadingByMessage: Record<string, 'approve' | 'reject' | undefined>;
  onApproveExecution: (messageId: string, executionId: string) => void;
  onRejectExecution: (messageId: string, executionId: string) => void;
}

export const hasTaskOutcomeContent = (message: ChatMessage): boolean => {
  if (message.role !== 'assistant' || message.metadata?.mode !== 'task') {
    return false;
  }

  const taskParts = resolveTaskParts(message.contentParts);
  const status = resolveMessageTaskStatus(message);
  const executionId = resolveMessageExecutionId(message);
  const finalResult = message.metadata?.finalResult?.trim();
  const finalSummary = message.metadata?.finalSummary?.trim();
  const errorMessage = message.metadata?.errorMessage?.trim();
  const failureReason = message.metadata?.failureReason?.trim();
  const resultTitle = message.metadata?.resultTitle?.trim();
  const presentation = resolveChatOutcomePresentation({
    finalResult,
    finalSummary,
    normalizedResult: message.metadata?.normalizedResult,
    rawResult: message.metadata?.finalResultData ?? taskParts.structuredResultData,
  });
  const normalizedSummary = presentation.normalizedResult?.summary?.trim();
  const normalizedDetail = presentation.normalizedResult?.detailText?.trim();
  const structuredResult = presentation.structuredText;
  const partDownloadUrl =
    findDeeplinkByLabel(taskParts.deeplinks, /下载|download/i) || taskParts.deeplinks[0]?.url;
  const partDetailUrl = findDeeplinkByLabel(taskParts.deeplinks, /详情|detail|执行/i);
  const missingInputs = (message.metadata?.missingInputs || []) as {
    name?: string;
    description?: string;
    group_label?: string;
    display_name?: string;
    missing?: boolean;
  }[];
  const artifacts =
    message.metadata?.artifacts || message.metadata?.normalizedResult?.artifacts || [];

  return Boolean(
    status ||
      finalResult ||
      finalSummary ||
      normalizedSummary ||
      normalizedDetail ||
      errorMessage ||
      failureReason ||
      resultTitle ||
      executionId ||
      message.metadata?.downloadUrl ||
      partDownloadUrl ||
      message.metadata?.temporalLink ||
      partDetailUrl ||
      structuredResult ||
      artifacts.length > 0 ||
      missingInputs.length > 0
  );
};

export function TaskOutcomeBlock({
  message,
  actionLoadingByMessage,
  onApproveExecution,
  onRejectExecution,
}: TaskOutcomeBlockProps) {
  if (message.role !== 'assistant' || message.metadata?.mode !== 'task') {
    return null;
  }

  const taskParts = resolveTaskParts(message.contentParts);
  const status = resolveMessageTaskStatus(message);
  const executionId = resolveMessageExecutionId(message);
  const finalResult = message.metadata?.finalResult?.trim();
  const finalSummary = message.metadata?.finalSummary?.trim();
  const errorMessage = message.metadata?.errorMessage?.trim();
  const failureReason = message.metadata?.failureReason?.trim();
  const resultTitle = message.metadata?.resultTitle?.trim();
  const presentation = resolveChatOutcomePresentation({
    finalResult,
    finalSummary,
    normalizedResult: message.metadata?.normalizedResult,
    rawResult: message.metadata?.finalResultData ?? taskParts.structuredResultData,
  });
  const normalizedSummary = presentation.normalizedResult?.summary?.trim();
  const normalizedDetail = presentation.normalizedResult?.detailText?.trim();
  const structuredResult = presentation.structuredText;
  const partDownloadUrl =
    findDeeplinkByLabel(taskParts.deeplinks, /下载|download/i) || taskParts.deeplinks[0]?.url;
  const partDetailUrl = findDeeplinkByLabel(taskParts.deeplinks, /详情|detail|执行/i);
  const displayFinalResult = status === 'completed' ? presentation.primaryText : undefined;
  const isRedundantCompletionText = (value?: string) =>
    isCompletionOnlyResultText(value, presentation.normalizedResult?.title);
  const supplementalResult =
    displayFinalResult &&
    finalResult &&
    finalResult !== displayFinalResult &&
    !isRedundantCompletionText(finalResult)
      ? finalResult
      : displayFinalResult &&
          normalizedDetail &&
          normalizedDetail !== displayFinalResult &&
          !isRedundantCompletionText(normalizedDetail)
        ? normalizedDetail
        : null;
  const missingInputs = (message.metadata?.missingInputs || []) as {
    name?: string;
    description?: string;
    group_label?: string;
    display_name?: string;
    missing?: boolean;
  }[];
  const waitingInputItems = missingInputs.map((item, index) => ({
    key: `${item.name || 'missing'}-${index}`,
    label: resolveWaitingInputDisplayLabel({
      name: item.name || item.description || `field-${index + 1}`,
      description: item.description,
      group_label: item.group_label,
      display_name: item.display_name,
    }),
  }));
  const waitingInputGroupMap = missingInputs.reduce<Map<string, typeof waitingInputItems>>(
    (groups, item, index) => {
      const label = item.group_label?.trim() || '待补字段';
      const groupItems = groups.get(label) || [];
      groupItems.push({
        key: `${label}-${item.name || 'missing'}-${index}`,
        label: resolveWaitingInputDisplayLabel({
          name: item.name || item.description || `field-${index + 1}`,
          description: item.description,
          group_label: item.group_label,
          display_name: item.display_name,
        }),
      });
      groups.set(label, groupItems);
      return groups;
    },
    new Map()
  );
  const waitingInputGroups = [...waitingInputGroupMap.entries()].map(([label, items]) => ({
    label,
    items,
  }));
  const artifacts =
    message.metadata?.artifacts || message.metadata?.normalizedResult?.artifacts || [];
  const hasTaskCard = hasTaskOutcomeContent(message);

  if (!hasTaskCard) {
    return null;
  }

  const shouldShowArtifactActions = status === 'completed' || status === 'failed';

  return (
    <>
      <SharedTaskOutcomeCard
        executionStatus={getMessageStatusLabel(status) || null}
        executionId={executionId}
        skillName={message.metadata?.skillUsed}
        downloadUrl={message.metadata?.downloadUrl || partDownloadUrl}
        temporalLink={message.metadata?.temporalLink || partDetailUrl}
        executionDetailLink={executionId ? `/executions/${executionId}` : undefined}
        browserExecutionMode={false}
        shouldShowTakeoverCard={status === 'human_control'}
        shouldShowErrorCard={status === 'failed'}
        errorMessage={errorMessage}
        failureReason={failureReason}
        finalResult={displayFinalResult}
        hasBusinessResult={presentation.hasBusinessResult || message.metadata?.hasBusinessResult}
        shouldShowStructuredResult={Boolean(
          structuredResult &&
            displayFinalResult &&
            structuredResult !== displayFinalResult &&
            structuredResult !== errorMessage
        )}
        structuredResultText={structuredResult}
        waitingInputSummary={
          status === 'waiting_input'
            ? finalSummary || '还需要你补充以下信息，请直接在下方聊天框回复，任务会继续执行。'
            : undefined
        }
        isWaitingInput={status === 'waiting_input'}
        isPendingApproval={status === 'pending_approval'}
        showRunningState={status === 'running'}
        summaryToDisplay={finalSummary || normalizedSummary || resultTitle || undefined}
        waitingInputGroups={waitingInputGroups}
        waitingInputItems={waitingInputItems}
        approvalAction={(() => {
          const action = actionLoadingByMessage[message.id];
          return action === 'approve' || action === 'reject' ? action : null;
        })()}
        onApproveExecution={() => {
          if (executionId) {
            onApproveExecution(message.id, executionId);
          }
        }}
        onRejectExecution={() => {
          if (executionId) {
            onRejectExecution(message.id, executionId);
          }
        }}
      />

      {/* 结果/产物列表 — 默认收起 (Collapsible Div) */}
      {shouldShowArtifactActions && artifacts.length > 0 ? (
        <details className={styles['user-chat-outcome-details']} style={{ marginTop: 8 }}>
          <summary style={{ cursor: 'pointer', userSelect: 'none' }}>
            {`查看相关结果与产物链接 (${artifacts.length} 项)`}
          </summary>
          <Space wrap className={styles['user-chat-outcome-actions']} style={{ marginTop: 8 }}>
            {artifacts.map((artifact, index) => {
              const href = artifact.downloadUrl || artifact.url;
              if (!href) {
                return null;
              }
              return (
                <Button key={`${href}-${index}`} size="small" href={href} target="_blank">
                  {artifact.label || artifact.name || `结果项 ${index + 1}`}
                </Button>
              );
            })}
          </Space>
        </details>
      ) : null}

      {supplementalResult ? (
        <details className={styles['user-chat-outcome-details']}>
          <summary>查看补充说明</summary>
          <pre className={styles['user-chat-outcome-pre']}>{supplementalResult}</pre>
        </details>
      ) : null}
    </>
  );
}

interface TaskProgressBlockProps {
  message: ChatMessage;
}

export function TaskProgressBlock({ message }: TaskProgressBlockProps) {
  const progressLogs: ChatProgressLog[] = message.metadata?.progressLogs || [];
  const status = resolveMessageTaskStatus(message);
  if (
    message.role !== 'assistant' ||
    message.metadata?.mode !== 'task' ||
    progressLogs.length === 0 ||
    status !== 'running'
  ) {
    return null;
  }

  const currentProgress = progressLogs[progressLogs.length - 1];
  if (!currentProgress) {
    return null;
  }

  return <SharedTaskProgressCard currentProgressLog={currentProgress} isRunning />;
}

export const isTaskMessageWithStatus = (
  message: ChatMessage,
  status: ChatTaskStatus
): boolean => resolveMessageTaskStatus(message) === status;
