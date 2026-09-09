import React, { useState } from 'react';
import { Card, Space, Tag, Radio, Button } from 'antd';
import {
  SafetyCertificateOutlined,
  ReloadOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { SkillAccessRequestReviewDTO } from '@/api/skill';
import { SkillAccessRequestReviewTab } from '@/features/admin/skills/components/SkillAccessRequestReviewTab';

interface AdminAuthorizationApprovalCardProps {
  pendingRequests: SkillAccessRequestReviewDTO[];
  approvedRequests: SkillAccessRequestReviewDTO[];
  rejectedRequests: SkillAccessRequestReviewDTO[];
  allRequests: SkillAccessRequestReviewDTO[];
  loading?: boolean;
  processingRequestId?: string | null;
  processingAction?: 'approve' | 'reject' | null;
  onApprove: (request: SkillAccessRequestReviewDTO, responseNote?: string) => void;
  onReject: (request: SkillAccessRequestReviewDTO, responseNote?: string) => void;
  onRefresh?: () => void;
}

export const AdminAuthorizationApprovalCard: React.FC<AdminAuthorizationApprovalCardProps> = ({
  pendingRequests,
  approvedRequests,
  rejectedRequests,
  allRequests,
  loading = false,
  processingRequestId = null,
  processingAction = null,
  onApprove,
  onReject,
  onRefresh,
}) => {
  const navigate = useNavigate();
  const [activeSubTab, setActiveSubTab] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');

  const currentRequests =
    activeSubTab === 'pending'
      ? pendingRequests
      : activeSubTab === 'approved'
        ? approvedRequests
        : activeSubTab === 'rejected'
          ? rejectedRequests
          : allRequests;

  return (
    <Card
      styles={{ body: { padding: '20px 24px' } }}
      style={{
        borderRadius: 16,
        border: '1px solid var(--border-color)',
        background: 'var(--bg-card)',
        boxShadow: 'var(--shadow-md)',
        marginBottom: 20,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div>
          <Space size={10} align="center">
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: 'rgba(22, 119, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <SafetyCertificateOutlined style={{ fontSize: 20, color: 'var(--primary-color)' }} />
            </div>
            <div>
              <Space size={8} align="center">
                <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                  用户授权申请审批中心
                </span>
                <Tag
                  color={pendingRequests.length > 0 ? 'error' : 'success'}
                  icon={pendingRequests.length === 0 ? <CheckCircleOutlined /> : undefined}
                  style={{ borderRadius: 6, fontWeight: 600 }}
                >
                  {pendingRequests.length > 0 ? `${pendingRequests.length} 条待审批` : '全部已处理'}
                </Tag>
              </Space>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                审核普通用户对受限技能或企业能力的开通申请。审批通过后系统将自动为申请人所在角色授予该技能权限。
              </div>
            </div>
          </Space>
        </div>

        <Space size={10} wrap>
          <Radio.Group
            value={activeSubTab}
            onChange={(e) => setActiveSubTab(e.target.value)}
            buttonStyle="solid"
            size="middle"
          >
            <Radio.Button value="pending">
              待审批 ({pendingRequests.length})
            </Radio.Button>
            <Radio.Button value="approved">
              已批准 ({approvedRequests.length})
            </Radio.Button>
            <Radio.Button value="rejected">
              已驳回 ({rejectedRequests.length})
            </Radio.Button>
            <Radio.Button value="all">
              全部记录 ({allRequests.length})
            </Radio.Button>
          </Radio.Group>

          {onRefresh && (
            <Button icon={<ReloadOutlined />} onClick={onRefresh}>
              刷新
            </Button>
          )}

          <Button
            type="link"
            icon={<ArrowRightOutlined />}
            onClick={() => navigate('/admin/skills?tab=requests')}
            style={{ padding: '4px 8px' }}
          >
            技能授权管理
          </Button>
        </Space>
      </div>

      <SkillAccessRequestReviewTab
        requests={currentRequests}
        loading={loading}
        processingRequestId={processingRequestId}
        processingAction={processingAction}
        onApprove={onApprove}
        onReject={onReject}
        enableReviewActions={activeSubTab === 'pending' || activeSubTab === 'all'}
        showSkillColumn={true}
        searchable={true}
        pagination={{ pageSize: 8, showSizeChanger: true }}
        emptyText={
          activeSubTab === 'pending'
            ? '当前没有待处理的用户授权申请，平台权限运转正常！'
            : '暂无相关授权申请记录'
        }
      />
    </Card>
  );
};
