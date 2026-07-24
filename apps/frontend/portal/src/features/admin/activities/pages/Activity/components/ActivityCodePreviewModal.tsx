import React from 'react';
import { Modal, Button, Space, Card, Typography, message } from 'antd';
import { CopyOutlined, SaveOutlined, RobotOutlined } from '@ant-design/icons';

const { Text } = Typography;

export interface ActivityCodePreviewModalProps {
  visible: boolean;
  onCancel: () => void;
  code: string;
  onSaveCode?: (code: string) => void;
  isGenerating?: boolean;
  isSaving?: boolean;
}

export const ActivityCodePreviewModal: React.FC<ActivityCodePreviewModalProps> = ({
  visible,
  onCancel,
  code,
  onSaveCode,
  isGenerating = false,
  isSaving = false,
}) => {
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    message.success('Python 代码已复制到剪贴板');
  };

  return (
    <Modal
      title={
        <Space>
          <RobotOutlined style={{ color: 'var(--primary-color)' }} />
          <span>AI 生成的 Python Activity 代码</span>
        </Space>
      }
      open={visible}
      onCancel={onCancel}
      width={800}
      footer={[
        <Button key="copy" icon={<CopyOutlined />} onClick={handleCopy} disabled={!code}>
          复制代码
        </Button>,
        <Button
          key="save"
          type="primary"
          icon={<SaveOutlined />}
          onClick={() => onSaveCode?.(code)}
          loading={isSaving}
          disabled={!code}
        >
          保存/缓存代码
        </Button>,
      ]}
    >
      <Card
        size="small"
        style={{
          background: 'var(--bg-secondary)',
          borderRadius: 8,
          border: '1px solid var(--border-color)',
        }}
      >
        {isGenerating ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
            <RobotOutlined spin style={{ fontSize: 24, marginBottom: 12 }} />
            <div>正在分析配置并生成 Python 代码，请稍候...</div>
          </div>
        ) : (
          <pre
            style={{
              color: 'var(--text-primary)',
              padding: 12,
              margin: 0,
              fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
              fontSize: 12,
              lineHeight: 1.5,
              overflow: 'auto',
              maxHeight: 500,
            }}
          >
            {code || '# 暂无生成的代码，请点击【生成代码】按钮'}
          </pre>
        )}
      </Card>
      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
        提示：该代码基于 Activity 的 Handler 配置与参数定义自动编译而成，可直接投入 Temporal Worker 运行。
      </Text>
    </Modal>
  );
};
