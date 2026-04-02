import React, { useState } from 'react';
import { Card, Button, Input, Space, Tag, message, Tooltip } from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  StopOutlined,
  LinkOutlined,
  ApiOutlined,
  DisconnectOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { RecorderStatus } from '../../services/recorder.service';

interface RecorderControlsProps {
  status: RecorderStatus;
  isConnected: boolean;
  onStart: (url: string) => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

const RecorderControls: React.FC<RecorderControlsProps> = ({
  status,
  isConnected,
  onStart,
  onStop,
  onPause,
  onResume,
  onConnect,
  onDisconnect,
}) => {
  const { t } = useTranslation(['common', 'recorder']);
  const [url, setUrl] = useState('');

  const statusColors: Record<RecorderStatus, string> = {
    idle: 'default',
    connecting: 'processing',
    recording: 'success',
    paused: 'warning',
    stopped: 'default',
    error: 'error',
  };

  const handleStart = () => {
    if (!url) {
      message.warning(t('recorder:enterUrl'));
      return;
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      message.warning(t('recorder:invalidUrl'));
      return;
    }
    onStart(url);
  };

  const handleConnect = async () => {
    try {
      await onConnect();
      message.success(t('recorder:connected'));
    } catch {
      message.error(t('recorder:connectionFailed'));
    }
  };

  const isRecording = status === 'recording';
  const isPaused = status === 'paused';
  const isIdle = status === 'idle';
  const isStopped = status === 'stopped';
  const isError = status === 'error';

  return (
    <Card title={t('recorder:controls')}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {/* Connection Status */}
        <Space>
          <Tag color={isConnected ? 'success' : 'error'}>
            {isConnected ? t('recorder:connected') : t('recorder:disconnected')}
          </Tag>
          <Tag color={statusColors[status]}>{t(`recorder:status.${status}`)}</Tag>
        </Space>

        {/* Connection Controls */}
        <Space>
          {!isConnected ? (
            <Button
              type="primary"
              icon={<ApiOutlined />}
              onClick={handleConnect}
              loading={status === 'connecting'}
            >
              {t('recorder:connect')}
            </Button>
          ) : (
            <Button icon={<DisconnectOutlined />} onClick={onDisconnect} danger>
              {t('recorder:disconnect')}
            </Button>
          )}
        </Space>

        {/* URL Input */}
        <Input
          placeholder={t('recorder:urlPlaceholder')}
          prefix={<LinkOutlined />}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={!isConnected || isRecording}
          onPressEnter={handleStart}
          size="large"
        />

        {/* Recording Controls */}
        <Space wrap>
          <Tooltip title={!isConnected || !isIdle && !isStopped && !isError ? t('recorder:connectFirst') : ''}>
            <Button
              type="primary"
              size="large"
              icon={<PlayCircleOutlined />}
              onClick={handleStart}
              disabled={!isConnected || isRecording || isPaused}
            >
              {t('recorder:start')}
            </Button>
          </Tooltip>

          {isRecording && (
            <Button
              size="large"
              icon={<PauseCircleOutlined />}
              onClick={onPause}
            >
              {t('recorder:pause')}
            </Button>
          )}

          {isPaused && (
            <Button
              type="primary"
              size="large"
              icon={<PlayCircleOutlined />}
              onClick={onResume}
            >
              {t('recorder:resume')}
            </Button>
          )}

          {(isRecording || isPaused) && (
            <Button
              size="large"
              danger
              icon={<StopOutlined />}
              onClick={onStop}
            >
              {t('recorder:stop')}
            </Button>
          )}
        </Space>

        </Space>
    </Card>
  );
};

export default RecorderControls;