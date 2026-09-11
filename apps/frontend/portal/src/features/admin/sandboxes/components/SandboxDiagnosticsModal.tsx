import React from 'react';
import { Modal, Button, Space, Typography, Tag, message } from 'antd';
import { SyncOutlined, CopyOutlined, CheckOutlined, CodeOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface SandboxDiagnosticsModalProps {
  visible: boolean;
  onClose: () => void;
  targetUser: string;
  loading: boolean;
  output: string;
}

export const SandboxDiagnosticsModal: React.FC<SandboxDiagnosticsModalProps> = ({
  visible,
  onClose,
  targetUser,
  loading,
  output,
}) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    setCopied(true);
    message.success('诊断日志已复制到剪贴板');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      title={
        <Space size={8}>
          <CodeOutlined style={{ color: '#1677ff' }} />
          <Text strong>沙箱实时运行诊断与环境状态</Text>
          <Tag color="blue">{targetUser}</Tag>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={[
        <Button
          key="copy"
          icon={copied ? <CheckOutlined /> : <CopyOutlined />}
          onClick={handleCopy}
          disabled={loading || !output}
        >
          {copied ? '已复制' : '复制日志'}
        </Button>,
        <Button key="close" type="primary" onClick={onClose}>
          完成
        </Button>,
      ]}
      width={780}
    >
      {/* macOS Terminal Window Container */}
      <div
        style={{
          borderRadius: 10,
          overflow: 'hidden',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          background: '#0d1117',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
        }}
      >
        {/* Terminal Header Bar with traffic lights */}
        <div
          style={{
            height: 36,
            background: '#161b22',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 12px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
            <span
              style={{
                width: 11,
                height: 11,
                borderRadius: '50%',
                background: '#ff5f56',
                display: 'inline-block',
              }}
            />
            <span
              style={{
                width: 11,
                height: 11,
                borderRadius: '50%',
                background: '#ffbd2e',
                display: 'inline-block',
              }}
            />
            <span
              style={{
                width: 11,
                height: 11,
                borderRadius: '50%',
                background: '#27c93f',
                display: 'inline-block',
              }}
            />
          </div>

          <div
            style={{
              color: '#8b949e',
              fontSize: 12,
              fontFamily: 'SFMono-Regular, Consolas, Monaco, monospace',
            }}
          >
            ops-sandbox: user-{targetUser} $ dsh info
          </div>

          <div style={{ width: 45 }} />
        </div>

        {/* Terminal Output Body */}
        <div style={{ padding: 16, minHeight: 280 }}>
          {loading ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: 240,
                color: '#58a6ff',
              }}
            >
              <SyncOutlined spin style={{ fontSize: 26, marginBottom: 12 }} />
              <div style={{ fontSize: 13, color: '#8b949e' }}>
                正在向沙箱实例下发指令并获取运行现场...
              </div>
            </div>
          ) : (
            <pre
              style={{
                margin: 0,
                color: '#7ee787',
                fontFamily: 'SFMono-Regular, Consolas, Monaco, monospace',
                fontSize: 12.5,
                lineHeight: 1.6,
                maxHeight: 420,
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {output || '# 诊断完成，无输出内容'}
            </pre>
          )}
        </div>
      </div>
    </Modal>
  );
};
