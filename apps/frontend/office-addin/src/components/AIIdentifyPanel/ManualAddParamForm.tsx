import React from 'react';

interface ManualAddParamFormProps {
  applyState: any;
  targetGroupName: string;
}

export const ManualAddParamForm: React.FC<ManualAddParamFormProps> = ({ applyState, targetGroupName }) => {
  return (
    <div className="manual-add-form expanded" style={{ marginTop: '8px', padding: '12px', background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
      <div className="selection-section">
        <button className="get-selection-btn" onClick={() => { void applyState.handleGetSelection(); }}>
          📍 获取当前选中内容
        </button>
        {applyState.selectedContent && (
          <div className="selected-preview">
            <span className="selected-text">已选: "{applyState.selectedContent.substring(0, 30)}..."</span>
          </div>
        )}
      </div>

      <div className="variable-config">
        <div className="input-group">
          <label>变量名:</label>
          <div className="input-with-btn">
            <input
              type="text"
              className="manual-param-input"
              value={applyState.manualParamName}
              onChange={(e) => applyState.setManualParamName(e.target.value)}
              placeholder="d.fieldName"
              autoFocus
            />
            <button
              className="ai-generate-btn"
              onClick={() => { void applyState.handleAIGenerateVariableName(); }}
              disabled={applyState.isGeneratingAI || !applyState.selectedContent}
            >
              {applyState.isGeneratingAI ? '⏳' : '🤖'}
            </button>
          </div>
        </div>

        <div className="input-group">
          <label>格式化器:</label>
          <select value={applyState.manualFormatter} onChange={(e) => applyState.setManualFormatter(e.target.value)}>
            <option value="">无格式化</option>
            <option value="formatDate(YYYY-MM-DD)">日期 YYYY-MM-DD</option>
            <option value="formatDate(YYYY/MM/DD)">日期 YYYY/MM/DD</option>
            <option value="formatNumber(#,##0.00)">数字 #,##0.00</option>
            <option value="upper">大写</option>
            <option value="lower">小写</option>
          </select>
        </div>

        <div className="input-group">
          <label>用途说明:</label>
          <input
            type="text"
            value={applyState.manualSignificance}
            onChange={(e) => applyState.setManualSignificance(e.target.value)}
            placeholder="如：合同甲方名称、发票金额"
          />
        </div>

        <div className="loop-config">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={applyState.manualLoopMode}
              onChange={(e) => applyState.setManualLoopMode(e.target.checked)}
            />
            启用循环模式
          </label>

          {applyState.manualLoopMode && (
            <div className="input-group">
              <label>数组路径:</label>
              <input
                type="text"
                value={applyState.manualArrayPath}
                onChange={(e) => applyState.setManualArrayPath(e.target.value)}
                placeholder="d.items"
              />
              <small>将包装为 {'{#d.array}...{/d.array}'}</small>
            </div>
          )}
        </div>
      </div>

      {applyState.manualParamName && (
        <div className="marker-preview">
          <code>{applyState.generateManualMarker()}</code>
        </div>
      )}

      <div className="manual-actions">
        <button className="confirm-add-btn" onClick={() => { void applyState.handleManualAddParam(targetGroupName); }}>
          ✅ 添加到列表
        </button>
        <button
          className="cancel-add-btn"
          onClick={() => {
            applyState.setActiveManualAddGroup(null);
            applyState.setManualParamName('d.');
            applyState.setManualFormatter('');
            applyState.setManualLoopMode(false);
            applyState.setManualArrayPath('');
            applyState.setManualSignificance('');
          }}
        >
          ❌ 取消
        </button>
      </div>
    </div>
  );
};
