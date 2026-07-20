import React from 'react';
import type { ExecutionDetailSectionsProps } from '@/features/executions/detail/components/ExecutionDetailSections.types';
import ExecutionNonBrowserActionCard from '@/features/executions/shared/components/ExecutionNonBrowserActionCard';
import ExecutionNonBrowserInfoCard from '@/features/executions/shared/components/ExecutionNonBrowserInfoCard';
import ExecutionNonBrowserResultCard from '@/features/executions/shared/components/ExecutionNonBrowserResultCard';
import ExecutionNonBrowserReviewSection from '@/features/executions/shared/components/ExecutionNonBrowserReviewSection';
import ExecutionReviewResultCard from '@/features/executions/shared/components/ExecutionReviewResultCard';
import ExecutionTakeoverRecoveryCard from '@/features/executions/shared/components/ExecutionTakeoverRecoveryCard';
import SemanticOverviewCard from '@/features/executions/shared/components/SemanticOverviewCard';
import { asRecord, tryParseJsonValue } from '@/features/executions/shared/lib/common';
import { replaceLocalhostWithCurrentHost } from '@/shared/utils/publicUrl';

const fixLocalhostLink = (url?: string): string | undefined =>
  replaceLocalhostWithCurrentHost(url);

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
    <>
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
          temporalExecutionLink: isEnglish ? 'Open Temporal Execution' : '打开 Temporal 执行链路',
          noInput: isEnglish ? 'No input' : '暂无输入内容',
          noStructuredResult: isEnglish ? 'No structured result' : '暂无结构化结果',
          noResultOutput: isEnglish ? 'No result output' : '暂无结果输出',
        }}
      />
    </>
  );
};

export default ExecutionNonBrowserDetailSections;
