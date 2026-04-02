import { apiClient } from './client';

// Types based on template service entity
export type TemplateStatus = 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'DEPRECATED' | 'REVOKED';

export interface ParamsSchema {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
}

export interface TemplateStep {
  step_id: string;
  action: string;
  locator?: { type: string; value: string; fallback?: { type: string; value: string } };
  params?: Record<string, string | number>;
  wait?: { type: string; value: number | string };
  retry?: { max_attempts: number; delay_ms: number };
  on_fail?: string;
}

export interface Template {
  id: string;
  name: string;
  version: string;
  status: TemplateStatus;
  description?: string;
  params_schema: ParamsSchema;
  steps: TemplateStep[];
  guards: Record<string, unknown>[];
  config: Record<string, unknown>;
  created_by: string;
  reviewed_by?: string;
  published_at?: Date;
  created_at: Date;
  updated_at: Date;
  deprecated_at?: Date;
}

export interface TemplateListResponse {
  templates: Template[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateTemplateRequest {
  name: string;
  version?: string;
  description?: string;
  params_schema?: ParamsSchema;
  steps?: TemplateStep[];
  created_by: string;
}

export interface UpdateTemplateRequest {
  name?: string;
  version?: string;
  description?: string;
  params_schema?: ParamsSchema;
  steps?: TemplateStep[];
}

export interface TemplateQueryParams {
  page?: number;
  pageSize?: number;
  status?: TemplateStatus;
  search?: string;
}

export interface CompileResultStep {
  step_id: string;
  action: string;
  locator?: { type: string; value: string; fallback?: { type: string; value: string } };
  params?: Record<string, string | number>;
  wait?: { type: string; value: number | string };
  on_fail?: string;
  retry?: { max_attempts: number; delay_ms: number };
}

export interface CompileResult {
  template: {
    id: string;
    name: string;
    version: string;
    status: string;
    params_schema: ParamsSchema;
    steps: CompileResultStep[];
    metadata: {
      created_by: string;
      created_at: string;
      updated_at: string;
      description?: string;
    };
  };
  validation: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
}

// Template API
export const templateApi = {
  list: async (params?: TemplateQueryParams): Promise<TemplateListResponse> => {
    return apiClient.get<TemplateListResponse>('/templates', { params });
  },

  getById: async (id: string): Promise<Template> => {
    return apiClient.get<Template>(`/templates/${id}`);
  },

  create: async (data: CreateTemplateRequest): Promise<Template> => {
    return apiClient.post<Template>('/templates', data);
  },

  update: async (id: string, data: UpdateTemplateRequest): Promise<Template> => {
    return apiClient.put<Template>(`/templates/${id}`, data);
  },

  delete: async (id: string): Promise<void> => {
    return apiClient.delete(`/templates/${id}`);
  },

  publish: async (id: string, reviewedBy: string): Promise<Template> => {
    return apiClient.patch<Template>(`/templates/${id}/publish`, { reviewed_by: reviewedBy });
  },

  deprecate: async (id: string): Promise<Template> => {
    return apiClient.patch<Template>(`/templates/${id}/deprecate`);
  },

  revoke: async (id: string): Promise<Template> => {
    return apiClient.patch<Template>(`/templates/${id}/revoke`);
  },

  clone: async (id: string): Promise<Template> => {
    return apiClient.post<Template>(`/templates/${id}/clone`);
  },

  compile: async (script: string, intent?: string): Promise<CompileResult> => {
    return apiClient.post<CompileResult>('/templates/compile', { script, intent });
  },

  validate: async (id: string): Promise<{ valid: boolean; errors: string[] }> => {
    return apiClient.get(`/templates/${id}/validate`);
  },
};