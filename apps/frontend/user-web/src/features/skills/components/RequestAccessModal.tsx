import { Input, Modal, Space, Tag, Typography } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import type { PublishedSkillCatalogItem } from '@/api/skill';
import styles from './EmployeeManagement.module.css';

interface RequestAccessModalProps {
  loading: boolean;
  onCancel: () => void;
  onReasonChange: (value: string) => void;
  onSubmit: () => void;
  requestReason: string;
  requestTarget: PublishedSkillCatalogItem | null;
}

const QUICK_REASONS = [
  '日常巡检监控与自动化响应',
  '业务数据报表定期汇总生成',
  '网页与外部系统数据自动抓取',
  '高频跨系统流程协同与通知',
  '业务文档与表格自动化整理',
];

export function RequestAccessModal({
  loading,
  onCancel,
  onReasonChange,
  onSubmit,
  requestReason,
  requestTarget,
}: RequestAccessModalProps) {
  const handleSelectQuickReason = (reason: string) => {
    if (!requestReason.trim()) {
      onReasonChange(reason);
    } else if (!requestReason.includes(reason)) {
      onReasonChange(`${requestReason}；${reason}`);
    }
  };

  return (
    <Modal
      title={
        <Space align="center" size={8}>
          <RobotOutlined style={{ color: '#6366f1' }} />
          <span>{requestTarget ? `申请开通数字员工: ${requestTarget.name}` : '申请开通数字员工'}</span>
        </Space>
      }
      open={Boolean(requestTarget)}
      onCancel={onCancel}
      onOk={onSubmit}
      okText="提交开通申请"
      cancelText="取消"
      confirmLoading={loading}
      destroyOnHidden
      width={520}
    >
      <Space direction="vertical" size={14} style={{ width: '100%', marginTop: 8 }}>
        {requestTarget && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              background: 'rgba(99, 102, 241, 0.05)',
              border: '1px solid rgba(99, 102, 241, 0.15)',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>
              {requestTarget.name}
              {requestTarget.publishedReleaseVersion ? (
                <Tag style={{ marginLeft: 8, fontSize: 10 }}>v{requestTarget.publishedReleaseVersion}</Tag>
              ) : null}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {requestTarget.description || '专注执行自动化业务流程与跨系统任务协同。'}
            </div>
          </div>
        )}

        <div>
          <Typography.Text style={{ fontSize: 13, fontWeight: 500 }}>申请原因 / 预期用途</Typography.Text>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
            请填写申请原因，便于管理员快速审核并为你开通该数字员工权限。
          </div>
          <Input.TextArea
            rows={3}
            maxLength={500}
            showCount
            placeholder="例如：需使用该数字员工完成每周一销售报表汇总或服务器日常巡检..."
            value={requestReason}
            onChange={(event) => onReasonChange(event.target.value)}
          />
        </div>

        <div>
          <Typography.Text type="secondary" style={{ fontSize: 11.5 }}>
            常用理由快捷填充：
          </Typography.Text>
          <div className={styles['quick-reason-chips']}>
            {QUICK_REASONS.map((reason, idx) => (
              <span
                key={idx}
                className={styles['quick-reason-chip']}
                onClick={() => handleSelectQuickReason(reason)}
              >
                + {reason}
              </span>
            ))}
          </div>
        </div>
      </Space>
    </Modal>
  );
}
