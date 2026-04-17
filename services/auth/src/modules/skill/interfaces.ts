/**
 * Skill Interfaces
 * Skill模块接口定义
 */

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
  executionFlow?: string[];
  tools?: string[];
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
  executionFlow: string[];
  tools: string[];
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
}