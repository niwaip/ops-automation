import React, { useEffect, useState } from 'react';
import { OfficeAppType, useAppStore } from './store';

type ConnectionStatus = 'checking' | 'connected' | 'disconnected' | 'error';

interface TaskpaneShellProps {
  officeType: OfficeAppType;
  officeLabel: string;
  templateLabel: string;
  helpContent: React.ReactNode;
  children: React.ReactNode;
}

export const TaskpaneShell: React.FC<TaskpaneShellProps> = ({
  officeType,
  officeLabel,
  templateLabel,
  helpContent,
  children,
}) => {
  const { setOfficeType, apiBaseUrl, addDebugLog } = useAppStore();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('checking');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    setOfficeType(officeType);
    addDebugLog('info', `Office 类型检测: ${officeType}`);
  }, [addDebugLog, officeType, setOfficeType]);

  useEffect(() => {
    void checkBackendConnection();
  }, [apiBaseUrl]);

  const checkBackendConnection = async () => {
    setConnectionStatus('checking');
    setConnectionError(null);
    addDebugLog('info', '检测后端连接', `URL: ${apiBaseUrl}/health`);

    try {
      const response = await fetch(`${apiBaseUrl}/health`, {
        method: 'GET',
        mode: 'cors',
      });

      if (response.ok) {
        const data = await response.json();
        setConnectionStatus('connected');
        addDebugLog('info', '后端连接成功', JSON.stringify(data));
        return;
      }

      setConnectionStatus('disconnected');
      setConnectionError(`HTTP ${response.status}: ${response.statusText}`);
      addDebugLog('warn', '后端响应异常', `状态码: ${response.status}`);
    } catch (error: any) {
      setConnectionStatus('error');
      setConnectionError(error.message);
      addDebugLog('error', '后端连接失败', error.message);

      if (apiBaseUrl.startsWith('https://') && error.message.includes('certificate')) {
        addDebugLog('warn', '可能是 SSL 证书问题', '请确保 CA 证书已安装到系统');
      }
    }
  };

  const renderConnectionStatus = () => {
    switch (connectionStatus) {
      case 'checking':
        return <span className="checking">⏳ 检测中...</span>;
      case 'connected':
        return <span className="connected">✅ 已连接</span>;
      case 'disconnected':
        return (
          <span className="disconnected">
            ❌ 未连接
            <button onClick={() => void checkBackendConnection()}>重试</button>
          </span>
        );
      case 'error':
        return (
          <span className="disconnected error">
            ❌ 连接错误
            <button onClick={() => void checkBackendConnection()}>重试</button>
          </span>
        );
    }
  };

  return (
    <div className="app-container">
      <header className="status-bar">
        <div className="office-badge">
          <span className="icon">📄</span>
          <span className="label">{officeLabel}</span>
        </div>

        <div className="connection-status">
          {renderConnectionStatus()}
          {connectionError && <div className="connection-error-tooltip">{connectionError}</div>}
        </div>
      </header>

      <div className="host-template-tabs">
        <button
          className="host-template-tab active"
          type="button"
          disabled
        >
          {templateLabel}
        </button>
      </div>

      {children}

      <footer className="quick-actions">
        <div className="syntax-help">
          <button className="help-btn" onClick={() => setShowHelp(true)}>语法帮助</button>
        </div>
        <div className="version">v1.0.0</div>
      </footer>

      {showHelp && (
        <div className="help-modal-overlay" onClick={() => setShowHelp(false)}>
          <div className="help-modal" onClick={(event) => event.stopPropagation()}>
            <div className="help-modal-header">
              <h3>帮助</h3>
              <button className="help-modal-close" onClick={() => setShowHelp(false)}>关闭</button>
            </div>
            <div className="help-modal-content">{helpContent}</div>
          </div>
        </div>
      )}
    </div>
  );
};
