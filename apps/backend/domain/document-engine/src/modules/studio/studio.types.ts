/**
 * Studio模块共享类型定义
 * 此文件用于确保所有分支的类型定义一致性
 */

export const TEMPLATE_ASSET_MANIFEST_VERSION = '1.0';
export const TEMPLATE_WORKFLOW_SCHEMA_VERSION = 'p0-template-workflow';
export const TEMPLATE_ASSET_SOURCE_OFFICE_ADDIN = 'office-addin';
export const TEMPLATE_ASSET_SOURCE_LEGACY = 'legacy-template-workflow';
export const TEMPLATE_DOCUMENT_MODE_SINGLE_LANGUAGE = 'single_language';
export const TEMPLATE_DOCUMENT_MODE_BILINGUAL = 'single_or_bilingual';
export const DEFAULT_RENDER_PLAN_VERSION = 1;

export interface TemplateResponse {
  id: string;
  fileName: string;
  format: 'docx' | 'xlsx' | 'pptx' | 'html';
  size: number;
  variables: string[];
  parameterCount?: number;
  suggestions?: any[];
  rawSuggestions?: any[];
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
  templateAssetManifest?: TemplateAssetManifest; // 新增：模板资产清单
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

/**
 * 渲染计划 (Render Plan)
 * 原 carboneBindingPlan 的更名与收敛版本
 */
export interface RenderPlan {
  templateId: string;
  version: number;
  bindings: Array<{
    fieldId: string;
    variablePath: string;
    valueSelector: string;
    language?: string;
    transform: string;
    required: boolean;
  }>;
}

/**
 * 模板资产清单 (Template Asset Manifest)
 * 包含模板的所有语义信息，可独立于数据库存在
 */
export interface TemplateAssetManifest {
  assetVersion: string; // 清单结构版本，例如 "1.0"
  templateId: string;
  fileName: string;
  format: string;
  fieldCount: number;
  templateFieldSpecs: any[]; // 对应 WorkflowTemplateFieldSpec[]
  languageProfile: any;      // 对应 WorkflowLanguageProfile
  renderPlan: RenderPlan;
  renderPlanVersion: number;
  termAssets?: any;          // 对应 WorkflowTermAssets
  metadata: {
    generatedAt: string;
    source: string;          // 例如 "office-addin"
    addinVersion?: string;
  };
}

/**
 * 模板资产导出负载
 */
export interface TemplateAssetExportPayload {
  templateId: string;
  includeBinary: boolean;
}

/**
 * 模板资产导入负载
 */
export interface TemplateAssetImportPayload {
  manifest: TemplateAssetManifest;
  templateBinary?: string; // Base64
}

/**
 * 从资产生成工作流草稿的结果
 */
export interface GenerateTemplateWorkflowDraftFromAssetResult {
  workflowDsl: any;
  activityDsl: any;
  templateAssetVersion: string;
  renderPlanVersion: number;
  warnings?: string[];
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
