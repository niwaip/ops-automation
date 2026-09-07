import { apiClient } from './index';

export interface CollaboratorUser {
  id: string;
  username: string;
  email: string | null;
  role?: string;
  departmentName?: string;
}

export type CoordinationTaskType = 'approval' | 'assignment' | 'review';
export type CoordinationTaskStatus =
  | 'pending'
  | 'in_progress'
  | 'approved'
  | 'rejected'
  | 'completed'
  | 'canceled';
export type CoordinationTaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface CoordinationAttachment {
  name: string;
  url?: string;
  size?: number;
  mimeType?: string;
  storagePath?: string;
}

export interface CoordinationActionRecord {
  id: string;
  operatorId: string;
  operatorName?: string;
  action: 'approve' | 'reject' | 'complete';
  comment?: string;
  attachments?: CoordinationAttachment[];
  timestamp: string;
}

export interface WorkflowParamProperty {
  type: 'string' | 'number' | 'date' | 'boolean';
  description: string;
  required?: boolean;
  default?: any;
  enum?: Array<string | number>;
}

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
  triggerEvent?: 'on_approve' | 'on_submit';
  description?: string;
}

export interface WorkflowTemplateDefinition {
  id: string;
  workflowId: string;
  name: string;
  description: string;
  category: string;
  icon?: string;
  taskType: CoordinationTaskType;
  status?: 'draft' | 'published' | 'archived';
  isPublished?: boolean;
  version?: string;
  assembledWorkflows?: AssembledBaseWorkflow[];
  processDefinition?: {
    stages: WorkflowStageDefinition[];
  };
  paramsSchema: {
    properties: Record<string, WorkflowParamProperty>;
    required: string[];
  };
  accessStatus?: 'authorized' | 'requested' | 'unauthorized';
  accessRequest?: {
    id: string;
    status: 'pending' | 'approved' | 'rejected';
    reason?: string;
    createdAt?: string;
  } | null;
  grantedRoleIds?: string[];
}

export interface CreateCoordinationTaskPayload {
  assigneeId: string;
  assigneeName?: string;
  taskType?: CoordinationTaskType;
  workflowId?: string;
  parameters?: Record<string, any>;
  title: string;
  content: string;
  priority?: CoordinationTaskPriority;
  dueDate?: string;
  attachments?: CoordinationAttachment[];
  isCardTemplate?: boolean;
  metadata?: Record<string, any>;
}

export interface SubmitCoordinationActionPayload {
  action: 'approve' | 'reject' | 'complete';
  comment?: string;
  attachments?: CoordinationAttachment[];
}

export interface CoordinationTask {
  taskId: string;
  inboxItemId?: string;
  title: string;
  rawContent?: string;
  status: CoordinationTaskStatus;
  taskType: CoordinationTaskType;
  priority: CoordinationTaskPriority;
  dueDate?: string | null;
  initiator?: {
    id: string;
    username: string;
    email?: string | null;
  };
  assignee?: {
    id: string;
    username: string;
    email?: string | null;
  };
  attachments?: CoordinationAttachment[];
  actions?: CoordinationActionRecord[];
  workflowId?: string;
  parameters?: Record<string, any>;
  externalSyncResult?: {
    success?: boolean;
    trackingNumber?: string;
    externalSystem?: string;
    message?: string;
    detail?: Record<string, any>;
  };
  createdAt?: string;
  updatedAt?: string;
  unifiedPayload?: Record<string, any>;
}

export const workbenchCoordinationApi = {
  /**
   * 获取可用的规范工作流模版及参数 Schema
   */
  getWorkflowTemplates: async (): Promise<WorkflowTemplateDefinition[]> => {
    try {
      const response = await apiClient.get<WorkflowTemplateDefinition[]>(
        '/workbench-coordination/workflow-templates'
      );
      if (Array.isArray(response)) {
        return response;
      }
      if (Array.isArray((response as any)?.data)) {
        return (response as any).data;
      }
      return [];
    } catch (err) {
      console.warn('Failed to load workflow templates:', err);
      return [];
    }
  },

  /**
   * 检索可协同的同事列表
   */
  searchCollaborators: async (
    query?: string,
    limit = 20
  ): Promise<CollaboratorUser[]> => {
    try {
      const response = await apiClient.get<CollaboratorUser[] | { data?: CollaboratorUser[] }>(
        '/workbench-coordination/collaborators',
        {
          params: {
            keyword: query?.trim() || undefined,
            limit,
          },
        }
      );
      if (Array.isArray(response)) {
        return response;
      }
      if (Array.isArray((response as any)?.data)) {
        return (response as any).data;
      }
      return [];
    } catch (err) {
      console.warn('Failed to search collaborators:', err);
      return [];
    }
  },

  /**
   * 发起协同任务
   */
  createTask: async (
    payload: CreateCoordinationTaskPayload
  ): Promise<CoordinationTask> => {
    return await apiClient.post<CoordinationTask>(
      '/workbench-coordination/tasks',
      payload
    );
  },

  /**
   * 提交协同操作动作（同意、拒绝、完成并提交）
   */
  submitAction: async (
    taskId: string,
    payload: SubmitCoordinationActionPayload
  ): Promise<{ taskId: string; status: CoordinationTaskStatus; action: string }> => {
    return await apiClient.post(
      `/workbench-coordination/tasks/${taskId}/action`,
      payload
    );
  },

  /**
   * 获取协同任务详情
   */
  getTaskDetails: async (taskId: string): Promise<CoordinationTask> => {
    return await apiClient.get<CoordinationTask>(
      `/workbench-coordination/tasks/${taskId}`
    );
  },

  /**
   * 查询协同任务与流程实例列表
   */
  listTasks: async (role?: 'all' | 'assignee' | 'initiator'): Promise<CoordinationTask[]> => {
    return await apiClient.get<CoordinationTask[]>('/workbench-coordination/tasks', {
      params: { role },
    });
  },

  /**
   * 申请开通企业工作流权限
   */
  requestAccess: async (
    workflowId: string,
    reason?: string
  ): Promise<{ id: string; status: string }> => {
    return await apiClient.post(
      `/workbench-coordination/workflow-templates/${workflowId}/request-access`,
      { reason }
    );
  },
};
