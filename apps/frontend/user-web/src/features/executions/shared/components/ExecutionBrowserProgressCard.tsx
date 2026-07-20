import React from 'react';
import { Alert, Descriptions, Space, Steps, Tag, Typography } from 'antd';
import type { ExecutionDto, ExecutionPhaseDto, ExecutionStepDto } from '@/api/execution';
import ExecutionDetailSectionCard from '@/features/executions/detail/components/ExecutionDetailSectionCard';
import ExecutionStatusSummaryTags from '@/features/executions/shared/components/ExecutionStatusSummaryTags';
import { formatPhaseDisplayName } from '@/features/executions/shared/lib/phaseText';
import { getPhaseStatusColor, getPhaseStepStatus } from '@/features/executions/shared/lib/phase';
import { formatLocalizedDateTime } from '@/shared/utils/dateText';
import {
  EXECUTION_STATUS_COLORS,
  EXECUTION_STATUS_LABELS_ZH,
} from '@/shared/constants/executionStatusMeta';

const { Text } = Typography;
const statusColors = EXECUTION_STATUS_COLORS;
const statusLabels = EXECUTION_STATUS_LABELS_ZH;

interface ExecutionLoopSummaryView {
  totalItems: number;
  hasManualHandling: boolean;
  autoApprovedCount: number;
  manualHandledCount: number;
}

interface ExecutionBrowserProgressCardProps {
  execution: ExecutionDto;
  currentSelectedPhase?: ExecutionPhaseDto;
  currentSelectedStep?: ExecutionStepDto;
  displaySelectedPhases: ExecutionPhaseDto[];
  selectedCurrentPhaseIndex: number;
  selectedCompletedPhaseCount: number;
  selectedLoopCount: number;
  shouldShowSelectedCurrentPhaseInfo: boolean;
  shouldShowSelectedExecutionSummary: boolean;
  selectedSummaryHeadline: string;
  selectedLoopSummary?: ExecutionLoopSummaryView | null;
}

const ExecutionBrowserProgressCard: React.FC<ExecutionBrowserProgressCardProps> = ({
  execution,
  currentSelectedPhase,
  currentSelectedStep,
  displaySelectedPhases,
  selectedCurrentPhaseIndex,
  selectedCompletedPhaseCount,
  selectedLoopCount,
  shouldShowSelectedCurrentPhaseInfo,
  shouldShowSelectedExecutionSummary,
  selectedSummaryHeadline,
  selectedLoopSummary,
}) => {
  return (
    <ExecutionDetailSectionCard title="步骤进度">
      {!shouldShowSelectedExecutionSummary ? (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <ExecutionDetailSectionCard title="当前步骤">
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <ExecutionStatusSummaryTags
                items={[
                  {
                    text: statusLabels[execution.status],
                    color: statusColors[execution.status],
                  },
                  currentSelectedPhase
                    ? {
                        text: formatPhaseDisplayName(currentSelectedPhase, {
                          fallbackIndex: selectedCurrentPhaseIndex + 1,
                        }),
                        color: 'processing',
                      }
                    : null,
                  currentSelectedStep ? { text: `步骤 ${currentSelectedStep.stepIndex + 1}` } : null,
                ]}
              />
              <div>
                <Text strong style={{ fontSize: 16 }}>
                  {currentSelectedStep?.name ||
                    currentSelectedPhase?.phaseName ||
                    currentSelectedPhase?.phaseKey ||
                    '-'}
                </Text>
                <div style={{ marginTop: 6 }}>
                  <Text type="secondary">
                    {currentSelectedStep?.action ||
                      currentSelectedStep?.type ||
                      '展示当前正在执行的步骤。'}
                  </Text>
                </div>
              </div>
              <Space wrap size={[12, 8]}>
                <Text type="secondary">{`进度: ${selectedCurrentPhaseIndex + 1} / ${displaySelectedPhases.length}`}</Text>
                <Text type="secondary">{`已完成: ${selectedCompletedPhaseCount}`}</Text>
                {selectedLoopCount > 0 ? <Text type="secondary">{`轮次: ${selectedLoopCount}`}</Text> : null}
              </Space>
              {shouldShowSelectedCurrentPhaseInfo && currentSelectedPhase ? (
                <Alert
                  type={execution.status === 'human_control' ? 'warning' : 'info'}
                  showIcon
                  message={`当前阶段：${currentSelectedPhase.phaseName || currentSelectedPhase.phaseKey || '-'}`}
                  description={
                    <Space wrap size={[12, 4]}>
                      <Text type="secondary">{`Key: ${currentSelectedPhase.phaseKey}`}</Text>
                      <Text type="secondary">
                        {formatLocalizedDateTime(
                          currentSelectedPhase.startedAt || currentSelectedPhase.createdAt
                        )}
                      </Text>
                      {currentSelectedPhase.errorMessage ? (
                        <Text type="danger">{currentSelectedPhase.errorMessage}</Text>
                      ) : null}
                    </Space>
                  }
                />
              ) : null}
            </Space>
          </ExecutionDetailSectionCard>
          <Steps
            current={selectedCurrentPhaseIndex}
            size="small"
            responsive
            items={displaySelectedPhases.map((phase, index) => ({
              title: formatPhaseDisplayName(phase, { fallbackIndex: index + 1 }),
              status: getPhaseStepStatus(phase.status),
              description: (
                <Space wrap size={[8, 4]}>
                  <Tag color={getPhaseStatusColor(phase.status)}>{phase.status}</Tag>
                  {currentSelectedPhase?.id === phase.id ? (
                    <Tag color="processing">当前 Activity</Tag>
                  ) : null}
                </Space>
              ),
            }))}
          />
        </Space>
      ) : (
        <ExecutionDetailSectionCard title="执行总结">
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <ExecutionStatusSummaryTags
              items={[
                {
                  text: statusLabels[execution.status],
                  color: statusColors[execution.status],
                },
                { text: `总阶段数: ${displaySelectedPhases.length}` },
                { text: `已完成: ${selectedCompletedPhaseCount}`, color: 'green' },
                selectedLoopCount > 0 ? { text: `轮次: ${selectedLoopCount}` } : null,
              ]}
            />
            <Alert
              type={
                execution.status === 'succeeded'
                  ? 'success'
                  : execution.status === 'failed'
                    ? 'error'
                    : 'warning'
              }
              showIcon
              message={selectedSummaryHeadline}
              description={
                <Space wrap size={[12, 8]}>
                  {execution.endedAt ? (
                    <Text type="secondary">
                      {`结束时间: ${formatLocalizedDateTime(execution.endedAt)}`}
                    </Text>
                  ) : null}
                  {execution.failureReason ? (
                    <Text type="danger">{execution.failureReason}</Text>
                  ) : null}
                </Space>
              }
            />
            {selectedLoopSummary ? (
              <Descriptions column={2} size="small">
                <Descriptions.Item label="处理条数">
                  {selectedLoopSummary.totalItems}
                </Descriptions.Item>
                <Descriptions.Item label="人工介入">
                  {selectedLoopSummary.hasManualHandling ? '是' : '否'}
                </Descriptions.Item>
                <Descriptions.Item label="自动承认">
                  {`${selectedLoopSummary.autoApprovedCount} 条`}
                </Descriptions.Item>
                <Descriptions.Item label="人工处理">
                  {`${selectedLoopSummary.manualHandledCount} 条`}
                </Descriptions.Item>
              </Descriptions>
            ) : null}
          </Space>
        </ExecutionDetailSectionCard>
      )}
    </ExecutionDetailSectionCard>
  );
};

export default ExecutionBrowserProgressCard;
