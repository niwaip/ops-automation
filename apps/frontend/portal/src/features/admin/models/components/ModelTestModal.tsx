import React, { useState, useEffect } from 'react';
import { Modal, Input, Button, Space, Typography, Tag, Alert } from 'antd';
import { ExperimentOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { AIModel } from '@/api/ai';

const { Text, Paragraph } = Typography;

interface ModelTestModalProps {
  open: boolean;
  model: AIModel | null;
  onCancel: () => void;
  onRunTest: (id: string, prompt: string) => Promise<{ success: boolean; response?: string; error?: string }>;
}

export const ModelTestModal: React.FC<ModelTestModalProps> = ({
  open,
  model,
  onCancel,
  onRunTest,
}) => {
  const [prompt, setPrompt] = useState('你好，请用一句话介绍你自己。');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success?: boolean;
    response?: string;
    error?: string;
    latencyMs?: number;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setTestResult(null);
      setPrompt('你好，请用一句话介绍你自己。');
    }
  }, [open]);

  const handleTest = async () => {
    if (!model || !prompt.trim()) return;
    setTesting(true);
    setTestResult(null);
    const start = Date.now();
    try {
      const res = await onRunTest(model.id, prompt.trim());
      setTestResult({
        ...res,
        latencyMs: Date.now() - start,
      });
    } catch (err: unknown) {
      setTestResult({
        success: false,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - start,
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Modal
      title={
        <Space align="center" size={8}>
          <ExperimentOutlined style={{ color: '#6366f1' }} />
          <span>测试模型可用性</span>
          {model && (
            <Tag color="blue" style={{ margin: 0 }}>
              {model.config?.display_name || model.name}
            </Tag>
          )}
        </Space>
      }
      open={open}
      onCancel={onCancel}
      width={600}
      footer={[
        <Button key="close" onClick={onCancel}>
          关闭
        </Button>,
        <Button
          key="test"
          type="primary"
          icon={<ExperimentOutlined />}
          loading={testing}
          onClick={handleTest}
        >
          发送测试请求
        </Button>,
      ]}
    >
      <div style={{ marginTop: 12 }}>
        <Text strong style={{ fontSize: 13, marginBottom: 6, display: 'block' }}>
          测试提示词 (Test Prompt)
        </Text>
        <Input.TextArea
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="输入发送给模型的测试文本..."
          style={{ borderRadius: 8, marginBottom: 16 }}
        />

        {testResult && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <Text strong style={{ fontSize: 13 }}>
                测试结果
              </Text>
              {testResult.success ? (
                <Tag color="success" icon={<CheckCircleOutlined />}>
                  测试成功 ({testResult.latencyMs}ms)
                </Tag>
              ) : (
                <Tag color="error" icon={<CloseCircleOutlined />}>
                  测试失败 ({testResult.latencyMs}ms)
                </Tag>
              )}
            </div>

            {testResult.success ? (
              <div
                style={{
                  background: 'var(--bg-secondary)',
                  borderRadius: 8,
                  padding: 12,
                  maxHeight: 200,
                  overflowY: 'auto',
                }}
              >
                <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 13 }}>
                  {testResult.response || '（无响应内容）'}
                </Paragraph>
              </div>
            ) : (
              <Alert
                type="error"
                showIcon
                message="模型调用异常"
                description={testResult.error || '未知错误'}
                style={{ borderRadius: 8 }}
              />
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
