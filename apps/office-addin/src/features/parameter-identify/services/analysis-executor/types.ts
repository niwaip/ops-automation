import { DocumentIR, HostType } from '../../../../host/adapters/document-ir';

export type AnalysisExecutorKind = 'studio' | 'chat';

export type AnalysisStage =
  | 'general'
  | 'excel-global-understanding'
  | 'excel-pair-analysis'
  | 'word-section-analysis';

export interface WordSectionPromptCandidate {
  candidateId: string;
  sourceBlockId?: string;
  anchorText: string;
  parameterSlot?: string;
  sampleValue?: string;
  fieldIdHint?: string;
  fieldTypeHint?: string;
  generationPolicyHint?: string;
  language?: 'zh' | 'ja' | 'en' | 'mixed' | 'unknown';
  paragraphIndex?: number;
  candidateType?: 'variable' | 'loop_column';
  loopGroupKey?: string;
  tableIndex?: number;
  rowIndex?: number;
  cellIndex?: number;
}

export interface WordSectionPromptBilingualGroup {
  groupKey: string;
  pairType: 'candidate_pair';
  zhCandidateIds: string[];
  jpCandidateIds: string[];
}

export interface WordSectionPromptAcceptedSuggestion {
  candidateId: string;
  suggestedName: string;
  type: 'variable' | 'loop' | 'format' | 'image' | 'table';
  fieldType?: string;
  confidence?: number;
}

export interface StructuredAnalyzeRequest {
  host: HostType;
  documentIR: DocumentIR;
  documentContent: string;
  documentType: 'docx' | 'xlsx' | 'pptx';
  templateType: string;
  skill?: any;
  context?: string;
  underlineInfo?: Array<Record<string, unknown>>;
  paragraphFormats?: Array<Record<string, unknown>>;
  analysisStage?: AnalysisStage;
  pairLabel?: string;
  globalUnderstandingSummary?: string;
  diffSummary?: string;
  diffOverview?: string;
  candidateFieldList?: string;
  bilingualCandidatePairs?: string;
  wordSectionCandidates?: WordSectionPromptCandidate[];
  wordSectionBilingualGroups?: WordSectionPromptBilingualGroup[];
  wordSectionAcceptedSuggestions?: WordSectionPromptAcceptedSuggestion[];
  wordSectionRoundIndex?: number;
  wordSectionMaxRounds?: number;
  chatSessionId?: string;
}

export class ChatAnalysisError extends Error {
  constructor(
    message: string,
    public readonly details: {
      stage?: AnalysisStage;
      pairLabel?: string;
      url?: string;
      status?: number;
      reason: string;
    }
  ) {
    super(message);
    this.name = 'ChatAnalysisError';
  }
}

export interface StructuredAnalysisExecutor {
  kind: AnalysisExecutorKind;
  requestedKind: AnalysisExecutorKind;
  supportsThinking: boolean;
  fallbackReason?: string;
  analyze(request: StructuredAnalyzeRequest): Promise<any>;
}

export interface ResolveAnalysisExecutorOptions {
  apiBaseUrl: string;
  useMultiStage: boolean;
  requestedKind?: AnalysisExecutorKind;
  thinking?: boolean;
  aiOrchestratorBaseUrl?: string;
  aiOrchestratorAuthToken?: string;
}
