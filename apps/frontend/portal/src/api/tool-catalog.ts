import { apiClient } from '@/shared/api/http/client';

export type ToolCatalogStatus = 'active' | 'disabled' | 'deprecated';
export type ToolRiskLevel = 'L0' | 'L1' | 'L2' | 'L3';
export type ToolPromptExposure = 'hidden' | 'prompt_only' | 'runtime_only' | 'prompt_and_runtime';

export interface ToolCatalogItem {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  category?: string;
  runtimeType?: string;
  status: ToolCatalogStatus;
  riskLevel: ToolRiskLevel;
  allowSkillBinding: boolean;
  promptExposure: ToolPromptExposure;
  defaultRequiresConfirmation: boolean;
  defaultRequiresApproval: boolean;
  metadataJson?: Record<string, unknown>;
  usageSummary?: {
    boundSkillCount: number;
    boundSkillNames?: string[];
    boundSkills?: Array<{
      id: string;
      name: string;
      isActive: boolean;
      configStatus?: string;
      isPublished: boolean;
      publishedReleaseStatus?: string | null;
      publishedDeploymentStatus?: string | null;
    }>;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface ToolCatalogFilters {
  status?: ToolCatalogStatus;
  category?: string;
  runtimeType?: string;
  allowSkillBinding?: boolean;
  keyword?: string;
}

export interface UpdateToolCatalogPayload {
  displayName?: string;
  description?: string;
  status?: ToolCatalogStatus;
  riskLevel?: ToolRiskLevel;
  allowSkillBinding?: boolean;
  promptExposure?: ToolPromptExposure;
  defaultRequiresConfirmation?: boolean;
  defaultRequiresApproval?: boolean;
  metadataJson?: Record<string, unknown>;
}

type ToolCatalogListResponse = {
  tools: ToolCatalogItem[];
};

type ToolCatalogDetailResponse = {
  tool: ToolCatalogItem;
};

type ToolCatalogUpdateResponse = {
  tool: ToolCatalogItem;
};

export const toolCatalogApi = {
  list: async (filters?: ToolCatalogFilters): Promise<ToolCatalogListResponse> => {
    return apiClient.get<ToolCatalogListResponse>('/tools/catalog', { params: filters });
  },

  getByName: async (name: string): Promise<ToolCatalogItem> => {
    const response = await apiClient.get<ToolCatalogDetailResponse>(
      `/tools/catalog/${encodeURIComponent(name)}`
    );
    return response.tool;
  },

  update: async (name: string, data: UpdateToolCatalogPayload): Promise<ToolCatalogItem> => {
    const response = await apiClient.patch<ToolCatalogUpdateResponse>(
      `/tools/catalog/${encodeURIComponent(name)}`,
      data
    );
    return response.tool;
  },
};
