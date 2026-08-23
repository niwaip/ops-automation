export const HABIT_POLICY_VERSION = 'habit-policy/v2';

export interface HabitCandidateRow {
  id: string;
  ownerUserId: string;
  kind: string;
  status: string;
  riskLevel: string;
  intentKey: string;
  savedSkillId: string | null;
  savedVersion: number | null;
  evidenceJson: Record<string, unknown>;
  reviewJson: Record<string, unknown> | null;
  shadowJson: Record<string, unknown> | null;
  sourceRunId: string;
  policyVersion: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SavedWorkflowEvidenceRow {
  ownerUserId: string;
  skillId: string;
  version: number;
  name: string;
  sourceExecutionId: string;
  planHash: string;
  planSnapshotJson: Record<string, unknown>;
  aiReviewJson: Record<string, unknown>;
}
