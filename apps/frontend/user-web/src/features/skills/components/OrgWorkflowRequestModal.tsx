import React, { useState } from 'react';
import { Modal, Input, Typography, Space, Alert, message } from 'antd';
import { KeyOutlined } from '@ant-design/icons';
import { useMutation } from 'react-query';
import {
  workbenchCoordinationApi,
  type WorkflowTemplateDefinition,
} from '../../../api/workbenchCoordination';

interface OrgWorkflowRequestModalProps {
  visible: boolean;
  workflow: WorkflowTemplateDefinition | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const OrgWorkflowRequestModal: React.FC<OrgWorkflowRequestModalProps> = ({
  visible,
  workflow,
  onClose,
  onSuccess,
}) => {
  const [reason, setReason] = useState('');

  const requestMutation = useMutation(
    () => {
      if (!workflow) throw new Error('No workflow selected');
      return workbenchCoordinationApi.requestAccess(workflow.id, reason);
    },
    {
      onSuccess: () => {
        message.success('开通申请已提交，等待管理员审核！');
        setReason('');
        onSuccess();
        onClose();
      },
      onError: (err: any) => {
        message.error(`提交申请失败: ${err.message || '未知错误'}`);
      },
    }
  );

  return (
    <Modal
      title={
        <Space>
          <KeyOutlined style={{ color: '#1677ff' }} />
          <span>申请开通企业工作流权限 - {workflow?.name}</span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      onOk={() => requestMutation.mutate()}
      confirmLoading={requestMutation.isLoading}
      okText="提交申请"
      cancelText="取消"
      width={480}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 6 }}>
        <Alert
          message="权限开通须知"
          description={`当前企业工作流受角色访问控制。提交申请后将由管理员进行核准，审核通过后您即可在协同工作台中直接发起提单。`}
          type="info"
          showIcon
        />

        <div>
          <Typography.Text strong>申请理由 / 业务说明：</Typography.Text>
          <Input.TextArea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="例如：因负责部门差旅招待报销与考勤统筹，需开通此流程发起权限"
            style={{ marginTop: 8 }}
          />
        </div>
      </div>
    </Modal>
  );
};
