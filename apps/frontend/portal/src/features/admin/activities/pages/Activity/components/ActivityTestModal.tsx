import React, { useState } from 'react';
import { Modal, Form, Input, Button, Alert, Typography } from 'antd';
import type { ActivityDTO } from '@/api/activity';

const { Text } = Typography;
const { TextArea } = Input;

export interface ActivityTestModalProps {
  visible: boolean;
  onCancel: () => void;
  activity: ActivityDTO | null;
}

export const ActivityTestModal: React.FC<ActivityTestModalProps> = ({
  visible,
  onCancel,
  activity,
}) => {
  const [paramsJson, setParamsJson] = useState('{\n  "testKey": "testValue"\n}');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!activity) return null;

  const handleTestRun = () => {
    setLoading(true);
    setTestResult(null);
    window.setTimeout(() => {
      setLoading(false);
      setTestResult(JSON.stringify({ status: 'success', output: 'Activity 执行完成 (已完成模拟沙箱调用)' }, null, 2));
    }, 800);
  };

  return (
    <Modal
      open={visible}
      title={`测试 Activity: ${activity.name}`}
      onCancel={onCancel}
      footer={[
        <Button key="close" onClick={onCancel}>
          关闭
        </Button>,
        <Button key="run" type="primary" loading={loading} onClick={handleTestRun}>
          运行测试
        </Button>,
      ]}
      width={640}
    >
      <div style={{ marginBottom: 16 }}>
        <Text type="secondary">配置入参 JSON 并直接在调试环境中触发该 Activity。</Text>
      </div>

      <Form layout="vertical">
        <Form.Item label="测试入参 (JSON)">
          <TextArea
            value={paramsJson}
            onChange={(e) => setParamsJson(e.target.value)}
            autoSize={{ minRows: 4, maxRows: 8 }}
            style={{ fontFamily: 'monospace', fontSize: 13 }}
          />
        </Form.Item>
      </Form>

      {testResult && (
        <Alert
          type="success"
          message="执行成功"
          description={
            <pre style={{ margin: 0, fontSize: 12, maxHeight: 200, overflow: 'auto' }}>
              {testResult}
            </pre>
          }
          style={{ marginTop: 16 }}
        />
      )}
    </Modal>
  );
};
