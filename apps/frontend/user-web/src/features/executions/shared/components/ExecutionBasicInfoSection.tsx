import React from 'react';
import { Button, Descriptions, Space, Typography } from 'antd';
import { CopyOutlined, DownloadOutlined } from '@ant-design/icons';
import {
  extractExecutionDownloadUrl,
  buildNovncAutoConnectUrl,
} from '@ops/user-core';
import type { ExecutionDto } from '@/api/execution';
import ExecutionStatusTag from '@/features/executions/shared/components/ExecutionStatusTag';
import { formatDateTime } from '@/features/executions/list/lib/listView';
import { replaceLocalhostWithCurrentHost } from '@/shared/utils/publicUrl';
import {
  EXECUTION_STATUS_COLORS,
  EXECUTION_STATUS_LABELS_ZH,
} from '@/shared/constants/executionStatusMeta';
import { message } from 'antd';

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
  const downloadUrl = replaceLocalhostWithCurrentHost(extractExecutionDownloadUrl(execution));

  const handleCopyDebugJson = () => {
    const debugInfo = {
      id: execution.id,
      status: execution.status,
      riskLevel: execution.riskLevel,
      skillId: execution.skillId,
      skillName: getSkillDisplayName(execution.skillId),
      startedAt: execution.startedAt || execution.createdAt,
      endedAt: execution.endedAt,
      runtimeSessionId: runtimeSessionId || execution.runtimeSessionId,
      failureReason: execution.failureReason,
      failureCode: execution.failureCode,
    };
    navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2));
    message.success('已复制执行调试信息 (JSON)');
  };

  return (
    <Space direction="vertical" size={10} style={{ width: '100%' }}>
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="执行单号">
          <Text copyable={{ text: execution.id }}>{execution.id}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="状态">
          <ExecutionStatusTag color={statusColors[execution.status]}>
            {statusLabels[execution.status]}
          </ExecutionStatusTag>
        </Descriptions.Item>
        {execution.riskLevel ? (
          <Descriptions.Item label="风险">{execution.riskLevel}</Descriptions.Item>
        ) : null}
        <Descriptions.Item label="运行技能">
          <Text strong>
            {getSkillDisplayName(
              execution.skillId ||
                (execution as any).capabilityId ||
                (execution as any).capabilitiesUsed?.[0]?.name ||
                (execution as any).capabilitiesUsed?.[0]?.id
            )}
          </Text>
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
        {isBrowserExecution || runtimeSessionId ? (
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
                        buildNovncAutoConnectUrl(
                          replaceLocalhostWithCurrentHost(runtimePreviewUrl)
                        ),
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
        ) : null}
        <Descriptions.Item label="结束时间">
          {formatDateTime(execution.endedAt || undefined)}
        </Descriptions.Item>
        {execution.failureReason ? (
          <Descriptions.Item label="失败原因">
            <Text type="danger">{execution.failureReason}</Text>
          </Descriptions.Item>
        ) : null}
        {!isBrowserExecution && downloadUrl ? (
          <Descriptions.Item label="成果文件">
            <Button
              type="link"
              icon={<DownloadOutlined />}
              style={{ paddingInline: 0 }}
              onClick={() => window.open(downloadUrl, '_blank', 'noopener,noreferrer')}
            >
              点击下载结果文档
            </Button>
          </Descriptions.Item>
        ) : null}
      </Descriptions>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button
          size="small"
          icon={<CopyOutlined />}
          onClick={handleCopyDebugJson}
          style={{ fontSize: 12 }}
        >
          复制调试 JSON
        </Button>
      </div>
    </Space>
  );
};

export default ExecutionBasicInfoSection;
