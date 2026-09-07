import { CoordinationTaskType } from './dto/workbench-coordination.dto';

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

export interface OrganizationWorkflowDefinition {
  id: string;
  workflowId: string;
  name: string;
  description: string;
  category: string;
  icon?: string;
  taskType: CoordinationTaskType;
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

export interface OrgWorkflowAccessRequest {
  id: string;
  workflowId: string;
  userId: string;
  username: string;
  status: 'pending' | 'approved' | 'rejected';
  reason?: string;
  responseNote?: string;
  createdAt: string;
  processedAt?: string;
  processedBy?: string;
}

export interface OrgWorkflowCatalogItemDto extends OrganizationWorkflowDefinition {
  accessStatus: 'authorized' | 'requested' | 'unauthorized';
  accessRequest?: OrgWorkflowAccessRequest | null;
}

export interface CreateOrgWorkflowDto {
  workflowId: string;
  name: string;
  description: string;
  category?: string;
  icon?: string;
  taskType?: CoordinationTaskType;
  status?: OrgWorkflowPublishStatus;
  version?: string;
  assembledWorkflows?: AssembledBaseWorkflow[];
  processDefinition?: {
    stages: WorkflowStageDefinition[];
  };
  paramsSchema?: WorkflowParamsSchema;
  grantedRoleIds?: string[];
}

export interface UpdateOrgWorkflowDto {
  name?: string;
  description?: string;
  category?: string;
  icon?: string;
  taskType?: CoordinationTaskType;
  status?: OrgWorkflowPublishStatus;
  version?: string;
  assembledWorkflows?: AssembledBaseWorkflow[];
  processDefinition?: {
    stages: WorkflowStageDefinition[];
  };
  paramsSchema?: WorkflowParamsSchema;
  grantedRoleIds?: string[];
}

export interface AssignWorkflowRolesDto {
  roleIds: string[];
}

export interface RequestWorkflowAccessDto {
  reason?: string;
}

export interface ReviewWorkflowAccessDto {
  status: 'approved' | 'rejected';
  note?: string;
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
  validationStatus?: string;
  validationScore?: number;
  hasGeneratedCode?: boolean;
  workflowDsl?: Record<string, any>;
  activityDsl?: Record<string, any>;
  generatedCode?: string;
}
