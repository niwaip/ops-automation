import React from 'react';
import { Button, Input, Space, Typography } from 'antd';
import {
  ApiOutlined,
  DisconnectOutlined,
  LinkOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

export interface ManualControlsProps {
  isConnected: boolean;
  recorderStatus: string;
  recordUrl: string;
  setRecordUrl: (url: string) => void;
  isRecording: boolean;
  isPaused: boolean;
  recordedScript?: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onStart: () => void;
  onPauseRecording?: () => void;
  onResumeRecording?: () => void;
  onStopRecording?: () => void;
  t: (key: string) => string;
}

export const ManualControls: React.FC<ManualControlsProps> = ({
  isConnected,
  recorderStatus,
  recordUrl,
  setRecordUrl,
  isRecording,
  isPaused,
  recordedScript,
  onConnect,
  onDisconnect,
  onStart,
  onPauseRecording,
  onResumeRecording,
  onStopRecording,
  t,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Connection Controls */}
      <Space>
        {!isConnected ? (
          <Button
            type="primary"
            icon={<ApiOutlined />}
            onClick={onConnect}
            loading={recorderStatus === 'connecting'}
          >
            {t('recorder:connect') || '连接'}
          </Button>
        ) : (
          <Button icon={<DisconnectOutlined />} onClick={onDisconnect} danger>
            {t('recorder:disconnect') || '断开'}
          </Button>
        )}
      </Space>

      {/* URL Input */}
      <Input
        placeholder={t('recorder:urlPlaceholder') || '输入网址开始录制'}
        prefix={<LinkOutlined />}
        value={recordUrl}
        onChange={(e) => setRecordUrl(e.target.value)}
        disabled={!isConnected || isRecording}
        onPressEnter={onStart}
        size="large"
      />

      {/* Recording Controls */}
      <Space wrap>
        <Button
          type="primary"
          size="large"
          icon={<PlayCircleOutlined />}
          onClick={onStart}
          disabled={!isConnected || isRecording || isPaused}
        >
          {t('recorder:start') || '开始录制'}
        </Button>

        {isRecording && (
          <Button size="large" icon={<PauseCircleOutlined />} onClick={onPauseRecording}>
            {t('recorder:pause') || '暂停'}
          </Button>
        )}

        {isPaused && (
          <Button
            type="primary"
            size="large"
            icon={<PlayCircleOutlined />}
            onClick={onResumeRecording}
          >
            {t('recorder:resume') || '继续'}
          </Button>
        )}

        {(isRecording || isPaused) && (
          <Button size="large" icon={<StopOutlined />} onClick={onStopRecording} danger>
            {t('recorder:stop') || '停止'}
          </Button>
        )}
      </Space>

      {/* Recorded Script Preview */}
      {recordedScript && (
        <div style={{ marginTop: 16 }}>
          <Text strong style={{ fontSize: 13 }}>
            {t('recorder:script') || '录制脚本'}：
          </Text>
          <pre
            style={{
              background: 'var(--bg-secondary)',
              padding: 12,
              borderRadius: 8,
              maxHeight: 200,
              overflow: 'auto',
              fontSize: 11,
              marginTop: 8,
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
            }}
          >
            {recordedScript}
          </pre>
        </div>
      )}
    </div>
  );
};
