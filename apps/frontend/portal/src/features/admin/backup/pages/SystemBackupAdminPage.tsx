import React from 'react';
import { useQuery, useQueryClient } from 'react-query';
import {
  Typography,
  Space,
  Row,
  Col,
  Card,
  Statistic,
  Button,
  Tooltip,
} from 'antd';
import {
  CloudSyncOutlined,
  ReloadOutlined,
  DatabaseOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  ApartmentOutlined,
  BranchesOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { systemBackupApi } from '@/api/system-backup';
import { BackupExportCard } from '../components/BackupExportCard';
import { BackupImportCard } from '../components/BackupImportCard';

const { Title, Text, Paragraph } = Typography;

export const SystemBackupAdminPage: React.FC = () => {
  const queryClient = useQueryClient();

  const {
    data: summary,
    isLoading: loadingSummary,
    refetch: refetchSummary,
  } = useQuery(['system-backup-summary'], () => systemBackupApi.getSummary(), {
    staleTime: 30000,
  });

  const handleRefreshAll = () => {
    refetchSummary();
    queryClient.invalidateQueries(['models']);
    queryClient.invalidateQueries(['skills']);
    queryClient.invalidateQueries(['temporal-workflows']);
  };

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1600, margin: '0 auto' }}>
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 20,
        }}
      >
        <div>
          <Space align="center" size={10}>
            <CloudSyncOutlined style={{ fontSize: 24, color: '#1677ff' }} />
            <Title level={3} style={{ margin: 0 }}>
              数据备份与系统迁移 (Backup & Restore)
            </Title>
          </Space>
          <Paragraph type="secondary" style={{ marginTop: 6, marginBottom: 0 }}>
            提供全系统资产（AI 模型、技能工具、工作流活动、发布工件、模板与组织权限）的结构化导出备份，并在不同环境间一键解析还原，支撑系统平滑迁移与高可用灾备。
          </Paragraph>
        </div>

        <Tooltip title="刷新当前资产统计数据">
          <Button
            icon={<ReloadOutlined />}
            loading={loadingSummary}
            onClick={handleRefreshAll}
            style={{ borderRadius: 8 }}
          >
            刷新统计
          </Button>
        </Tooltip>
      </div>

      {/* Top Assets Overview Bar */}
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={8} md={4}>
          <Card size="small" style={{ borderRadius: 10 }}>
            <Statistic
              title={
                <Space size={4}>
                  <DatabaseOutlined style={{ color: '#1677ff' }} />
                  <Text type="secondary" style={{ fontSize: 12 }}>系统资产总计</Text>
                </Space>
              }
              value={summary?.totalAssets ?? 0}
              loading={loadingSummary}
              valueStyle={{ fontWeight: 600, color: '#1677ff', fontSize: 20 }}
            />
          </Card>
        </Col>

        <Col xs={12} sm={8} md={4}>
          <Card size="small" style={{ borderRadius: 10 }}>
            <Statistic
              title={
                <Space size={4}>
                  <RobotOutlined style={{ color: '#722ed1' }} />
                  <Text type="secondary" style={{ fontSize: 12 }}>AI 模型与配置</Text>
                </Space>
              }
              value={summary?.counts?.aiModels ?? 0}
              loading={loadingSummary}
              valueStyle={{ fontWeight: 600, fontSize: 20 }}
            />
          </Card>
        </Col>

        <Col xs={12} sm={8} md={4}>
          <Card size="small" style={{ borderRadius: 10 }}>
            <Statistic
              title={
                <Space size={4}>
                  <ThunderboltOutlined style={{ color: '#faad14' }} />
                  <Text type="secondary" style={{ fontSize: 12 }}>技能与工具</Text>
                </Space>
              }
              value={summary?.counts?.skills ?? 0}
              loading={loadingSummary}
              valueStyle={{ fontWeight: 600, fontSize: 20 }}
            />
          </Card>
        </Col>

        <Col xs={12} sm={8} md={4}>
          <Card size="small" style={{ borderRadius: 10 }}>
            <Statistic
              title={
                <Space size={4}>
                  <ApartmentOutlined style={{ color: '#52c41a' }} />
                  <Text type="secondary" style={{ fontSize: 12 }}>工作流工件</Text>
                </Space>
              }
              value={summary?.counts?.temporalWorkflows ?? 0}
              loading={loadingSummary}
              valueStyle={{ fontWeight: 600, fontSize: 20 }}
            />
          </Card>
        </Col>

        <Col xs={12} sm={8} md={4}>
          <Card size="small" style={{ borderRadius: 10 }}>
            <Statistic
              title={
                <Space size={4}>
                  <BranchesOutlined style={{ color: '#13c2c2' }} />
                  <Text type="secondary" style={{ fontSize: 12 }}>能力发布版本</Text>
                </Space>
              }
              value={summary?.counts?.capabilityReleases ?? 0}
              loading={loadingSummary}
              valueStyle={{ fontWeight: 600, fontSize: 20 }}
            />
          </Card>
        </Col>

        <Col xs={12} sm={8} md={4}>
          <Card size="small" style={{ borderRadius: 10 }}>
            <Statistic
              title={
                <Space size={4}>
                  <FileTextOutlined style={{ color: '#eb2f96' }} />
                  <Text type="secondary" style={{ fontSize: 12 }}>录制与执行模板</Text>
                </Space>
              }
              value={(summary?.counts?.browserTemplates ?? 0) + (summary?.counts?.executionFlowTemplates ?? 0)}
              loading={loadingSummary}
              valueStyle={{ fontWeight: 600, fontSize: 20 }}
            />
          </Card>
        </Col>
      </Row>

      {/* Main Export & Import Panels */}
      <Row gutter={[20, 20]}>
        <Col xs={24} lg={13}>
          <BackupExportCard summary={summary} loadingSummary={loadingSummary} />
        </Col>
        <Col xs={24} lg={11}>
          <BackupImportCard onRefreshSummary={handleRefreshAll} />
        </Col>
      </Row>
    </div>
  );
};

export default SystemBackupAdminPage;
