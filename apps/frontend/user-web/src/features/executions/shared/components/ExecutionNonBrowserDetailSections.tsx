import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button, Collapse, Space, Tag, Tabs, Typography } from 'antd';
import type { ExecutionDetailSectionsProps } from '@/features/executions/detail/components/ExecutionDetailSections.types';
import ExecutionDetailSectionCard from '@/features/executions/detail/components/ExecutionDetailSectionCard';
import ExecutionNonBrowserActionCard from '@/features/executions/shared/components/ExecutionNonBrowserActionCard';
import ExecutionNonBrowserInfoCard from '@/features/executions/shared/components/ExecutionNonBrowserInfoCard';
import ExecutionNonBrowserResultCard from '@/features/executions/shared/components/ExecutionNonBrowserResultCard';
import ExecutionNonBrowserReviewSection from '@/features/executions/shared/components/ExecutionNonBrowserReviewSection';
import ExecutionPayloadContent from '@/features/executions/shared/components/ExecutionPayloadContent';
import ExecutionReviewResultCard from '@/features/executions/shared/components/ExecutionReviewResultCard';
import ExecutionTakeoverRecoveryCard from '@/features/executions/shared/components/ExecutionTakeoverRecoveryCard';
import SemanticOverviewCard from '@/features/executions/shared/components/SemanticOverviewCard';
import { asRecord, tryParseJsonValue } from '@/features/executions/shared/lib/common';
import { replaceLocalhostWithCurrentHost } from '@/shared/utils/publicUrl';

const fixLocalhostLink = (url?: string): string | undefined =>
  replaceLocalhostWithCurrentHost(url);

const { Text } = Typography;

/**
 * Collapsible container for displaying result text or Markdown with max-height truncation
 */
const CollapsibleResultView: React.FC<{
  content: string;
  isMarkdown?: boolean;
  maxCollapsedHeight?: number;
}> = ({ content, isMarkdown = true, maxCollapsedHeight = 120 }) => {
  const [expanded, setExpanded] = React.useState(false);
  const [shouldTruncate, setShouldTruncate] = React.useState(false);
  const contentRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (contentRef.current) {
      setShouldTruncate(contentRef.current.scrollHeight > maxCollapsedHeight + 15);
    }
  }, [content, maxCollapsedHeight]);

  return (
    <div style={{ marginTop: 6, position: 'relative' }}>
      <div
        ref={contentRef}
        style={{
          maxHeight: expanded ? 'none' : `${maxCollapsedHeight}px`,
          overflow: 'hidden',
          transition: 'max-height 0.25s ease-in-out',
          position: 'relative',
        }}
      >
        {isMarkdown ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              table: ({ children }: { children?: React.ReactNode }) => (
                <div className="markdown-table-wrapper">
                  <table>{children}</table>
                </div>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        ) : (
          <Text style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: 13 }}>
            {content}
          </Text>
        )}

        {!expanded && shouldTruncate && (
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 40,
              background: 'linear-gradient(to bottom, transparent, var(--bg-card, #1f2937))',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>

      {shouldTruncate && (
        <div style={{ marginTop: 4, textAlign: 'right' }}>
          <Button
            type="link"
            size="small"
            onClick={() => setExpanded(!expanded)}
            style={{ padding: 0, fontSize: 12, height: 'auto' }}
          >
            {expanded ? '收起内容 ▲' : '展开全部 ▼'}
          </Button>
        </div>
      )}
    </div>
  );
};

/**
 * Extract user-visible content from a step's outputJson.
 * Priority: presentation.detailText → searchResults → markdown_content/content/text → result (filtered)
 */
const extractStepUserContent = (
  outputJson: Record<string, unknown> | undefined | null
): { text?: string; isMarkdown?: boolean } => {
  if (!outputJson) return {};

  const isGeneric = (val: string) =>
    ['success', 'ok', 'true', '200'].includes(val.trim().toLowerCase());

  // 1. presentation.detailText — best human summary if meaningful
  const presentation = outputJson.presentation as Record<string, unknown> | undefined;
  const detailText =
    typeof presentation?.detailText === 'string' &&
    presentation.detailText.trim() &&
    !isGeneric(presentation.detailText)
      ? presentation.detailText.trim()
      : undefined;
  if (detailText) return { text: detailText, isMarkdown: true };

  // 2. result field
  const resultRaw = outputJson.result;
  if (resultRaw !== undefined && resultRaw !== null) {
    if (typeof resultRaw === 'string' && resultRaw.trim()) {
      const trimmed = resultRaw.trim();
      if (!isGeneric(trimmed)) {
        return { text: trimmed, isMarkdown: true };
      }
    }

    if (typeof resultRaw === 'object' && !Array.isArray(resultRaw)) {
      const rec = resultRaw as Record<string, unknown>;

      // Search results list
      if (Array.isArray(rec.searchResults) && rec.searchResults.length > 0) {
        const items = rec.searchResults as Array<Record<string, unknown>>;
        const formatted = items
          .map((item, idx) => {
            const title = typeof item.title === 'string' ? item.title.trim() : '';
            const url = typeof item.url === 'string' ? item.url.trim() : '';
            const snippet =
              typeof item.content === 'string'
                ? item.content.trim()
                : typeof item.snippet === 'string'
                ? item.snippet.trim()
                : '';
            if (title && url) return `${idx + 1}. [${title}](${url})${snippet ? `\n   > ${snippet.slice(0, 150)}...` : ''}`;
            if (title) return `${idx + 1}. **${title}**${snippet ? `\n   > ${snippet.slice(0, 150)}...` : ''}`;
            return null;
          })
          .filter(Boolean)
          .join('\n\n');

        if (formatted) return { text: `**搜索结果 (${items.length} 条):**\n\n${formatted}`, isMarkdown: true };
      }

      // Markdown / text fields
      for (const field of ['markdown_content', 'content', 'text', 'summary', 'formatted_output', 'chatSummary']) {
        if (typeof rec[field] === 'string' && (rec[field] as string).trim()) {
          const val = (rec[field] as string).trim();
          if (!isGeneric(val)) {
            return { text: val, isMarkdown: true };
          }
        }
      }

      // businessData message
      if (rec.businessData && typeof rec.businessData === 'object') {
        const bData = rec.businessData as Record<string, unknown>;
        for (const field of ['message', 'content', 'text', 'summary']) {
          if (typeof bData[field] === 'string' && (bData[field] as string).trim()) {
            const val = (bData[field] as string).trim();
            if (!isGeneric(val)) {
              return { text: val, isMarkdown: true };
            }
          }
        }
      }
    }
  }

  // 3. Direct top-level fields
  for (const field of ['markdown_content', 'content', 'text', 'searchResults']) {
    if (field === 'searchResults' && Array.isArray(outputJson.searchResults)) {
      const items = outputJson.searchResults as Array<Record<string, unknown>>;
      const formatted = items
        .map((item, idx) => {
          const title = typeof item.title === 'string' ? item.title.trim() : '';
          const url = typeof item.url === 'string' ? item.url.trim() : '';
          if (title && url) return `${idx + 1}. [${title}](${url})`;
          if (title) return `${idx + 1}. **${title}**`;
          return null;
        })
        .filter(Boolean)
        .join('\n');
      if (formatted) return { text: `**搜索结果 (${items.length} 条):**\n\n${formatted}`, isMarkdown: true };
    }
    if (typeof outputJson[field] === 'string' && (outputJson[field] as string).trim()) {
      const val = (outputJson[field] as string).trim();
      if (!isGeneric(val)) {
        return { text: val, isMarkdown: true };
      }
    }
  }

  return {};
};

const getStepColor = (status: string) => {
  if (status === 'succeeded') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'running') return 'processing';
  return 'default';
};

const ExecutionNonBrowserDetailSections: React.FC<ExecutionDetailSectionsProps> = ({
  text,
  isEnglish,
  execution,
  statusLabels,
  statusColors,
  getExecutionStatusLabel,
  getExecutionStatusColor,
  normalizedResult,
  currentPhase,
  latestExecutionReview,
  takeoverFocusPhase,
  currentPhaseDetailUrl,
  waitingInputStep,
  waitingInputSummary,
  requiredInputs,
  requiredInputGroups,
  approveAndContinueLoading,
  approveLoading,
  rejectLoading,
  submitInputLoading,
  onApproveAndContinue,
  onApprove,
  onReject,
  onSubmitInput,
  executionInput,
  primaryResultText,
  shouldRenderPrimaryAsMarkdown,
  shouldShowStructuredResult,
  resultPreviewValue,
  effectiveResultJson,
  shouldShowCurrentPhaseInfo,
  semantic,
  steps,
}) => {
  if (!execution) {
    return null;
  }

  const semanticOverviewCard =
    semantic && execution.status !== 'waiting_input' ? (
      <SemanticOverviewCard semantic={semantic} text={text} />
    ) : null;

  const executionInfoRecord = asRecord(tryParseJsonValue(execution.resultJson));
  const executionInfoTemporalLink = fixLocalhostLink(
    normalizedResult?.temporalLink ||
      (typeof executionInfoRecord?.temporalLink === 'string'
        ? executionInfoRecord.temporalLink
        : undefined)
  );

  const executionReviewResultCard = latestExecutionReview ? (
    <ExecutionReviewResultCard
      execution={execution}
      latestExecutionReview={latestExecutionReview}
      labels={{
        executionResult: text.executionResult,
        status: text.status,
        humanReview: text.humanReview,
        reviewed: text.reviewed,
        reviewDecision: text.reviewDecision,
        reviewPhase: text.reviewPhase,
        reviewedAt: text.reviewedAt,
        reviewContext: text.reviewContext,
      }}
      getExecutionStatusColor={getExecutionStatusColor}
      getExecutionStatusLabel={getExecutionStatusLabel}
    />
  ) : null;

  const takeoverRecoveryCard = takeoverFocusPhase ? (
    <ExecutionTakeoverRecoveryCard
      phase={takeoverFocusPhase}
      isEnglish={isEnglish}
      labels={{
        title: isEnglish ? 'Takeover Recovery' : '接管恢复信息',
        reviewPhase: text.reviewPhase,
        status: text.status,
        latestTakeover: isEnglish ? 'Latest Takeover' : '最近接管',
        recoveryPatch: isEnglish ? 'Recovery Patch' : '恢复补丁',
        failureReason: text.failureReason,
        resolutionNote: isEnglish ? 'Resolution Note' : '处理说明',
        resolvedAt: isEnglish ? 'Resolved at' : '完成于',
        requestedBy: isEnglish ? 'Requested by' : '发起人',
        resolvedBy: isEnglish ? 'Resolved by' : '处理人',
        recoveryDecisionPayload: isEnglish ? 'Recovery Decision Payload' : '恢复决策详情',
      }}
    />
  ) : null;

  return (
    <Tabs
      type="card"
      size="large"
      items={[
        {
          key: 'user-view',
          label: isEnglish ? 'User View' : '💡 执行结果与交互',
          children: (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
              <ExecutionNonBrowserActionCard
                execution={execution}
                currentPhase={currentPhase}
                currentPhaseDetailUrl={currentPhaseDetailUrl}
                waitingInputStep={waitingInputStep}
                waitingInputSummary={waitingInputSummary}
                requiredInputs={requiredInputs}
                requiredInputGroups={requiredInputGroups}
                shouldShowCurrentPhaseInfo={shouldShowCurrentPhaseInfo}
                approveAndContinueLoading={approveAndContinueLoading}
                approveLoading={approveLoading}
                rejectLoading={rejectLoading}
                submitInputLoading={submitInputLoading}
                confirmTagLabel={isEnglish ? 'Needs confirmation' : '待确认'}
                labels={{
                  manualReviewPending: text.manualReviewPending,
                  takeoverDescDefault: text.takeoverDescDefault,
                  currentPhase: text.currentPhase,
                  currentPageLink: text.currentPageLink,
                  takeoverApproveAndContinue: text.takeoverApproveAndContinue,
                  openCurrentPage: text.openCurrentPage,
                  approvalRequired: text.approvalRequired,
                  approvalWaiting: text.approvalWaiting,
                  approvalStatusPrefix: text.approvalStatusPrefix,
                  approvalDescDefault: text.approvalDescDefault,
                  approveAndContinue: text.approveAndContinue,
                  rejectExecution: text.rejectExecution,
                  missingInputRequired: text.missingInputRequired,
                  submitAndResume: text.submitAndResume,
                  reset: text.reset,
                  provideField: text.provideField,
                  source: text.source,
                  enterJsonString: text.enterJsonString,
                  enterField: text.enterField,
                  invalidJson: text.invalidJson,
                }}
                onApproveAndContinue={onApproveAndContinue}
                onApprove={onApprove}
                onReject={onReject}
                onSubmitInput={onSubmitInput}
              />

              <ExecutionNonBrowserReviewSection
                execution={execution}
                currentPhase={currentPhase}
                reviewResultCard={executionReviewResultCard}
                takeoverRecoveryCard={takeoverRecoveryCard}
              />

              {React.isValidElement(semanticOverviewCard) ? semanticOverviewCard : null}

              <ExecutionDetailSectionCard
                title={isEnglish ? 'Task Request / Input' : '📌 任务需求与输入'}
              >
                <ExecutionPayloadContent
                  value={executionInput}
                  emptyText={isEnglish ? 'No input provided' : '暂无输入内容'}
                />
              </ExecutionDetailSectionCard>

              <ExecutionNonBrowserResultCard
                executionInput={executionInput}
                normalizedResult={normalizedResult}
                primaryResultText={primaryResultText}
                shouldRenderPrimaryAsMarkdown={shouldRenderPrimaryAsMarkdown}
                shouldShowStructuredResult={shouldShowStructuredResult}
                resultPreviewValue={resultPreviewValue}
                effectiveResultJson={effectiveResultJson}
                labels={{
                  title: text.inputOutput,
                  input: text.input,
                  result: text.result,
                  resultArtifacts: isEnglish ? 'Result artifacts' : '结果文件',
                  sourceLinks: isEnglish ? 'Source links' : '来源链接',
                  temporalExecutionLink: isEnglish ? 'Open Temporal Execution' : '打开 Temporal 执行链路',
                  noInput: isEnglish ? 'No input' : '暂无输入内容',
                  noStructuredResult: isEnglish ? 'No structured result' : '暂无结构化结果',
                  noResultOutput: isEnglish ? 'No result output' : '暂无结果输出',
                }}
              />

              {/* 中间步骤结果 — 默认收起，包含可折叠控制的精简内容 */}
              {steps && steps.length > 1 ? (
                <Collapse
                  ghost
                  size="small"
                  items={[{
                    key: 'step-results',
                    label: (
                      <Text style={{ fontSize: 13, fontWeight: 600 }}>
                        {isEnglish
                          ? `Step-by-step results (${steps.length} steps)`
                          : `中间步骤结果（${steps.length} 步）`}
                      </Text>
                    ),
                    children: (
                      <Space direction="vertical" size={12} style={{ width: '100%' }}>
                        {[...steps]
                          .sort((a, b) => a.stepIndex - b.stepIndex)
                          .map((step) => {
                            const userContent = extractStepUserContent(step.outputJson);
                            return (
                              <div
                                key={step.id}
                                style={{
                                  padding: '12px 16px',
                                  borderRadius: 10,
                                  background: 'var(--bg-card)',
                                  border: '1px solid var(--bg-secondary)',
                                }}
                              >
                                {/* 步骤头 */}
                                <div style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  marginBottom: userContent.text ? 8 : 0,
                                  flexWrap: 'wrap',
                                  gap: 6,
                                }}>
                                  <Space size={6}>
                                    <Text strong style={{ fontSize: 13 }}>
                                      {`步骤 ${step.stepIndex + 1}`}
                                    </Text>
                                    <Text style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                      {step.name || step.action || step.type}
                                    </Text>
                                  </Space>
                                  <Tag color={getStepColor(step.status)} style={{ marginInlineEnd: 0 }}>
                                    {step.status === 'succeeded'
                                      ? (isEnglish ? 'Success' : '已完成')
                                      : step.status === 'failed'
                                      ? (isEnglish ? 'Failed' : '失败')
                                      : step.status}
                                  </Tag>
                                </div>

                                {/* 智能可折叠输出内容 */}
                                {userContent.text ? (
                                  <CollapsibleResultView
                                    content={userContent.text}
                                    isMarkdown={userContent.isMarkdown}
                                  />
                                ) : (
                                  step.status === 'succeeded' && (
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                      {isEnglish ? 'Step completed' : '步骤执行完毕'}
                                    </Text>
                                  )
                                )}

                                {/* 错误提示 */}
                                {step.errorMessage ? (
                                  <Text type="danger" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
                                    {step.errorMessage}
                                  </Text>
                                ) : null}
                              </div>
                            );
                          })}
                      </Space>
                    ),
                  }]}
                />
              ) : null}
            </div>
          ),
        },
        {
          key: 'raw-data',
          label: isEnglish ? 'Raw Data & Logs' : '⚙️ 原始数据与元信息',
          children: (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
              <ExecutionNonBrowserInfoCard
                execution={execution}
                statusLabel={statusLabels[execution.status]}
                statusColor={statusColors[execution.status]}
                temporalLink={executionInfoTemporalLink}
                labels={{
                  status: text.status,
                  createdAt: text.createdAt,
                  startedAt: text.startedAt,
                  endedAt: text.endedAt,
                  failureReason: text.failureReason,
                  failureCode: text.failureCode,
                  temporalLink: isEnglish ? 'Temporal Link' : 'Temporal 链接',
                }}
              />
              <ExecutionDetailSectionCard title={isEnglish ? 'Input Payload (JSON)' : '输入参数 (JSON)'}>
                <ExecutionPayloadContent value={executionInput} emptyText={isEnglish ? 'No input' : '暂无输入参数'} />
              </ExecutionDetailSectionCard>
              <ExecutionDetailSectionCard title={isEnglish ? 'Raw Result JSON' : '原始输出 (JSON)'}>
                <ExecutionPayloadContent value={effectiveResultJson} emptyText={isEnglish ? 'No raw output' : '暂无原始输出'} />
              </ExecutionDetailSectionCard>
            </div>
          ),
        },
      ]}
    />
  );
};

export default ExecutionNonBrowserDetailSections;

