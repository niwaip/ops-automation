/**
 * Office Addin - 状态管理 Store
 * 使用 Zustand 管理 AI 识别、模板配置等状态
 */

import { create } from 'zustand';

// AI 识别结果类型
export interface AISuggestion {
  id: string;
  type: 'variable' | 'loop' | 'format' | 'image' | 'table';
  elementPath: string;  // 格式化的位置显示，如【甲方名称： _ 乙方】
  suggestedName: string;
  originalText: string;
  confidence: number;
  applied: boolean;
  context?: string;  // 原文档上下文
  // 精确位置信息（用于替换和高亮）
  underlineInfo?: {
    paragraphIndex?: number;
    position?: { start: number; end: number };
    paragraphText?: string;
    underlineType?: string;
  };
  details?: {
    formatter?: string;
    loopType?: 'explicit' | 'implicit';
    arrayPath?: string;
    tableName?: string;
    slideIndex?: number;
    context?: string;
    chapter?: string;  // 所在章节信息（用于分组）
    significance?: string;  // 项目意义说明
    displayPosition?: string;  // 格式化的位置显示
    beforeBlank?: string;  // 空白前文本
    afterBlank?: string;  // 空白后文本
    fieldType?: string;  // 字段类型（text/date/number等）
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

// 调试日志条目
export interface DebugLogEntry {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  details?: string;  // 详细信息，如堆栈、响应数据等
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
  analysisErrorDetails: string | null;  // 详细错误信息
  setAnalyzing: (status: boolean) => void;
  setSuggestions: (suggestions: AISuggestion[]) => void;
  setAnalysisError: (error: string | null, details?: string | null) => void;

  // 应用建议
  applySuggestion: (id: string) => void;
  applyAllSuggestions: () => void;
  dismissSuggestion: (id: string) => void;
  updateSuggestionName: (id: string, newName: string) => void;  // 更新建议名称

  // 模板配置
  templateConfig: TemplateConfig;
  setTemplateConfig: (config: Partial<TemplateConfig>) => void;

  // 选择的单元格/元素
  selectedElements: Array<{ type: string; id: string; content: string }>;
  addSelectedElement: (element: { type: string; id: string; content: string }) => void;
  clearSelectedElements: () => void;

  // 后端 API 配置
  apiBaseUrl: string;
  setApiBaseUrl: (url: string) => void;

  // 调试日志
  debugLogs: DebugLogEntry[];
  addDebugLog: (level: DebugLogEntry['level'], message: string, details?: string) => void;
  clearDebugLogs: () => void;
  showDebugPanel: boolean;
  setShowDebugPanel: (show: boolean) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  officeType: 'word',
  setOfficeType: (type) => set({ officeType: type }),

  isAnalyzing: false,
  suggestions: [],
  analysisError: null,
  analysisErrorDetails: null,
  setAnalyzing: (status) => set({ isAnalyzing: status }),
  setSuggestions: (suggestions) => set({ suggestions }),
  setAnalysisError: (error, details) => set({ analysisError: error, analysisErrorDetails: details }),

  applySuggestion: (id) => {
    set((state) => ({
      suggestions: state.suggestions.map((s) =>
        s.id === id ? { ...s, applied: true } : s
      ),
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

  selectedElements: [],
  addSelectedElement: (element) =>
    set((state) => ({
      selectedElements: [...state.selectedElements, element],
    })),
  clearSelectedElements: () => set({ selectedElements: [] }),

  apiBaseUrl: 'https://192.168.100.143:3443',  // HTTPS代理端口（Office插件必须使用HTTPS）
  setApiBaseUrl: (url) => set({ apiBaseUrl: url }),

  // 调试日志功能
  debugLogs: [],
  addDebugLog: (level, message, details) => {
    const entry: DebugLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      level,
      message,
      details,
    };
    set((state) => ({
      debugLogs: [...state.debugLogs.slice(-99), entry],  // 最多保留100条
    }));
    // 同时输出到控制台
    const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : level === 'debug' ? 'debug' : 'log';
    console[consoleMethod](`[${level.toUpperCase()}] ${message}`, details || '');
  },
  clearDebugLogs: () => set({ debugLogs: [] }),
  showDebugPanel: false,
  setShowDebugPanel: (show) => set({ showDebugPanel: show }),
}));