import { DocumentIR } from '../../../../../host/adapters/document-ir';
import { AISuggestion } from '../../../../../app/store';
import { AnalysisExecutorKind } from '../../analysis-executor';

export interface ExcelGlobalUnderstandingCache {
  summary: string;
  promptRequestText?: string;
  promptDebugSummary?: string;
  rawAiResponse?: string;
}

export interface AnalyzeDocumentOptions {
  apiBaseUrl: string;
  templateType: string;
  useMultiStage: boolean;
  analysisExecutor?: AnalysisExecutorKind;
  thinking?: boolean;
  aiOrchestratorBaseUrl?: string;
  aiOrchestratorAuthToken?: string;
  skill?: any;
  excelGlobalUnderstandingCache?: ExcelGlobalUnderstandingCache;
}

export interface AnalyzeDocumentResult {
  documentIR: DocumentIR;
  suggestions: AISuggestion[];
  templateConfig?: any;
  contextAnalysis?: Record<string, unknown>;
}

export interface AnalyzeResponse {
  suggestions: AISuggestion[];
  rawSuggestions?: AISuggestion[];
  templateConfig?: any;
  contextAnalysis?: Record<string, unknown>;
}
