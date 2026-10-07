import React from 'react';
import { Button, Space } from 'antd';
import { DownloadOutlined, EyeOutlined, FolderOutlined, LinkOutlined } from '@ant-design/icons';
import type { ChatMessage, ChatProgressLog } from '@ops/user-core';
import {
  isCompletionOnlyResultText,
  resolveChatOutcomePresentation,
  resolveWaitingInputDisplayLabel,
} from '@ops/user-core';
import { findDeeplinkByLabel, resolveTaskParts } from '@chat-web/lib/contentParts';
import SharedTaskOutcomeCard from '@chat-web/components/TaskOutcomeCard';
import SharedTaskProgressCard from '@chat-web/components/TaskProgressCard';
import { replaceLocalhostWithCurrentHost } from '@/shared/utils/publicUrl';
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
  onApproveExecution: (
    messageId: string,
    executionId: string,
    effectId?: string,
    approvedPayloadHash?: string
  ) => void;
  onRejectExecution: (
    messageId: string,
    executionId: string,
    effectId?: string
  ) => void;
}

export const hasTaskOutcomeContent = (message: ChatMessage): boolean => {
  if (message.role !== 'assistant' || message.metadata?.mode !== 'task') {
    return false;
  }

  // 原生大模型对话/问答任务、纯知识检索问答，无执行单号且无产物时，直接按标准 Markdown 气泡呈现，不渲染“任务结果卡片”
  if (
    message.metadata?.executionMode === 'native_llm' ||
    (message.metadata as any)?.code === 'NATIVE_TASK_COMPLETED'
  ) {
    return false;
  }

  const executionId = resolveMessageExecutionId(message);
  const taskParts = resolveTaskParts(message.contentParts);
  const artifacts =
    message.metadata?.artifacts || message.metadata?.normalizedResult?.artifacts || [];
  const missingInputs = (message.metadata?.missingInputs || []) as {
    name?: string;
    description?: string;
    group_label?: string;
    display_name?: string;
    missing?: boolean;
  }[];
  const partDownloadUrl =
    findDeeplinkByLabel(taskParts.deeplinks, /下载|download/i) || taskParts.deeplinks[0]?.url;
  const partDetailUrl = findDeeplinkByLabel(taskParts.deeplinks, /详情|detail|执行/i);

  // 若无 executionId、且无具体文件产物、无审批待补字段、无深度链接，说明仅为纯文本问答，不应作为任务卡片展示
  if (
    !executionId &&
    artifacts.length === 0 &&
    missingInputs.length === 0 &&
    !message.metadata?.downloadUrl &&
    !partDownloadUrl &&
    !message.metadata?.temporalLink &&
    !partDetailUrl
  ) {
    return false;
  }

  const status = resolveMessageTaskStatus(message);
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

const isDownloadableArtifact = (art?: {
  artifactType?: string;
  type?: string;
  downloadUrl?: string;
  url?: string;
  name?: string;
  label?: string;
}): boolean => {
  if (!art) return false;
  if (art.artifactType === 'url' || art.type === 'url') return false;
  const url = (art.downloadUrl || art.url || '').toLowerCase();
  const name = (art.name || art.label || '').toLowerCase();
  return (
    url.includes('/download') ||
    url.includes('/renders/') ||
    /\.(docx?|pdf|xlsx?|pptx?|zip|tar|gz|csv)$/i.test(name) ||
    /\.(docx?|pdf|xlsx?|pptx?|zip|tar|gz|csv)$/i.test(url)
  );
};

export function TaskOutcomeBlock(props: TaskOutcomeBlockProps) {
  const { message } = props;
  if (message.role !== 'assistant' || message.metadata?.mode !== 'task') {
    return null;
  }

  if (!hasTaskOutcomeContent(message)) {
    return null;
  }

  return <TaskOutcomeBlockContent {...props} />;
}

function TaskOutcomeBlockContent({
  message,
  actionLoadingByMessage,
  onApproveExecution,
  onRejectExecution,
}: TaskOutcomeBlockProps) {
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
  const rawResults = Array.isArray((message.metadata?.finalResultData as any)?.results)
    ? (message.metadata?.finalResultData as any).results
    : Array.isArray((taskParts.structuredResultData as any)?.results)
    ? (taskParts.structuredResultData as any).results
    : [];
  const effectiveArtifacts = React.useMemo(() => {
    const list = [...(Array.isArray(artifacts) ? artifacts : [])];
    if (rawResults.length > 0 && !list.some((a) => (a as any).type === 'url' || (a as any).artifactType === 'url')) {
      for (const res of rawResults) {
        if (res && typeof res.url === 'string') {
          list.push({
            type: 'url',
            artifactType: 'url',
            name: res.title || res.name,
            url: res.url,
            downloadUrl: res.url,
          } as any);
        }
      }
    }
    return list;
  }, [artifacts, rawResults]);
  const citations = Array.isArray((message.metadata?.finalResultData as any)?.citations)
    ? (message.metadata?.finalResultData as any).citations
    : Array.isArray((taskParts.structuredResultData as any)?.citations)
    ? (taskParts.structuredResultData as any).citations
    : [];

  const shouldShowArtifactActions = status === 'completed' || status === 'failed';

  const isUuid = (val?: unknown): val is string =>
    typeof val === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());

  const rawSkillName =
    (message.metadata as any)?.skillName ||
    (message.metadata as any)?.displayName ||
    (!isUuid(message.metadata?.resultTitle) ? message.metadata?.resultTitle : undefined) ||
    (!isUuid(message.metadata?.skillUsed) ? message.metadata?.skillUsed : undefined);

  const displaySkillName = isUuid(rawSkillName) ? undefined : rawSkillName;

  const effectiveDownloadUrl = replaceLocalhostWithCurrentHost(
    message.metadata?.downloadUrl ||
      partDownloadUrl ||
      (effectiveArtifacts && effectiveArtifacts[0] && isDownloadableArtifact(effectiveArtifacts[0])
        ? effectiveArtifacts[0].downloadUrl || effectiveArtifacts[0].url
        : undefined)
  );

  const extraArtifacts = React.useMemo(() => {
    if (!artifacts || artifacts.length === 0) return [];
    if (!effectiveDownloadUrl) return artifacts;
    const normDownload = effectiveDownloadUrl.toLowerCase().trim();
    return artifacts.filter((art) => {
      const rawHref = art.downloadUrl || art.url;
      const href = (replaceLocalhostWithCurrentHost(rawHref) || rawHref || '').toLowerCase().trim();
      return href && href !== normDownload;
    });
  }, [artifacts, effectiveDownloadUrl]);

  return (
    <>
      <SharedTaskOutcomeCard
        executionStatus={getMessageStatusLabel(status) || null}
        executionId={executionId}
        skillName={displaySkillName}
        downloadUrl={effectiveDownloadUrl}
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
        pendingOutboundEffects={(message.metadata as any)?.pendingOutboundEffects}
        approvalAction={(() => {
          const action = actionLoadingByMessage[message.id];
          return action === 'approve' || action === 'reject' ? action : null;
        })()}
        onApproveExecution={(effectId, approvedPayloadHash) => {
          if (executionId) {
            onApproveExecution(message.id, executionId, effectId, approvedPayloadHash);
          }
        }}
        onRejectExecution={(effectId) => {
          if (executionId) {
            onRejectExecution(message.id, executionId, effectId);
          }
        }}
        artifacts={effectiveArtifacts}
      />

      {/* 结果/产物列表 — 默认收起 (若仅有已被卡片主下载按钮承载的单一产物，则不重复展示产物折叠区) */}
      {shouldShowArtifactActions && extraArtifacts.length > 0 ? (
        <details
          className={styles['user-chat-outcome-details']}
          style={{ marginTop: 8 }}
        >
          <summary style={{ cursor: 'pointer', userSelect: 'none' }}>
            {`查看相关结果与产物链接 (${extraArtifacts.length} 项)`}
          </summary>
          <Space wrap className={styles['user-chat-outcome-actions']} style={{ marginTop: 8 }}>
            {extraArtifacts.map((artifact, index) => {
              const rawHref = artifact.downloadUrl || artifact.url;
              const href = replaceLocalhostWithCurrentHost(rawHref) || rawHref;
              if (!href) {
                return null;
              }
              const isWsLink = Boolean(href.includes('/workspaces') && href.includes('fileId='));
              if (isWsLink) {
                const fileIdMatch = href.match(/[?&]fileId=([^&]+)/);
                const wsMatch = href.match(/[?&]workspaceId=([^&]+)/);
                const fileId = fileIdMatch ? decodeURIComponent(fileIdMatch[1]) : '';
                const workspaceId = wsMatch ? decodeURIComponent(wsMatch[1]) : undefined;
                return (
                  <Button
                    key={`${href}-${index}`}
                    size="small"
                    onClick={() => {
                      if (fileId && typeof window !== 'undefined') {
                        window.dispatchEvent(
                          new CustomEvent('open-workspace-preview', {
                            detail: {
                              fileId,
                              workspaceId,
                              fileName: artifact.label || artifact.name,
                            },
                          })
                        );
                      }
                    }}
                  >
                    {artifact.label || artifact.name || `文档预览`}
                  </Button>
                );
              }
              const isDownloadable = isDownloadableArtifact(artifact);
              return (
                <Button
                  key={`${href}-${index}`}
                  size="small"
                  type="primary"
                  ghost
                  icon={isDownloadable ? <DownloadOutlined /> : <LinkOutlined />}
                  href={href}
                  target="_blank"
                >
                  {artifact.label ||
                    artifact.name ||
                    (isDownloadable
                      ? `下载结果文档 ${index + 1}`
                      : `查看参考来源 ${index + 1}`)}
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

      {status === 'completed' && citations.length > 0 ? (
        <div
          style={{
            marginTop: 8,
            padding: '8px 12px',
            background: 'rgba(22, 119, 255, 0.04)',
            borderRadius: 8,
            border: '1px solid rgba(22, 119, 255, 0.15)',
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--primary-color, #1677ff)',
              marginBottom: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <FolderOutlined />
            <span>参考工作空间文档（点击直接就地预览）：</span>
          </div>
          <Space wrap size={[6, 6]}>
            {citations.map((cit: any, idx: number) => {
              const fileId = cit.fileId;
              const workspaceId = cit.workspaceId;
              const name = cit.fileName || `文档 ${idx + 1}`;
              const ws = cit.workspaceName ? `[${cit.workspaceName}] ` : '';
              return (
                <Button
                  key={idx}
                  size="small"
                  type="primary"
                  ghost
                  icon={<EyeOutlined />}
                  onClick={() => {
                    if (fileId && typeof window !== 'undefined') {
                      window.dispatchEvent(
                        new CustomEvent('open-workspace-preview', {
                          detail: { fileId, workspaceId, fileName: name },
                        })
                      );
                    }
                  }}
                  style={{
                    borderRadius: 6,
                    fontSize: 12,
                    cursor: fileId ? 'pointer' : 'default',
                  }}
                >
                  {ws}{name}
                  {cit.line ? <span style={{ opacity: 0.65, marginLeft: 4 }}>:L{cit.line}</span> : null}
                </Button>
              );
            })}
          </Space>
        </div>
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
    status !== 'running' ||
    message.isStreaming === false ||
    message.metadata?.executionStatus === 'cancelled'
  ) {
    return null;
  }

  const currentProgress = progressLogs[progressLogs.length - 1];
  if (!currentProgress) {
    return null;
  }

  return (
    <SharedTaskProgressCard
      currentProgressLog={currentProgress}
      isRunning={message.isStreaming === true && status === 'running'}
    />
  );
}

export const isTaskMessageWithStatus = (
  message: ChatMessage,
  status: ChatTaskStatus
): boolean => resolveMessageTaskStatus(message) === status;
