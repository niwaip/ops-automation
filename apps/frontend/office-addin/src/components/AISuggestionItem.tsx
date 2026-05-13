import React, { useEffect, useRef, useState } from 'react';
import { AISuggestion } from '../taskpane/store';

export const AISuggestionItem: React.FC<{
  suggestion: AISuggestion;
  onApply: () => void;
  onDismiss: () => void;
  onUpdateName?: (newName: string) => void;
  onUpdateDetails?: (details: Partial<NonNullable<AISuggestion['details']>>) => void;
}> = ({ suggestion, onApply, onDismiss, onUpdateName, onUpdateDetails }) => {
  const [expanded, setExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(suggestion.suggestedName);
  const [editDescription, setEditDescription] = useState(suggestion.details?.description || '');
  const [editSignificance, setEditSignificance] = useState(suggestion.details?.significance || '');
  const [editFieldType, setEditFieldType] = useState(suggestion.details?.fieldType || 'text');
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setEditValue(suggestion.suggestedName);
    setEditDescription(suggestion.details?.description || '');
    setEditSignificance(suggestion.details?.significance || '');
    setEditFieldType(suggestion.details?.fieldType || 'text');
  }, [suggestion]);

  // 获取位置信息（使用格式化的显示位置）
  const getPositionInfo = (suggestion: AISuggestion): string => {
    // 优先使用displayPosition
    if (suggestion.details?.displayPosition) {
      return suggestion.details.displayPosition;
    }
    // 使用elementPath作为格式化位置
    if (suggestion.elementPath && suggestion.elementPath.startsWith('【')) {
      return suggestion.elementPath;
    }
    // 兼容旧格式
    if (suggestion.elementPath?.startsWith('position:')) {
      const pos = suggestion.elementPath.replace('position:', '');
      return `文档位置 ${pos}`;
    }
    // 使用beforeBlank和afterBlank构建
    if (suggestion.details?.beforeBlank || suggestion.details?.afterBlank) {
      return `【${suggestion.details.beforeBlank || ''} _____ ${suggestion.details.afterBlank || ''}】`;
    }
    return suggestion.originalText || '未知位置';
  };

  // 处理编辑确认
  const handleEditConfirm = () => {
    if (editValue !== suggestion.suggestedName && onUpdateName) {
      onUpdateName(editValue);
    }
    if (onUpdateDetails) {
      onUpdateDetails({
        description: editDescription,
        significance: editSignificance,
        fieldType: editFieldType,
      });
    }
    setIsEditing(false);
  };

  // 处理编辑取消
  const handleEditCancel = () => {
    setEditValue(suggestion.suggestedName);
    setEditDescription(suggestion.details?.description || '');
    setEditSignificance(suggestion.details?.significance || '');
    setEditFieldType(suggestion.details?.fieldType || 'text');
    setIsEditing(false);
  };

  const enterEditMode = () => {
    setExpanded(true);
    setIsEditing(true);
  };

  const handleCardBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!isEditing) {
      return;
    }
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && containerRef.current?.contains(nextTarget)) {
      return;
    }
    handleEditConfirm();
  };

  const sourceLabelMap: Record<string, string> = {
    ai: 'AI',
    heuristic: '启发式',
    manual: '手动',
    'ai+heuristic': 'AI+启发式',
  };

  return (
    <div
      ref={containerRef}
      className={`suggestion-item ${suggestion.applied ? 'applied' : ''}`}
      onBlurCapture={handleCardBlur}
    >
      <div className="suggestion-header" onClick={() => setExpanded(!expanded)}>
        <div className="confidence-badge">
          {suggestion.confidence > 0.8 ? '🟢' : suggestion.confidence > 0.5 ? '🟡' : '🔴'}
          {Math.round(suggestion.confidence * 100)}%
        </div>

        <div className="suggestion-content" onDoubleClick={(event) => {
          event.stopPropagation();
          enterEditMode();
        }}>
          <span className="original">{suggestion.originalText}</span>
          <span className="arrow">→</span>
          {isEditing ? (
            <input
              type="text"
              className="edit-input"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleEditConfirm();
                } else if (e.key === 'Escape') {
                  handleEditCancel();
                }
              }}
              autoFocus
            />
          ) : (
            <span className="suggested">{suggestion.suggestedName}</span>
          )}
        </div>

        {suggestion.applied && <span className="applied-badge">已应用</span>}
        <button
          className="dismiss-btn"
          onClick={(event) => {
            event.stopPropagation();
            onDismiss();
          }}
        >
          删除
        </button>
      </div>

      {/* 显示原文位置（格式化显示） */}
      <div className="suggestion-context">
        <span className="context-label">原文位置:</span>
        <span className="context-text position-format">{getPositionInfo(suggestion)}</span>
      </div>

      <div className="suggestion-meta-row">
        <span className={`suggestion-source-badge source-${suggestion.details?.source || 'heuristic'}`}>
          来源: {sourceLabelMap[suggestion.details?.source || 'heuristic'] || '未知'}
        </span>
        <span className="suggestion-field-type">
          类型: {suggestion.details?.fieldType || 'text'}
        </span>
      </div>

      {suggestion.details?.description && (
        <div className="suggestion-description">
          <span className="description-label">参数描述:</span>
          <span className="description-text">{suggestion.details.description}</span>
        </div>
      )}

      {/* 显示项目意义 */}
      {suggestion.details?.significance && (
        <div className="suggestion-significance">
          <span className="significance-label">用途说明:</span>
          <span className="significance-text">{suggestion.details.significance}</span>
        </div>
      )}

      {/* 显示上下文内容 */}
      {suggestion.details?.context && (
        <div className="context-snippet">
          <span className="snippet-label">上下文:</span>
          <span className="snippet-text">...{suggestion.details.context}...</span>
        </div>
      )}

      {expanded && (
        <div className="suggestion-details">
          <p>变量路径: <code>{suggestion.suggestedName}</code></p>
          <p>原始文本: <code>{suggestion.originalText}</code></p>
          <p>建议来源: <code>{sourceLabelMap[suggestion.details?.source || 'heuristic'] || '未知'}</code></p>
          {suggestion.details?.formatter && (
            <p>建议格式化器: <code>{suggestion.details.formatter}</code></p>
          )}

          <div className="suggestion-actions">
            {!isEditing ? (
              <>
                {!suggestion.applied && (
                  <button className="apply-btn" onClick={onApply}>
                    ✅ 应用
                  </button>
                )}
              </>
            ) : (
              <>
                <input
                  type="text"
                  className="edit-input"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="参数描述"
                />
                <input
                  type="text"
                  className="edit-input"
                  value={editSignificance}
                  onChange={(e) => setEditSignificance(e.target.value)}
                  placeholder="用途说明"
                />
                <select
                  className="edit-input"
                  value={editFieldType}
                  onChange={(e) => setEditFieldType(e.target.value)}
                >
                  <option value="text">text</option>
                  <option value="number">number</option>
                  <option value="date">date</option>
                  <option value="boolean">boolean</option>
                  <option value="percent">percent</option>
                  <option value="formula">formula</option>
                  <option value="loop">loop</option>
                </select>
                <button className="confirm-btn" onClick={handleEditConfirm}>
                  保存
                </button>
                <button className="cancel-btn" onClick={handleEditCancel}>
                  取消
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
