import type { FlowLogEntry } from '../../../app/store';

interface WordWorkflowDebugPanelProps {
  showDebugPanel: boolean;
  onToggleDebugPanel: () => void;
  analysisError: string | null;
  analysisErrorDetails?: string | null;
  showErrorDetails: boolean;
  onToggleErrorDetails: () => void;
  recentErrorLogs: FlowLogEntry[];
}

export function WordWorkflowDebugPanel(props: WordWorkflowDebugPanelProps) {
  const {
    showDebugPanel,
    onToggleDebugPanel,
    analysisError,
    analysisErrorDetails,
    showErrorDetails,
    onToggleErrorDetails,
    recentErrorLogs,
  } = props;

  return (
    <>
      <button
        className="debug-toggle-btn"
        onClick={onToggleDebugPanel}
      >
        {showDebugPanel ? '隐藏日志' : '显示日志'}
      </button>

      {analysisError && (
        <div className="error-message-container">
          <div className="error-message" onClick={onToggleErrorDetails}>
            <span className="error-icon">❌</span>
            <span className="error-text">{analysisError}</span>
            <span className="error-toggle">{showErrorDetails ? '▼' : '▶'}</span>
          </div>
          {showErrorDetails && analysisErrorDetails && (
            <div className="error-details">
              <pre>{analysisErrorDetails}</pre>
            </div>
          )}
        </div>
      )}

      {(analysisError || recentErrorLogs.length > 0) && (
        <section className="word-error-log-section">
          <div className="word-error-log-header">
            <h3>识别错误日志</h3>
            <span>Word 页底部固定展示，便于直接排查 500</span>
          </div>
          {analysisError && (
            <div className="word-error-log-card latest">
              <div className="word-error-log-title">当前错误</div>
              <div className="word-error-log-message">{analysisError}</div>
              <pre className="word-error-log-pre">
                {analysisErrorDetails || analysisError}
              </pre>
            </div>
          )}
          {recentErrorLogs.length > 0 && (
            <div className="word-error-log-list">
              {recentErrorLogs.map((log) => (
                <div key={log.id} className="word-error-log-card">
                  <div className="word-error-log-meta">
                    <span>[{log.level.toUpperCase()}]</span>
                    <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="word-error-log-message">{log.message}</div>
                  {log.details && (
                    <pre className="word-error-log-pre">{log.details}</pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
