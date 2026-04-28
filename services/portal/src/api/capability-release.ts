import apiClient from './client';
import { useAuthStore } from '../store/authStore';

export type CapabilitySourceType = 'execution_flow_template' | 'temporal_workflow';

export interface CapabilityRelease {
  id: string;
  sourceType: CapabilitySourceType;
  sourceId?: string | null;
  sourceName?: string | null;
  sourceStatus: string;
  releaseVersion: number;
  status: string;
  approvalStatus: string;
  deploymentStatus: string;
  currentSourceSnapshotId?: string | null;
  currentBuildId?: string | null;
  latestSuccessfulBuildId?: string | null;
  latestValidationId?: string | null;
  latestSuccessfulValidationId?: string | null;
  currentSkillDraftId?: string | null;
  publishedSkillId?: string | null;
  lastDeploymentId?: string | null;
  lastDeploymentEnvironment?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CapabilitySourceSnapshot {
  id: string;
  releaseId: string;
  snapshotVersion: number;
  sourceType: CapabilitySourceType;
  sourceId?: string | null;
  sourcePayload: Record<string, unknown>;
  summary?: string | null;
  createdAt: string;
}

export interface CapabilityBuild {
  id: string;
  releaseId: string;
  sourceSnapshotId: string;
  buildType: string;
  modelId: string;
  inputSnapshot: Record<string, unknown>;
  generatedCode?: string | null;
  generatedConfig?: Record<string, unknown> | null;
  logs: string[];
  diffSummary?: string | null;
  status: string;
  errorSummary?: string | null;
  createdAt: string;
}

export interface CapabilityValidation {
  id: string;
  releaseId: string;
  buildId: string;
  validationType: string;
  inputSnapshot?: Record<string, unknown> | null;
  resultSnapshot?: Record<string, unknown> | null;
  logs: string[];
  score: number;
  success: boolean;
  errorSummary?: string | null;
  createdAt: string;
}

export interface CapabilityValidationStreamEvent {
  event: 'status' | 'log' | 'complete' | 'error';
  data: Record<string, unknown>;
}

export interface CapabilityBuildStreamEvent {
  event: 'status' | 'log' | 'complete' | 'error';
  data: Record<string, unknown>;
}

export interface SkillDraft {
  id: string;
  releaseId: string;
  name: string;
  description: string;
  triggerKeywords: string[];
  paramsSchema: Record<string, unknown>;
  executionFlowTemplateIds: string[];
  tools: string[];
  apiEndpoints?: Record<string, unknown> | null;
  draftPayload: Record<string, unknown>;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeploymentRecord {
  id: string;
  releaseId: string;
  publishedSkillId?: string | null;
  environment: 'dev' | 'test' | 'staging' | 'prod';
  runtimeType: 'flow_runtime' | 'temporal_worker';
  artifactUri?: string | null;
  artifactHash?: string | null;
  workerVersion?: string | null;
  reloadStrategy?: string | null;
  requestPayload?: Record<string, unknown> | null;
  resultSnapshot?: Record<string, unknown> | null;
  logs: string[];
  status: 'running' | 'succeeded' | 'failed' | 'rolled_back';
  success: boolean;
  smokeValidationId?: string | null;
  rollbackTargetReleaseId?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
}

export interface ReleaseAuditEvent {
  id: string;
  releaseId: string;
  eventType: string;
  actorId?: string | null;
  actorName?: string | null;
  success: boolean;
  summary: string;
  details?: Record<string, unknown> | null;
  createdAt: string;
}

export interface CapabilityReleaseDetail {
  release: CapabilityRelease;
  currentSourceSnapshot?: CapabilitySourceSnapshot | null;
  sourceSnapshots?: CapabilitySourceSnapshot[];
  builds: CapabilityBuild[];
  validations: CapabilityValidation[];
  currentSkillDraft?: SkillDraft | null;
  deployments?: DeploymentRecord[];
  auditEvents?: ReleaseAuditEvent[];
}

export const capabilityReleaseApi = {
  list: async (): Promise<{ releases: CapabilityRelease[] }> => {
    return apiClient.get<{ releases: CapabilityRelease[] }>('/capability-releases');
  },

  listReleaseCenter: async (): Promise<{ releases: CapabilityRelease[] }> => {
    return apiClient.get<{ releases: CapabilityRelease[] }>('/capability-releases/release-center');
  },

  getById: async (id: string): Promise<{ release: CapabilityReleaseDetail }> => {
    return apiClient.get<{ release: CapabilityReleaseDetail }>(`/capability-releases/${id}`);
  },

  getReleaseCenterById: async (id: string): Promise<{ release: CapabilityReleaseDetail }> => {
    return apiClient.get<{ release: CapabilityReleaseDetail }>(
      `/capability-releases/release-center/${id}`,
    );
  },

  create: async (data: {
    sourceType: CapabilitySourceType;
    sourceId?: string;
    sourceName?: string;
    sourcePayload?: Record<string, unknown>;
  }): Promise<{ release: CapabilityReleaseDetail }> => {
    return apiClient.post<{ release: CapabilityReleaseDetail }>('/capability-releases', data);
  },

  updateSource: async (
    id: string,
    data: { sourceName?: string; sourcePayload: Record<string, unknown> },
  ): Promise<{ release: CapabilityReleaseDetail }> => {
    return apiClient.put<{ release: CapabilityReleaseDetail }>(`/capability-releases/${id}/source`, data);
  },

  build: async (
    id: string,
    data?: { buildType?: string; modelId?: string; errorContext?: string },
  ): Promise<{ release: CapabilityRelease; build: CapabilityBuild }> => {
    return apiClient.post<{ release: CapabilityRelease; build: CapabilityBuild }>(
      `/capability-releases/${id}/build`,
      data,
    );
  },

  buildStream: async (
    id: string,
    data: { buildType?: string; modelId?: string; errorContext?: string } = {},
    handlers: {
      onEvent?: (event: CapabilityBuildStreamEvent) => void;
      onOpen?: () => void;
      onComplete?: () => void;
    } = {},
  ): Promise<void> => {
    const token = useAuthStore.getState().accessToken;
    const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api';
    const params = new URLSearchParams();
    if (data.buildType) params.set('buildType', data.buildType);
    if (data.modelId) params.set('modelId', data.modelId);
    if (data.errorContext) params.set('errorContext', data.errorContext);

    const response = await fetch(
      `${baseUrl}/capability-releases/${id}/build/stream?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
    );

    if (!response.ok || !response.body) {
      const message = await response.text();
      throw new Error(message || '无法建立构建日志流');
    }

    handlers.onOpen?.();

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    const emitChunk = (chunk: string) => {
      const lines = chunk.split('\n');
      let eventName = 'message';
      const dataLines: string[] = [];

      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim());
        }
      }

      if (dataLines.length === 0) {
        return;
      }

      const rawData = dataLines.join('\n');
      const parsed = JSON.parse(rawData) as Record<string, unknown>;
      handlers.onEvent?.({
        event: eventName as CapabilityBuildStreamEvent['event'],
        data: parsed,
      });
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';
      for (const chunk of chunks) {
        if (chunk.trim()) {
          emitChunk(chunk);
        }
      }
    }

    if (buffer.trim()) {
      emitChunk(buffer);
    }

    handlers.onComplete?.();
  },

  validateStatic: async (
    id: string,
    data?: { buildId?: string },
  ): Promise<{ release: CapabilityRelease; validation: CapabilityValidation }> => {
    return apiClient.post<{ release: CapabilityRelease; validation: CapabilityValidation }>(
      `/capability-releases/${id}/validate/static`,
      data,
    );
  },

  validateSandbox: async (
    id: string,
    data?: {
      buildId?: string;
      input?: Record<string, unknown>;
      testUserInput?: string;
      testCases?: string[];
      fn?: string;
    },
  ): Promise<{ release: CapabilityRelease; validation: CapabilityValidation }> => {
    return apiClient.post<{ release: CapabilityRelease; validation: CapabilityValidation }>(
      `/capability-releases/${id}/validate/sandbox`,
      data,
    );
  },

  validateSandboxStream: async (
    id: string,
    data: { buildId?: string; input?: Record<string, unknown>; testUserInput?: string; fn?: string },
    handlers: {
      onEvent?: (event: CapabilityValidationStreamEvent) => void;
      onOpen?: () => void;
      onComplete?: () => void;
    } = {},
  ): Promise<void> => {
    const token = useAuthStore.getState().accessToken;
    const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api';
    const params = new URLSearchParams();
    if (data.buildId) params.set('buildId', data.buildId);
    if (data.fn) params.set('fn', data.fn);
    if (data.testUserInput) params.set('testUserInput', data.testUserInput);
    if (data.input) params.set('input', JSON.stringify(data.input));

    const response = await fetch(
      `${baseUrl}/capability-releases/${id}/validate/sandbox/stream?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
    );

    if (!response.ok || !response.body) {
      const message = await response.text();
      throw new Error(message || '无法建立日志流');
    }

    handlers.onOpen?.();

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    const emitChunk = (chunk: string) => {
      const lines = chunk.split('\n');
      let eventName = 'message';
      const dataLines: string[] = [];

      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim());
        }
      }

      if (dataLines.length === 0) {
        return;
      }

      const rawData = dataLines.join('\n');
      const parsed = JSON.parse(rawData) as Record<string, unknown>;
      handlers.onEvent?.({
        event: eventName as CapabilityValidationStreamEvent['event'],
        data: parsed,
      });
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';
      for (const chunk of chunks) {
        if (chunk.trim()) {
          emitChunk(chunk);
        }
      }
    }

    if (buffer.trim()) {
      emitChunk(buffer);
    }

    handlers.onComplete?.();
  },

  generateSkillDraft: async (
    id: string,
    data?: { validationId?: string; modelId?: string },
  ): Promise<{ release: CapabilityRelease; skillDraft: SkillDraft }> => {
    return apiClient.post<{ release: CapabilityRelease; skillDraft: SkillDraft }>(
      `/capability-releases/${id}/generate-skill-draft`,
      data,
    );
  },

  getCurrentSkillDraft: async (id: string): Promise<{ skillDraft: SkillDraft }> => {
    return apiClient.get<{ skillDraft: SkillDraft }>(`/capability-releases/${id}/skill-draft`);
  },

  updateSkillDraft: async (
    id: string,
    data: Partial<Pick<SkillDraft, 'name' | 'description' | 'triggerKeywords' | 'paramsSchema' | 'executionFlowTemplateIds' | 'tools' | 'apiEndpoints'>>,
  ): Promise<{ skillDraft: SkillDraft }> => {
    return apiClient.put<{ skillDraft: SkillDraft }>(`/capability-releases/${id}/skill-draft`, data);
  },

  publishSkill: async (
    id: string,
    data?: { draftId?: string },
  ): Promise<{ release: CapabilityRelease; publishedSkillId: string }> => {
    return apiClient.post<{ release: CapabilityRelease; publishedSkillId: string }>(
      `/capability-releases/${id}/publish-skill`,
      data,
    );
  },

  approveRelease: async (
    id: string,
    data: { decision: 'approved' | 'rejected'; comment?: string },
  ): Promise<{ release: CapabilityReleaseDetail }> => {
    return apiClient.post<{ release: CapabilityReleaseDetail }>(`/capability-releases/${id}/approve`, data);
  },

  deploy: async (
    id: string,
    data?: {
      environment?: 'dev' | 'test' | 'staging' | 'prod';
      strategy?: string;
      configOverrides?: Record<string, unknown>;
    },
  ): Promise<{ release: CapabilityRelease; deployment: DeploymentRecord }> => {
    return apiClient.post<{ release: CapabilityRelease; deployment: DeploymentRecord }>(
      `/capability-releases/${id}/deploy`,
      data,
    );
  },

  suggestWizardAssist: async (
    id: string,
    data?: { environment?: 'dev' | 'test' | 'staging' | 'prod' },
  ): Promise<{
    explanation: string;
    deployConfig: Record<string, unknown>;
    testInput: Record<string, unknown>;
    testUserInput?: string | null;
  }> => {
    return apiClient.post(`/capability-releases/${id}/wizard-assist`, data);
  },

  getDeployments: async (id: string): Promise<{ deployments: DeploymentRecord[] }> => {
    return apiClient.get<{ deployments: DeploymentRecord[] }>(`/capability-releases/${id}/deployments`);
  },

  getAuditEvents: async (id: string): Promise<{ auditEvents: ReleaseAuditEvent[] }> => {
    return apiClient.get<{ auditEvents: ReleaseAuditEvent[] }>(`/capability-releases/${id}/audit-events`);
  },

  rollback: async (
    id: string,
    data?: { targetReleaseId?: string; reason?: string },
  ): Promise<{ release: CapabilityRelease; deployment: DeploymentRecord; targetReleaseId: string }> => {
    return apiClient.post<{ release: CapabilityRelease; deployment: DeploymentRecord; targetReleaseId: string }>(
      `/capability-releases/${id}/rollback`,
      data,
    );
  },

  archive: async (id: string): Promise<{ success: true; archivedId: string }> => {
    return apiClient.delete<{ success: true; archivedId: string }>(`/capability-releases/${id}`);
  },

  analyzeFailure: async (
    id: string,
    data: { recordId: string; recordType: 'build' | 'validation' | 'deployment' },
  ): Promise<{
    analysis: string;
    explanation: string;
    isParameterIssue: boolean;
    suggestedParams?: Record<string, unknown> | null;
    suggestedAction?: string | null;
  }> => {
    return apiClient.post(`/capability-releases/${id}/analyze-failure`, data);
  },
};
