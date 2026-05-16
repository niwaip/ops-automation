import React from 'react';
import { Button, Card, Space, Tag } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { replaceLocalhostWithCurrentHost } from '../../utils/publicUrl';

interface LiveSessionPreviewCardProps {
  novncUrl: string;
  title?: string;
  statusLabel?: string;
  height?: number;
}

export const LiveSessionPreviewCard: React.FC<LiveSessionPreviewCardProps> = ({
  novncUrl,
  title = '实时画面',
  statusLabel = '执行中',
  height = 600,
}) => {
  const resolvedUrl = replaceLocalhostWithCurrentHost(novncUrl) || novncUrl;

  return (
    <Card
      title={(
        <Space>
          <EyeOutlined />
          {title}
          <Tag color="processing">{statusLabel}</Tag>
        </Space>
      )}
      extra={(
        <Button
          type="link"
          onClick={() => window.open(resolvedUrl, '_blank', 'noopener,noreferrer')}
        >
          新窗口打开
        </Button>
      )}
    >
      <div
        style={{
          width: '100%',
          height,
          border: '1px solid #d9d9d9',
          borderRadius: 4,
          background: '#1e1e1e',
          overflow: 'hidden',
        }}
      >
        <iframe
          src={`${resolvedUrl}${resolvedUrl.includes('?') ? '&' : '?'}autoconnect=true&resize=scale`}
          style={{ width: '100%', height: '100%', border: 'none' }}
          title="Live Browser Session"
          allow="fullscreen"
        />
      </div>
    </Card>
  );
};

export default LiveSessionPreviewCard;
