/**
 * 调试日志面板组件
 * 显示详细的调试日志，帮助排查问题
 */

import React, { useMemo, useState } from 'react';
import { useAppStore, DebugLogEntry } from '../taskpane/store';

type DebugModuleKey = 'understanding' | 'identify' | 'apply' | 'draft' | 'verifySave' | 'other';

const DEBUG_MODULES: Array<{ key: DebugModuleKey; label: string }> = [
  { key: 'understanding', label: '理解文档' },
  { key: 'identify', label: '参数识别' },
  { key: 'apply', label: '参数应用' },
  { key: 'draft', label: '制作草稿' },
  { key: 'verifySave', label: '验证保存' },
  { key: 'other', label: '其他' },
];

export const DebugLogPanel: React.FC = () => {
  const { debugLogs, clearDebugLogs, showDebugPanel, setShowDebugPanel } = useAppStore();
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

  if (!showDebugPanel) return null;

  const formatLogTime = (timestamp: DebugLogEntry['timestamp']) => {
    try {
      const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
      if (Number.isNaN(date.getTime())) {
        return '--:--:--';
      }
      return date.toLocaleTimeString();
    } catch {
      return '--:--:--';
    }
  };

  /**
   * 复制单条日志到剪贴板
   */
  const copyLogToClipboard = async (log: DebugLogEntry) => {
    if (!log) return;
    const logText = `[${log.level ? log.level.toUpperCase() : 'INFO'}] ${formatLogTime(log.timestamp)} - ${log.message || ''}\n${log.details || ''}`;
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
    const allLogsText = latestLogsByModule.map(({ moduleLabel, log }) =>
      `【${moduleLabel}】 [${log?.level ? log.level.toUpperCase() : 'INFO'}] ${formatLogTime(log?.timestamp)} - ${log?.message || ''}\n${log?.details || ''}`
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

  const classifyLogModule = (log: DebugLogEntry): DebugModuleKey => {
    if (!log || !log.message) return 'other';
    const text = `${log.message} ${log.details || ''}`.toLowerCase();

    if (
      text.includes('工作表') ||
      text.includes('sheet') ||
      text.includes('全局 ai') ||
      text.includes('对照组') ||
      text.includes('模板源导出提示')
    ) {
      return 'understanding';
    }

    if (
      text.includes('ai 识别') ||
      text.includes('参数识别') ||
      text.includes('获取文档内容') ||
      text.includes('调用多阶段处理api') ||
      text.includes('进度更新') ||
      text.includes('处理完成') ||
      text.includes('分析来源') ||
      text.includes('ai 分析成功') ||
      text.includes('识别方式')
    ) {
      return 'identify';
    }

    if (
      text.includes('应用建议') ||
      text.includes('应用完成') ||
      text.includes('重新应用') ||
      text.includes('当前宿主暂不支持应用建议')
    ) {
      return 'apply';
    }

    if (
      text.includes('生成ai指南') ||
      text.includes('暂存副本') ||
      text.includes('副本已') ||
      text.includes('载入暂存副本') ||
      text.includes('清除暂存副本') ||
      text.includes('验证模版配置') ||
      text.includes('验证成功') ||
      text.includes('验证失败')
    ) {
      return 'draft';
    }

    if (
      text.includes('ai生成数据') ||
      text.includes('预览成功') ||
      text.includes('预览失败') ||
      text.includes('数据预览') ||
      text.includes('模板生成失败') ||
      text.includes('模版已生成') ||
      text.includes('最终保存成功') ||
      text.includes('保存失败')
    ) {
      return 'verifySave';
    }

    return 'other';
  };

  const latestLogsByModule = useMemo(() => {
    const latestMap = new Map<DebugModuleKey, DebugLogEntry>();

    debugLogs.forEach((log) => {
      latestMap.set(classifyLogModule(log), log);
    });

    return DEBUG_MODULES
      .map((module) => {
        const log = latestMap.get(module.key);
        if (!log) {
          return null;
        }
        return {
          moduleKey: module.key,
          moduleLabel: module.label,
          log,
        };
      })
      .filter((item): item is { moduleKey: DebugModuleKey; moduleLabel: string; log: DebugLogEntry } => Boolean(item));
  }, [debugLogs]);

  return (
    <div className="flow-log-panel">
      <div className="flow-log-header">
        <h3>流程日志</h3>
        <div className="flow-log-actions">
          <button onClick={copyAllLogsToClipboard} disabled={latestLogsByModule.length === 0}>
            {copySuccess === 'all' ? '✓ 已复制' : '📋 复制全部'}
          </button>
          <button onClick={clearDebugLogs}>清空</button>
          <button onClick={() => setShowDebugPanel(false)}>关闭</button>
        </div>
      </div>

      <div className="flow-log-content">
        {latestLogsByModule.length === 0 ? (
          <div className="flow-log-empty">暂无日志</div>
        ) : (
          latestLogsByModule.map(({ moduleKey, moduleLabel, log }) => {
            if (!log) return null;
            return (
              <div key={moduleKey} className="flow-log-entry" style={{ borderColor: getLevelColor(log.level) }}>
                <div className="flow-log-entry-header">
                  <span className="flow-log-module-tag">{moduleLabel}</span>
                  <span className="flow-log-icon">{getLevelIcon(log.level)}</span>
                  <span className="flow-log-time">
                    {formatLogTime(log.timestamp)}
                  </span>
                  <span className="flow-log-level" style={{ color: getLevelColor(log.level) }}>
                    [{log.level ? log.level.toUpperCase() : 'INFO'}]
                  </span>
                  <span className="flow-log-message">{log.message || '空内容'}</span>
                  <button
                    className="flow-log-copy-btn"
                    onClick={() => copyLogToClipboard(log)}
                    title="复制此日志"
                  >
                    {copySuccess === log.id ? '✓' : '📋'}
                  </button>
                </div>
                {log.details && (
                  <div className="flow-log-details">
                    <pre>{log.details}</pre>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="flow-log-footer">
        <span>显示 {latestLogsByModule.length} 个模块的最新日志</span>
        <span>原始日志 {debugLogs.length} 条</span>
      </div>
    </div>
  );
};

export default DebugLogPanel;
