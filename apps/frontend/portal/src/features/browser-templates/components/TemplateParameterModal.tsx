import React from 'react';
import { Form, Modal } from 'antd';
import type { FormInstance } from 'antd/es/form';
import TemplateParamFormItems from '@/features/browser-templates/components/TemplateParamFormItems';
import type { ParamProperty } from '@/features/browser-templates/lib/templateDetail';

interface TemplateParameterModalProps {
  title: string;
  description: string;
  open: boolean;
  onOk: () => void;
  onCancel: () => void;
  confirmLoading: boolean;
  okText: string;
  cancelText: string;
  form: FormInstance;
  paramProperties: Record<string, ParamProperty>;
  requiredParams: string[];
  fallbackPlaceholder: string;
}

const TemplateParameterModal: React.FC<TemplateParameterModalProps> = ({
  title,
  description,
  open,
  onOk,
  onCancel,
  confirmLoading,
  okText,
  cancelText,
  form,
  paramProperties,
  requiredParams,
  fallbackPlaceholder,
}) => (
  <Modal
    title={title}
    open={open}
    onOk={onOk}
    onCancel={onCancel}
    confirmLoading={confirmLoading}
    okText={okText}
    cancelText={cancelText}
  >
    <p style={{ marginBottom: 16 }}>{description}</p>
    <Form form={form} layout="vertical">
      <TemplateParamFormItems
        paramProperties={paramProperties}
        requiredParams={requiredParams}
        fallbackPlaceholder={fallbackPlaceholder}
      />
    </Form>
  </Modal>
);

export default TemplateParameterModal;
