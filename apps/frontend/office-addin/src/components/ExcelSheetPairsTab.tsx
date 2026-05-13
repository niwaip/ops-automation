import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { OfficeHelper } from '../utils/office-api';
import { ExcelSheetPairState, useAppStore } from '../taskpane/store';
import { analyzeExcelWorkbookUnderstanding } from '../services/suggestion-service';

const EXCEL_UNDERSTANDING_CACHE_STORAGE_KEY = 'office-addin:excel-understanding-cache:v1';

interface ExcelUnderstandingCacheEntry {
  cacheKey: string;
  summary: string;
  updatedAt: number;
}

interface WorkbookSheetSummary {
  name: string;
  index: number;
  address: string;
  rowCount: number;
  columnCount: number;
  tables: Array<{
    name: string;
    address: string;
    headerAddress?: string;
    dataBodyAddress?: string;
  }>;
  values: (string | number | boolean | null)[][];
  formulas: string[][];
}

function buildSheetPairs(sheets: WorkbookSheetSummary[]): ExcelSheetPairState[] {
  const pairs: ExcelSheetPairState[] = [];

  for (let index = 0; index < sheets.length; index += 2) {
    pairs.push({
      id: `sheet-pair-${index}`,
      pairIndex: Math.floor(index / 2),
      compare: true,
      hidden: false,
      leftSheetName: sheets[index]?.name,
      leftSheetIndex: sheets[index]?.index,
      rightSheetName: sheets[index + 1]?.name,
      rightSheetIndex: sheets[index + 1]?.index,
    });
  }

  return pairs;
}

function buildUnderstandingCacheKey(
  workbookSheets: WorkbookSheetSummary[],
  selectedSheetIndexes: number[]
): string {
  const workbookSignature = workbookSheets
    .map((sheet) => `${sheet.index}:${sheet.name}:${sheet.rowCount}:${sheet.columnCount}`)
    .join('|');
  const selectedSignature = [...selectedSheetIndexes].sort((a, b) => a - b).join(',');
  return `${workbookSignature}::${selectedSignature}`;
}

function loadExcelUnderstandingCache(): Record<string, ExcelUnderstandingCacheEntry> {
  try {
    const raw = localStorage.getItem(EXCEL_UNDERSTANDING_CACHE_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, ExcelUnderstandingCacheEntry>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveExcelUnderstandingCacheEntry(entry: ExcelUnderstandingCacheEntry): void {
  const cache = loadExcelUnderstandingCache();
  cache[entry.cacheKey] = entry;
  localStorage.setItem(EXCEL_UNDERSTANDING_CACHE_STORAGE_KEY, JSON.stringify(cache));
}

export const ExcelSheetPairsTab: React.FC = () => {
  const {
    addDebugLog,
    apiBaseUrl,
    aiOrchestratorAuthToken,
    aiOrchestratorBaseUrl,
    analysisExecutor,
    analysisThinkingEnabled,
    excelSheetPairs,
    excelWorkbookUnderstanding,
    setExcelSheetPairs,
    setExcelUnderstandingSelectedSheets,
    setExcelWorkbookUnderstandingState,
    toggleExcelUnderstandingSheet,
  } = useAppStore();
  const [workbookSheets, setWorkbookSheets] = useState<WorkbookSheetSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [understandingCollapsed, setUnderstandingCollapsed] = useState(false);
  const [hasSelectionInteraction, setHasSelectionInteraction] = useState(false);

  const loadWorkbookSheets = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const sheets = await OfficeHelper.Excel.getWorkbookSheets();
      setWorkbookSheets(sheets);
      const previousPairsById = new Map(useAppStore.getState().excelSheetPairs.map((pair) => [pair.id, pair]));
      const nextPairs = buildSheetPairs(sheets).map((pair) => {
        const previous = previousPairsById.get(pair.id);
        return previous
          ? { ...pair, compare: previous.compare, hidden: previous.hidden }
          : pair;
      });
      setExcelSheetPairs(nextPairs);
      const previousSelectedSheets = useAppStore.getState().excelWorkbookUnderstanding.selectedSheetIndexes;
      const availableSheetIndexes = sheets.map((sheet) => sheet.index);
      
      // 默认选中所有“右侧”（数据）sheet
      const dataSheetIndexes = nextPairs
        .map((pair) => pair.rightSheetIndex)
        .filter((idx): idx is number => typeof idx === 'number');

      const nextSelectedSheets = previousSelectedSheets.length > 0
        ? previousSelectedSheets.filter((sheetIndex) => availableSheetIndexes.includes(sheetIndex))
        : dataSheetIndexes;
      setExcelUnderstandingSelectedSheets(nextSelectedSheets);
      addDebugLog('info', 'Excel sheet 对照加载成功', `共 ${sheets.length} 个 sheet，生成 ${nextPairs.length} 个对照组`);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : '读取 Excel sheet 失败';
      setError(message);
      addDebugLog('error', 'Excel sheet 对照加载失败', message);
    } finally {
      setLoading(false);
    }
  }, [addDebugLog, setExcelSheetPairs, setExcelUnderstandingSelectedSheets]);

  useEffect(() => {
    void loadWorkbookSheets();
  }, [loadWorkbookSheets]);

  const sheetPairs = useMemo(
    () => excelSheetPairs.filter((pair) => !pair.hidden),
    [excelSheetPairs]
  );

  const activeCompareCount = useMemo(
    () => sheetPairs.filter((pair) => pair.compare).length,
    [sheetPairs]
  );
  const understandingSelectedSet = useMemo(
    () => new Set(excelWorkbookUnderstanding.selectedSheetIndexes),
    [excelWorkbookUnderstanding.selectedSheetIndexes]
  );
  const understandingCacheKey = useMemo(
    () => buildUnderstandingCacheKey(workbookSheets, excelWorkbookUnderstanding.selectedSheetIndexes),
    [workbookSheets, excelWorkbookUnderstanding.selectedSheetIndexes]
  );
  const currentCacheEntry = useMemo(
    () => (hasSelectionInteraction && excelWorkbookUnderstanding.selectedSheetIndexes.length > 0
      ? loadExcelUnderstandingCache()[understandingCacheKey]
      : undefined),
    [hasSelectionInteraction, understandingCacheKey, excelWorkbookUnderstanding.selectedSheetIndexes.length]
  );

  useEffect(() => {
    if (workbookSheets.length === 0) {
      return;
    }

    if (!hasSelectionInteraction) {
      return;
    }

    const cachedEntry = loadExcelUnderstandingCache()[understandingCacheKey];
    if (cachedEntry) {
      setExcelWorkbookUnderstandingState({
        summary: cachedEntry.summary,
        promptRequestText: undefined,
        promptDebugSummary: undefined,
        rawAiResponse: undefined,
        error: null,
      });
      // 记录加载缓存的日志
      addDebugLog('info', 'Excel 文档理解 (命中缓存)', `【理解摘要】\n${cachedEntry.summary}`);
      return;
    }

    if (!excelWorkbookUnderstanding.isUnderstanding) {
      setExcelWorkbookUnderstandingState({
        summary: null,
        promptRequestText: undefined,
        promptDebugSummary: undefined,
        rawAiResponse: undefined,
        error: null,
      });
    }
  }, [
    workbookSheets,
    understandingCacheKey,
    hasSelectionInteraction,
    excelWorkbookUnderstanding.isUnderstanding,
    setExcelWorkbookUnderstandingState,
  ]);

  const handleUnderstandWorkbook = async () => {
    const selectedSheetIndexes = workbookSheets
      .map((sheet) => sheet.index)
      .filter((sheetIndex) => understandingSelectedSet.has(sheetIndex));

    if (selectedSheetIndexes.length === 0) {
      setExcelWorkbookUnderstandingState({
        error: {
          message: '请至少选择一个 sheet 作为文档理解对象',
          reason: 'no_sheet_selected',
        },
      });
      return;
    }

    setHasSelectionInteraction(true);
    setExcelWorkbookUnderstandingState({
      isUnderstanding: true,
      summary: null,
      promptRequestText: undefined,
      promptDebugSummary: undefined,
      rawAiResponse: undefined,
      error: null,
    });
    addDebugLog('info', '开始 Excel 文档理解', `sheet: ${selectedSheetIndexes.join(', ')}`);

    try {
      const result = await analyzeExcelWorkbookUnderstanding({
        apiBaseUrl,
        templateType: useAppStore.getState().templateConfig?.templateType || 'report',
        useMultiStage: false,
        analysisExecutor,
        thinking: analysisThinkingEnabled,
        aiOrchestratorBaseUrl,
        aiOrchestratorAuthToken,
        selectedSheetIndexes,
        configuredPairs: excelSheetPairs,
      });

      setExcelWorkbookUnderstandingState({
        isUnderstanding: false,
        summary: result.summary,
        promptRequestText: result.contextAnalysis?.promptRequestText
          ? String(result.contextAnalysis.promptRequestText)
          : undefined,
        promptDebugSummary: result.contextAnalysis?.promptDebugSummary
          ? String(result.contextAnalysis.promptDebugSummary)
          : undefined,
        rawAiResponse: result.contextAnalysis?.rawAiResponse
          ? String(result.contextAnalysis.rawAiResponse)
          : undefined,
        error: null,
      });
      saveExcelUnderstandingCacheEntry({
        cacheKey: understandingCacheKey,
        summary: result.summary,
        updatedAt: Date.now(),
      });
      addDebugLog('info', 'Excel 文档理解完成', 
        `【理解摘要】\n${result.summary}\n\n【发送给 AI 的请求原文】\n${result.contextAnalysis?.promptRequestText || '无'}\n\n【AI 原始返回】\n${result.contextAnalysis?.rawAiResponse || '无'}`
      );
    } catch (understandingError) {
      const errorMessage = understandingError instanceof Error ? understandingError.message : '文档理解失败';
      setExcelWorkbookUnderstandingState({
        isUnderstanding: false,
        error: {
          message: errorMessage,
          reason: 'understanding_failed',
        },
      });
      addDebugLog('error', 'Excel 文档理解失败', errorMessage);
    }
  };

  const handleSelectAllSheets = () => {
    setHasSelectionInteraction(true);
    const dataSheetIndexes = excelSheetPairs
      .filter((pair) => !pair.hidden)
      .map((pair) => pair.rightSheetIndex)
      .filter((sheetIndex): sheetIndex is number => typeof sheetIndex === 'number');
    setExcelUnderstandingSelectedSheets(dataSheetIndexes);
  };

  const handleClearSelectedSheets = () => {
    setHasSelectionInteraction(true);
    setExcelUnderstandingSelectedSheets([]);
  };

  return (
    <div className="excel-sheet-pairs-tab">
      <div className="excel-understanding-card">
        <div 
          className="excel-understanding-header"
          onClick={() => setUnderstandingCollapsed((value) => !value)}
        >
          <div>
            <h3>理解文档</h3>
            <p>选择要参与业务理解的 sheet，然后单独执行文档理解。</p>
          </div>
          <div className="excel-understanding-actions" onClick={(e) => e.stopPropagation()}>
            <button className="sheet-action-btn refresh-btn" onClick={() => { void loadWorkbookSheets(); }} disabled={loading}>
              {loading ? '加载中...' : '刷新'}
            </button>
            <button
              className="sheet-action-btn"
              onClick={handleSelectAllSheets}
              disabled={loading || workbookSheets.length === 0}
            >
              全选
            </button>
            <button
              className="sheet-action-btn"
              onClick={handleClearSelectedSheets}
              disabled={loading || workbookSheets.length === 0}
            >
              清空
            </button>
            <button
              className="sheet-action-btn sheet-action-btn-primary"
              onClick={() => { void handleUnderstandWorkbook(); }}
              disabled={loading || excelWorkbookUnderstanding.isUnderstanding}
            >
              {excelWorkbookUnderstanding.isUnderstanding ? '理解中...' : '理解'}
            </button>
          </div>
        </div>

        <div className="excel-sheet-pairs-summary">
          <span>对照组: {sheetPairs.length}</span>
          <span>参与比较: {activeCompareCount}</span>
          <span>已跳过: {sheetPairs.length - activeCompareCount}</span>
          <span>已选 sheet: {excelWorkbookUnderstanding.selectedSheetIndexes.length}</span>
          {hasSelectionInteraction && excelWorkbookUnderstanding.selectedSheetIndexes.length > 0 && (
            <span>{currentCacheEntry ? '缓存: 已命中' : '缓存: 未命中'}</span>
          )}
        </div>

        {!understandingCollapsed && (
          <div className="excel-understanding-sheet-list">
            {workbookSheets.map((sheet) => (
              <label key={sheet.index} className="excel-understanding-sheet-item">
                <input
                  type="checkbox"
                  checked={understandingSelectedSet.has(sheet.index)}
                  onChange={() => {
                    setHasSelectionInteraction(true);
                    toggleExcelUnderstandingSheet(sheet.index);
                  }}
                />
                <span>{sheet.name}</span>
              </label>
            ))}
          </div>
        )}

        {excelWorkbookUnderstanding.error?.message && (
          <div className="analysis-pair-result-error">❌ {excelWorkbookUnderstanding.error.message}</div>
        )}

        {excelWorkbookUnderstanding.summary && (
          <div className="verify-result success">
            <span className="verify-result-message">
              ✅ {currentCacheEntry ? '已加载缓存的文档理解结果' : '文档理解执行成功'}，详细内容已记录至运行日志。
            </span>
          </div>
        )}
      </div>

      {error && <div className="error-message">❌ {error}</div>}

      {!loading && sheetPairs.length === 0 && !error && (
        <div className="sheet-pair-empty-state">
          当前没有可展示的 sheet 对照组，请确认工作簿已包含模板 sheet 和真实数据 sheet。
        </div>
      )}

    </div>
  );
};

export default ExcelSheetPairsTab;
