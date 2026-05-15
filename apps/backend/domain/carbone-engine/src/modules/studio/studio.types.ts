/**
 * Studio模块共享类型定义
 * 此文件用于确保所有分支的类型定义一致性
 */

export interface TemplateResponse {
  id: string;
  fileName: string;
  format: 'docx' | 'xlsx' | 'pptx' | 'html';
  size: number;
  variables: string[];
  parameterCount?: number;
  loops: Array<{ arrayPath: string }>;
  markings?: Array<{ path: string; text: string; formatters?: string[] }>;
  ignoredElements?: number[];  // 被忽略的元素索引列表
  elementGroups?: Record<string, number[]>;  // 元素分组
  ignoredGroups?: string[];  // 被忽略的分组ID列表
  savedAt?: string;
  templateConfig?: any;  // AI-generated template configuration
  configSavedAt?: string;
  skillId?: string;  // 关联的Skill ID - 重要：确保所有分支都有此属性
  markedTemplateId?: string;  // 编辑后的模版ID
  verifyResult?: {  // AI验证结果
    report?: string;
    downloadUrl?: string;
    previewUrl?: string;
    markedTemplateId?: string;
    markedTemplateUrl?: string;
    sampleData?: any;
    success?: boolean;
    verifiedAt?: string;
  };
}

export interface RenderResponse {
  downloadUrl: string;
  fileName: string;
  format: string;
  size?: number;
}

export interface AIIdentifyResponse {
  templateConfig: any;
  suggestions: any[];
  rawSuggestions?: any[];
  loops: any[];
  images: any[];
  combinedVariables: any[];
  analyzedAt: string;
  documentStats?: any;
  contextAnalysis?: any;
}
