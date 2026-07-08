import { Input, Modal, Space, Typography } from 'antd';
import type { PublishedSkillCatalogItem } from '@/api/skill';

interface RequestAccessModalProps {
  loading: boolean;
  onCancel: () => void;
  onReasonChange: (value: string) => void;
  onSubmit: () => void;
  requestReason: string;
  requestTarget: PublishedSkillCatalogItem | null;
}

export function RequestAccessModal({
  loading,
  onCancel,
  onReasonChange,
  onSubmit,
  requestReason,
  requestTarget,
}: RequestAccessModalProps) {
  return (
    <Modal
      title={requestTarget ? `申请使用技能: ${requestTarget.name}` : '申请授权'}
      open={Boolean(requestTarget)}
      onCancel={onCancel}
      onOk={onSubmit}
      okText="提交申请"
      cancelText="取消"
      confirmLoading={loading}
      destroyOnHidden
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Typography.Text type="secondary">
          请填写申请原因，便于管理员判断是否为你开通该技能。
        </Typography.Text>
        <Input.TextArea
          rows={4}
          maxLength={500}
          showCount
          placeholder="例如：需要用于日报生成、合同整理或日常审批处理。"
          value={requestReason}
          onChange={(event) => onReasonChange(event.target.value)}
        />
      </Space>
    </Modal>
  );
}
