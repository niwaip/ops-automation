/**
 * Skill Interfaces
 * Skill模块接口定义
 */

/**
 * API端点配置
 */
export interface ApiEndpoint {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  description: string;
}

export interface SkillRuntimeMetadata {
  routingAliases?: string[];
  matchSummary?: string;
  paramCollectionGuidance?: string;
  validationRules?: string;
  goal?: string;
  outputParams?: Record<string, unknown>;
  runtimeType?: string;
  templateFormat?: string;
  supportsArtifact?: boolean;
  producesArtifact?: boolean;
  expectedResult?: string;
  sourceType?: 'execution_flow_template' | 'temporal_workflow' | string;
  skillGuideMarkdown?: string;
  dataExampleJson?: Record<string, unknown> | string;
  extractionRules?: Array<Record<string, unknown>>;
  mappingHints?: Array<Record<string, unknown>>;
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
  workflowInputPolicy?: WorkflowInputPolicy;
}

export type WorkflowParamRequiredMode = 'always' | 'conditional' | 'optional' | 'system_required';

export interface WorkflowParamPolicy {
  enabled?: boolean;
  requiredMode?: WorkflowParamRequiredMode;
  defaultValue?: unknown;
  defaultValueResolver?: string;
  valueSourcePriority?: string[];
  confirmationThreshold?: number;
  previewBlocking?: boolean;
  validationRules?: Array<Record<string, unknown>>;
  transformRule?: string;
  templateBinding?: string;
}

export interface WorkflowInputPolicy {
  params: Record<string, WorkflowParamPolicy>;
}

export type ToolCatalogStatus = 'active' | 'disabled' | 'deprecated';
export type ToolRiskLevel = 'L0' | 'L1' | 'L2' | 'L3';
export type ToolPromptExposure = 'hidden' | 'prompt_only' | 'runtime_only' | 'prompt_and_runtime';
export type SkillToolBindingSource = 'declared' | 'inferred_from_flow' | 'system_required';

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

export interface SkillToolBinding {
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
  properties: Record<
    string,
    {
      type: 'string' | 'number' | 'date' | 'boolean';
      description: string;
      /** @deprecated 过渡兼容字段；模板级必填策略应迁移到 workflowInputPolicy.params.requiredMode */
      required?: boolean;
      /** @deprecated 过渡兼容字段；模板级默认值应迁移到 workflowInputPolicy.params.defaultValue */
      default?: string | number | boolean;
      extractionPrompt?: string;
      semanticRole?: string;
      extractionHints?: string[];
      displayName?: string;
      groupLabel?: string;
      renderPath?: string | string[];
      /** @deprecated 过渡兼容字段；预览阻断策略应迁移到 workflowInputPolicy.params.previewBlocking */
      previewBlocking?: boolean;
      /** @deprecated 过渡兼容字段；确认阈值应迁移到 workflowInputPolicy.params.confirmationThreshold */
      confirmationThreshold?: number;
      enum?: Array<string | number>;
      /** Canonical enum value -> locale/domain aliases used by deterministic recognition. */
      'x-enum-aliases'?: Record<string, Array<string | number>>;
    }
  >;
  /** @deprecated 过渡兼容字段；模板级 required 列表应迁移到 workflowInputPolicy.params.requiredMode */
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
  executionFlowTemplateIds?: string[]; // 关联的多个流程模板ID
  executionFlow?: Array<Record<string, unknown>>; // 手动编排/追加的步骤
  tools?: string[];
  apiEndpoints?: {
    runtimeMetadata?: SkillRuntimeMetadata;
  };
  /**
   * Authoritative output JSON Schema (§6.3 / §9.3). Set by the capability
   * release pipeline at publish time; the control plane treats
   * `skill_configs.output_schema` as the custom-skill output contract.
   */
  outputSchema?: Record<string, unknown>;
}

/**
 * Skill配置DTO
 */
export interface SkillConfigDto {
  id: string;
  name: string;
  description: string;
  triggerKeywords: string[];
  paramsSchema: ParamsSchema;
  executionFlowTemplateIds: string[]; // 关联的多个流程模板ID
  executionFlow: Array<Record<string, unknown>>;
  tools: string[];
  effectiveTools?: string[];
  apiEndpoints?: {
    runtimeMetadata?: SkillRuntimeMetadata;
  };
  isActive: boolean;
  configStatus?: string;
  isPublished: boolean;
  publishedReleaseId?: string | null;
  publishedReleaseVersion?: number | null;
  publishedReleaseStatus?: string | null;
  publishedDeploymentStatus?: string | null;
  publishedSourceType?: string | null;
  outputSchema?: Record<string, unknown>;
}

export type SkillAccessStatus = 'authorized' | 'requested' | 'unauthorized';

export interface SkillAccessRequestDTO {
  id: string;
  skillId: string;
  requesterUserId: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reason?: string | null;
  responseNote?: string | null;
  processedAt?: Date | null;
  processedBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SkillAccessRequestReviewDTO extends SkillAccessRequestDTO {
  skillName: string;
  requesterUsername: string;
  requesterEmail?: string | null;
  requesterRole: string;
  targetRoleId?: string | null;
  targetRoleName?: string | null;
}

export interface PublishedSkillCatalogItemDTO extends SkillConfigDto {
  accessStatus: SkillAccessStatus;
  accessRequest?: SkillAccessRequestDTO | null;
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
  executionFlowTemplateIds?: string[]; // 关联的多个流程模板ID
  apiEndpoints?: {
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
  grantedBy: string | null; // 数据库返回 null，使用 null 类型
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
  matchedSkill: string | null;
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
      log?: string[]; // 执行日志
      iterations?: number; // 执行迭代次数
      generatedSkill?: Partial<SkillConfigDto>;
    };
  };
}
