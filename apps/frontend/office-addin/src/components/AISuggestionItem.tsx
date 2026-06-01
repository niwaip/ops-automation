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

  const getAnchorInfo = (suggestion: AISuggestion): string => {
    const wordAnchor = suggestion.details?.wordAnchor;
    if (wordAnchor?.type === 'content-control' && typeof wordAnchor.contentControlId === 'number') {
      return `Word 内容控件 #${wordAnchor.contentControlId}`;
    }
    if (
      wordAnchor?.type === 'table-cell'
      && typeof wordAnchor.tableIndex === 'number'
      && typeof wordAnchor.rowIndex === 'number'
      && typeof wordAnchor.cellIndex === 'number'
    ) {
      return `Word 表格 T${wordAnchor.tableIndex} R${wordAnchor.rowIndex} C${wordAnchor.cellIndex}`;
    }
    if (
      wordAnchor?.type === 'text-range'
      && typeof wordAnchor.paragraphIndex === 'number'
      && typeof wordAnchor.start === 'number'
      && typeof wordAnchor.end === 'number'
    ) {
      return `Word 段落 #${wordAnchor.paragraphIndex} 锚点 ${wordAnchor.start}-${wordAnchor.end}`;
    }

    const excelAnchor = suggestion.details?.excelAnchor;
    if (excelAnchor?.type === 'cell') {
      return `Excel 单元格 ${excelAnchor.sheetName}!${excelAnchor.address || ''}`;
    }
    if (excelAnchor?.type === 'table') {
      return `Excel 表格 ${excelAnchor.sheetName}!${excelAnchor.tableName || excelAnchor.startAddress || '区域'}`;
    }

    return '未绑定精确锚点';
  };

  const hasPreciseAnchor = Boolean(
    suggestion.details?.wordAnchor
    || suggestion.details?.excelAnchor
  );

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
  const summaryValue = sampleValue || '暂无样本值';
  const riskLevel = suggestion.details?.riskLevel || 'low';
  const riskLabelMap: Record<'low' | 'medium' | 'high', string> = {
    low: '低风险',
    medium: '中风险',
    high: '高风险',
  };
  const needsReview = suggestion.details?.needsReview === true;
  const confidenceLevel = suggestion.confidence >= 0.9
    ? 'high'
    : suggestion.confidence >= 0.75
      ? 'medium'
      : 'low';
  const badgeStyleMap = {
    base: {
      fontSize: '12px',
      padding: '2px 8px',
      borderRadius: '999px',
      display: 'inline-flex',
      alignItems: 'center',
      lineHeight: 1.4,
    } as React.CSSProperties,
    risk: {
      high: { background: '#fee2e2', color: '#b91c1c' },
      medium: { background: '#fef3c7', color: '#92400e' },
      low: { background: '#dcfce7', color: '#166534' },
    },
    confidence: {
      high: { background: '#dbeafe', color: '#1d4ed8' },
      medium: { background: '#ede9fe', color: '#6d28d9' },
      low: { background: '#fff1f2', color: '#be123c' },
    },
    review: {
      pending: { background: '#fff7ed', color: '#c2410c' },
      ready: { background: '#dcfce7', color: '#166534' },
    },
    neutral: { background: '#f1f5f9', color: '#64748b' },
  };

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
      <div
        className="suggestion-header"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setExpanded((current) => !current);
          }
        }}
      >
        <div
          className="suggestion-summary"
          onDoubleClick={(event) => {
            event.stopPropagation();
            enterEditMode();
          }}
        >
          <div className="suggestion-summary-row">
            <span className="suggestion-summary-label">参数名</span>
            {isEditing ? (
              <input
                type="text"
                className="edit-input suggestion-summary-input"
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
              <span
                className="suggested suggestion-summary-name"
                style={hasMalformedName ? { color: '#ef4444', fontWeight: 'bold' } : undefined}
              >
                {suggestion.suggestedName}
              </span>
            )}
          </div>
          <div className="suggestion-summary-row">
            <span className="suggestion-summary-label">参数值</span>
            <span className="original suggestion-summary-value">{summaryValue}</span>
          </div>
        </div>

        <div className="suggestion-summary-toggle">
          <span className={`suggestion-chevron ${expanded ? 'expanded' : ''}`}>⌄</span>
        </div>
      </div>

      {expanded && (
        <div className="suggestion-details">
          <div className="suggestion-meta-row" style={{ marginBottom: '12px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <span className={`suggestion-source-badge source-${suggestion.details?.source || 'heuristic'}`}>
              来源: {sourceLabelMap[suggestion.details?.source || 'heuristic'] || '未知'}
            </span>
            <span className="suggestion-field-type" style={{ fontSize: '12px', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
              类型: {suggestion.details?.fieldType || 'text'}
            </span>
            <span style={{ ...badgeStyleMap.base, ...badgeStyleMap.risk[riskLevel] }}>
              风险: {riskLabelMap[riskLevel]}
            </span>
            <span style={{ ...badgeStyleMap.base, ...badgeStyleMap.confidence[confidenceLevel] }}>
              置信度: {Math.round(suggestion.confidence * 100)}%
            </span>
            <span style={{ ...badgeStyleMap.base, ...(needsReview ? badgeStyleMap.review.pending : badgeStyleMap.review.ready) }}>
              状态: {needsReview ? '待人工确认' : '可继续应用'}
            </span>
            {suggestion.details?.policy && (
              <span style={{ ...badgeStyleMap.base, ...badgeStyleMap.neutral }}>
                策略: {suggestion.details.policy}
              </span>
            )}
            {suggestion.details?.termMatchStatus && (
              <span style={{ ...badgeStyleMap.base, ...(suggestion.details.termMatchStatus === 'matched'
                ? { background: '#ecfeff', color: '#0f766e' }
                : badgeStyleMap.neutral) }}>
                术语: {suggestion.details.termMatchStatus === 'matched'
                  ? `已命中${suggestion.details.termMatchTermId ? ` (${suggestion.details.termMatchTermId})` : ''}`
                  : '未命中'}
              </span>
            )}
          </div>

          <div className="suggestion-detail-grid">
            <div className="suggestion-detail-item">
              <span className="suggestion-detail-label">文档位置</span>
              <span className="context-text position-format">{getPositionInfo(suggestion)}</span>
            </div>
            <div className="suggestion-detail-item">
              <span className="suggestion-detail-label">字段类型</span>
              <span className="suggestion-detail-value">{suggestion.details?.fieldType || 'text'}</span>
            </div>
            <div className="suggestion-detail-item">
              <span className="suggestion-detail-label">定位状态</span>
              <span className="suggestion-detail-value" style={{ color: hasPreciseAnchor ? '#166534' : '#b45309' }}>
                {hasPreciseAnchor ? '已绑定精确锚点' : '仅能使用弱定位'}
              </span>
            </div>
            <div className="suggestion-detail-item suggestion-detail-item-block">
              <span className="suggestion-detail-label">定位锚点</span>
              <span className="suggestion-detail-value">{getAnchorInfo(suggestion)}</span>
            </div>
            <div className="suggestion-detail-item">
              <span className="suggestion-detail-label">原始分数</span>
              <span className="suggestion-detail-value">{suggestion.confidence.toFixed(2)}</span>
            </div>
            {suggestion.details?.excelAnchor && (
              <div className="suggestion-detail-item">
                <span className="suggestion-detail-label">锚点位置</span>
                <span className="suggestion-detail-value">
                  {suggestion.details.excelAnchor.type === 'cell'
                    ? suggestion.details.excelAnchor.address
                    : suggestion.details.excelAnchor.tableName || suggestion.details.excelAnchor.startAddress || '区域'}
                </span>
              </div>
            )}
            {descriptionSummary && (
              <div className="suggestion-detail-item suggestion-detail-item-block">
                <span className="suggestion-detail-label">参数说明</span>
                <span className="suggestion-detail-value">{descriptionSummary}</span>
              </div>
            )}
            {suggestion.details?.significance && (
              <div className="suggestion-detail-item suggestion-detail-item-block">
                <span className="suggestion-detail-label">用途说明</span>
                <span className="suggestion-detail-value">{suggestion.details.significance}</span>
              </div>
            )}
            {suggestion.details?.formatter && (
              <div className="suggestion-detail-item suggestion-detail-item-block">
                <span className="suggestion-detail-label">建议格式化器</span>
                <code className="suggestion-detail-code">{suggestion.details.formatter}</code>
              </div>
            )}
          </div>

          <div style={{ marginBottom: '8px', color: '#475569', fontSize: '13px', lineHeight: 1.6 }}>
            {needsReview
              ? '该字段建议在保存或发布前做人工确认。'
              : '该字段当前可直接进入后续确认或应用流程。'}
            {riskLevel === 'high' ? ' 由于属于高风险字段，建议重点复核样本值与锚点。' : ''}
            {suggestion.confidence < 0.75 ? ' 当前置信度偏低，建议结合原文位置再次确认。' : ''}
          </div>

          <div className="suggestion-actions" style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
            {!isEditing ? (
              <>
                <button className="dismiss-btn" onClick={enterEditMode}>
                  编辑
                </button>
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
                <button className="dismiss-btn" onClick={onDismiss}>
                  删除
                </button>
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
