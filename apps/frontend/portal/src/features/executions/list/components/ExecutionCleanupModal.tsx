import React, { useState } from 'react';
import { Modal, DatePicker, Typography, Alert, Space } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';

import dayjs, { Dayjs } from 'dayjs';

const { Text } = Typography;

interface ExecutionCleanupModalProps {
  open: boolean;
  loading: boolean;
  onCancel: () => void;
  onConfirm: (beforeDate: string) => void;
}

export const ExecutionCleanupModal: React.FC<ExecutionCleanupModalProps> = ({
  open,
  loading,
  onCancel,
  onConfirm,
}) => {
  const [clearDate, setClearDate] = useState<Dayjs>(() => dayjs().subtract(2, 'day'));

  const handleOk = () => {
    onConfirm(clearDate.format('YYYY-MM-DD'));
  };

  return (
    <Modal
      title={
        <Space>
          <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
          <span>清理历史执行记录</span>
        </Space>
      }
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      confirmLoading={loading}
      okText="确认清理"
      okButtonProps={{ danger: true }}
      destroyOnClose
      width={460}
    >
      <div style={{ margin: '16px 0' }}>
        <Alert
          type="warning"
          showIcon
          message="高危操作提示"
          description="将彻底删除所选基准日期之前创建的所有执行记录与运行快照，操作后数据无法恢复。"
          style={{ marginBottom: 16 }}
        />

        <div style={{ marginBottom: 12 }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            选择清理基准日期：
          </Text>
          <DatePicker
            value={clearDate}
            onChange={(date) => setClearDate(date || dayjs().subtract(2, 'day'))}
            allowClear={false}
            style={{ width: '100%' }}
            disabledDate={(current) => current && current > dayjs().endOf('day')}
          />
          <Text type="secondary" style={{ fontSize: 12, marginTop: 6, display: 'block' }}>
            系统将清理【{clearDate.format('YYYY-MM-DD')}】之前产生的所有工单记录。
          </Text>
        </div>
      </div>
    </Modal>
  );
};
