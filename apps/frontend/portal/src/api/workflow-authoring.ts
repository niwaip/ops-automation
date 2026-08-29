import apiClient from '@/shared/api/http/client';

export interface FailedTestQueryFeedback {
  query: string;
  decision?: 'no_match' | 'matched';
  confidence?: number;
  reason?: string;
  executionError?: string;
}

export interface OptimizeDescriptionRequest {
  name: string;
  description?: string;
  inputParams?: Record<string, unknown> | Array<Record<string, unknown>>;
  outputParams?: Record<string, unknown> | Array<Record<string, unknown>>;
  stepsSummary?: string[] | string;
  modelId?: string;
  previousFailures?: FailedTestQueryFeedback[];
}

export interface OptimizeDescriptionResponse {
  optimizedDescription: string;
  keyPoints: string[];
  suggestedTriggerKeywords: string[];
  sampleQueries: {
    singleStep: string[];
    multiStep: string[];
  };
  addressedFailures?: string[];
}

export interface CandidateSkillInput {
  id?: string;
  name: string;
  description: string;
  inputParams?: Record<string, unknown> | Array<Record<string, unknown>>;
  outputParams?: Record<string, unknown> | Array<Record<string, unknown>>;
}

export interface TestPlannerMatchingRequest {
  candidateSkill: CandidateSkillInput;
  testQueries?: string[];
  includeDefaultCombos?: boolean;
}

export interface PlannedNodeInfo {
  ref: string;
  capabilityKey: string;
  displayName: string;
  kind: 'skill' | 'llm_operation';
  dependsOn: string[];
  boundParams?: Record<string, unknown>;
}

export interface TestPlannerMatchingResultItem {
  query: string;
  queryType: 'single_step' | 'multi_step' | 'custom';
  decision: 'matched' | 'no_match';
  confidence: number;
  reason: string;
  plannedNodes?: PlannedNodeInfo[];
  executionError?: string;
}

export interface TestPlannerMatchingResponse {
  results: TestPlannerMatchingResultItem[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
  };
}

export const workflowAuthoringApi = {
  optimizeDescription: async (
    payload: OptimizeDescriptionRequest
  ): Promise<OptimizeDescriptionResponse> => {
    return apiClient.post<OptimizeDescriptionResponse>(
      '/ai/workflow-authoring/optimize-description',
      payload,
      { timeout: 120000 }
    );
  },

  testPlannerMatching: async (
    payload: TestPlannerMatchingRequest
  ): Promise<TestPlannerMatchingResponse> => {
    return apiClient.post<TestPlannerMatchingResponse>(
      '/ai/workflow-authoring/test-planner-matching',
      payload,
      { timeout: 120000 }
    );
  },
};
