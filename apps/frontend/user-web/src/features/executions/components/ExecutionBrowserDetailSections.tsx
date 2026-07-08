import React from 'react';
import LiveSessionPreviewCard from '../../../components/runtime/LiveSessionPreviewCard';
import ExecutionActivityOverviewCard from '@/features/executions/components/ExecutionActivityOverviewCard';
import ExecutionBrowserActionCard from '@/features/executions/components/ExecutionBrowserActionCard';
import ExecutionBrowserAuditEvidenceCard from '@/features/executions/components/ExecutionBrowserAuditEvidenceCard';
import ExecutionBrowserSummaryCard from '@/features/executions/components/ExecutionBrowserSummaryCard';
import type { ExecutionDetailSectionsProps } from '@/features/executions/components/ExecutionDetailSections.types';
import ExecutionLegacyStepsProgressCard from '@/features/executions/components/ExecutionLegacyStepsProgressCard';
import ExecutionPhaseTimelineCard from '@/features/executions/components/ExecutionPhaseTimelineCard';
import type { BrowserExecutionResultViewModel } from '@/features/executions/lib/browser';
import { hasBrowserAuditEvidence } from '@/features/executions/lib/browser';
import { stepStatusLabels } from '@/features/executions/lib/detailView';
import {
  getRuntimeSessionStatusLabel,
  isPreviewRuntimeSessionState,
} from '@/features/executions/lib/runtimeSession';

const ExecutionBrowserDetailSections: React.FC<ExecutionDetailSectionsProps> = ({
  text,
  isEnglish,
  execution,
  displayRuntimeType,
  statusLabels,
  statusColors,
  getExecutionStatusLabel,
  getExecutionStatusColor,
  effectiveBrowserExecutionResult,
  getSkillDisplayName,
  displayActivityPhases,
  shouldShowExecutionSummary,
  shouldShowLiveProgressInfo,
  currentPhase,
  currentExecutionStep,
  activityProgressCurrent,
  completedActivityCount,
  pendingActivityCount,
  totalLoopCount,
  currentPhaseLoopIteration,
  latestActivityUpdateAt,
  summaryHeadline,
  loopSummary,
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
  runtimeSession,
  isExecutionActive,
  stableRuntimeSessionNovncUrl,
  shouldShowLegacySteps,
  steps,
  currentStepIndex,
}) => {
  const phaseTimelineSectionRef = React.useRef<HTMLDivElement | null>(null);
  const scrollToPhaseTimeline = React.useCallback(() => {
    phaseTimelineSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  if (!execution) {
    return null;
  }

  const skillDisplayName = getSkillDisplayName(execution.skillId);

  return (
    <>
      <ExecutionBrowserSummaryCard
        execution={execution}
        skillDisplayName={skillDisplayName}
        displayRuntimeType={displayRuntimeType}
        statusLabel={statusLabels[execution.status]}
        statusColor={statusColors[execution.status]}
        labels={{
          summaryInfo: text.summaryInfo,
          status: text.status,
          skillLabel: text.skillLabel,
          runtimeInfo: text.runtimeInfo,
          idLabel: text.idLabel,
        }}
      />

      {stableRuntimeSessionNovncUrl &&
      (isExecutionActive || isPreviewRuntimeSessionState(runtimeSession?.state)) ? (
        <div style={{ marginBottom: 16 }}>
          <LiveSessionPreviewCard
            novncUrl={stableRuntimeSessionNovncUrl}
            title={isEnglish ? 'Live Browser View' : '实时画面'}
            statusLabel={getRuntimeSessionStatusLabel(runtimeSession?.state, isEnglish)}
            height={420}
          />
        </div>
      ) : null}

      <ExecutionBrowserActionCard
        execution={execution}
        currentPhase={currentPhase}
        currentPhaseDetailUrl={currentPhaseDetailUrl}
        waitingInputStep={waitingInputStep}
        waitingInputSummary={waitingInputSummary}
        requiredInputs={requiredInputs}
        requiredInputGroups={requiredInputGroups}
        approveAndContinueLoading={approveAndContinueLoading}
        approveLoading={approveLoading}
        rejectLoading={rejectLoading}
        submitInputLoading={submitInputLoading}
        confirmTagLabel={isEnglish ? 'Needs confirmation' : '待确认'}
        labels={{
          operationsArea: text.operationsArea,
          browserTakeoverReason: text.browserTakeoverReason,
          currentPageLink: text.currentPageLink,
          takeoverApproveAndContinue: text.takeoverApproveAndContinue,
          approvalWaiting: text.approvalWaiting,
          approvalStatusPrefix: text.approvalStatusPrefix,
          approvalDescDefault: text.approvalDescDefault,
          approveAndContinue: text.approveAndContinue,
          rejectExecution: text.rejectExecution,
          submitAndResume: text.submitAndResume,
          reset: text.reset,
          provideField: text.provideField,
          source: text.source,
          enterJsonString: text.enterJsonString,
          enterField: text.enterField,
          invalidJson: text.invalidJson,
          noPendingActions: text.noPendingActions,
        }}
        onApproveAndContinue={onApproveAndContinue}
        onApprove={onApprove}
        onReject={onReject}
        onSubmitInput={onSubmitInput}
      />

      {displayActivityPhases.length > 0 ? (
        <ExecutionActivityOverviewCard
          execution={execution}
          isEnglish={isEnglish}
          displayActivityPhases={displayActivityPhases}
          shouldShowExecutionSummary={shouldShowExecutionSummary}
          shouldShowLiveProgressInfo={shouldShowLiveProgressInfo}
          currentPhase={currentPhase}
          currentExecutionStep={currentExecutionStep}
          activityProgressCurrent={activityProgressCurrent}
          completedActivityCount={completedActivityCount}
          pendingActivityCount={pendingActivityCount}
          totalLoopCount={totalLoopCount}
          currentPhaseLoopIteration={currentPhaseLoopIteration}
          latestActivityUpdateAt={latestActivityUpdateAt}
          summaryHeadline={summaryHeadline}
          loopSummary={loopSummary}
          skillDisplayName={skillDisplayName}
          labels={{
            stepsProgress: text.stepsProgress,
            executionSummaryTitle: text.executionSummaryTitle,
            skillLabel: text.skillLabel,
            detailButton: text.detailButton,
            processingSummary: text.processingSummary,
            noSummary: text.noSummary,
            executionSummaryHint: text.executionSummaryHint,
            endedAt: text.endedAt,
            totalActivities: text.totalActivities,
            completedActivities: text.completedActivities,
            pendingActivities: text.pendingActivities,
            loopCount: text.loopCount,
            progressOverview: text.progressOverview,
            latestUpdate: text.latestUpdate,
            processedItems: text.processedItems,
            manualHandledFlag: text.manualHandledFlag,
            autoApprovedItems: text.autoApprovedItems,
            manualHandledItems: text.manualHandledItems,
            currentPhase: text.currentPhase,
            currentStepLabel: text.currentStepLabel,
            step: text.step,
            currentActivity: text.currentActivity,
            currentStepHint: text.currentStepHint,
            yes: text.yes,
            no: text.no,
          }}
          onOpenPhaseTimeline={scrollToPhaseTimeline}
          getExecutionStatusColor={getExecutionStatusColor}
          getExecutionStatusLabel={getExecutionStatusLabel}
        />
      ) : null}

      {effectiveBrowserExecutionResult &&
      hasBrowserAuditEvidence(effectiveBrowserExecutionResult as BrowserExecutionResultViewModel) ? (
        <ExecutionBrowserAuditEvidenceCard
          result={effectiveBrowserExecutionResult as BrowserExecutionResultViewModel}
          executionSkillId={execution.skillId}
          executionTakeoverReason={execution.takeoverReason}
          labels={{
            title: text.browserAuditEvidence,
            browserExecutionPlanVersion: text.browserExecutionPlanVersion,
            browserDegradedMode: text.browserDegradedMode,
            browserDegradeReason: text.browserDegradeReason,
            browserCurrentStepId: text.browserCurrentStepId,
            browserCurrentLoopIteration: text.browserCurrentLoopIteration,
            browserCurrentRiskLevel: text.browserCurrentRiskLevel,
            browserRiskReason: text.browserRiskReason,
            browserTakeoverReason: text.browserTakeoverReason,
            browserLastReadValue: text.browserLastReadValue,
            browserLastBranchDecision: text.browserLastBranchDecision,
            browserTraceability: text.browserTraceability,
            browserRecorderSessionId: text.browserRecorderSessionId,
            browserExportArtifactId: text.browserExportArtifactId,
            browserReleaseId: text.browserReleaseId,
            browserSkillDraftId: text.browserSkillDraftId,
            browserPublishedSkillId: text.browserPublishedSkillId,
            browserRuntimeExecutionId: text.browserRuntimeExecutionId,
            yes: text.yes,
            no: text.no,
          }}
        />
      ) : null}

      {displayActivityPhases.length > 0 ? (
        <ExecutionPhaseTimelineCard
          phases={displayActivityPhases}
          currentPhase={currentPhase}
          executionStatus={execution.status}
          isEnglish={isEnglish}
          sectionRef={phaseTimelineSectionRef}
          labels={{
            phaseTimeline: text.phaseTimeline,
            expandPhaseTimeline: text.expandPhaseTimeline,
            phaseAttempt: text.phaseAttempt,
            phaseSteps: text.phaseSteps,
            phaseArtifactCount: text.phaseArtifactCount,
            phaseActionFailed: text.phaseActionFailed,
            phaseArtifacts: text.phaseArtifacts,
            phaseNoData: text.phaseNoData,
            step: text.step,
          }}
        />
      ) : null}

      {!displayActivityPhases.length && shouldShowLegacySteps && steps && steps.length > 0 ? (
        <ExecutionLegacyStepsProgressCard
          steps={steps}
          currentStepIndex={currentStepIndex}
          isEnglish={isEnglish}
          labels={{
            title: text.stepsProgress,
            step: text.step,
          }}
          stepStatusLabels={stepStatusLabels}
        />
      ) : null}
    </>
  );
};

export default ExecutionBrowserDetailSections;
