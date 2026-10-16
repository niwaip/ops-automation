import React from 'react';
import { Button, Card, Segmented, Space, Tooltip, Typography } from 'antd';
import { DesktopOutlined } from '@ant-design/icons';
import { buildNovncAutoConnectUrl } from '@ops/user-core';

const { Text } = Typography;

interface RecorderBrowserPreviewCardProps {
  isDarkTheme: boolean;
  previewMode: 'idle' | 'shared' | 'session';
  previewUrl: string | null;
  openInNewTabLabel: string;
  browserPreviewLabel: string;
  startPreviewHint: string;
  noVncHint: string;
}

const RecorderBrowserPreviewCard: React.FC<RecorderBrowserPreviewCardProps> = ({
  isDarkTheme,
  previewMode,
  previewUrl,
  openInNewTabLabel,
  browserPreviewLabel,
  startPreviewHint,
  noVncHint,
}) => {
  const [resizeMode, setResizeMode] = React.useState<'scale' | 'off'>('scale');

  const connectUrl = React.useMemo(
    () => (previewUrl ? buildNovncAutoConnectUrl(previewUrl, { resize: resizeMode }) : ''),
    [previewUrl, resizeMode]
  );

  return (
  <Card
    title={
      <Space>
        <DesktopOutlined />
        <Text strong>{browserPreviewLabel}</Text>
      </Space>
    }
    style={{
      flex: 1,
      height: 'auto',
      borderRadius: 16,
      boxShadow: isDarkTheme ? '0 8px 24px rgba(0, 0, 0, 0.24)' : '0 4px 20px rgba(0, 0, 0, 0.08)',
      border: '1px solid var(--bg-secondary)',
      background: 'var(--bg-card)',
      display: 'flex',
      flexDirection: 'column',
    }}
    styles={{
      header: {
        minHeight: 34,
        padding: '0 8px',
      },
      body: {
        flex: 1,
        padding: 0,
        minHeight: 0,
      },
    }}
    extra={
      <Space size="small">
        <Segmented
          size="small"
          value={resizeMode}
          onChange={(val) => setResizeMode(val as 'scale' | 'off')}
          options={[
            {
              label: (
                <Tooltip title="完整缩放并适应卡片窗口（推荐在卡片中使用）">
                  <span>自适应</span>
                </Tooltip>
              ),
              value: 'scale',
            },
            {
              label: (
                <Tooltip title="1:1 点对点原画（文字最锐利，窗口不足时需滚动）">
                  <span>1:1清晰</span>
                </Tooltip>
              ),
              value: 'off',
            },
          ]}
          disabled={!previewUrl}
        />
        <Button
          type="link"
          size="small"
          onClick={() => {
            if (previewUrl) {
              const newTabUrl = buildNovncAutoConnectUrl(previewUrl, { resize: 'off' });
              window.open(newTabUrl, '_blank', 'noopener,noreferrer');
            }
          }}
          disabled={!previewUrl}
          style={{ color: '#6366f1' }}
        >
          {openInNewTabLabel}
        </Button>
      </Space>
    }
  >
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: resizeMode === 'off' ? 'flex-start' : 'center',
        justifyContent: resizeMode === 'off' ? 'flex-start' : 'center',
        background: isDarkTheme ? '#000000' : '#1a1a2e',
        overflow: resizeMode === 'off' ? 'auto' : 'hidden',
      }}
    >
      {connectUrl ? (
        <iframe
          key={connectUrl}
          src={connectUrl}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
          }}
          title="Browser Preview"
          allow="fullscreen"
        />
      ) : (
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          <DesktopOutlined
            style={{ fontSize: 48, marginBottom: 16, color: 'var(--text-secondary)' }}
          />
          <p style={{ color: 'var(--text-primary)', marginBottom: 8 }}>
            {previewMode === 'shared' ? '手动录制已连接共享浏览器' : startPreviewHint}
          </p>
          <p style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
            {previewMode === 'shared'
              ? 'AI 模式不会再回退显示共享 noVNC，拿到会话地址后才显示专属浏览器'
              : noVncHint}
          </p>
        </div>
      )}
    </div>
  </Card>
  );
};

export default RecorderBrowserPreviewCard;
