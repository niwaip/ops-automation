import { apiClient } from '@/shared/api/http/client';

export interface BranchStepSpec {
  readSelectors: string[];
  readMethod: 'innerText' | 'textContent' | 'value';
  outputVar: string;
  conditionFn: string;
  takeoverReason: string;
  onMismatch: 'takeover' | 'stop' | 'continue';
  onMatch: 'continue' | 'stop';
  description: string;
}

export interface AnalyzeBranchConditionRequest {
  runtimeSessionId: string;
  userIntent: string;
  onMismatch?: 'takeover' | 'stop' | 'continue';
}

export interface AnalyzeBranchConditionResponse {
  branchStepSpec: BranchStepSpec;
  analysisSource: 'llm' | 'fallback';
  pageContext?: {
    pageUrl?: string;
    pageTitle?: string;
  };
}

export const branchAnalysisApi = {
  analyze: async (
    payload: AnalyzeBranchConditionRequest
  ): Promise<AnalyzeBranchConditionResponse> => {
    const response = await apiClient.post<AnalyzeBranchConditionResponse>(
      '/ai/analyze-branch-condition',
      payload
    );
    return response as AnalyzeBranchConditionResponse;
  },
};
