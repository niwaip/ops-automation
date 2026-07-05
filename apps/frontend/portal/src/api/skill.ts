import { createSkillApi } from '@ops/user-core';
import { apiClient } from './client';
import { ExecutionFlowStep } from './flows';
import { useAuthStore } from '@/shared/store/authStore';

// Types based on auth service DTOs
export interface ApiEndpoint {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  description: string;
}

export interface SkillParamsSchema {
  properties: Record<
    string,
    {
      type: 'string' | 'number' | 'date' | 'boolean';
      description: string;
      required?: boolean;
      default?: string | number | boolean;
      extractionPrompt?: string;
    }
  >;
  required: string[];
}

export interface SkillConfigDTO {
  id: string;
  name: string;
  description: string;
  triggerKeywords: string[];
  paramsSchema: SkillParamsSchema;
  templateId?: string;
  carboneTemplateId?: string;
  carboneSkillId?: string;
  executionFlowTemplateIds: string[]; // 关联的多个流程模板ID
  executionFlow: ExecutionFlowStep[];
  tools: string[];
  effectiveTools?: string[];
  apiEndpoints?: {
    render?: ApiEndpoint;
    getSkill?: ApiEndpoint;
    runtimeMetadata?: {
      matchSummary?: string;
      paramCollectionGuidance?: string;
      validationRules?: string;
      goal?: string;
      expectedResult?: string;
      outputParams?: Record<string, unknown>;
      sourceType?: string;
      sourceTemplate?: {
        templateId?: string;
        skillId?: string;
        fileName?: string;
        format?: string;
        variableCount?: number;
      };
      taskQueue?: string;
      workflowSteps?: Array<{
        id?: string;
        name?: string;
        type?: string;
        activityName?: string;
      }>;
    };
  };
  isActive: boolean;
  isPublished: boolean;
  publishedReleaseId?: string | null;
  publishedReleaseVersion?: number | null;
  publishedReleaseStatus?: string | null;
  publishedDeploymentStatus?: string | null;
  publishedSourceType?: string | null;
}

export interface SkillPermissionDTO {
  skillId: string;
  skillName: string;
  roleId: string;
  roleName: string;
  grantedAt: string;
  grantedBy: string | null;
}

export interface CreateSkillDTO {
  name: string;
  description: string;
  triggerKeywords: string[];
  paramsSchema: SkillParamsSchema;
  templateId?: string;
  carboneTemplateId?: string;
  carboneSkillId?: string;
  executionFlowTemplateIds?: string[]; // 关联的多个流程模板ID
  executionFlow?: ExecutionFlowStep[];
  tools?: string[];
  apiEndpoints?: {
    render?: ApiEndpoint;
    getSkill?: ApiEndpoint;
  };
}

export interface GrantSkillDTO {
  roleId: string;
}

export interface SkillListResponse {
  skills: SkillConfigDTO[];
}

export interface SkillPermissionsResponse {
  permissions: SkillPermissionDTO[];
}

export interface SkillAccessRequestDTO {
  id: string;
  skillId: string;
  requesterUserId: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reason?: string | null;
  responseNote?: string | null;
  processedAt?: string | null;
  processedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SkillAccessRequestReviewDTO extends SkillAccessRequestDTO {
  skillName: string;
  requesterUsername: string;
  requesterEmail?: string | null;
  requesterRole: string;
  targetRoleId?: string | null;
  targetRoleName?: string | null;
}

export interface SkillAccessRequestsResponse {
  requests: SkillAccessRequestReviewDTO[];
}

// Role DTO for selection
export interface RoleDTO {
  id: string;
  name: string;
}

// Skill validation result
export interface SkillValidationResult {
  isValid: boolean;
  score: number;
  suggestions: string[];
  warnings: string[];
  validatedAt: string;
  validatedBy: string;
  details?: {
    configAnalysis: {
      hasTriggerKeywords: boolean;
      hasParamsSchema: boolean;
      hasTemplate: boolean;
      hasFlowTemplate: boolean;
      triggerKeywordQuality: string;
      paramsSchemaCompleteness: string;
    };
    skillSimulation?: {
      success: boolean;
      validationScore: number;
      simulatedRequest: string;
      summary: string;
      issues: string[];
      suggestions: string[];
      log?: string[];
      iterations?: number;
      generatedSkill?: Partial<SkillConfigDTO>;
    };
  };
}

export interface SkillValidationStreamEvent {
  type: 'stage' | 'log' | 'result' | 'error';
  content: string;
  data?: {
    validation?: SkillValidationResult;
    stage?: string;
    phase?: string;
    [key: string]: any;
  };
}

const baseSkillApi = createSkillApi(apiClient);

// Skill API
export const skillApi = {
  list: baseSkillApi.list as () => Promise<SkillListResponse>,

  getById: baseSkillApi.getById as (id: string) => Promise<SkillConfigDTO>,

  create: async (data: CreateSkillDTO): Promise<SkillConfigDTO> => {
    return apiClient.post<SkillConfigDTO>('/skills', data);
  },

  update: async (id: string, data: Partial<CreateSkillDTO>): Promise<SkillConfigDTO> => {
    return apiClient.put<SkillConfigDTO>(`/skills/${id}`, data);
  },

  delete: async (id: string): Promise<{ success: boolean }> => {
    return apiClient.delete<{ success: boolean }>(`/skills/${id}`);
  },

  // Validate skill with AI simulation
  validate: async (id: string): Promise<{ validation: SkillValidationResult }> => {
    return apiClient.post<{ validation: SkillValidationResult }>(
      `/skills/${id}/validate`,
      undefined,
      { timeout: 180000 }
    );
  },

  streamValidate: (
    id: string,
    onEvent: (event: SkillValidationStreamEvent) => void,
    onError?: (error: Error) => void,
    onComplete?: () => void
  ): (() => void) => {
    const abortController = new AbortController();
    const token = useAuthStore.getState().accessToken;

    (async () => {
      try {
        const response = await fetch(`/api/skills/${id}/validate/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error('Response body is null');
        }

        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split('\n\n');
          buffer = chunks.pop() || '';

          for (const chunk of chunks) {
            if (!chunk.startsWith('data: ')) {
              continue;
            }
            try {
              const data = JSON.parse(chunk.slice(6));
              onEvent(data as SkillValidationStreamEvent);
            } catch (error) {
              console.warn('Failed to parse SSE data:', chunk, error);
            }
          }
        }

        onComplete?.();
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        onError?.(error instanceof Error ? error : new Error('Unknown error'));
      }
    })();

    return () => abortController.abort();
  },

  applyAdjustment: async (
    id: string,
    generatedSkill?: Partial<CreateSkillDTO>
  ): Promise<SkillConfigDTO> => {
    return apiClient.post<SkillConfigDTO>(`/skills/${id}/apply-adjustment`, { generatedSkill });
  },

  // Permission management
  getPermissions: async (skillId: string): Promise<SkillPermissionsResponse> => {
    return apiClient.get<SkillPermissionsResponse>(`/skills/${skillId}/permissions`);
  },

  grant: async (skillId: string, roleId: string): Promise<{ permission: SkillPermissionDTO }> => {
    return apiClient.post<{ permission: SkillPermissionDTO }>(`/skills/${skillId}/grant`, {
      roleId,
    });
  },

  revoke: async (skillId: string, roleId: string): Promise<{ success: boolean }> => {
    return apiClient.delete<{ success: boolean }>(`/skills/${skillId}/grant/${roleId}`);
  },

  getAccessRequests: async (
    skillId?: string,
    status: 'pending' | 'approved' | 'rejected' | 'cancelled' = 'pending'
  ): Promise<SkillAccessRequestsResponse> => {
    return apiClient.get<SkillAccessRequestsResponse>('/skills/access-requests', {
      params: {
        ...(skillId ? { skillId } : {}),
        status,
      },
    });
  },

  approveAccessRequest: async (
    requestId: string,
    data?: { responseNote?: string }
  ): Promise<{ request: SkillAccessRequestReviewDTO }> => {
    return apiClient.post<{ request: SkillAccessRequestReviewDTO }>(
      `/skills/access-requests/${requestId}/approve`,
      data
    );
  },

  rejectAccessRequest: async (
    requestId: string,
    data?: { responseNote?: string }
  ): Promise<{ request: SkillAccessRequestReviewDTO }> => {
    return apiClient.post<{ request: SkillAccessRequestReviewDTO }>(
      `/skills/access-requests/${requestId}/reject`,
      data
    );
  },
};

// Role API (from auth service)
export const roleApi = {
  list: async (): Promise<{ roles: RoleDTO[] }> => {
    return apiClient.get<{ roles: RoleDTO[] }>('/skills/roles');
  },
};
