import { apiClient } from './client';

export type SemanticRuleSetStatus =
  | 'DRAFT'
  | 'VALIDATING'
  | 'CANARY'
  | 'ACTIVE'
  | 'ARCHIVED'
  | 'ROLLED_BACK';

export type SemanticRuleCategory =
  | 'LOGIN'
  | 'NAVIGATION'
  | 'FIELD_FILL'
  | 'MENU_SELECTION'
  | 'DETAIL_OPEN'
  | 'READ_VALUE'
  | 'ROW_ACTION'
  | 'SEARCH'
  | 'GENERIC_ALIAS';

export interface SemanticRuleDomain {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SemanticRule {
  id: string;
  ruleSetId: string;
  type: string;
  category?: SemanticRuleCategory;
  name: string;
  enabled: boolean;
  priority: number;
  stopOnMatch: boolean;
  flags?: string | null;
  patterns?: unknown;
  outputs?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface SemanticRuleTargeting {
  id: string;
  ruleSetId: string;
  environments?: unknown;
  hosts?: unknown;
  tenantIds?: unknown;
  userIds?: unknown;
  skillIds?: unknown;
  pageTypes?: unknown;
  sampleRate?: number | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SemanticRuleSet {
  id: string;
  domainId: string;
  key: string;
  name: string;
  version: string;
  status: SemanticRuleSetStatus;
  description?: string | null;
  basedOnRuleSetId?: string | null;
  changeSummary?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  activatedAt?: string | null;
  archivedAt?: string | null;
  domain?: SemanticRuleDomain;
  rules: SemanticRule[];
  targetings?: SemanticRuleTargeting[];
}

export interface ListSemanticRuleSetsParams {
  domain_code?: string;
  status?: SemanticRuleSetStatus;
  key?: string;
}

export interface SemanticRuleHitLog {
  id: string;
  domainId: string;
  ruleSetId?: string | null;
  matchedRuleIds: string[];
  inputText: string;
  normalizedInput?: string | null;
  pageUrl?: string | null;
  pageTitle?: string | null;
  pageType?: string | null;
  observationSummary?: string | null;
  availableCandidateIds?: unknown;
  normalizedSemantic?: Record<string, unknown> | null;
  parserOutput?: Record<string, unknown> | null;
  usedAiFallback: boolean;
  finalExecutionSuccess?: boolean | null;
  failureReason?: string | null;
  traceId?: string | null;
  createdAt: string;
}

export interface ListSemanticRuleHitLogsParams {
  domain_code?: string;
  rule_set_id?: string;
  trace_id?: string;
}

export interface SemanticRuleErrorLog {
  id: string;
  domainId: string;
  ruleSetId?: string | null;
  source: string;
  errorType: string;
  errorCode?: string | null;
  errorMessage: string;
  inputText?: string | null;
  normalizedInput?: string | null;
  traceId?: string | null;
  sessionId?: string | null;
  taskId?: string | null;
  stepId?: string | null;
  pageUrl?: string | null;
  pageTitle?: string | null;
  host?: string | null;
  pageType?: string | null;
  observationSummary?: string | null;
  candidateSummary?: Record<string, unknown> | null;
  matchedRuleIds?: string[] | null;
  normalizedSemantic?: Record<string, unknown> | null;
  parserOutput?: Record<string, unknown> | null;
  aiFallbackInput?: Record<string, unknown> | null;
  aiFallbackOutput?: Record<string, unknown> | null;
  screenshotUrl?: string | null;
  domSnippet?: string | null;
  locatorInfo?: Record<string, unknown> | null;
  consoleErrors?: string[] | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface ListSemanticRuleErrorLogsParams {
  domain_code?: string;
  rule_set_id?: string;
  trace_id?: string;
  source?: string;
  error_type?: string;
  host?: string;
  page_type?: string;
}

export interface CreateSemanticRulePayload {
  type:
    | 'INTENT_ALIAS'
    | 'FIELD_ALIAS'
    | 'REGION_ALIAS'
    | 'ENTITY_ALIAS'
    | 'ROW_REFERENCE'
    | 'READ_INTENT'
    | 'LOGIN_PHRASE';
  category?: SemanticRuleCategory;
  name: string;
  enabled?: boolean;
  priority: number;
  stop_on_match?: boolean;
  flags?: string;
  patterns: string[];
  outputs: Record<string, unknown>;
}

export interface CreateSemanticRuleTargetingPayload {
  environments?: string[];
  hosts?: string[];
  tenant_ids?: string[];
  user_ids?: string[];
  skill_ids?: string[];
  page_types?: string[];
  sample_rate?: number;
  enabled?: boolean;
}

export interface CreateSemanticRuleSetPayload {
  domain_code: string;
  key: string;
  name: string;
  version?: string;
  description?: string;
  based_on_rule_set_id?: string;
  change_summary?: string;
  created_by: string;
  rules: CreateSemanticRulePayload[];
  targetings?: CreateSemanticRuleTargetingPayload[];
}

export interface UpdateSemanticRuleSetPayload {
  name?: string;
  version?: string;
  description?: string;
  rules?: CreateSemanticRulePayload[];
  targetings?: CreateSemanticRuleTargetingPayload[];
}

export interface ReplaceSemanticRuleCategoryPayload {
  rules: CreateSemanticRulePayload[];
}

export interface RollbackSemanticRuleSetPayload {
  target_rule_set_id: string;
  reason: string;
}

export interface SemanticRuleValidationResult {
  valid: boolean;
  rule_set_id: string;
  rule_count: number;
  category_count: number;
  validated_at: string;
  errors: string[];
  warnings: string[];
}

export interface SemanticRuleReleaseRecord {
  id: string;
  ruleSetId: string;
  releaseMode: 'MANUAL' | 'ROLLBACK' | string;
  fromStatus: string;
  toStatus: string;
  releasedBy: string;
  releaseNote?: string | null;
  targeting?: unknown;
  triggeredAt: string;
  effectiveAt?: string | null;
  previousActiveRuleSetId?: string | null;
  ruleSet?: SemanticRuleSet;
}

export interface ListSemanticRuleReleasesParams {
  rule_set_id?: string;
  domain_code?: string;
  key?: string;
}

export interface GenerateSemanticRuleSetDraftPayload {
  domain_code: string;
  category?: SemanticRuleCategory;
  error_log_ids?: string[];
  rule_set_id?: string;
  trace_id?: string;
  source?: string;
  error_type?: string;
  host?: string;
  page_type?: string;
  max_logs?: number;
  created_by?: string;
}

export interface SemanticRuleGenerationDraftSummary {
  domain_code: string;
  sample_count: number;
  rule_count: number;
  source_count: number;
  error_type_count: number;
  host_count: number;
  page_type_count: number;
  source_error_log_ids: string[];
}

export interface SemanticRuleGenerationSourceErrorLog {
  id: string;
  created_at: string;
  source: string;
  error_type: string;
  error_message: string;
  input_text?: string | null;
  normalized_input?: string | null;
  trace_id?: string | null;
  host?: string | null;
  page_type?: string | null;
}

export interface SemanticRuleGenerationDraftRuleSet {
  domain_code: string;
  key: string;
  name: string;
  version: string;
  description?: string;
  created_by: string;
  rules: CreateSemanticRulePayload[];
  targetings: CreateSemanticRuleTargetingPayload[];
}

export interface GenerateSemanticRuleSetDraftResponse {
  generated: boolean;
  reason?: string;
  generation_trace_id: string;
  summary: SemanticRuleGenerationDraftSummary;
  draft_rule_set: SemanticRuleGenerationDraftRuleSet;
  explanations: string[];
  risks: string[];
  source_error_logs: SemanticRuleGenerationSourceErrorLog[];
  generation_metadata: Record<string, unknown>;
}

export interface CommitSemanticRuleSetDraftPayload {
  generation_trace_id: string;
  draft_rule_set: CreateSemanticRuleSetPayload;
  based_on_rule_set_id?: string;
  source_error_log_ids?: string[];
  review_notes?: string[];
}

export interface CommitSemanticRuleSetDraftResponse {
  committed: boolean;
  generation_trace_id: string;
  rule_set: SemanticRuleSet;
}

export const browserSemanticsApi = {
  listRuleSets: async (params?: ListSemanticRuleSetsParams): Promise<SemanticRuleSet[]> => {
    return apiClient.get<SemanticRuleSet[]>('/browser-semantics/semantic-rule-sets', { params });
  },

  getRuleSetById: async (id: string): Promise<SemanticRuleSet> => {
    return apiClient.get<SemanticRuleSet>(`/browser-semantics/semantic-rule-sets/${id}`);
  },

  createRuleSet: async (payload: CreateSemanticRuleSetPayload): Promise<SemanticRuleSet> => {
    return apiClient.post<SemanticRuleSet>('/browser-semantics/semantic-rule-sets', payload);
  },

  updateRuleSet: async (
    id: string,
    payload: UpdateSemanticRuleSetPayload
  ): Promise<SemanticRuleSet> => {
    return apiClient.put<SemanticRuleSet>(`/browser-semantics/semantic-rule-sets/${id}`, payload);
  },

  replaceRuleCategory: async (
    id: string,
    category: SemanticRuleCategory,
    payload: ReplaceSemanticRuleCategoryPayload
  ): Promise<SemanticRuleSet> => {
    return apiClient.put<SemanticRuleSet>(
      `/browser-semantics/semantic-rule-sets/${id}/categories/${encodeURIComponent(category)}`,
      payload
    );
  },

  listHitLogs: async (params?: ListSemanticRuleHitLogsParams): Promise<SemanticRuleHitLog[]> => {
    return apiClient.get<SemanticRuleHitLog[]>('/browser-semantics/semantic-rule-hit-logs', {
      params,
    });
  },

  listErrorLogs: async (
    params?: ListSemanticRuleErrorLogsParams
  ): Promise<SemanticRuleErrorLog[]> => {
    return apiClient.get<SemanticRuleErrorLog[]>('/browser-semantics/semantic-rule-error-logs', {
      params,
    });
  },

  listReleases: async (
    params?: ListSemanticRuleReleasesParams
  ): Promise<SemanticRuleReleaseRecord[]> => {
    return apiClient.get<SemanticRuleReleaseRecord[]>('/browser-semantics/semantic-rule-releases', {
      params,
    });
  },

  generateRuleSetDraft: async (
    payload: GenerateSemanticRuleSetDraftPayload
  ): Promise<GenerateSemanticRuleSetDraftResponse> => {
    return apiClient.post<GenerateSemanticRuleSetDraftResponse>(
      '/browser-semantics/semantic-rule-generations/draft',
      payload
    );
  },

  commitRuleSetDraft: async (
    payload: CommitSemanticRuleSetDraftPayload
  ): Promise<CommitSemanticRuleSetDraftResponse> => {
    return apiClient.post<CommitSemanticRuleSetDraftResponse>(
      '/browser-semantics/semantic-rule-generations/draft/commit',
      payload
    );
  },

  promoteToCanary: async (
    id: string,
    payload?: { release_note?: string }
  ): Promise<Record<string, unknown>> => {
    return apiClient.post<Record<string, unknown>>(
      `/browser-semantics/semantic-rule-sets/${id}/promote/canary`,
      payload || {}
    );
  },

  promoteToActive: async (
    id: string,
    payload?: { release_note?: string }
  ): Promise<Record<string, unknown>> => {
    return apiClient.post<Record<string, unknown>>(
      `/browser-semantics/semantic-rule-sets/${id}/promote/active`,
      payload || {}
    );
  },

  rollbackRuleSet: async (
    id: string,
    payload: RollbackSemanticRuleSetPayload
  ): Promise<Record<string, unknown>> => {
    return apiClient.post<Record<string, unknown>>(
      `/browser-semantics/semantic-rule-sets/${id}/rollback`,
      payload
    );
  },

  validateRuleSet: async (id: string): Promise<SemanticRuleValidationResult> => {
    return apiClient.post<SemanticRuleValidationResult>(
      `/browser-semantics/semantic-rule-sets/${id}/validate`,
      {}
    );
  },
};
