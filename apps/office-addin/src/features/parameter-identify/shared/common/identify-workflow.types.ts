import type {
  AISuggestion,
  AnalysisExecutorType,
  ExcelSheetPairState,
  ExcelWorkbookUnderstandingState,
} from '../../../../app/store';
import type { AnalysisSummary } from '../AIIdentifyPanel.helpers';

export type IdentifyDebugLevel = 'info' | 'warn' | 'error' | 'debug';

export interface IdentifyWorkflowResult {
  analysisSummary: AnalysisSummary | null;
  stagedSuggestions: AISuggestion[];
  handleAnalyze: (options?: { commitSuggestions?: boolean }) => Promise<void>;
  handleAnalyzePair: (pairId: string) => Promise<void>;
  handleCommitStagedSuggestions: () => boolean;
  handleClearStagedSuggestions: () => void;
  collapsedSuggestionGroups: Record<string, boolean>;
  collapsedPairDetails: Record<string, boolean>;
  togglePairDetailsCollapse: (pairIndex: number) => void;
  toggleSuggestionGroupCollapse: (groupName: string) => void;
}

export interface IdentifyWorkflowBaseOptions {
  hostAdapter: any;
  suggestions: AISuggestion[];
  setSuggestions: (suggestions: AISuggestion[]) => void;
  setAnalysisError: (error: string | null, details?: string | null) => void;
  setShowErrorDetails: (show: boolean) => void;
  setAnalyzing: (status: boolean) => void;
  addDebugLog: (level: IdentifyDebugLevel, message: string, details?: string) => void;
  apiBaseUrl: string;
  aiOrchestratorBaseUrl: string;
  aiOrchestratorAuthToken: string;
  analysisExecutor: AnalysisExecutorType;
  analysisThinkingEnabled: boolean;
  aiSkillGuide: any;
  selectedTemplateType: string;
  useMultiStage: boolean;
}

export interface WordIdentifyWorkflowOptions extends IdentifyWorkflowBaseOptions {}

export interface ExcelIdentifyWorkflowOptions extends IdentifyWorkflowBaseOptions {
  excelSheetPairs: ExcelSheetPairState[];
  setExcelSheetPairs: (pairs: ExcelSheetPairState[]) => void;
  excelWorkbookUnderstanding: ExcelWorkbookUnderstandingState;
}
