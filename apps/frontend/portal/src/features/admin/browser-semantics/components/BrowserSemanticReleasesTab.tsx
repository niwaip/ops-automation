import React from 'react';
import {
  Card,
  Space,
  Tag,
  Typography,
  Button,
  Table,
  theme,
} from 'antd';
import {
  RocketOutlined,
  SafetyCertificateOutlined,
  RollbackOutlined,
  EyeOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import type { SemanticRuleSet } from '@/api/browser-semantics';

const { Text } = Typography;

export interface BrowserSemanticReleasesTabProps {
  ruleSets: SemanticRuleSet[];
  activeRuleSetId?: string;
  selectedRuleSetId: string | null;
  loading?: boolean;
  onSelectRuleSet: (id: string) => void;
  onOpenDetail: (id: string) => void;
  onPromoteCanary: (id: string) => void;
  onPromoteActive: (id: string) => void;
  onOpenRollback: (id: string) => void;
  onValidateRuleSet: (id: string) => void;
  publishCanaryLoading?: boolean;
  publishActiveLoading?: boolean;
}

export const BrowserSemanticReleasesTab: React.FC<BrowserSemanticReleasesTabProps> = ({
  ruleSets,
  activeRuleSetId,
  selectedRuleSetId,
  loading = false,
  onSelectRuleSet,
  onOpenDetail,
  onPromoteCanary,
  onPromoteActive,
  onOpenRollback,
  onValidateRuleSet,
  publishCanaryLoading,
  publishActiveLoading,
}) => {
  const { token } = theme.useToken();

  const columns = [
    {
      title: '版本号 / 名称',
      key: 'version',
      render: (_: unknown, record: SemanticRuleSet) => {
        const isActive = record.id === activeRuleSetId;
        const isSelected = record.id === selectedRuleSetId;
        return (
          <Space direction="vertical" size={2}>
            <Space size={6} align="center">
              <Text strong style={{ fontSize: 13 }}>
                {record.name}
              </Text>
              <Tag color="blue">{record.version}</Tag>
              {isActive && (
                <Tag color="green" icon={<CheckCircleOutlined />}>
                  当前线上版本
                </Tag>
              )}
              {isSelected && !isActive && (
                <Tag color="cyan">当前编辑中</Tag>
              )}
            </Space>
            <Text type="secondary" style={{ fontSize: 11 }}>
              Key: {record.key}
            </Text>
          </Space>
        );
      },
    },
    {
      title: '发布状态',
      key: 'status',
      width: 130,
      render: (_: unknown, record: SemanticRuleSet) => {
        const colorMap: Record<string, string> = {
          DRAFT: 'default',
          CANARY: 'gold',
          ACTIVE: 'green',
          ARCHIVED: 'purple',
          ROLLED_BACK: 'red',
        };
        return <Tag color={colorMap[record.status] || 'default'}>{record.status}</Tag>;
      },
    },
    {
      title: '包含规则数',
      key: 'rulesCount',
      width: 110,
      render: (_: unknown, record: SemanticRuleSet) => (
        <span>{record.rules?.length || 0} 条</span>
      ),
    },
    {
      title: '更新说明 / 创建人',
      key: 'changeSummary',
      render: (_: unknown, record: SemanticRuleSet) => (
        <Space direction="vertical" size={2}>
          <Text style={{ fontSize: 12 }}>
            {record.changeSummary || record.description || '（无更新说明）'}
          </Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            创建人: {record.createdBy || '-'} · {new Date(record.createdAt).toLocaleString()}
          </Text>
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 280,
      render: (_: unknown, record: SemanticRuleSet) => {
        const isActive = record.id === activeRuleSetId;
        const isSelected = record.id === selectedRuleSetId;
        return (
          <Space size={6} wrap>
            {!isSelected && (
              <Button size="small" onClick={() => onSelectRuleSet(record.id)}>
                载入工作区
              </Button>
            )}
            <Button
              size="small"
              icon={<SafetyCertificateOutlined />}
              onClick={() => onValidateRuleSet(record.id)}
            >
              验证
            </Button>
            {record.status !== 'ACTIVE' && (
              <>
                <Button
                  size="small"
                  type="primary"
                  ghost
                  icon={<RocketOutlined />}
                  loading={publishCanaryLoading}
                  onClick={() => onPromoteCanary(record.id)}
                >
                  灰度
                </Button>
                <Button
                  size="small"
                  type="primary"
                  icon={<RocketOutlined />}
                  loading={publishActiveLoading}
                  onClick={() => onPromoteActive(record.id)}
                >
                  全量上线
                </Button>
              </>
            )}
            {isActive && (
              <Button
                size="small"
                danger
                icon={<RollbackOutlined />}
                onClick={() => onOpenRollback(record.id)}
              >
                回滚
              </Button>
            )}
            <Button
              size="small"
              type="text"
              icon={<EyeOutlined />}
              onClick={() => onOpenDetail(record.id)}
            />
          </Space>
        );
      },
    },
  ];

  return (
    <Card
      size="small"
      style={{
        borderRadius: 12,
        border: `1px solid ${token.colorBorderSecondary}`,
      }}
      title={<Text strong>规则集全版本生命周期发布与回滚</Text>}
    >
      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={ruleSets}
        pagination={{ pageSize: 8 }}
      />
    </Card>
  );
};
