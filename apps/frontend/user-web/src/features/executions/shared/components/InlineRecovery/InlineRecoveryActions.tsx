import React from 'react';
import { Button, Space } from 'antd';
import { PlayCircleOutlined, StopOutlined } from '@ant-design/icons';
import ExecutionDetailActionBar from '@/features/executions/detail/components/ExecutionDetailActionBar';
import { RECOVERY_COPY } from '../recoveryOptions';

interface InlineRecoveryActionsProps {
  onApplyResume: () => void;
  onCancel: () => void;
  isApplyLoading: boolean;
  isCancelLoading: boolean;
  actionButtonLabel?: string;
  actionButtonIcon?: React.ReactNode;
  extraActions?: React.ReactNode;
}

/** 操作按钮组：确认处置恢复 + 结束执行 (+ 可选外部扩展)。 */
export function InlineRecoveryActions({
  onApplyResume,
  onCancel,
  isApplyLoading,
  isCancelLoading,
  actionButtonLabel,
  actionButtonIcon,
  extraActions,
}: InlineRecoveryActionsProps) {
  return (
    <ExecutionDetailActionBar>
      <Space wrap size={[10, 8]}>
        <Button
          type="primary"
          icon={actionButtonIcon || <PlayCircleOutlined />}
          onClick={onApplyResume}
          loading={isApplyLoading}
        >
          {actionButtonLabel || RECOVERY_COPY.applyAndResume}
        </Button>
        {extraActions}
        <Button
          danger
          ghost
          icon={<StopOutlined />}
          onClick={onCancel}
          loading={isCancelLoading}
        >
          {RECOVERY_COPY.cancelExecution}
        </Button>
      </Space>
    </ExecutionDetailActionBar>
  );
}
