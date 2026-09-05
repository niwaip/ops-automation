import { apiClient } from '@/shared/api/http/client';

interface TaskPoliciesApiClient {
  get<T>(url: string): Promise<T>;
  post<T>(url: string, data?: unknown): Promise<T>;
}

const typedApiClient = apiClient as unknown as TaskPoliciesApiClient;

export interface TaskPolicySummary {
  id: string;
  name: string;
  scopeType: string;
  scopeId: string;
  status: 'draft' | 'shadow' | 'active' | 'retired';
  version: string;
  digest: string;
  createdAt: string;
  publishedAt?: string;
  _count?: {
    aliases: number;
    recipes: number;
    bindings: number;
    proposals: number;
  };
}

export interface TaskPolicyProposal {
  id: string;
  proposalType: string;
  scopeType: string;
  scopeId: string;
  confidence: number;
  status: 'candidate' | 'shadow' | 'rejected';
  patchJson: Record<string, unknown>;
  evidenceJson: Record<string, unknown>;
  createdAt: string;
}

export interface TaskPolicyDetail extends TaskPolicySummary {
  aliases: Array<{
    id: string;
    canonicalCommand: string;
    alias: string;
    matchType: string;
    weight: number;
    source: string;
  }>;
  recipes: Array<{
    id: string;
    recipeKey: string;
    version: string;
    name: string;
    requiredCommandsJson: string[];
    optionalCommandsJson: string[];
    stepsJson: unknown[];
    completionClaimsJson: string[];
    riskLevel: string;
  }>;
  bindings: Array<{
    id: string;
    capabilityRole: string;
    capabilityId: string;
    capabilityVersion?: string;
    priority: number;
  }>;
  auditLogs: Array<{
    id: string;
    action: string;
    actorUserId?: string;
    createdAt: string;
    detailJson?: Record<string, unknown>;
  }>;
}

export interface TaskPolicyReplayResult {
  passed: boolean;
  policySetId: string;
  policyDigest: string;
  gates: {
    static: { passed: boolean; errors: string[] };
    golden: { passed: boolean; total: number; passedCases: number; passRate: number; failures: any[] };
    history: { status: string; note: string };
    shadow: { status: string };
  };
}

export const taskPolicyApi = {
  list: (): Promise<TaskPolicySummary[]> =>
    typedApiClient.get<TaskPolicySummary[]>('/admin/task-policies'),
  get: (id: string): Promise<TaskPolicyDetail> =>
    typedApiClient.get<TaskPolicyDetail>(`/admin/task-policies/${id}`),
  listProposals: (): Promise<TaskPolicyProposal[]> =>
    typedApiClient.get<TaskPolicyProposal[]>('/admin/task-policies/proposals'),
  replay: (id: string): Promise<TaskPolicyReplayResult> =>
    typedApiClient.post<TaskPolicyReplayResult>(`/admin/task-policies/${id}/replay`),
  publish: (id: string): Promise<TaskPolicyDetail> =>
    typedApiClient.post<TaskPolicyDetail>(`/admin/task-policies/${id}/publish`),
  reviewProposal: (
    id: string,
    status: 'shadow' | 'rejected'
  ): Promise<TaskPolicyProposal> =>
    typedApiClient.post<TaskPolicyProposal>(`/admin/task-policies/proposals/${id}/review`, { status }),
};
