export interface FailedTestQueryFeedback {
  query: string;
  decision?: 'no_match' | 'matched';
  confidence?: number;
  reason?: string;
  executionError?: string;
}

export interface OptimizeDescriptionRequestDto {
  name: string;
  description?: string;
  inputParams?: Record<string, unknown> | Array<Record<string, unknown>>;
  outputParams?: Record<string, unknown> | Array<Record<string, unknown>>;
  stepsSummary?: string[] | string;
  modelId?: string;
  previousFailures?: FailedTestQueryFeedback[];
}

export interface OptimizeDescriptionResponseDto {
  optimizedDescription: string;
  keyPoints: string[];
  suggestedTriggerKeywords: string[];
  sampleQueries: {
    singleStep: string[];
    multiStep: string[];
  };
  addressedFailures?: string[];
}

export interface CandidateSkillInputDto {
  id?: string;
  name: string;
  description: string;
  inputParams?: Record<string, unknown> | Array<Record<string, unknown>>;
  outputParams?: Record<string, unknown> | Array<Record<string, unknown>>;
}

export interface TestPlannerMatchingRequestDto {
  candidateSkill: CandidateSkillInputDto;
  testQueries?: string[];
  includeDefaultCombos?: boolean;
  authToken?: string;
}

export interface TestPlannerMatchingResultItem {
  query: string;
  queryType: 'single_step' | 'multi_step' | 'custom';
  decision: 'matched' | 'no_match';
  confidence: number;
  reason: string;
  plannedNodes?: Array<{
    ref: string;
    capabilityKey: string;
    displayName: string;
    kind: 'skill' | 'llm_operation';
    dependsOn: string[];
    boundParams?: Record<string, unknown>;
  }>;
  executionError?: string;
}

export interface TestPlannerMatchingResponseDto {
  results: TestPlannerMatchingResultItem[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
  };
}
