/**
 * Office Addin - 主应用组件
 * 整合 AI 识别、模板配置、手动选择功能
 */

import React, { useState, useEffect } from 'react';
import { useAppStore, OfficeAppType } from './store';
import { AIIdentifyPanel } from '../components/AIIdentifyPanel';
import { TemplateConfigPanel } from '../components/TemplateConfigPanel';
import { ManualSelector } from '../components/ManualSelector';
import { OfficeHelper } from '../utils/office-api';

type TabId = 'ai' | 'manual' | 'config';

export const App: React.FC = () => {
  const { officeType, setOfficeType, apiBaseUrl, setApiBaseUrl } = useAppStore();
  const [activeTab, setActiveTab] = useState<TabId>('ai');
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');

  /**
   * 初始化检测 Office 类型
   */
  useEffect(() => {
    const detectedType = OfficeHelper.getOfficeType();
    setOfficeType(detectedType);

    // 检测后端连接
    checkBackendConnection();
  }, []);

  /**
   * 检测后端连接状态
   */
  const checkBackendConnection = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/health`);
      if (response.ok) {
        setConnectionStatus('connected');
      } else {
        setConnectionStatus('disconnected');
      }
    } catch {
      setConnectionStatus('disconnected');
    }
  };

  /**
   * Tab 配置
   */
  const tabs: Array<{ id: TabId; label: string; icon: string }> = [
    { id: 'ai', label: 'AI识别', icon: '🤖' },
    { id: 'manual', label: '手动选择', icon: '🎯' },
    { id: 'config', label: '模板配置', icon: '⚙️' },
  ];

  /**
   * 渲染当前 Tab 内容
   */
  const renderTabContent = () => {
    switch (activeTab) {
      case 'ai':
        return (
          <AIIdentifyPanel
            onApplyComplete={() => setActiveTab('config')}
          />
        );
      case 'manual':
        return (
          <ManualSelector
            onInsert={(marker) => {
              console.log('已插入标记:', marker);
              setActiveTab('config');
            }}
          />
        );
      case 'config':
        return <TemplateConfigPanel />;
      default:
        return null;
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

  return (
    <div className="app-container">
      {/* 顶部状态栏 */}
      <header className="status-bar">
        <div className="office-badge">
          <span className="icon">📄</span>
          <span className="label">{officeTypeLabel()}</span>
        </div>

        <div className="connection-status">
          {connectionStatus === 'checking' && <span className="checking">检测中...</span>}
          {connectionStatus === 'connected' && <span className="connected">✅ 已连接</span>}
          {connectionStatus === 'disconnected' && (
            <span className="disconnected">
              ❌ 未连接
              <button onClick={checkBackendConnection}>重试</button>
            </span>
          )}
        </div>

        <div className="api-url">
          <input
            type="text"
            value={apiBaseUrl}
            onChange={(e) => setApiBaseUrl(e.target.value)}
            placeholder="后端API地址"
          />
        </div>
      </header>

      {/* Tab 导航 */}
      <nav className="tab-nav">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="icon">{tab.icon}</span>
            <span className="label">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* 主内容区 */}
      <main className="content-area">{renderTabContent()}</main>

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