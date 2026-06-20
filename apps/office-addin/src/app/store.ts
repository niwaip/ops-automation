/**
 * Office Addin - 状态管理 Store
 * 使用 Zustand 管理 AI 识别、模板配置等状态
 */

import { create } from 'zustand';
import { officeAddinRuntimeConfig } from '../config/runtime';
import { getDefaultTemplateFormatForHost } from '../shared/utils/host-storage';

// AI 识别结果类型
export interface AISuggestion {
  id: string;
  type: 'variable' | 'loop' | 'format' | 'image' | 'table';
  elementPath: string; // 格式化的位置显示，如【甲方名称： _ 乙方】
  suggestedName: string;
  originalText: string;
  confidence: number;
  applied: boolean;
  context?: string; // 原文档上下文
  // 精确位置信息（用于替换和高亮）
  underlineInfo?: {
    paragraphIndex?: number;
    position?: { start: number; end: number };
    paragraphText?: string;
    underlineType?: string;
  };
  details?: {
    source?: 'ai' | 'heuristic' | 'manual' | 'ai+heuristic';
    description?: string;
    sampleValue?: string;
    formatter?: string;
    loopType?: 'explicit' | 'implicit';
    arrayPath?: string;
    tableName?: string;
    columnMappings?: Array<{
      headerName: string;
      variablePath: string;
      sampleValue?: string;
      columnIndex?: number;
    }>;
    slideIndex?: number;
    context?: string;
    chapter?: string; // 所在章节信息（用于分组）
    significance?: string; // 项目意义说明
    displayPosition?: string; // 格式化的位置显示
    beforeBlank?: string; // 空白前文本
    afterBlank?: string; // 空白后文本
    fieldType?: string; // 字段类型（text/date/number等）
    policy?: string;
    riskLevel?: 'low' | 'medium' | 'high';
    needsReview?: boolean;
    termMatchStatus?: 'matched' | 'unmatched';
    termMatchTermId?: string;
    candidateId?: string;
    peerCandidateId?: string;
    currentLanguageHint?: 'zh' | 'ja' | 'en' | 'mixed' | 'unknown';
    pairOrdinal?: number;
    wordAnchor?: {
      type: 'content-control' | 'table-cell' | 'text-range';
      contentControlId?: number;
      tableIndex?: number;
      rowIndex?: number;
      cellIndex?: number;
      paragraphIndex?: number;
      start?: number;
      end?: number;
      paragraphText?: string;
    };
    excelAnchor?: {
      type: 'cell' | 'table';
      sheetName: string;
      sheetIndex?: number;
      pairIndex?: number;
      address?: string;
      rowIndex?: number;
      colIndex?: number;
      tableName?: string;
      startAddress?: string;
      endAddress?: string;
      dataStartRowIndex?: number;
      dataEndRowIndex?: number;
    };
  };
}

// 模板配置
export interface TemplateConfig {
  templateType: string;
  outputPath: string;
  formatType: 'docx' | 'xlsx' | 'pptx' | 'pdf';
  variables: Record<string, string>;
  loops: Array<{
    arrayPath: string;
    loopType: 'explicit' | 'implicit';
  }>;
}

// Office 应用类型
export type OfficeAppType = 'word' | 'excel' | 'ppt';
export type AnalysisExecutorType = 'studio' | 'chat';

// 统一流程诊断日志条目，旧的 Debug 命名保留为兼容别名。
export interface FlowLogEntry {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  details?: string; // 详细信息，如堆栈、响应数据等
}

export type DebugLogEntry = FlowLogEntry;

export interface ExcelSheetPairState {
  id: string;
  pairIndex: number;
  compare: boolean;
  hidden?: boolean;
  leftSheetName?: string;
  leftSheetIndex?: number;
  rightSheetName?: string;
  rightSheetIndex?: number;
}

export interface ExcelWorkbookUnderstandingState {
  selectedSheetIndexes: number[];
  isUnderstanding: boolean;
  summary: string | null;
  promptRequestText?: string;
  promptDebugSummary?: string;
  rawAiResponse?: string;
  error?: {
    message?: string;
    reason?: string;
    url?: string;
    status?: number;
  } | null;
}

// 主状态
interface AppState {
  // Office 类型
  officeType: OfficeAppType;
  setOfficeType: (type: OfficeAppType) => void;

  // AI 分析状态
  isAnalyzing: boolean;
  suggestions: AISuggestion[];
  analysisError: string | null;
  analysisErrorDetails: string | null; // 详细错误信息
  setAnalyzing: (status: boolean) => void;
  setSuggestions: (suggestions: AISuggestion[]) => void;
  setAnalysisError: (error: string | null, details?: string | null) => void;

  // 应用建议
  applySuggestion: (id: string) => void;
  applyAllSuggestions: () => void;
  dismissSuggestion: (id: string) => void;
  updateSuggestionName: (id: string, newName: string) => void; // 更新建议名称
  updateSuggestionDetails: (
    id: string,
    details: Partial<NonNullable<AISuggestion['details']>>
  ) => void;

  // 模板配置
  templateConfig: TemplateConfig;
  setTemplateConfig: (config: Partial<TemplateConfig>) => void;

  // Excel sheet 对照组状态
  excelSheetPairs: ExcelSheetPairState[];
  setExcelSheetPairs: (pairs: ExcelSheetPairState[]) => void;
  toggleExcelSheetPairCompare: (id: string) => void;
  removeExcelSheetPair: (id: string) => void;
  excelWorkbookUnderstanding: ExcelWorkbookUnderstandingState;
  setExcelUnderstandingSelectedSheets: (sheetIndexes: number[]) => void;
  toggleExcelUnderstandingSheet: (sheetIndex: number) => void;
  setExcelWorkbookUnderstandingState: (state: Partial<ExcelWorkbookUnderstandingState>) => void;
  resetExcelWorkbookUnderstanding: () => void;

  // 选择的单元格/元素
  selectedElements: Array<{ type: string; id: string; content: string }>;
  addSelectedElement: (element: { type: string; id: string; content: string }) => void;
  clearSelectedElements: () => void;

  // 后端 API 配置
  apiBaseUrl: string;
  setApiBaseUrl: (url: string) => void;
  aiOrchestratorBaseUrl: string;
  setAiOrchestratorBaseUrl: (url: string) => void;
  analysisExecutor: AnalysisExecutorType;
  setAnalysisExecutor: (executor: AnalysisExecutorType) => void;
  analysisThinkingEnabled: boolean;
  setAnalysisThinkingEnabled: (enabled: boolean) => void;
  aiOrchestratorAuthToken: string;
  setAiOrchestratorAuthToken: (token: string) => void;

  // 统一流程诊断日志
  flowLogs: FlowLogEntry[];
  addFlowLog: (level: FlowLogEntry['level'], message: string, details?: string) => void;
  clearFlowLogs: () => void;
  showFlowDiagnosticsPanel: boolean;
  setShowFlowDiagnosticsPanel: (show: boolean) => void;

  // 旧调试命名，保留兼容
  debugLogs: DebugLogEntry[];
  addDebugLog: (level: DebugLogEntry['level'], message: string, details?: string) => void;
  clearDebugLogs: () => void;
  showDebugPanel: boolean;
  setShowDebugPanel: (show: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  officeType: 'word',
  setOfficeType: (type) =>
    set((state) => ({
      officeType: type,
      templateConfig: {
        ...state.templateConfig,
        formatType: getDefaultTemplateFormatForHost(type),
      },
    })),

  isAnalyzing: false,
  suggestions: [],
  analysisError: null,
  analysisErrorDetails: null,
  setAnalyzing: (status) => set({ isAnalyzing: status }),
  setSuggestions: (suggestions) => set({ suggestions }),
  setAnalysisError: (error, details) =>
    set({ analysisError: error, analysisErrorDetails: details }),

  applySuggestion: (id) => {
    set((state) => ({
      suggestions: state.suggestions.map((s) => (s.id === id ? { ...s, applied: true } : s)),
    }));
  },

  applyAllSuggestions: () => {
    set((state) => ({
      suggestions: state.suggestions.map((s) => ({ ...s, applied: true })),
    }));
  },

  dismissSuggestion: (id) => {
    set((state) => ({
      suggestions: state.suggestions.filter((s) => s.id !== id),
    }));
  },

  updateSuggestionName: (id, newName) => {
    set((state) => ({
      suggestions: state.suggestions.map((s) =>
        s.id === id ? { ...s, suggestedName: newName } : s
      ),
    }));
  },

  updateSuggestionDetails: (id, details) => {
    set((state) => ({
      suggestions: state.suggestions.map((s) =>
        s.id === id
          ? {
              ...s,
              details: {
                ...s.details,
                ...details,
              },
            }
          : s
      ),
    }));
  },

  templateConfig: {
    templateType: 'report',
    outputPath: '',
    formatType: 'docx',
    variables: {},
    loops: [],
  },
  setTemplateConfig: (config) =>
    set((state) => ({
      templateConfig: { ...state.templateConfig, ...config },
    })),

  excelSheetPairs: [],
  setExcelSheetPairs: (pairs) => set({ excelSheetPairs: pairs }),
  toggleExcelSheetPairCompare: (id) =>
    set((state) => ({
      excelSheetPairs: state.excelSheetPairs.map((pair) =>
        pair.id === id ? { ...pair, compare: !pair.compare } : pair
      ),
    })),
  removeExcelSheetPair: (id) =>
    set((state) => ({
      excelSheetPairs: state.excelSheetPairs.map((pair) =>
        pair.id === id ? { ...pair, hidden: true, compare: false } : pair
      ),
    })),

  excelWorkbookUnderstanding: {
    selectedSheetIndexes: [],
    isUnderstanding: false,
    summary: null,
    promptRequestText: undefined,
    promptDebugSummary: undefined,
    rawAiResponse: undefined,
    error: null,
  },
  setExcelUnderstandingSelectedSheets: (selectedSheetIndexes) =>
    set((state) => ({
      excelWorkbookUnderstanding: {
        ...state.excelWorkbookUnderstanding,
        selectedSheetIndexes,
      },
    })),
  toggleExcelUnderstandingSheet: (sheetIndex) =>
    set((state) => {
      const selected = state.excelWorkbookUnderstanding.selectedSheetIndexes;
      const nextSelected = selected.includes(sheetIndex)
        ? selected.filter((value) => value !== sheetIndex)
        : [...selected, sheetIndex].sort((a, b) => a - b);

      return {
        excelWorkbookUnderstanding: {
          ...state.excelWorkbookUnderstanding,
          selectedSheetIndexes: nextSelected,
        },
      };
    }),
  setExcelWorkbookUnderstandingState: (nextState) =>
    set((state) => ({
      excelWorkbookUnderstanding: {
        ...state.excelWorkbookUnderstanding,
        ...nextState,
      },
    })),
  resetExcelWorkbookUnderstanding: () =>
    set((state) => ({
      excelWorkbookUnderstanding: {
        ...state.excelWorkbookUnderstanding,
        isUnderstanding: false,
        summary: null,
        promptRequestText: undefined,
        promptDebugSummary: undefined,
        rawAiResponse: undefined,
        error: null,
      },
    })),

  selectedElements: [],
  addSelectedElement: (element) =>
    set((state) => ({
      selectedElements: [...state.selectedElements, element],
    })),
  clearSelectedElements: () => set({ selectedElements: [] }),

  apiBaseUrl: officeAddinRuntimeConfig.apiBaseUrl,
  setApiBaseUrl: (url) => set({ apiBaseUrl: url }),
  aiOrchestratorBaseUrl: officeAddinRuntimeConfig.aiOrchestratorBaseUrl,
  setAiOrchestratorBaseUrl: (url) => set({ aiOrchestratorBaseUrl: url }),
  analysisExecutor: 'studio',
  setAnalysisExecutor: (analysisExecutor) => set({ analysisExecutor }),
  analysisThinkingEnabled: true,
  setAnalysisThinkingEnabled: (analysisThinkingEnabled) => set({ analysisThinkingEnabled }),
  aiOrchestratorAuthToken: '',
  setAiOrchestratorAuthToken: (aiOrchestratorAuthToken) => set({ aiOrchestratorAuthToken }),

  // 调试日志功能
  flowLogs: [],
  addFlowLog: (level, message, details) => {
    const entry: FlowLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      timestamp: new Date(),
      level,
      message,
      details,
    };
    set((state) => ({
      flowLogs: [...state.flowLogs.slice(-99), entry], // 最多保留100条
      debugLogs: [...state.debugLogs.slice(-99), entry], // 最多保留100条
    }));
    // 同时输出到控制台
    const consoleMethod =
      level === 'error' ? 'error' : level === 'warn' ? 'warn' : level === 'debug' ? 'debug' : 'log';
    console[consoleMethod](`[${level.toUpperCase()}] ${message}`, details || '');
  },
  clearFlowLogs: () => set({ flowLogs: [], debugLogs: [] }),
  showFlowDiagnosticsPanel: false,
  setShowFlowDiagnosticsPanel: (show) =>
    set({ showFlowDiagnosticsPanel: show, showDebugPanel: show }),
  debugLogs: [],
  addDebugLog: (level, message, details) =>
    useAppStore.getState().addFlowLog(level, message, details),
  clearDebugLogs: () => useAppStore.getState().clearFlowLogs(),
  showDebugPanel: false,
  setShowDebugPanel: (show) => useAppStore.getState().setShowFlowDiagnosticsPanel(show),
}));
