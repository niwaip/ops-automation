import React from 'react';
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Typography,
  Tooltip,
  Popconfirm,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  EyeOutlined,
  RocketOutlined,
  DeleteOutlined,
  CopyOutlined,
  GlobalOutlined,
  ApartmentOutlined,
  NodeIndexOutlined,
  SendOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  CheckCircleFilled,
} from '@ant-design/icons';
import type { CapabilityRelease } from '@/api/capabilities';
import {
  getSourceTypeLabel,
  resolvePipelineInfo,
  formatRelativeTime,
} from '../utils/capabilitiesHelpers';

const { Text } = Typography;

export interface CapabilityListTableProps {
  filteredReleases: CapabilityRelease[];
  isLoading: boolean;
  onSelectRelease: (id: string, mode: 'view' | 'edit') => void;
  onOpenWizard: (record: CapabilityRelease, step?: number) => void;
  onOpenDeployModal: (id: string) => void;
  onArchiveRelease: (id: string) => void;
}

export const CapabilityListTable: React.FC<CapabilityListTableProps> = ({
  filteredReleases,
  isLoading,
  onSelectRelease,
  onOpenWizard,
  onArchiveRelease,
}) => {
  const handleCopyId = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id).then(() => {
      message.success('已复制发布版本 ID 到剪贴板');
    });
  };

  const getSourceIcon = (sourceType: string) => {
    switch (sourceType) {
      case 'temporal_workflow':
        return <ApartmentOutlined style={{ color: '#722ed1', fontSize: 16 }} />;
      case 'browser_recording':
        return <GlobalOutlined style={{ color: '#13c2c2', fontSize: 16 }} />;
      case 'execution_flow_template':
      default:
        return <NodeIndexOutlined style={{ color: '#1890ff', fontSize: 16 }} />;
    }
  };

  const renderPipelineProgress = (record: CapabilityRelease) => {
    const info = resolvePipelineInfo(record);

    return (
      <Space direction="vertical" size={6} style={{ width: '100%' }}>
        <Space size={6} wrap align="center">
          <Tag
            color={info.badgeColor}
            style={{ borderRadius: 6, fontWeight: 500, margin: 0, padding: '2px 8px' }}
          >
            {info.badgeText}
          </Tag>
          {record.lastDeploymentEnvironment && (
            <Tag style={{ borderRadius: 4, margin: 0, fontSize: 11 }}>
              {record.lastDeploymentEnvironment}
            </Tag>
          )}
          {record.publishedSkillId && (
            <Tooltip title={`已挂载发布技能: ${record.publishedSkillId}`}>
              <Tag
                color="green"
                style={{
                  borderRadius: 4,
                  margin: 0,
                  fontSize: 11,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                }}
              >
                <CheckCircleFilled style={{ fontSize: 11 }} />
                Skill #{record.publishedSkillId.slice(0, 8)}
              </Tag>
            </Tooltip>
          )}
        </Space>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: 'var(--text-secondary)',
          }}
        >
          <span
            style={{
              color: info.currentStep >= 1 ? '#52c41a' : '#bfbfbf',
              fontWeight: info.currentStep === 1 ? 600 : 'normal',
            }}
          >
            {info.currentStep > 1 ? '✓' : '1.'} 配置就绪
          </span>
          <span style={{ color: '#d9d9d9' }}>➔</span>
          <span
            style={{
              color:
                info.currentStep > 2
                  ? '#52c41a'
                  : info.stage === 'failed'
                    ? '#ff4d4f'
                    : info.currentStep === 2
                      ? '#1890ff'
                      : info.stage === 'configured'
                        ? '#fa8c16'
                        : '#bfbfbf',
              fontWeight: info.currentStep === 2 ? 600 : 'normal',
            }}
          >
            {info.currentStep > 2 ? '✓' : '2.'} 部署测试
          </span>
          <span style={{ color: '#d9d9d9' }}>➔</span>
          <span
            style={{
              color:
                info.currentStep >= 3
                  ? '#52c41a'
                  : info.stage === 'deployed_pending'
                    ? '#1890ff'
                    : '#bfbfbf',
              fontWeight: info.currentStep === 3 ? 600 : 'normal',
            }}
          >
            {info.currentStep >= 3 ? '✓' : '3.'} 技能发布
          </span>
        </div>
      </Space>
    );
  };

  const columns: ColumnsType<CapabilityRelease> = [
    {
      title: '流程资产名称与类型',
      key: 'sourceName',
      width: 260,
      render: (_, record) => {
        const displayName = record.sourceName || record.sourceId || '未命名流程';
        const versionText = `v${record.releaseVersion || 1}`;

        return (
          <Space align="start" size={10}>
            <div style={{ marginTop: 3 }}>{getSourceIcon(record.sourceType)}</div>
            <Space direction="vertical" size={2}>
              <Space size={6} wrap>
                <Text
                  strong
                  style={{
                    fontSize: 14,
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                  onClick={() => onSelectRelease(record.id, 'view')}
                >
                  {displayName}
                </Text>
                <Tag color="blue" style={{ fontSize: 11, margin: 0, padding: '0 5px' }}>
                  {versionText}
                </Tag>
              </Space>

              <Space size={6}>
                <Tag style={{ borderRadius: 4, margin: 0, fontSize: 11, padding: '0 4px' }}>
                  {getSourceTypeLabel(record.sourceType)}
                </Tag>
                <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>
                  #{record.id.slice(0, 8)}
                </Text>
                <Tooltip title="复制发布版本 ID">
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined style={{ fontSize: 11, color: 'var(--text-secondary)' }} />}
                    onClick={(e) => handleCopyId(e, record.id)}
                    style={{ width: 16, height: 16, padding: 0 }}
                  />
                </Tooltip>
              </Space>
            </Space>
          </Space>
        );
      },
    },
    {
      title: '发布流水线进度',
      key: 'pipeline',
      width: 300,
      render: (_, record) => renderPipelineProgress(record),
    },
    {
      title: '行动指引与更新时间',
      key: 'actionPrompt',
      width: 260,
      render: (_, record) => {
        const info = resolvePipelineInfo(record);
        return (
          <Space direction="vertical" size={2}>
            <Text style={{ fontSize: 13, color: 'var(--text-primary)' }}>
              {info.actionPrompt}
            </Text>
            <Tooltip title={`完整更新时间: ${new Date(record.updatedAt).toLocaleString()}`}>
              <Text type="secondary" style={{ fontSize: 11 }}>
                更新于 {formatRelativeTime(record.updatedAt)}
              </Text>
            </Tooltip>
          </Space>
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 230,
      fixed: 'right',
      render: (_, record) => {
        const info = resolvePipelineInfo(record);

        return (
          <Space size={8} onClick={(e) => e.stopPropagation()}>
            {/* 上下文智能主操作按钮 */}
            {info.primaryAction.key === 'deploy' && (
              <Button
                size="small"
                type="primary"
                icon={<RocketOutlined />}
                onClick={() => onOpenWizard(record, info.primaryAction.stepTarget)}
              >
                {info.primaryAction.label}
              </Button>
            )}

            {info.primaryAction.key === 'publish' && (
              <Button
                size="small"
                type="primary"
                style={{ background: '#52c41a', borderColor: '#52c41a' }}
                icon={<SendOutlined />}
                onClick={() => onOpenWizard(record, info.primaryAction.stepTarget)}
              >
                {info.primaryAction.label}
              </Button>
            )}

            {info.primaryAction.key === 'validate' && (
              <Button
                size="small"
                icon={<PlayCircleOutlined style={{ color: '#1890ff' }} />}
                onClick={() => onOpenWizard(record, info.primaryAction.stepTarget)}
              >
                {info.primaryAction.label}
              </Button>
            )}

            {info.primaryAction.key === 'retry' && (
              <Button
                size="small"
                type="primary"
                danger
                icon={<ReloadOutlined />}
                onClick={() => onOpenWizard(record, info.primaryAction.stepTarget)}
              >
                {info.primaryAction.label}
              </Button>
            )}

            {/* 次级操作：向导全景、详情抽屉 */}
            <Tooltip title="以分步向导查看/推进全流程">
              <Button
                size="small"
                type="link"
                onClick={() => onOpenWizard(record)}
                style={{ padding: '0 4px' }}
              >
                向导
              </Button>
            </Tooltip>

            <Tooltip title="查看底层构建、参数快照与审计日志">
              <Button
                size="small"
                type="link"
                icon={<EyeOutlined />}
                onClick={() => onSelectRelease(record.id, 'view')}
                style={{ padding: '0 4px' }}
              >
                详情
              </Button>
            </Tooltip>

            <Popconfirm
              title="确认归档删除该流程发布？"
              description="归档后流程将从在线列表移除，历史构建与验证记录仍将保留。"
              onConfirm={() => onArchiveRelease(record.id)}
              okText="确认归档"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Tooltip title="归档删除本流程发布">
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  style={{ padding: '0 4px' }}
                />
              </Tooltip>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <Card
      style={{
        borderRadius: 14,
        border: '1px solid var(--bg-secondary)',
        background: 'var(--bg-card)',
      }}
      styles={{ body: { padding: '16px 20px' } }}
    >
      <Table
        rowKey="id"
        dataSource={filteredReleases}
        columns={columns}
        loading={isLoading}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条流程发布记录`,
        }}
        scroll={{ x: 1050 }}
        locale={{
          emptyText: '暂无符合筛选条件的流程发布记录',
        }}
      />
    </Card>
  );
};

export default CapabilityListTable;
