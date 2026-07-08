/**
 * ExecutionDetailPage
 * View execution details and steps
 * Phase 4: Portal Execution views
 */

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Button,
  Spin,
  Typography,
  Alert,
  message,
} from 'antd';
import '../../chat/ChatMessage.css';
import {
  ArrowLeftOutlined,
} from '@ant-design/icons';
import ExecutionDetailSections from '../components/ExecutionDetailSections';
import { useExecutionDetailActions } from '../hooks/useExecutionDetailActions';
import { useExecutionDetailData } from '../hooks/useExecutionDetailData';
import { buildExecutionDetailText } from '../lib/executionDetailText';
import { usePreferencesStore } from '@/shared/store/preferencesStore';

const { Title } = Typography;

const ExecutionDetailPage: React.FC = () => {
  const runtimeSessionLookupEnabled = true;
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const language = usePreferencesStore((state) => state.language);
  const isEnglish = language === 'en-US';
  const text = React.useMemo(() => buildExecutionDetailText(isEnglish), [isEnglish]);
  const {
    statusLabels,
    statusColors,
    getExecutionStatusLabel,
    getExecutionStatusColor,
    activityProgressCurrent,
    completedActivityCount,
    currentExecutionStep,
    currentPhase,
    currentPhaseDetailUrl,
    currentPhaseLoopIteration,
    currentStepIndex,
    defaultResumeFromCurrentPhaseStepId,
    displayActivityPhases,
    displayRuntimeType,
    effectiveBrowserExecutionResult,
    effectiveResultJson,
    errorExecution,
    execution,
    executionInput,
    failedCurrentPhaseStepId,
    getSkillDisplayName,
    isBrowserExecution,
    isExecutionActive,
    isLoadingExecution,
    latestActivityUpdateAt,
    latestExecutionReview,
    loopSummary,
    normalizedResult,
    pendingActivityCount,
    primaryResultText,
    requiredInputGroups,
    requiredInputs,
    resultPreviewValue,
    runtimeSession,
    semantic,
    shouldRenderPrimaryAsMarkdown,
    shouldShowCurrentPhaseInfo,
    shouldShowExecutionSummary,
    shouldShowLegacySteps,
    shouldShowLiveProgressInfo,
    shouldShowStructuredResult,
    stableRuntimeSessionNovncUrl,
    steps,
    summaryHeadline,
    takeoverFocusPhase,
    totalLoopCount,
    waitingInputStep,
    waitingInputSummary,
  } = useExecutionDetailData({
    id,
    isEnglish,
    text,
    runtimeSessionLookupEnabled,
  });
  const {
    approveMutation,
    approveAndContinueMutation,
    rejectMutation,
    submitInputMutation,
  } = useExecutionDetailActions({
    id,
    execution,
    currentPhase,
    waitingInputStep,
    defaultResumeFromCurrentPhaseStepId,
    failedCurrentPhaseStepId,
    currentPhaseLoopIteration,
    isEnglish,
    text: {
      inputSubmitted: text.inputSubmitted,
      submitInputFailed: text.submitInputFailed,
      executionApproved: text.executionApproved,
      approveFailed: text.approveFailed,
      executionRejected: text.executionRejected,
      rejectFailed: text.rejectFailed,
      takeoverApproveSuccess: text.takeoverApproveSuccess,
      takeoverApproveFailed: text.takeoverApproveFailed,
    },
    onSuccessMessage: (content) => {
      void message.success(content);
    },
    onErrorMessage: (content) => {
      void message.error(content);
    },
  });

  const handleSubmitInput = (values: Record<string, unknown>) => {
    submitInputMutation.mutate(values);
  };
  if (isLoadingExecution) {
    return (
      <div
        style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}
      >
        <Spin size="large" tip={text.loading} />
      </div>
    );
  }

  if (errorExecution || !execution) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          type="error"
          message={text.loadFailed}
          description={errorExecution?.message || text.notFound}
          showIcon
          action={<Button onClick={() => navigate('/executions')}>{text.backToExecutions}</Button>}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <Title level={3} style={{ margin: 0 }}>
            {text.details}
          </Title>
          <Button size="small" icon={<ArrowLeftOutlined />} onClick={() => navigate('/executions')}>
            {text.backToExecutions}
          </Button>
        </div>
      </div>
      <ExecutionDetailSections
        text={text}
        isEnglish={isEnglish}
        execution={execution}
        displayRuntimeType={displayRuntimeType}
        statusLabels={statusLabels as Record<string, string>}
        statusColors={statusColors as Record<string, string>}
        getExecutionStatusLabel={getExecutionStatusLabel}
        getExecutionStatusColor={getExecutionStatusColor}
        isBrowserExecution={isBrowserExecution}
        effectiveBrowserExecutionResult={effectiveBrowserExecutionResult}
        normalizedResult={normalizedResult}
        getSkillDisplayName={getSkillDisplayName}
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
        latestExecutionReview={latestExecutionReview}
        takeoverFocusPhase={takeoverFocusPhase}
        currentPhaseDetailUrl={currentPhaseDetailUrl}
        waitingInputStep={waitingInputStep}
        waitingInputSummary={waitingInputSummary}
        requiredInputs={requiredInputs}
        requiredInputGroups={requiredInputGroups}
        approveAndContinueLoading={approveAndContinueMutation.isLoading}
        approveLoading={approveMutation.isLoading}
        rejectLoading={rejectMutation.isLoading}
        submitInputLoading={submitInputMutation.isLoading}
        onApproveAndContinue={() => approveAndContinueMutation.mutate()}
        onApprove={() => approveMutation.mutate()}
        onReject={() => rejectMutation.mutate()}
        onSubmitInput={handleSubmitInput}
        executionInput={executionInput}
        primaryResultText={primaryResultText}
        shouldRenderPrimaryAsMarkdown={shouldRenderPrimaryAsMarkdown}
        shouldShowStructuredResult={shouldShowStructuredResult}
        resultPreviewValue={resultPreviewValue}
        effectiveResultJson={effectiveResultJson}
        shouldShowCurrentPhaseInfo={shouldShowCurrentPhaseInfo}
        runtimeSession={runtimeSession}
        isExecutionActive={isExecutionActive}
        stableRuntimeSessionNovncUrl={stableRuntimeSessionNovncUrl}
        semantic={semantic}
        shouldShowLegacySteps={shouldShowLegacySteps}
        steps={steps}
        currentStepIndex={currentStepIndex}
      />
    </div>
  );
};

export default ExecutionDetailPage;
