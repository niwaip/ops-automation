import React from 'react';
import { Card, Form, Input, Button, Typography } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;
const { TextArea } = Input;

export interface AiDraftNewSessionFormProps {
  description: string;
  setDescription: (val: string) => void;
  referenceUrl: string;
  setReferenceUrl: (val: string) => void;
  onSubmit: () => void;
  loading: boolean;
}

export const AiDraftNewSessionForm: React.FC<AiDraftNewSessionFormProps> = ({
  description,
  setDescription,
  referenceUrl,
  setReferenceUrl,
  onSubmit,
  loading,
}) => {
  return (
    <div style={{ flex: 1, padding: 40, maxWidth: 640, margin: '0 auto', width: '100%', overflowY: 'auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <ThunderboltOutlined style={{ fontSize: 44, color: 'var(--primary-color)', marginBottom: 12 }} />
        <Title level={3} style={{ margin: 0 }}>
          新建 AI 工作流草稿
        </Title>
        <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
          描述所需业务需求或输入 API 参考链接，AI 将自动分析并生成完整的 Workflow DSL 定义。
        </Text>
      </div>

      <Card style={{ borderRadius: 12, boxShadow: 'var(--shadow-md)' }}>
        <Form layout="vertical" onFinish={onSubmit}>
          <Form.Item label="工作流需求说明" required>
            <TextArea
              rows={5}
              placeholder="描述具体业务场景，如: 监控服务指标，若 CPU > 90% 则触发巡检并向钉钉群发送告警..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Form.Item>

          <Form.Item label="参考 API 或网页 URL (可选)">
            <Input
              placeholder="https://api.example.com/docs"
              value={referenceUrl}
              onChange={(e) => setReferenceUrl(e.target.value)}
            />
          </Form.Item>

          <Button
            type="primary"
            size="large"
            block
            icon={<ThunderboltOutlined />}
            htmlType="submit"
            loading={loading}
          >
            生成草稿
          </Button>
        </Form>
      </Card>
    </div>
  );
};
