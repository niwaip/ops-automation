/**
 * Skill Interfaces
 * Skill模块接口定义
 */

import { ExecutionFlowStep } from '../execution-flow/interfaces';

/**
 * API端点配置
 */
export interface ApiEndpoint {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  description: string;
}

export interface SkillRuntimeMetadata {
  matchSummary?: string;
  paramCollectionGuidance?: string;
  validationRules?: string;
  goal?: string;
  expectedResult?: string;
  outputParams?: Record<string, unknown>;
  sourceType?: 'execution_flow_template' | 'temporal_workflow' | string;
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
}

export type ToolCatalogStatus = 'active' | 'disabled' | 'deprecated';
export type ToolRiskLevel = 'L0' | 'L1' | 'L2' | 'L3';
export type ToolPromptExposure = 'hidden' | 'prompt_only' | 'runtime_only' | 'prompt_and_runtime';
export type SkillToolBindingSource = 'declared' | 'inferred_from_flow' | 'system_required';

export interface ToolCatalogDTO {
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

export interface UpdateToolCatalogDTO {
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

export interface SkillToolBindingDTO {
  skillId: string;
  toolName: string;
  bindingSource: SkillToolBindingSource;
}

export interface SkillToolValidationMessage {
  code: string;
  toolName?: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
}

export interface SkillToolValidationResult {
  isValid: boolean;
  declaredTools: string[];
  inferredTools: string[];
  effectiveTools: string[];
  missingTools: string[];
  disabledTools: string[];
  forbiddenSkillTools: string[];
  undeclaredFlowTools: string[];
  messages: SkillToolValidationMessage[];
}

/**
 * 参数Schema定义
 */
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

/**
 * 创建Skill DTO
 */
export interface CreateSkillDTO {
  name: string;
  description: string;
  triggerKeywords: string[];
  paramsSchema: ParamsSchema;
  templateId?: string;
  carboneTemplateId?: string;  // Carbone引擎的模板ID
  carboneSkillId?: string;      // Carbone引擎的Skill ID
  executionFlowTemplateIds?: string[];  // 关联的多个流程模板ID
  executionFlow?: ExecutionFlowStep[]; // 手动编排/追加的步骤
  tools?: string[];
  apiEndpoints?: {
    generateParameters?: ApiEndpoint;  // 参数生成API
    render?: ApiEndpoint;              // 文档渲染API
    getSkill?: ApiEndpoint;            // 获取Skill信息API
    runtimeMetadata?: SkillRuntimeMetadata;
  };
}

/**
 * Skill配置DTO
 */
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
  effectiveTools?: string[];
  apiEndpoints?: {
    generateParameters?: ApiEndpoint;
    render?: ApiEndpoint;
    getSkill?: ApiEndpoint;
    runtimeMetadata?: SkillRuntimeMetadata;
  };
  isActive: boolean;
  configStatus?: string;
  lastValidationSummary?: Record<string, unknown> | null;
  isPublished: boolean;
  publishedReleaseId?: string | null;
  publishedReleaseVersion?: number | null;
  publishedReleaseStatus?: string | null;
  publishedDeploymentStatus?: string | null;
  publishedSourceType?: string | null;
}

export interface LLMUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
}

/**
 * Skill匹配结果
 */
export interface SkillMatchResult {
  skillId: string;
  skillName: string;
  matchedKeywords: string[];
  confidence: number;
  collectedParams: Record<string, unknown>;
  missingParams: string[];
  paramsSchema: ParamsSchema;
  templateId?: string;
  carboneTemplateId?: string;
  carboneSkillId?: string;
  executionFlowTemplateIds?: string[];  // 关联的多个流程模板ID
  apiEndpoints?: {
    generateParameters?: ApiEndpoint;
    render?: ApiEndpoint;
    getSkill?: ApiEndpoint;
    runtimeMetadata?: SkillRuntimeMetadata;
  };
  goal?: string;
  expectedResult?: string;
  outputParams?: Record<string, unknown>;
  // 新增：AI 匹配原因
  matchReason?: string;
  // 新增：消耗
  usage?: LLMUsage;
  debug?: {
    llmCalls?: Array<{
      stage: string;
      label: string;
      modelId?: string;
      requestMessages?: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string;
      }>;
      responseText?: string;
      note?: string;
    }>;
    notes?: string[];
  };
}

/**
 * Skill 权限 DTO
 */
export interface SkillPermissionDTO {
  skillId: string;
  skillName: string;
  roleId: string;
  roleName: string;
  grantedAt: Date;
  grantedBy: string | null;  // 数据库返回 null，使用 null 类型
}

/**
 * 授权 Skill 给角色 DTO
 */
export interface GrantSkillDTO {
  roleId: string;
}

/**
 * AI 匹配响应
 */
export interface AIMatchResponse {
  matchedSkill: string;
  confidence: number;
  reason: string;
}

/**
 * Skill验证结果
 */
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
      toolValidationPassed?: boolean;
      triggerKeywordQuality: string;
      paramsSchemaCompleteness: string;
    };
    toolValidation?: SkillToolValidationResult;
    skillSimulation?: {
      success: boolean;
      validationScore: number;
      simulatedRequest: string;
      summary: string;
      issues: string[];
      suggestions: string[];
      log?: string[];           // 执行日志
      iterations?: number;      // 执行迭代次数
      generatedSkill?: Partial<SkillConfigDTO>;
    };
  };
}
