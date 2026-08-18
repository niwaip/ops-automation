/**
 * ExecutionDetailPage
 * View execution details and steps
 * Phase 4: Portal Execution views
 */

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Spin,
  Typography,
  message,
} from 'antd';
import '../../chat/ChatMessage.css';
import {
  ArrowLeftOutlined,
} from '@ant-design/icons';
import ExecutionStatusTag from '@/features/executions/shared/components/ExecutionStatusTag';
import ExecutionDetailSections from '../detail/components/ExecutionDetailSections';
import { useExecutionDetailActions } from '../detail/hooks/useExecutionDetailActions';
import { useExecutionDetailData } from '../detail/hooks/useExecutionDetailData';
import { useExecutionDetailText } from '../detail/lib/executionDetailText';
import { usePreferencesStore } from '@/shared/store/preferencesStore';
import styles from './ExecutionDetailPage.module.css';



const ExecutionDetailPage: React.FC = () => {
  const runtimeSessionLookupEnabled = true;
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const language = usePreferencesStore((state) => state.language);
  const isEnglish = language === 'en-US';
  const text = useExecutionDetailText();
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
    <div className={styles['execution-detail-page']}>
      {/* Header Card */}
      <Card className={styles['execution-detail-header-card']} styles={{ body: { padding: '14px 20px' } }}>
        <div className={styles['execution-detail-header-row']}>
          <div className={styles['execution-detail-header-left']}>
            <Button
              size="small"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/executions')}
            >
              {text.backToExecutions}
            </Button>
            <h1 className={styles['execution-detail-header-title']}>
              {getSkillDisplayName(execution.skillId) || text.details}
            </h1>
            <ExecutionStatusTag color={getExecutionStatusColor(execution.status)}>
              {getExecutionStatusLabel(execution.status)}
            </ExecutionStatusTag>
          </div>
          <Typography.Text
            copyable={{ text: execution.id }}
            className={styles['execution-detail-header-id']}
          >
            ID: {execution.id}
          </Typography.Text>
        </div>
      </Card>

      <div className={styles['execution-detail-content']}>
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
    </div>
  );
};

export default ExecutionDetailPage;
