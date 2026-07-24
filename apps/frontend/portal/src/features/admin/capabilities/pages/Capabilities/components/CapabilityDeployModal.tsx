import React from 'react';
import { Modal, Form, Select, Input, Button } from 'antd';
import { DEPLOY_ENV_OPTIONS, type DeploymentEnvironment } from '../utils/capabilitiesHelpers';

export interface CapabilityDeployModalProps {
  visible: boolean;
  onCancel: () => void;
  onDeploy: (params: {
    environment: DeploymentEnvironment;
    strategy: 'hot_reload' | 'rolling_restart' | 'full_restart';
    configOverrides?: Record<string, unknown>;
  }) => void;
  loading: boolean;
}

export const CapabilityDeployModal: React.FC<CapabilityDeployModalProps> = ({
  visible,
  onCancel,
  onDeploy,
  loading,
}) => {
  const [form] = Form.useForm();

  const handleFinish = (values: any) => {
    let configOverrides: Record<string, unknown> | undefined;
    if (values.overridesDraft && values.overridesDraft.trim()) {
      try {
        configOverrides = JSON.parse(values.overridesDraft);
      } catch {
        // error handling handled at parent level if needed
      }
    }
    onDeploy({
      environment: values.environment,
      strategy: values.strategy,
      configOverrides,
    });
  };

  return (
    <Modal
      open={visible}
      title="部署 Capability Release"
      onCancel={onCancel}
      footer={null}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          environment: 'staging',
          strategy: 'rolling_restart',
          overridesDraft: '{}',
        }}
        onFinish={handleFinish}
      >
        <Form.Item label="目标部署环境" name="environment" rules={[{ required: true }]}>
          <Select options={DEPLOY_ENV_OPTIONS} />
        </Form.Item>
        <Form.Item label="部署策略" name="strategy" rules={[{ required: true }]}>
          <Select
            options={[
              { label: '滚动重启 (rolling_restart)', value: 'rolling_restart' },
              { label: '热重载 (hot_reload)', value: 'hot_reload' },
              { label: '完全重启 (full_restart)', value: 'full_restart' },
            ]}
          />
        </Form.Item>
        <Form.Item label="配置重写 JSON (可选)" name="overridesDraft">
          <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} font-family="monospace" />
        </Form.Item>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" htmlType="submit" loading={loading}>
            确认部署
          </Button>
        </div>
      </Form>
    </Modal>
  );
};
