import { apiClient } from './client';

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
  category: string;
  triggerKeywords: string[];
  paramsSchema: ParamsSchema;
  templateId?: string;
  carboneTemplateId?: string;
  carboneSkillId?: string;
  executionFlowTemplateId?: string;  // 关联的流程模板ID
  executionFlow: string[];
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
  category?: string;
  triggerKeywords: string[];
  paramsSchema: ParamsSchema;
  templateId?: string;
  carboneTemplateId?: string;
  carboneSkillId?: string;
  executionFlowTemplateId?: string;  // 关联的流程模板ID
  executionFlow?: string[];
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
    flowAnalysis?: {
      templateId: string;
      templateName: string;
      stepCount: number;
      executableSteps: number;
      validationScore: number;
      executionSimulations: Array<{
        stepId: string;
        stepName: string;
        type: string;
        simulated: boolean;
        success: boolean;
        output?: string;
        error?: string;
      }>;
    };
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
    return apiClient.post<{ validation: SkillValidationResult }>(`/skills/${id}/validate`);
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