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
  category?: string;
  triggerKeywords: string[];
  paramsSchema: ParamsSchema;
  templateId?: string;
  carboneTemplateId?: string;  // Carbone引擎的模板ID
  carboneSkillId?: string;      // Carbone引擎的Skill ID
  executionFlow?: string[];
  tools?: string[];
  apiEndpoints?: {
    generateParameters?: ApiEndpoint;  // 参数生成API
    render?: ApiEndpoint;              // 文档渲染API
    getSkill?: ApiEndpoint;            // 获取Skill信息API
  };
}

/**
 * Skill配置DTO
 */
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
  executionFlow: string[];
  tools: string[];
  apiEndpoints?: {
    generateParameters?: ApiEndpoint;
    render?: ApiEndpoint;
    getSkill?: ApiEndpoint;
  };
  isActive: boolean;
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
  apiEndpoints?: {
    generateParameters?: ApiEndpoint;
    render?: ApiEndpoint;
    getSkill?: ApiEndpoint;
  };
  // 新增：AI 匹配原因
  matchReason?: string;
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