import React from 'react';
import { Card, Col, Row, Space, Tag, Typography } from 'antd';
import {
  SafetyCertificateOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  PlayCircleOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const { Text } = Typography;

interface AdminOverviewStatsProps {
  pendingRequestsCount: number;
  totalUsersCount: number;
  activeUsersCount: number;
  totalSkillsCount: number;
  customSkillsCount: number;
  publishedSkillsCount: number;
  runningExecutionsCount: number;
  pendingApprovalExecutionsCount: number;
  onViewRequests?: () => void;
}

export const AdminOverviewStats: React.FC<AdminOverviewStatsProps> = ({
  pendingRequestsCount,
  totalUsersCount,
  activeUsersCount,
  totalSkillsCount,
  customSkillsCount,
  publishedSkillsCount,
  runningExecutionsCount,
  pendingApprovalExecutionsCount,
  onViewRequests,
}) => {
  const navigate = useNavigate();

  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
      {/* 1. 待审批用户授权 */}
      <Col xs={24} sm={12} lg={6}>
        <Card
          className="stat-card dashboard-stat-card card-gradient-1 animate-fade-in-up"
          variant="borderless"
          styles={{ body: { padding: '16px 20px', cursor: 'pointer' } }}
          onClick={() => {
            if (onViewRequests) {
              onViewRequests();
            } else {
              navigate('/admin/skills?tab=requests');
            }
          }}
          style={{
            borderRadius: 14,
            border: pendingRequestsCount > 0 ? '2px solid rgba(255, 77, 79, 0.6)' : undefined,
            position: 'relative',
          }}
        >
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: 13, fontWeight: 500 }}>
                待审批用户授权
              </Text>
              <Tag
                color={pendingRequestsCount > 0 ? '#ff4d4f' : '#52c41a'}
                style={{ margin: 0, borderRadius: 10, fontSize: 11, border: 'none', color: '#fff' }}
              >
                {pendingRequestsCount > 0 ? '需审批' : '全部已处理'}
              </Tag>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              <SafetyCertificateOutlined style={{ fontSize: 24, color: '#fff' }} />
              <span style={{ fontSize: 32, fontWeight: 700, color: '#fff', lineHeight: 1 }}>
                {pendingRequestsCount}
              </span>
              <Text style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: 12 }}>条待处理</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <Text style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: 12 }}>
                用户技能使用权限申请
              </Text>
              <ArrowRightOutlined style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: 12 }} />
            </div>
          </Space>
        </Card>
      </Col>

      {/* 2. 平台用户与角色 */}
      <Col xs={24} sm={12} lg={6}>
        <Card
          className="stat-card dashboard-stat-card card-gradient-2 animate-fade-in-up"
          variant="borderless"
          styles={{ body: { padding: '16px 20px', cursor: 'pointer' } }}
          onClick={() => navigate('/admin/users')}
          style={{ borderRadius: 14 }}
        >
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: 13, fontWeight: 500 }}>
                平台用户与权限
              </Text>
              <Tag
                color="rgba(255, 255, 255, 0.2)"
                style={{ margin: 0, borderRadius: 10, fontSize: 11, border: 'none', color: '#fff' }}
              >
                用户管理
              </Tag>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              <TeamOutlined style={{ fontSize: 24, color: '#fff' }} />
              <span style={{ fontSize: 32, fontWeight: 700, color: '#fff', lineHeight: 1 }}>
                {totalUsersCount}
              </span>
              <Text style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: 12 }}>注册用户</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <Text style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: 12 }}>
                启用中: {activeUsersCount} | 停用: {Math.max(0, totalUsersCount - activeUsersCount)}
              </Text>
              <ArrowRightOutlined style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: 12 }} />
            </div>
          </Space>
        </Card>
      </Col>

      {/* 3. 技能与能力资产 */}
      <Col xs={24} sm={12} lg={6}>
        <Card
          className="stat-card dashboard-stat-card card-gradient-3 animate-fade-in-up"
          variant="borderless"
          styles={{ body: { padding: '16px 20px', cursor: 'pointer' } }}
          onClick={() => navigate('/admin/skills')}
          style={{ borderRadius: 14 }}
        >
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: 13, fontWeight: 500 }}>
                技能资产中心
              </Text>
              <Tag
                color="rgba(255, 255, 255, 0.2)"
                style={{ margin: 0, borderRadius: 10, fontSize: 11, border: 'none', color: '#fff' }}
              >
                已发布 {publishedSkillsCount}
              </Tag>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              <ThunderboltOutlined style={{ fontSize: 24, color: '#fff' }} />
              <span style={{ fontSize: 32, fontWeight: 700, color: '#fff', lineHeight: 1 }}>
                {totalSkillsCount}
              </span>
              <Text style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: 12 }}>总能力数</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <Text style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: 12 }}>
                自定义: {customSkillsCount} | 内置套件: {totalSkillsCount - customSkillsCount}
              </Text>
              <ArrowRightOutlined style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: 12 }} />
            </div>
          </Space>
        </Card>
      </Col>

      {/* 4. 任务运行与待审批 */}
      <Col xs={24} sm={12} lg={6}>
        <Card
          className="stat-card dashboard-stat-card card-gradient-4 animate-fade-in-up"
          variant="borderless"
          styles={{ body: { padding: '16px 20px', cursor: 'pointer' } }}
          onClick={() => navigate('/executions')}
          style={{ borderRadius: 14 }}
        >
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: 13, fontWeight: 500 }}>
                任务运行与待干预
              </Text>
              <Tag
                color={pendingApprovalExecutionsCount > 0 ? '#faad14' : 'rgba(255, 255, 255, 0.2)'}
                style={{ margin: 0, borderRadius: 10, fontSize: 11, border: 'none', color: '#fff' }}
              >
                待审批 {pendingApprovalExecutionsCount}
              </Tag>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              <PlayCircleOutlined style={{ fontSize: 24, color: '#fff' }} />
              <span style={{ fontSize: 32, fontWeight: 700, color: '#fff', lineHeight: 1 }}>
                {runningExecutionsCount}
              </span>
              <Text style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: 12 }}>运行中任务</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <Text style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: 12 }}>
                人工干预: {pendingApprovalExecutionsCount} 项待确认
              </Text>
              <ArrowRightOutlined style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: 12 }} />
            </div>
          </Space>
        </Card>
      </Col>
    </Row>
  );
};
