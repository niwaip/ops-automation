import { Alert, Card, Space } from 'antd';
import styles from '../pages/ChatPage.module.css';

interface ChatStatusAlertsProps {
  embedded: boolean;
  modelsError: unknown;
  sessionsError: unknown;
  historyError: unknown;
  pageError: string | null;
}

const toErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

export function ChatStatusAlerts({
  embedded,
  modelsError,
  sessionsError,
  historyError,
  pageError,
}: ChatStatusAlertsProps) {
  const alerts = [
    modelsError ? (
      <Alert
        key="models"
        type="error"
        showIcon
        message={toErrorMessage(modelsError, '模型列表加载失败')}
      />
    ) : null,
    sessionsError ? (
      <Alert
        key="sessions"
        type="error"
        showIcon
        message={toErrorMessage(sessionsError, '会话列表加载失败')}
      />
    ) : null,
    historyError ? (
      <Alert
        key="history"
        type="warning"
        showIcon
        message={toErrorMessage(historyError, '历史消息加载失败')}
      />
    ) : null,
    pageError ? <Alert key="page" type="error" showIcon message={pageError} /> : null,
  ].filter(Boolean);

  if (alerts.length === 0) {
    return null;
  }

  if (embedded) {
    return (
      <Card className={`${styles['user-chat-status-panel']} ${styles.embedded}`}>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {alerts}
        </Space>
      </Card>
    );
  }

  return <div className={styles['user-chat-alert-stack']}>{alerts}</div>;
}
