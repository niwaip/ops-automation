import apiClient from '@/shared/api/http/client';

export type OrgWorkflowPublishStatus = 'draft' | 'published' | 'archived';

export type StageType = 'submission' | 'approval' | 'automation' | 'archive';

export interface WorkflowStageDefinition {
  id: string;
  name: string;
  type: StageType;
  description: string;
  approverRule?: 'leader' | 'role' | 'assignee' | 'specific_user';
  approverRole?: string;
  actions?: string[];
}

export type BaseWorkflowType = 'execution_flow' | 'temporal_workflow' | 'skill';

export interface AssembledBaseWorkflow {
  type: BaseWorkflowType;
  refId: string;
  name: string;
  triggerEvent?: 'on_submit' | 'on_stage_approval' | 'on_approve' | 'on_complete';
  description?: string;
  stageType?: StageType;
  handlerRule?: string;
  requiredMetadata?: string[];
}

export interface WorkflowParamProperty {
  type: 'string' | 'number' | 'date' | 'boolean';
  description: string;
  required?: boolean;
  default?: any;
  enum?: Array<string | number>;
}

export interface WorkflowParamsSchema {
  properties: Record<string, WorkflowParamProperty>;
  required: string[];
}

export interface OrganizationWorkflowDTO {
  id: string;
  workflowId: string;
  name: string;
  description: string;
  category: string;
  icon?: string;
  taskType: 'approval' | 'assignment' | 'review';
  status: OrgWorkflowPublishStatus;
  isPublished: boolean;
  version: string;
  assembledWorkflows: AssembledBaseWorkflow[];
  processDefinition: {
    stages: WorkflowStageDefinition[];
  };
  paramsSchema: WorkflowParamsSchema;
  grantedRoleIds: string[];
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AvailableBaseWorkflowItem {
  type: BaseWorkflowType;
  id: string;
  name: string;
  category?: string;
  description?: string;
  stageType?: StageType;
  handlerRule?: string;
  requiredMetadata?: string[];
  validationStatus?: 'draft' | 'generated' | 'validated' | 'failed' | string;
  validationScore?: number;
  hasGeneratedCode?: boolean;
  workflowDsl?: any;
  activityDsl?: any;
  generatedCode?: string;
}

export interface OrgWorkflowAdminListResponse {
  workflows: OrganizationWorkflowDTO[];
  stats: {
    total: number;
    publishedCount: number;
    draftCount: number;
    assembledBaseCount: number;
  };
}

export interface CreateOrgWorkflowDTO {
  workflowId: string;
  name: string;
  description: string;
  category?: string;
  icon?: string;
  taskType?: 'approval' | 'assignment' | 'review';
  status?: OrgWorkflowPublishStatus;
  version?: string;
  assembledWorkflows?: AssembledBaseWorkflow[];
  processDefinition?: {
    stages: WorkflowStageDefinition[];
  };
  paramsSchema?: WorkflowParamsSchema;
  grantedRoleIds?: string[];
}

export interface UpdateOrgWorkflowDTO {
  name?: string;
  description?: string;
  category?: string;
  icon?: string;
  taskType?: 'approval' | 'assignment' | 'review';
  status?: OrgWorkflowPublishStatus;
  version?: string;
  assembledWorkflows?: AssembledBaseWorkflow[];
  processDefinition?: {
    stages: WorkflowStageDefinition[];
  };
  paramsSchema?: WorkflowParamsSchema;
  grantedRoleIds?: string[];
}

export const orgWorkflowApi = {
  /**
   * 管理员查询全量企业工作流及统计
   */
  listAdminWorkflows: async (): Promise<OrgWorkflowAdminListResponse> => {
    try {
      const res = await apiClient.get<any>(
        '/workbench-coordination/admin/workflows'
      );
      if (res && Array.isArray(res.workflows)) {
        return res;
      }
      return {
        workflows: [],
        stats: { total: 0, publishedCount: 0, draftCount: 0, assembledBaseCount: 0 },
      };
    } catch (err) {
      console.warn('Failed to list admin workflows:', err);
      return {
        workflows: [],
        stats: { total: 0, publishedCount: 0, draftCount: 0, assembledBaseCount: 0 },
      };
    }
  },

  /**
   * 获取 5173 底层可用资产池（Execution Flow, Temporal, Skill）
   */
  getAvailableBaseWorkflows: async (): Promise<AvailableBaseWorkflowItem[]> => {
    try {
      const res = await apiClient.get<any>(
        '/workbench-coordination/admin/available-base-workflows'
      );
      if (Array.isArray(res)) {
        return res;
      }
      if (Array.isArray(res?.data)) {
        return res.data;
      }
      return [];
    } catch (err) {
      console.warn('Failed to get available base workflows:', err);
      return [];
    }
  },

  /**
   * 创建新的企业工作流
   */
  createWorkflow: async (payload: CreateOrgWorkflowDTO): Promise<OrganizationWorkflowDTO> => {
    return await apiClient.post<OrganizationWorkflowDTO>(
      '/workbench-coordination/admin/workflows',
      payload
    );
  },

  /**
   * 获取工作流详情
   */
  getWorkflowDetail: async (id: string): Promise<OrganizationWorkflowDTO> => {
    return await apiClient.get<OrganizationWorkflowDTO>(
      `/workbench-coordination/admin/workflows/${id}`
    );
  },

  /**
   * 更新工作流配置、组装与流程定义
   */
  updateWorkflow: async (
    id: string,
    payload: UpdateOrgWorkflowDTO
  ): Promise<OrganizationWorkflowDTO> => {
    return await apiClient.put<OrganizationWorkflowDTO>(
      `/workbench-coordination/admin/workflows/${id}`,
      payload
    );
  },

  /**
   * 发布 / 下架工作流
   */
  togglePublish: async (
    id: string,
    publish?: boolean
  ): Promise<OrganizationWorkflowDTO> => {
    return await apiClient.post<OrganizationWorkflowDTO>(
      `/workbench-coordination/admin/workflows/${id}/publish`,
      { publish }
    );
  },

  /**
   * 删除工作流
   */
  deleteWorkflow: async (id: string): Promise<{ success: boolean }> => {
    return await apiClient.delete<{ success: boolean }>(
      `/workbench-coordination/admin/workflows/${id}`
    );
  },

  /**
   * 更新角色权限分配
   */
  updatePermissions: async (
    id: string,
    roleIds: string[]
  ): Promise<OrganizationWorkflowDTO> => {
    return await apiClient.put<OrganizationWorkflowDTO>(
      `/workbench-coordination/admin/workflows/${id}/permissions`,
      { roleIds }
    );
  },

  /**
   * 通过 AI 对话生成流程专用原子流草稿 (支持 API 直接更新与浏览器模版调用)
   */
  generateStageFlowAiDraft: async (
    payload: GenerateStageFlowAiDraftDTO
  ): Promise<StageWorkflowDraft> => {
    return await apiClient.post<StageWorkflowDraft>(
      '/workbench-coordination/admin/ai-draft-stage-flow',
      payload
    );
  },

  /**
   * 注册用户创建或 AI 生成的流程专用原子工作流
   */
  createBaseWorkflow: async (
    payload: AvailableBaseWorkflowItem
  ): Promise<AvailableBaseWorkflowItem> => {
    return await apiClient.post<AvailableBaseWorkflowItem>(
      '/workbench-coordination/admin/base-workflows',
      payload
    );
  },

  /**
   * 删除流程专用原子工作流
   */
  deleteBaseWorkflow: async (id: string): Promise<{ success: boolean; message?: string }> => {
    return await apiClient.delete<{ success: boolean; message?: string }>(
      `/workbench-coordination/admin/base-workflows/${id}`
    );
  },

  /**
   * 清空所有自定义流程专用原子工作流
   */
  clearAllBaseWorkflows: async (): Promise<{ success: boolean; count?: number }> => {
    return await apiClient.delete<{ success: boolean; count?: number }>(
      '/workbench-coordination/admin/base-workflows'
    );
  },
};

export type StageFlowMode = 'api' | 'browser_template';

export interface GenerateStageFlowAiDraftDTO {
  prompt: string;
  preferredMode?: 'api' | 'browser_template' | 'auto';
  stageType?: StageType;
  templateId?: string;
  credentialSecretKey?: string;
  targetEndpointUrl?: string;
}

export interface StageWorkflowDraft {
  id: string;
  name: string;
  category: string;
  stageType: StageType;
  handlerRule: string;
  requiredMetadata: string[];
  description: string;
  executionMode: StageFlowMode;
  apiConfig?: {
    businessParams: Array<{
      key: string;
      label: string;
      type: string;
      required: boolean;
      description?: string;
    }>;
    authActivity: {
      activityName: string;
      authType: 'api_key' | 'bearer_token' | 'oauth2' | 'hmac_signature';
      credentialKeyRef: string;
      headerName?: string;
      description: string;
    };
    updateActivity: {
      activityName: string;
      endpointUrl: string;
      method: 'POST' | 'PUT' | 'PATCH';
      payloadMapping: Record<string, string>;
      timeoutSeconds: number;
      description: string;
    };
  };
  browserConfig?: {
    templateId: string;
    templateName: string;
    paramMappings: Array<{
      businessParamKey: string;
      targetField: string;
      label: string;
      action: string;
    }>;
    credentialMapping: {
      vaultSecretKey: string;
      targetCredentialField: string;
      description: string;
    };
  };
  sampleInputContract: Record<string, unknown>;
  sampleOutputContract: Record<string, unknown>;
  warnings?: string[];
  workflowDsl: any;
  activityDsl: any;
  generatedCode: string;
  validationStatus?: 'draft' | 'generated' | 'validated' | 'failed' | string;
  validationScore?: number;
}
