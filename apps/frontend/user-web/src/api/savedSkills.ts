import { apiClient, runtimeConfig } from './index';

const resolveSavedSkillPath = (path: string): string => {
  const baseUrl = runtimeConfig.controlPlaneApiBaseUrl?.trim();
  return baseUrl ? `${baseUrl.replace(/\/+$/, '')}${path}` : path;
};

export type SavedSkillReviewIssue = {
  code: string;
  severity: 'warning' | 'error';
  path?: string;
  message: string;
};

export type SavedSkillReview = {
  decision: 'pass' | 'warning' | 'block';
  summary: string;
  planChanged: false;
  reviewedAt: string;
  model?: string;
  issues: SavedSkillReviewIssue[];
};

export type SavedSkill = {
  id: string;
  ownerUserId: string;
  name: string;
  description?: string;
  visibility: 'private';
  status: 'active' | 'blocked' | 'disabled' | 'pending_review';
  version: string;
  sourceExecutionId: string;
  stepCount: number;
  aliases: string[];
  habitIntentKeys: string[];
  fixedInput: Record<string, unknown>;
  paramsSchema: Record<string, unknown>;
  planHash: string;
  inputHash: string;
  review: SavedSkillReview;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowSaveEligibility = {
  eligible: boolean;
  executionId: string;
  executionMode?: string;
  stepCount: number;
  suggestedName?: string;
  fixedInput?: Record<string, unknown>;
  frozenStepInputs?: Array<{
    nodeId: string;
    sequence: number;
    title: string;
    parameters: Record<string, unknown>;
  }>;
  reasonCode?: string;
  message?: string;
  savedSkillId?: string;
  savedSkillVersion?: string;
};

export const savedSkillApi = {
  list: (): Promise<{ skills: SavedSkill[] }> =>
    apiClient.get(resolveSavedSkillPath('/saved-skills')),
  getById: (id: string): Promise<SavedSkill> =>
    apiClient.get(resolveSavedSkillPath(`/saved-skills/${id}`)),
  getSaveEligibility: (executionId: string): Promise<WorkflowSaveEligibility> =>
    apiClient.get(resolveSavedSkillPath(`/executions/${executionId}/workflow-save-eligibility`)),
  saveFromExecution: (
    executionId: string,
    data: { name: string; description?: string }
  ): Promise<SavedSkill> =>
    apiClient.post(resolveSavedSkillPath(`/executions/${executionId}/save-as-skill`), data),
  updateAliases: (id: string, aliases: string[]): Promise<SavedSkill> =>
    apiClient.put(resolveSavedSkillPath(`/saved-skills/${id}/aliases`), { aliases }),
};

export default savedSkillApi;
