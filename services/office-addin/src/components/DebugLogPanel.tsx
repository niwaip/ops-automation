/**
 * 调试日志面板组件
 * 显示详细的调试日志，帮助排查问题
 */

import React, { useState } from 'react';
import { useAppStore, DebugLogEntry } from '../taskpane/store';

export const DebugLogPanel: React.FC = () => {
  const { debugLogs, clearDebugLogs, showDebugPanel, setShowDebugPanel } = useAppStore();
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

  if (!showDebugPanel) return null;

  /**
   * 复制单条日志到剪贴板
   */
  const copyLogToClipboard = async (log: DebugLogEntry) => {
    const logText = `[${log.level.toUpperCase()}] ${log.timestamp.toLocaleTimeString()} - ${log.message}\n${log.details || ''}`;
    try {
      await navigator.clipboard.writeText(logText);
      setCopySuccess(log.id);
      setTimeout(() => setCopySuccess(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  /**
   * 复制所有日志到剪贴板
   */
  const copyAllLogsToClipboard = async () => {
    const allLogsText = debugLogs.map(log =>
      `[${log.level.toUpperCase()}] ${log.timestamp.toLocaleTimeString()} - ${log.message}\n${log.details || ''}`
    ).join('\n\n');
    try {
      await navigator.clipboard.writeText(allLogsText);
      setCopySuccess('all');
      setTimeout(() => setCopySuccess(null), 2000);
    } catch (err) {
      console.error('Failed to copy all:', err);
    }
  };

  const getLevelColor = (level: DebugLogEntry['level']) => {
    switch (level) {
      case 'error': return '#dc3545';
      case 'warn': return '#ffc107';
      case 'info': return '#17a2b8';
      case 'debug': return '#6c757d';
      default: return '#333';
    }
  };

  const getLevelIcon = (level: DebugLogEntry['level']) => {
    switch (level) {
      case 'error': return '❌';
      case 'warn': return '⚠️';
      case 'info': return 'ℹ️';
      case 'debug': return '🔍';
      default: return '•';
    }
  };

  return (
    <div className="debug-log-panel">
      <div className="debug-header">
        <h3>调试日志</h3>
        <div className="debug-actions">
          <button onClick={copyAllLogsToClipboard} disabled={debugLogs.length === 0}>
            {copySuccess === 'all' ? '✓ 已复制' : '📋 复制全部'}
          </button>
          <button onClick={clearDebugLogs}>清空</button>
          <button onClick={() => setShowDebugPanel(false)}>关闭</button>
        </div>
      </div>

      <div className="debug-content">
        {debugLogs.length === 0 ? (
          <div className="no-logs">暂无日志</div>
        ) : (
          debugLogs.map((log) => (
            <div key={log.id} className="log-entry" style={{ borderColor: getLevelColor(log.level) }}>
              <div className="log-header">
                <span className="log-icon">{getLevelIcon(log.level)}</span>
                <span className="log-time">
                  {log.timestamp.toLocaleTimeString()}
                </span>
                <span className="log-level" style={{ color: getLevelColor(log.level) }}>
                  [{log.level.toUpperCase()}]
                </span>
                <span className="log-message">{log.message}</span>
                <button
                  className="copy-log-btn"
                  onClick={() => copyLogToClipboard(log)}
                  title="复制此日志"
                >
                  {copySuccess === log.id ? '✓' : '📋'}
                </button>
              </div>
              {log.details && (
                <div className="log-details">
                  <pre>{log.details}</pre>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="debug-footer">
        <span>共 {debugLogs.length} 条日志</span>
        <span>（最多保留100条）</span>
      </div>
    </div>
  );
};

export default DebugLogPanel;