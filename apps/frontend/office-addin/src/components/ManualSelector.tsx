/**
 * 手动选择组件
 * 支持用户选择特定单元格/元素，手动配置变量名和格式化器
 */

import React, { useState } from 'react';
import { useAppStore } from '../taskpane/store';
import { ExcelAPI } from '../utils/office/excel/api';
import { WordAPI } from '../utils/office/word/api';

interface Props {
  onInsert: (marker: string) => void;
}

export const ManualSelector: React.FC<Props> = ({ onInsert }) => {
  const { officeType, addSelectedElement, selectedElements, clearSelectedElements } = useAppStore();

  const [variableName, setVariableName] = useState('');
  const [formatter, setFormatter] = useState('');
  const [loopMode, setLoopMode] = useState(false);
  const [arrayPath, setArrayPath] = useState('');

  const formatters = [
    { label: '无格式化', value: '' },
    { label: '日期 YYYY-MM-DD', value: 'formatDate(YYYY-MM-DD)' },
    { label: '日期 YYYY/MM/DD', value: 'formatDate(YYYY/MM/DD)' },
    { label: '数字 #,##0.00', value: 'formatNumber(#,##0.00)' },
    { label: '大写', value: 'upper' },
    { label: '小写', value: 'lower' },
    { label: '货币转换', value: 'convCurrency(USD)' },
  ];

  /**
   * 获取当前选中的内容
   */
  const handleGetSelection = async () => {
    try {
      if (officeType === 'word') {
        const selectedText = await WordAPI.getSelectedText();
        addSelectedElement({
          type: 'text',
          id: `word-${Date.now()}`,
          content: selectedText,
        });
      } else if (officeType === 'excel') {
        const selectedRange = await ExcelAPI.getSelectedRange();
        addSelectedElement({
          type: 'cell',
          id: selectedRange.address,
          content: selectedRange.values[0][0] as string,
        });
      }
    } catch (error) {
      console.error('获取选中内容失败:', error);
    }
  };

  /**
   * 生成标记语法
   */
  const generateMarker = (): string => {
    let marker = `{d.${variableName}`;

    if (formatter) {
      marker += `:${formatter}`;
    }

    marker += '}';

    if (loopMode && arrayPath) {
      marker = `{#${arrayPath}}${marker}{/${arrayPath}}`;
    }

    return marker;
  };

  /**
   * 插入标记到文档
   */
  const handleInsert = async () => {
    const marker = generateMarker();

    try {
      if (officeType === 'word') {
        if (loopMode) {
          await WordAPI.insertLoopMarker(arrayPath, marker);
        } else {
          await WordAPI.replaceText(
            selectedElements[selectedElements.length - 1]?.content || '',
            marker
          );
        }
      } else if (officeType === 'excel') {
        const lastElement = selectedElements[selectedElements.length - 1];
        if (lastElement) {
          await ExcelAPI.insertMarkerInCell(lastElement.id, marker);
        }
      }

      onInsert(marker);
      clearSelectedElements();
      setVariableName('');
      setFormatter('');
      setLoopMode(false);
      setArrayPath('');
    } catch (error) {
      console.error('插入标记失败:', error);
    }
  };

  /**
   * 添加表格循环
   */
  const handleAddTableLoop = async () => {
    try {
      if (officeType === 'word') {
        const selection = await WordAPI.getSelectedText();
        await WordAPI.insertLoopMarker(arrayPath, selection);
      }
    } catch (error) {
      console.error('添加表格循环失败:', error);
    }
  };

  return (
    <div className="manual-selector">
      {/* 选择内容 */}
      <div className="selector-section">
        <button className="get-selection-btn" onClick={handleGetSelection}>
          📍 获取当前选中内容
        </button>

        {selectedElements.length > 0 && (
          <div className="selected-elements">
            <h4>已选元素:</h4>
            {selectedElements.map((el) => (
              <div key={el.id} className="element-item">
                <span className="type">{el.type}</span>
                <span className="id">{el.id}</span>
                <span className="content">{el.content.substring(0, 50)}...</span>
              </div>
            ))}
            <button className="clear-btn" onClick={clearSelectedElements}>
              清除选择
            </button>
          </div>
        )}
      </div>

      {/* 变量配置 */}
      <div className="config-section">
        <h3>变量配置</h3>

        <div className="input-group">
          <label>变量名:</label>
          <input
            type="text"
            value={variableName}
            onChange={(e) => setVariableName(e.target.value)}
            placeholder="如: customerName, invoice.total"
          />
          <small>路径格式: d.xxx 或 d.array[i].field</small>
        </div>

        <div className="input-group">
          <label>格式化器:</label>
          <select value={formatter} onChange={(e) => setFormatter(e.target.value)}>
            {formatters.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        {/* 循环模式 */}
        <div className="loop-config">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={loopMode}
              onChange={(e) => setLoopMode(e.target.checked)}
            />
            启用循环模式
          </label>

          {loopMode && (
            <div className="input-group">
              <label>数组路径:</label>
              <input
                type="text"
                value={arrayPath}
                onChange={(e) => setArrayPath(e.target.value)}
                placeholder="如: d.items, d.rows"
              />
              <small>将选中内容包装为 {'{#d.array}...{/d.array}'}</small>
            </div>
          )}
        </div>
      </div>

      {/* 生成的标记预览 */}
      {variableName && (
        <div className="marker-preview">
          <h4>生成的标记:</h4>
          <code className="marker">{generateMarker()}</code>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="actions">
        <button
          className="insert-btn"
          onClick={handleInsert}
          disabled={!variableName || selectedElements.length === 0}
        >
          插入标记
        </button>

        {officeType === 'word' && (
          <button className="table-loop-btn" onClick={handleAddTableLoop}>
            添加表格循环
          </button>
        )}
      </div>
    </div>
  );
};

export default ManualSelector;