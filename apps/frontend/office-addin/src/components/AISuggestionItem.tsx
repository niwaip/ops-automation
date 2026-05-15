import React, { useEffect, useRef, useState, useMemo } from 'react';
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
    // 如果有 excel 锚点，优先显示 Excel 位置信息
    if (suggestion.details?.excelAnchor) {
      const anchor = suggestion.details.excelAnchor;
      if (anchor.type === 'cell') {
        return `单元格: ${anchor.sheetName}!${anchor.address || ''}`;
      } else if (anchor.type === 'table') {
        return `表格区域: ${anchor.sheetName}!${anchor.tableName || anchor.startAddress || ''}`;
      }
    }

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
  const descriptionSummary = suggestion.details?.description?.trim() || '';
  const sampleValue = suggestion.originalText?.trim() || '';

  // 检查是否包含无意义的命名（如 field, value, unknown 等）
  const hasMalformedName = useMemo(() => {
    const normalizedName = String(suggestion.suggestedName || '').replace(/[{}]/g, '').trim();
    return /^(?:d\.)?(?:[A-Za-z_][A-Za-z0-9_]*\[\]\.)?(field\d*|textValue|textField\d*|value\d*|var\d*|param\d*|undefined|null|unknown)$/i.test(normalizedName);
  }, [suggestion.suggestedName]);

  return (
    <div
      ref={containerRef}
      className={`suggestion-item ${suggestion.applied ? 'applied' : ''}`}
      onBlurCapture={handleCardBlur}
    >
      <div className="suggestion-header" onClick={() => setExpanded(!expanded)}>
        <div className="suggestion-content" onDoubleClick={(event) => {
          event.stopPropagation();
          enterEditMode();
        }}>
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
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: '13px',
                  lineHeight: 1.6,
                  color: '#0f172a',
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  wordBreak: 'break-word',
                }}
              >
                <span className="suggested" style={hasMalformedName ? { color: '#ef4444', fontWeight: 'bold' } : undefined}>
                  {suggestion.suggestedName}
                </span>
                {sampleValue && (
                  <>
                    <span className="arrow" style={{ margin: '0 8px', color: '#94a3b8' }}>←</span>
                    <span className="original" style={{ color: '#64748b' }}>{sampleValue}</span>
                  </>
                )}
                {suggestion.details?.excelAnchor && (
                  <span style={{ color: '#0ea5e9', marginLeft: sampleValue ? '8px' : '0', fontSize: '12px', background: '#e0f2fe', padding: '2px 6px', borderRadius: '4px' }}>
                    📍 {suggestion.details.excelAnchor.type === 'cell' ? suggestion.details.excelAnchor.address : suggestion.details.excelAnchor.tableName || suggestion.details.excelAnchor.startAddress || '区域'}
                  </span>
                )}
                {descriptionSummary && (
                  <span style={{ color: '#475569', marginLeft: '8px' }}>
                    说明: {descriptionSummary}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
      </div>

      {expanded && (
        <div className="suggestion-details" style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
          <div className="suggestion-meta-row" style={{ marginBottom: '12px', display: 'flex', gap: '12px' }}>
            <span className={`suggestion-source-badge source-${suggestion.details?.source || 'heuristic'}`}>
              来源: {sourceLabelMap[suggestion.details?.source || 'heuristic'] || '未知'}
            </span>
            <span className="suggestion-field-type" style={{ fontSize: '12px', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
              类型: {suggestion.details?.fieldType || 'text'}
            </span>
            <span className="confidence-badge" style={{ fontSize: '12px', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
              置信度: {Math.round(suggestion.confidence * 100)}%
            </span>
          </div>

          <div className="suggestion-context" style={{ marginBottom: '8px' }}>
            <span className="context-label" style={{ fontWeight: 600 }}>文档位置:</span>
            <span className="context-text position-format" style={{ marginLeft: '4px' }}>{getPositionInfo(suggestion)}</span>
          </div>

          {suggestion.details?.significance && (
            <div className="suggestion-significance" style={{ marginBottom: '8px' }}>
              <span className="significance-label" style={{ fontWeight: 600 }}>用途说明:</span>
              <span className="significance-text" style={{ marginLeft: '4px' }}>{suggestion.details.significance}</span>
            </div>
          )}
          {suggestion.details?.formatter && (
            <p style={{ marginBottom: '8px' }}><span style={{ fontWeight: 600 }}>建议格式化器:</span> <code>{suggestion.details.formatter}</code></p>
          )}

          <div className="suggestion-actions" style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
            {!isEditing ? (
              <>
                {!suggestion.applied ? (
                  <button className="apply-btn" onClick={onApply}>
                    ✅ 应用
                  </button>
                ) : (
                  <button 
                    className="apply-btn" 
                    onClick={onApply} 
                    style={{ backgroundColor: '#f3f4f6', color: '#4b5563', border: '1px solid #d1d5db' }}
                    title="重新将此参数写入到 Excel 中"
                  >
                    🔄 重新应用
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
