import React from 'react';
import { Alert, Input, Modal } from 'antd';
import type { CarboneTemplate } from '@/api/carbone';
import { isDraftDocumentTemplate } from '../lib/carboneTemplateList';

export interface CarboneTemplateRenameModalProps {
  open: boolean;
  selectedTemplate: CarboneTemplate | null;
  newName: string;
  onNewNameChange: (val: string) => void;
  onOk: () => void;
  onCancel: () => void;
}

export const CarboneTemplateRenameModal: React.FC<CarboneTemplateRenameModalProps> = ({
  open,
  selectedTemplate,
  newName,
  onNewNameChange,
  onOk,
  onCancel,
}) => {
  const isDraftModal = Boolean(selectedTemplate && isDraftDocumentTemplate(selectedTemplate));

  return (
    <Modal
      title={isDraftModal ? '转为正式模板 / 重命名' : '重命名模板'}
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      okText="确认保存"
      cancelText="取消"
    >
      {isDraftModal && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="输入正式模板名称后保存，系统将去除 draft-* 前缀并自动转为正式文档模板，纳入备份资产。"
        />
      )}
      <Input
        value={newName}
        onChange={(event) => onNewNameChange(event.target.value)}
        placeholder={isDraftModal ? '请输入正式模板名称（如：采购合同、保密协议）' : '请输入新名称'}
        autoFocus
      />
    </Modal>
  );
};
