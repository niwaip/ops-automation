import React from 'react';
import { Card, Typography, Button, Space, message } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useMutation } from 'react-query';
import { sessionApi } from '../api/session';

const { Title, Paragraph } = Typography;

const RecorderPage: React.FC = () => {
  const { t } = useTranslation(['common', 'session']);

  const createSessionMutation = useMutation(sessionApi.create, {
    onSuccess: (session) => {
      message.success(t('common:success'));
      // Navigate to session detail or open noVNC
      if (session.noVncUrl) {
        window.open(session.noVncUrl, '_blank');
      }
    },
    onError: () => {
      message.error(t('common:error'));
    },
  });

  const handleStartRecording = () => {
    createSessionMutation.mutate({
      name: `Recording ${new Date().toISOString()}`,
      type: 'record',
    });
  };

  return (
    <div>
      <Title level={4}>{t('recorder')}</Title>

      <Card style={{ marginTop: 16 }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Title level={5}>Start New Recording Session</Title>
          <Paragraph>
            Click the button below to start a new browser recording session. This will open a
            browser window where you can interact with the page. All your actions will be recorded
            and can be converted into a template for future automation.
          </Paragraph>

          <Space>
            <Button
              type="primary"
              size="large"
              icon={<PlayCircleOutlined />}
              onClick={handleStartRecording}
              loading={createSessionMutation.isLoading}
            >
              {t('session:startSession')}
            </Button>
          </Space>

          <Title level={5} style={{ marginTop: 24 }}>
            Instructions
          </Title>
          <Paragraph>
            <ul>
              <li>Start the recording session by clicking the button above</li>
              <li>A browser window will open - interact with the page normally</li>
              <li>Click the "Stop" button when you're done recording</li>
              <li>Review the recorded actions and save them as a template</li>
              <li>Templates can be used to automate the same workflow later</li>
            </ul>
          </Paragraph>
        </Space>
      </Card>

      <Card title="Recording Preview" style={{ marginTop: 16 }}>
        <div
          style={{
            height: 400,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#f5f5f5',
            borderRadius: 4,
          }}
        >
          <Paragraph style={{ textAlign: 'center', color: '#999' }}>
            Start a recording session to see the browser preview here.
            <br />
            The browser will be displayed via noVNC connection.
          </Paragraph>
        </div>
      </Card>
    </div>
  );
};

export default RecorderPage;