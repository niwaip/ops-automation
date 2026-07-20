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
  extraActions?: React.ReactNode;
}

/** 操作按钮组：恢复 + 取消 + 外部 extraActions。 */
export function InlineRecoveryActions({
  onApplyResume,
  onCancel,
  isApplyLoading,
  isCancelLoading,
  extraActions,
}: InlineRecoveryActionsProps) {
  return (
    <ExecutionDetailActionBar>
      <Space wrap size={[8, 8]}>
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          onClick={onApplyResume}
          loading={isApplyLoading}
        >
          {RECOVERY_COPY.applyAndResume}
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
