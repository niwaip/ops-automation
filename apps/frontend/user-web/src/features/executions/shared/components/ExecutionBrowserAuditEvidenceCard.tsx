import React from 'react';
import { Descriptions, Space, Tag, Typography } from 'antd';
import ExecutionDetailSectionCard from '@/features/executions/detail/components/ExecutionDetailSectionCard';
import { JsonPreview } from '@/features/executions/shared/components/JsonPreview';
import type { BrowserExecutionResultViewModel } from '@/features/executions/shared/lib/browser';

const { Text } = Typography;

interface ExecutionBrowserAuditEvidenceCardLabels {
  title: string;
  browserExecutionPlanVersion: string;
  browserDegradedMode: string;
  browserDegradeReason: string;
  browserCurrentStepId: string;
  browserCurrentLoopIteration: string;
  browserCurrentRiskLevel: string;
  browserRiskReason: string;
  browserTakeoverReason: string;
  browserLastReadValue: string;
  browserLastBranchDecision: string;
  browserTraceability: string;
  browserRecorderSessionId: string;
  browserExportArtifactId: string;
  browserReleaseId: string;
  browserSkillDraftId: string;
  browserPublishedSkillId: string;
  browserRuntimeExecutionId: string;
  yes: string;
  no: string;
}

interface ExecutionBrowserAuditEvidenceCardProps {
  result: BrowserExecutionResultViewModel;
  executionSkillId?: string;
  executionTakeoverReason?: string;
  labels: ExecutionBrowserAuditEvidenceCardLabels;
}

const ExecutionBrowserAuditEvidenceCard: React.FC<ExecutionBrowserAuditEvidenceCardProps> = ({
  result,
  executionSkillId,
  executionTakeoverReason,
  labels,
}) => {
  const trace = result.trace;
  const runtimeEvidence = result.runtimeEvidence;

  return (
    <ExecutionDetailSectionCard title={labels.title} style={{ marginBottom: 16 }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Descriptions column={2} size="small">
          <Descriptions.Item label={labels.browserExecutionPlanVersion}>
            {result.executionPlanVersion || '-'}
          </Descriptions.Item>
          <Descriptions.Item label={labels.browserDegradedMode}>
            <Tag color={result.degradedMode ? 'orange' : 'green'}>
              {result.degradedMode ? labels.yes : labels.no}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label={labels.browserDegradeReason} span={2}>
            {result.degradeReason || '-'}
          </Descriptions.Item>
          <Descriptions.Item label={labels.browserCurrentStepId}>
            {runtimeEvidence?.currentStepId || '-'}
          </Descriptions.Item>
          <Descriptions.Item label={labels.browserCurrentLoopIteration}>
            {runtimeEvidence?.currentLoopIteration ?? '-'}
          </Descriptions.Item>
          <Descriptions.Item label={labels.browserCurrentRiskLevel}>
            {runtimeEvidence?.currentRiskLevel || '-'}
          </Descriptions.Item>
          <Descriptions.Item label={labels.browserRiskReason}>
            {runtimeEvidence?.riskReason || '-'}
          </Descriptions.Item>
          <Descriptions.Item label={labels.browserTakeoverReason} span={2}>
            {runtimeEvidence?.takeoverReason || executionTakeoverReason || '-'}
          </Descriptions.Item>
        </Descriptions>

        {runtimeEvidence?.lastReadValue ? (
          <div>
            <Text strong>{labels.browserLastReadValue}</Text>
            <JsonPreview value={runtimeEvidence.lastReadValue} marginTop={8} />
          </div>
        ) : null}

        {runtimeEvidence?.lastBranchDecision ? (
          <div>
            <Text strong>{labels.browserLastBranchDecision}</Text>
            <JsonPreview value={runtimeEvidence.lastBranchDecision} marginTop={8} />
          </div>
        ) : null}

        {trace?.recorderSessionId ||
        trace?.exportArtifactId ||
        trace?.releaseId ||
        trace?.skillDraftId ||
        trace?.publishedSkillId ||
        trace?.runtimeExecutionId ? (
          <Descriptions column={2} size="small" title={labels.browserTraceability}>
            <Descriptions.Item label={labels.browserRecorderSessionId}>
              {trace?.recorderSessionId || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={labels.browserExportArtifactId}>
              {trace?.exportArtifactId || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={labels.browserReleaseId}>
              {trace?.releaseId || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={labels.browserSkillDraftId}>
              {trace?.skillDraftId || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={labels.browserPublishedSkillId}>
              {trace?.publishedSkillId || executionSkillId || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={labels.browserRuntimeExecutionId}>
              {trace?.runtimeExecutionId || '-'}
            </Descriptions.Item>
          </Descriptions>
        ) : null}
      </Space>
    </ExecutionDetailSectionCard>
  );
};

export default ExecutionBrowserAuditEvidenceCard;
