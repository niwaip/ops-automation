import React from 'react';
import { Form, Input, Modal, Select } from 'antd';
import type { SemanticRuleSet } from '@/api/browser-semantics';

interface SemanticRuleSetRollbackModalProps {
  open: boolean;
  loading?: boolean;
  currentRuleSet?: SemanticRuleSet | null;
  candidates: SemanticRuleSet[];
  onCancel: () => void;
  onSubmit: (values: { target_rule_set_id: string; reason: string }) => void | Promise<void>;
}

const SemanticRuleSetRollbackModal: React.FC<SemanticRuleSetRollbackModalProps> = ({
  open,
  loading,
  currentRuleSet,
  candidates,
  onCancel,
  onSubmit,
}) => {
  const [form] = Form.useForm<{ target_rule_set_id: string; reason: string }>();

  const handleSubmit = async () => {
    const values = await form.validateFields();
    await onSubmit(values);
  };

  return (
    <Modal
      title="回滚规则集"
      open={open}
      onCancel={onCancel}
      onOk={handleSubmit}
      confirmLoading={loading}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          reason: `从 ${currentRuleSet?.version || '-'} 回滚`,
        }}
      >
        <Form.Item label="当前规则集">
          <Input
            value={
              currentRuleSet
                ? `${currentRuleSet.key} / ${currentRuleSet.version} / ${currentRuleSet.status}`
                : ''
            }
            disabled
          />
        </Form.Item>
        <Form.Item
          label="回滚目标"
          name="target_rule_set_id"
          rules={[{ required: true, message: '请选择回滚目标规则集' }]}
        >
          <Select
            placeholder="选择同 key 的其他规则集"
            options={candidates.map((candidate) => ({
              value: candidate.id,
              label: `${candidate.version} / ${candidate.status} / ${candidate.name}`,
            }))}
          />
        </Form.Item>
        <Form.Item
          label="回滚原因"
          name="reason"
          rules={[{ required: true, message: '请输入回滚原因' }]}
        >
          <Input.TextArea rows={4} placeholder="说明为什么要回滚到该版本" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default SemanticRuleSetRollbackModal;
