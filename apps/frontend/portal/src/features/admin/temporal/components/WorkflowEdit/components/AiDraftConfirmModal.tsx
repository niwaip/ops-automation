import React from 'react';
import { Modal, Alert, Typography, Space } from 'antd';
import type { AiWorkflowDraft } from '@/api/temporal';

const { Text } = Typography;

export interface AiDraftConfirmModalProps {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  currentDraft: AiWorkflowDraft | null;
}

export const AiDraftConfirmModal: React.FC<AiDraftConfirmModalProps> = ({
  visible,
  onCancel,
  onConfirm,
  currentDraft,
}) => {
  if (!currentDraft) return null;

  return (
    <Modal
      open={visible}
      title="确认应用草稿至画布"
      onOk={onConfirm}
      onCancel={onCancel}
      width={600}
      okText="确认覆盖应用"
      cancelText="取消"
    >
      <Alert
        type="warning"
        showIcon
        message="应用草稿将覆盖当前画布编辑中的 Workflow 配置"
        description="系统将自动使用该草稿中的工作流定义 (Workflow DSL) 与步骤逻辑替换画布中的现有元素。此操作不可撤销。"
        style={{ marginBottom: 16 }}
      />

      <div style={{ background: 'var(--bg-secondary)', padding: 12, borderRadius: 8 }}>
        <Text strong style={{ display: 'block', marginBottom: 8 }}>
          即将在画布应用的草稿信息:
        </Text>
        <Space direction="vertical" size={4} style={{ width: '100%', fontSize: 13 }}>
          <Text>工作流名称: {currentDraft.name}</Text>
          <Text>Task Queue: {currentDraft.taskQueue || 'SKILL_TASK_QUEUE'}</Text>
          <Text>包含步骤: {(currentDraft.workflowDsl.steps || []).length} 个</Text>
        </Space>
      </div>
    </Modal>
  );
};
