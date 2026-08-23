import { apiClient } from '@/shared/api/http/client';

interface HabitLearningApiClient {
  get<T>(url: string): Promise<T>;
  post<T>(url: string, data?: unknown): Promise<T>;
}

const typedApiClient = apiClient as unknown as HabitLearningApiClient;

export interface HabitLearningOverview {
  phase: 'observation';
  habitLearning: {
    candidatesEnabled: boolean;
    activationEnabled: boolean;
  };
  feedback: {
    total: number;
    positive: number;
    negative: number;
    negativeReasons: Array<{ reasonCode: string; count: number }>;
  };
}

export interface HabitLearningStatus {
  candidatesEnabled: boolean;
  activationEnabled: boolean;
  candidateCounts: Record<string, number>;
  habitCounts: Record<string, number>;
  latestRun: HabitLearningRun | null;
}

export interface HabitLearningRun {
  id: string;
  status: string;
  policyVersion: string;
  windowStart: string;
  windowEnd: string;
  candidateCount: number;
  processedUsers: number;
  errorSummary?: string;
  startedAt: string;
  completedAt?: string;
}

export interface HabitCandidate {
  id: string;
  userKey: string;
  kind: string;
  status: string;
  riskLevel: string;
  intentKey: string;
  workflowName?: string;
  savedVersion?: number;
  evidenceJson: Record<string, unknown>;
  reviewJson?: Record<string, unknown>;
  createdAt: string;
}

export interface RoutingDiagnostics {
  windowDays: number;
  total: number;
  savedWorkflowReuse: number;
  plannerInvocations: number;
  noMatch: number;
  plannerInputTokens: number;
  sources: Array<{ routeSource: string; count: number }>;
  recent: Array<{
    id: string;
    userKey: string;
    routeSource: string;
    matchMethod?: string;
    candidateCount: number;
    matchScore?: number;
    plannerInvoked: boolean;
    routingPolicyVersion?: string;
    routingPolicyDigest?: string;
    createdAt: string;
  }>;
}

export const habitLearningApi = {
  getOverview: (): Promise<HabitLearningOverview> =>
    typedApiClient.get<HabitLearningOverview>('/admin/habit-learning/overview'),
  getStatus: (): Promise<HabitLearningStatus> =>
    typedApiClient.get<HabitLearningStatus>('/admin/habit-learning/status'),
  getCandidates: (): Promise<{ candidates: HabitCandidate[] }> =>
    typedApiClient.get<{ candidates: HabitCandidate[] }>('/admin/habit-learning/candidates'),
  getRuns: (): Promise<{ runs: HabitLearningRun[] }> =>
    typedApiClient.get<{ runs: HabitLearningRun[] }>('/admin/habit-learning/runs'),
  getRoutingDiagnostics: (): Promise<RoutingDiagnostics> =>
    typedApiClient.get<RoutingDiagnostics>('/admin/habit-learning/routing-diagnostics'),
  runNow: (): Promise<HabitLearningRun> =>
    typedApiClient.post<HabitLearningRun>('/admin/habit-learning/runs/run-now'),
  governCandidate: (
    id: string,
    action: 'hold' | 'reject' | 'rollback',
    reason?: string,
  ): Promise<HabitCandidate> =>
    typedApiClient.post<HabitCandidate>(
      `/admin/habit-learning/candidates/${id}/${action}`,
      { reason },
    ),
};
