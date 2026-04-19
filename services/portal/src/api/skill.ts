import { apiClient } from './client';
import { ExecutionFlowStep } from './execution-flow';
import { useAuthStore } from '../store/authStore';

// Types based on auth service DTOs
export interface ApiEndpoint {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  description: string;
}

export interface ParamsSchema {
  properties: Record<string, {
    type: 'string' | 'number' | 'date' | 'boolean';
    description: string;
    required?: boolean;
    default?: string | number | boolean;
    extractionPrompt?: string;
  }>;
  required: string[];
}

export interface SkillConfigDTO {
  id: string;
  name: string;
  description: string;
  triggerKeywords: string[];
  paramsSchema: ParamsSchema;
  templateId?: string;
  carboneTemplateId?: string;
  carboneSkillId?: string;
  executionFlowTemplateIds: string[];  // 关联的多个流程模板ID
  executionFlow: ExecutionFlowStep[];
  tools: string[];
  apiEndpoints?: {
    generateParameters?: ApiEndpoint;
    render?: ApiEndpoint;
    getSkill?: ApiEndpoint;
  };
  isActive: boolean;
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
  paramsSchema: ParamsSchema;
  templateId?: string;
  carboneTemplateId?: string;
  carboneSkillId?: string;
  executionFlowTemplateIds?: string[];  // 关联的多个流程模板ID
  executionFlow?: ExecutionFlowStep[];
  tools?: string[];
  apiEndpoints?: {
    generateParameters?: ApiEndpoint;
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

// Skill API
export const skillApi = {
  list: async (): Promise<SkillListResponse> => {
    return apiClient.get<SkillListResponse>('/skills');
  },

  getById: async (id: string): Promise<SkillConfigDTO> => {
    return apiClient.get<SkillConfigDTO>(`/skills/${id}`);
  },

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
      { timeout: 180000 },
    );
  },

  streamValidate: (
    id: string,
    onEvent: (event: SkillValidationStreamEvent) => void,
    onError?: (error: Error) => void,
    onComplete?: () => void,
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
    generatedSkill?: Partial<CreateSkillDTO>,
  ): Promise<SkillConfigDTO> => {
    return apiClient.post<SkillConfigDTO>(
      `/skills/${id}/apply-adjustment`,
      { generatedSkill },
    );
  },

  // Permission management
  getPermissions: async (skillId: string): Promise<SkillPermissionsResponse> => {
    return apiClient.get<SkillPermissionsResponse>(`/skills/${skillId}/permissions`);
  },

  grant: async (skillId: string, roleId: string): Promise<{ permission: SkillPermissionDTO }> => {
    return apiClient.post<{ permission: SkillPermissionDTO }>(`/skills/${skillId}/grant`, { roleId });
  },

  revoke: async (skillId: string, roleId: string): Promise<{ success: boolean }> => {
    return apiClient.delete<{ success: boolean }>(`/skills/${skillId}/grant/${roleId}`);
  },
};

// Role API (from auth service)
export const roleApi = {
  list: async (): Promise<{ roles: RoleDTO[] }> => {
    return apiClient.get<{ roles: RoleDTO[] }>('/skills/roles');
  },
};
