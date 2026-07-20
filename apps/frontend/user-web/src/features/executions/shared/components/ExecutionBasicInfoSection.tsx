import React from 'react';
import { Button, Descriptions, Space, Typography } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { extractExecutionDownloadUrl } from '@ops/user-core';
import type { ExecutionDto } from '@/api/execution';
import ExecutionStatusTag from '@/features/executions/shared/components/ExecutionStatusTag';
import { formatDateTime } from '@/features/executions/list/lib/listView';
import { replaceLocalhostWithCurrentHost } from '@/shared/lib/publicUrl';
import {
  EXECUTION_STATUS_COLORS,
  EXECUTION_STATUS_LABELS_ZH,
} from '@/shared/lib/executionStatusMeta';

const { Text } = Typography;

interface ExecutionBasicInfoSectionProps {
  execution: ExecutionDto;
  getSkillDisplayName: (skillId?: string) => string;
  shouldShowCurrentPhaseInfo: boolean;
  runtimeSessionId?: string;
  runtimePreviewUrl?: string;
  isBrowserExecution: boolean;
  onOpenDetailPage: () => void;
}

const statusColors = EXECUTION_STATUS_COLORS;
const statusLabels = EXECUTION_STATUS_LABELS_ZH;

const ExecutionBasicInfoSection: React.FC<ExecutionBasicInfoSectionProps> = ({
  execution,
  getSkillDisplayName,
  shouldShowCurrentPhaseInfo,
  runtimeSessionId,
  runtimePreviewUrl,
  isBrowserExecution,
  onOpenDetailPage,
}) => {
  return (
    <Descriptions column={1} size="small" bordered>
      <Descriptions.Item label="ID">{execution.id}</Descriptions.Item>
      <Descriptions.Item label="状态">
        <ExecutionStatusTag color={statusColors[execution.status]}>
          {statusLabels[execution.status]}
        </ExecutionStatusTag>
      </Descriptions.Item>
      <Descriptions.Item label="风险">{execution.riskLevel || '-'}</Descriptions.Item>
      <Descriptions.Item label="技能">
        <Space direction="vertical" size={0}>
          <Text>{getSkillDisplayName(execution.skillId)}</Text>
          {getSkillDisplayName(execution.skillId) !== execution.skillId ? (
            <Text type="secondary">ID: {execution.skillId}</Text>
          ) : null}
        </Space>
      </Descriptions.Item>
      <Descriptions.Item label="开始时间">
        {formatDateTime(execution.startedAt || execution.createdAt)}
      </Descriptions.Item>
      {shouldShowCurrentPhaseInfo ? (
        <Descriptions.Item label="当前阶段">
          <Space direction="vertical" size={0}>
            <Text>{execution.currentPhaseKey || '-'}</Text>
            <Text type="secondary">{execution.currentPhaseStatus || '未开始'}</Text>
          </Space>
        </Descriptions.Item>
      ) : null}
      <Descriptions.Item label="浏览器会话">
        {runtimeSessionId ? (
          <Space wrap>
            <Text copyable={{ text: runtimeSessionId }}>{runtimeSessionId}</Text>
            {runtimePreviewUrl ? (
              <Button
                type="link"
                style={{ paddingInline: 0 }}
                onClick={() =>
                  window.open(
                    replaceLocalhostWithCurrentHost(runtimePreviewUrl),
                    '_blank',
                    'noopener,noreferrer'
                  )
                }
              >
                打开实时画面
              </Button>
            ) : (
              <Button type="link" style={{ paddingInline: 0 }} onClick={onOpenDetailPage}>
                打开详情页
              </Button>
            )}
          </Space>
        ) : (
          '-'
        )}
      </Descriptions.Item>
      <Descriptions.Item label="结束时间">
        {formatDateTime(execution.endedAt || undefined)}
      </Descriptions.Item>
      <Descriptions.Item label="失败原因">{execution.failureReason || '-'}</Descriptions.Item>
      {!isBrowserExecution ? (
        <Descriptions.Item label="下载地址">
          {extractExecutionDownloadUrl(execution) ? (
            <Button
              type="link"
              icon={<DownloadOutlined />}
              style={{ paddingInline: 0 }}
              onClick={() =>
                window.open(
                  extractExecutionDownloadUrl(execution),
                  '_blank',
                  'noopener,noreferrer'
                )
              }
            >
              下载结果
            </Button>
          ) : (
            '-'
          )}
        </Descriptions.Item>
      ) : null}
    </Descriptions>
  );
};

export default ExecutionBasicInfoSection;
