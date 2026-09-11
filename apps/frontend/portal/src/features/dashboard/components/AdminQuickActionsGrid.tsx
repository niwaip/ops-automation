import React from 'react';
import { Card, Col, Row, Tag, Typography } from 'antd';
import {
  SettingOutlined,
  UserOutlined,
  ThunderboltOutlined,
  ApartmentOutlined,
  FolderOpenOutlined,
  ToolOutlined,
  CloudServerOutlined,
  PlayCircleOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const { Text } = Typography;

interface AdminQuickActionsGridProps {
  pendingRequestsCount?: number;
}

export const AdminQuickActionsGrid: React.FC<AdminQuickActionsGridProps> = ({
  pendingRequestsCount = 0,
}) => {
  const navigate = useNavigate();

  const actions = [
    {
      key: 'skills',
      title: '技能授权与管理',
      desc: '内置套件/自定义技能配置与角色使用授权',
      path: '/admin/skills',
      icon: <ThunderboltOutlined style={{ fontSize: 22, color: '#8b5cf6' }} />,
      bg: 'rgba(139, 92, 246, 0.08)',
      badge: pendingRequestsCount > 0 ? `${pendingRequestsCount} 条申请` : undefined,
      badgeColor: '#ff4d4f',
    },
    {
      key: 'users',
      title: '用户与角色分配',
      desc: '平台账号启停、管理员身份与角色授权矩阵',
      path: '/admin/users',
      icon: <UserOutlined style={{ fontSize: 22, color: '#1677ff' }} />,
      bg: 'rgba(22, 119, 255, 0.08)',
    },
    {
      key: 'workflows',
      title: '组织工作流编排',
      desc: '企业跨部门业务审批、任务流与自动化组合',
      path: '/admin/org-workflows',
      icon: <ApartmentOutlined style={{ fontSize: 22, color: '#10b981' }} />,
      bg: 'rgba(16, 185, 129, 0.08)',
    },
    {
      key: 'workspaces',
      title: '企业知识空间',
      desc: '部门与全员知识库文件管理、向量索引与问答',
      path: '/admin/workspaces',
      icon: <FolderOpenOutlined style={{ fontSize: 22, color: '#fa8c16' }} />,
      bg: 'rgba(250, 140, 22, 0.08)',
    },
    {
      key: 'tools',
      title: '模型原子能力',
      desc: '大模型规划调度的底层原子能力目录、Prompt 暴露策略与技能绑定门禁',
      path: '/admin/tools',
      icon: <ToolOutlined style={{ fontSize: 22, color: '#06b6d4' }} />,
      bg: 'rgba(6, 182, 212, 0.08)',
    },
    {
      key: 'models',
      title: 'AI 模型接入',
      desc: '多模型 Provider 接入、API Key 与推理路由配置',
      path: '/admin/models',
      icon: <SettingOutlined style={{ fontSize: 22, color: '#ec4899' }} />,
      bg: 'rgba(236, 72, 153, 0.08)',
    },
    {
      key: 'sandboxes',
      title: '个人沙箱容器',
      desc: '用户专属安全执行容器运行实例与资源监管',
      path: '/admin/sandboxes',
      icon: <CloudServerOutlined style={{ fontSize: 22, color: '#6366f1' }} />,
      bg: 'rgba(99, 102, 241, 0.08)',
    },
    {
      key: 'executions',
      title: '执行审计与监控',
      desc: '任务执行链路监控、高风险审批与异常回溯',
      path: '/executions',
      icon: <PlayCircleOutlined style={{ fontSize: 22, color: '#f59e0b' }} />,
      bg: 'rgba(245, 158, 11, 0.08)',
    },
  ];

  return (
    <Card
      title={
        <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>
          管理员快捷工作台
        </span>
      }
      styles={{ body: { padding: '16px 20px' } }}
      style={{
        borderRadius: 16,
        border: '1px solid var(--border-color)',
        background: 'var(--bg-card)',
        boxShadow: 'var(--shadow-md)',
        marginBottom: 20,
      }}
    >
      <Row gutter={[14, 14]}>
        {actions.map((item) => (
          <Col xs={24} sm={12} md={6} key={item.key}>
            <div
              onClick={() => navigate(item.path)}
              style={{
                borderRadius: 12,
                border: '1px solid var(--border-color)',
                padding: '14px 16px',
                background: 'var(--bg-card)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                position: 'relative',
                overflow: 'hidden',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--primary-color)';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-color)';
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: item.bg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {item.icon}
                  </div>
                  {item.badge && (
                    <Tag
                      color={item.badgeColor}
                      style={{
                        margin: 0,
                        borderRadius: 8,
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {item.badge}
                    </Tag>
                  )}
                </div>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
                  {item.title}
                </div>
                <Text
                  type="secondary"
                  style={{ fontSize: 12, display: 'block', marginTop: 4, lineHeight: '18px' }}
                >
                  {item.desc}
                </Text>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  marginTop: 12,
                  fontSize: 12,
                  color: 'var(--primary-color)',
                  fontWeight: 500,
                }}
              >
                <span>进入配置</span>
                <ArrowRightOutlined style={{ fontSize: 10 }} />
              </div>
            </div>
          </Col>
        ))}
      </Row>
    </Card>
  );
};
