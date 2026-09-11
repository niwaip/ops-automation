import React, { useRef } from 'react';
import { Space, Button, Typography } from 'antd';
import {
  SafetyCertificateOutlined,
  UserOutlined,
  ThunderboltOutlined,
  ReloadOutlined,
  DashboardOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAdminDashboardData } from '../hooks/useAdminDashboardData';
import { AdminOverviewStats } from '../components/AdminOverviewStats';
import { AdminAuthorizationApprovalCard } from '../components/AdminAuthorizationApprovalCard';
import { AdminQuickActionsGrid } from '../components/AdminQuickActionsGrid';
import { AdminRecentExecutionsCard } from '../components/AdminRecentExecutionsCard';

const { Title, Text } = Typography;

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const approvalSectionRef = useRef<HTMLDivElement>(null);

  const {
    pendingRequests,
    approvedRequests,
    rejectedRequests,
    allRequests,
    pendingRequestsCount,
    isLoadingRequests,
    totalUsersCount,
    activeUsersCount,
    totalSkillsCount,
    customSkillsCount,
    publishedSkillsCount,
    skillNameMap,
    runningExecutionsCount,
    pendingApprovalExecutionsCount,
    recentExecutions,
    recentExecutionsLoading,
    processingRequestId,
    processingAction,
    handleApprove,
    handleReject,
    refetchAll,
  } = useAdminDashboardData();

  const handleScrollToApproval = () => {
    approvalSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div style={{ width: '100%', padding: '0 24px 32px' }}>
      {/* 顶部欢迎与快捷操作栏 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <Space align="center" size={8}>
            <DashboardOutlined style={{ fontSize: 22, color: 'var(--primary-color)' }} />
            <Title level={3} style={{ margin: 0, fontWeight: 700 }}>
              管理员运营控制台
            </Title>
          </Space>
          <Text type="secondary" style={{ fontSize: 13, display: 'block', marginTop: 4 }}>
            监控平台核心资产状态、集中审批用户技能权限申请、监管执行任务与安全风险
          </Text>
        </div>

        <Space size={10} wrap>
          <Button
            type="primary"
            icon={<SafetyCertificateOutlined />}
            onClick={() => navigate('/admin/skills?tab=requests')}
            style={{ borderRadius: 8 }}
          >
            权限审批管理
          </Button>
          <Button
            icon={<UserOutlined />}
            onClick={() => navigate('/admin/users')}
            style={{ borderRadius: 8 }}
          >
            用户与角色
          </Button>
          <Button
            icon={<ThunderboltOutlined />}
            onClick={() => navigate('/admin/skills')}
            style={{ borderRadius: 8 }}
          >
            技能中心
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={refetchAll}
            style={{ borderRadius: 8 }}
          >
            刷新数据
          </Button>
        </Space>
      </div>

      {/* 1. 管理员核心 KPI 统计卡片 */}
      <AdminOverviewStats
        pendingRequestsCount={pendingRequestsCount}
        totalUsersCount={totalUsersCount}
        activeUsersCount={activeUsersCount}
        totalSkillsCount={totalSkillsCount}
        customSkillsCount={customSkillsCount}
        publishedSkillsCount={publishedSkillsCount}
        runningExecutionsCount={runningExecutionsCount}
        pendingApprovalExecutionsCount={pendingApprovalExecutionsCount}
        onViewRequests={handleScrollToApproval}
      />

      {/* 2. 核心工作区：用户授权申请审批中心 */}
      <div ref={approvalSectionRef}>
        <AdminAuthorizationApprovalCard
          pendingRequests={pendingRequests}
          approvedRequests={approvedRequests}
          rejectedRequests={rejectedRequests}
          allRequests={allRequests}
          loading={isLoadingRequests}
          processingRequestId={processingRequestId}
          processingAction={processingAction}
          onApprove={handleApprove}
          onReject={handleReject}
          onRefresh={refetchAll}
        />
      </div>

      {/* 3. 管理员快捷工作台入口矩阵 */}
      <AdminQuickActionsGrid pendingRequestsCount={pendingRequestsCount} />

      {/* 4. 任务执行监控与风险审计 */}
      <AdminRecentExecutionsCard
        executions={recentExecutions}
        loading={recentExecutionsLoading}
        skillNameMap={skillNameMap}
        onRefresh={refetchAll}
      />
    </div>
  );
};

export default DashboardPage;
