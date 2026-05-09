/**
 * Office Addin - 主应用组件
 * 整合 AI 识别流程为线性流程
 * 包含调试日志面板
 */

import React, { useState, useEffect } from 'react';
import { useAppStore } from './store';
import { AIIdentifyPanel } from '../components/AIIdentifyPanel';
import { DebugLogPanel } from '../components/DebugLogPanel';
import { OfficeHelper } from '../utils/office-api';

export const App: React.FC = () => {
  const { officeType, setOfficeType, apiBaseUrl, addDebugLog } = useAppStore();
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'disconnected' | 'error'>('checking');
  const [connectionError, setConnectionError] = useState<string | null>(null);

  /**
   * 初始化检测 Office 类型
   */
  useEffect(() => {
    const detectedType = OfficeHelper.getOfficeType();
    setOfficeType(detectedType);
    addDebugLog('info', `Office 类型检测: ${detectedType}`);

    // 检测后端连接
    checkBackendConnection();
  }, []);

  /**
   * 检测后端连接状态（支持 HTTPS）
   */
  const checkBackendConnection = async () => {
    setConnectionStatus('checking');
    setConnectionError(null);
    addDebugLog('info', `检测后端连接`, `URL: ${apiBaseUrl}/health`);

    try {
      // 注意：HTTPS 请求可能需要处理证书问题
      const response = await fetch(`${apiBaseUrl}/health`, {
        method: 'GET',
        mode: 'cors',
      });

      if (response.ok) {
        const data = await response.json();
        setConnectionStatus('connected');
        addDebugLog('info', `后端连接成功`, JSON.stringify(data));
      } else {
        setConnectionStatus('disconnected');
        setConnectionError(`HTTP ${response.status}: ${response.statusText}`);
        addDebugLog('warn', `后端响应异常`, `状态码: ${response.status}`);
      }
    } catch (error: any) {
      setConnectionStatus('error');
      setConnectionError(error.message);
      addDebugLog('error', `后端连接失败`, error.message);

      // 检查是否是 HTTPS 问题
      if (apiBaseUrl.startsWith('https://') && error.message.includes('certificate')) {
        addDebugLog('warn', `可能是 SSL 证书问题`, `请确保 CA 证书已安装到系统`);
      }
    }
  };

  /**
   * Office 类型显示
   */
  const officeTypeLabel = () => {
    switch (officeType) {
      case 'word':
        return 'Word';
      case 'excel':
        return 'Excel';
      case 'ppt':
        return 'PowerPoint';
    }
  };

  /**
   * 连接状态显示
   */
  const connectionStatusDisplay = () => {
    switch (connectionStatus) {
      case 'checking':
        return <span className="checking">⏳ 检测中...</span>;
      case 'connected':
        return <span className="connected">✅ 已连接</span>;
      case 'disconnected':
        return (
          <span className="disconnected">
            ❌ 未连接
            <button onClick={checkBackendConnection}>重试</button>
          </span>
        );
      case 'error':
        return (
          <span className="disconnected error">
            ❌ 连接错误
            <button onClick={checkBackendConnection}>重试</button>
          </span>
        );
    }
  };

  return (
    <div className="app-container">
      {/* 顶部状态栏 */}
      <header className="status-bar">
        <div className="office-badge">
          <span className="icon">📄</span>
          <span className="label">{officeTypeLabel()}</span>
        </div>

        <div className="connection-status">
          {connectionStatusDisplay()}
          {connectionError && (
            <div className="connection-error-tooltip">
              {connectionError}
            </div>
          )}
        </div>
      </header>

      {/* 主内容区 - 直接显示AI识别面板（线性流程） */}
      <main className="content-area">
        <AIIdentifyPanel />
        {/* 调试日志面板 */}
        <DebugLogPanel />
      </main>

      {/* 底部快捷操作 */}
      <footer className="quick-actions">
        <div className="syntax-help">
          <button className="help-btn">语法帮助</button>
        </div>
        <div className="version">v1.0.0</div>
      </footer>
    </div>
  );
};

export default App;