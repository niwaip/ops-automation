/**
 * Office Addin - 状态管理 Store
 * 使用 Zustand 管理 AI 识别、模板配置等状态
 */

import { create } from 'zustand';

// AI 识别结果类型
export interface AISuggestion {
  id: string;
  type: 'variable' | 'loop' | 'format' | 'image' | 'table';
  elementPath: string;
  suggestedName: string;
  originalText: string;
  confidence: number;
  applied: boolean;
  details?: {
    formatter?: string;
    loopType?: 'explicit' | 'implicit';
    arrayPath?: string;
    tableName?: string;
    slideIndex?: number;
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

// 主状态
interface AppState {
  // Office 类型
  officeType: OfficeAppType;
  setOfficeType: (type: OfficeAppType) => void;

  // AI 分析状态
  isAnalyzing: boolean;
  suggestions: AISuggestion[];
  analysisError: string | null;
  setAnalyzing: (status: boolean) => void;
  setSuggestions: (suggestions: AISuggestion[]) => void;
  setAnalysisError: (error: string | null) => void;

  // 应用建议
  applySuggestion: (id: string) => void;
  applyAllSuggestions: () => void;
  dismissSuggestion: (id: string) => void;

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
}

export const useAppStore = create<AppState>((set, get) => ({
  officeType: 'word',
  setOfficeType: (type) => set({ officeType: type }),

  isAnalyzing: false,
  suggestions: [],
  analysisError: null,
  setAnalyzing: (status) => set({ isAnalyzing: status }),
  setSuggestions: (suggestions) => set({ suggestions }),
  setAnalysisError: (error) => set({ analysisError: error }),

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

  apiBaseUrl: (import.meta.env.VITE_API_URL as string) || 'http://localhost:3100',
  setApiBaseUrl: (url) => set({ apiBaseUrl: url }),
}));