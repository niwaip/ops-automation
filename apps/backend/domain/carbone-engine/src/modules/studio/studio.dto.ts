import {
  TemplateAssetExportPayload,
  TemplateAssetImportPayload,
  TemplateAssetManifest,
} from './studio.types';
import {
  WorkflowDocumentIR,
  WorkflowFieldCandidate,
  WorkflowSaveMeta,
  WorkflowTemplateFieldSpec,
  WorkflowTermAssets,
  WorkflowUnderstandResult,
} from './template-workflow.service';

export class UploadTemplateDto {
  fileName!: string;
}

export class ParseTemplateDto {
  templateId!: string;
}

export class RenderDto {
  templateId!: string;
  data!: Record<string, any>;
  outputFormat?: 'docx' | 'xlsx' | 'pptx' | 'pdf' | 'html';
  sourceLanguage?: string;
  targetLanguages?: string[];
  prepareLocalizedRenderData?: boolean;
}

export class PreviewDto {
  templateId!: string;
  maxRows?: number;
}

export class AIIdentifyDto {
  templateId!: string;
  context?: string;
  manualMarkings?: Record<string, string>;  // 用户手动标记：{ 元素索引: 'param'|'loop'|'static' }
  markingSummary?: string;  // 标记摘要文本
}

/**
 * 直接AI识别DTO - 用于Office插件直接提交文档内容
 * 无需先上传模板，直接对文档内容进行AI识别
 */
export class DirectAIIdentifyDto {
  documentContent!: string;           // 文档文本内容（从Office获取）
  documentType!: 'docx' | 'xlsx' | 'pptx' | 'text';  // 文档类型
  templateType?: string;              // 模板类型：report, invoice, contract, certificate 等
  skillId?: string;                   // AI Skill ID
  skill?: any;                        // AI Skill 对象
  context?: string;                   // 上下文信息（如文档用途描述）
  customRules?: Array<{               // 自定义识别规则
    pattern: string;
    targetPath: string;
    description?: string;
  }>;
  underlineInfo?: Array<{             // 下划线信息（从Word JS API获取）
    text: string;                     // 带下划线的文本
    underlineType: string;            // 下划线类型
    paragraphIndex?: number;          // 段落索引（用于精确定位）
    paragraphText: string;            // 所在段落完整文本
    position: { start: number; end: number };  // 在段落中的位置
  }>;
  paragraphFormats?: Array<{          // 段落格式信息
    text: string;
    index: number;
    format: {
      fontSize?: number;
      isBold?: boolean;
      alignment?: string;
      isTitle?: boolean;
    };
  }>;
}

export class SaveMarkingsDto {
  templateId!: string;
  markings!: Array<{
    index?: number;      // 元素索引
    type?: string;       // 标记类型：param|loop|static
    path?: string;       // 变量路径（可选）
    text?: string;       // 文本内容（可选）
    formatters?: string[];
  }>;
  ignoredElements?: number[];  // 被忽略的元素索引列表
  elementGroups?: Record<string, number[]>;  // 元素分组
  ignoredGroups?: string[];  // 被忽略的分组ID列表
}

export class SaveTemplateConfigDto {
  templateId!: string;
  templateConfig!: any;  // TemplateConfig from AI analysis
  suggestions?: any[];
  rawSuggestions?: any[];
}

export class ValidateDto {
  templateId!: string;
  data!: Record<string, any>;
}

export class AIVerifyDto {
  templateId!: string;
  prompt?: string;
  testData?: string;
  templateConfig?: any;
}

export class RenderWithSkillDto {
  skillId!: string;
  params!: Record<string, any>;
  outputFormat?: 'docx' | 'xlsx' | 'pptx' | 'pdf' | 'html';
}

export class TemplateAnalyzeDto {
  workflowId?: string;
  templateId?: string;
  skillId?: string;
  skill?: any;
  templateDocumentIr!: WorkflowDocumentIR;
  sampleDocument?: {
    fileName?: string;
    contentBase64?: string;
  };
  candidateFields?: WorkflowFieldCandidate[];
  prefetchedUnderstanding?: WorkflowUnderstandResult;
  sourceLanguage?: string;
  targetLanguages?: string[];
  termAssets?: WorkflowTermAssets;
  options?: {
    enableTermMatch?: boolean;
    enableLayoutDetection?: boolean;
  };
}

export class TemplateUnderstandDto extends TemplateAnalyzeDto {}
export class TemplateCompareDto extends TemplateAnalyzeDto {}

export class TemplateSaveDto {
  templateId?: string;
  templateMeta?: WorkflowSaveMeta;
  templateDocumentIr!: WorkflowDocumentIR;
  templateFieldSpecs!: WorkflowTemplateFieldSpec[];
  saveMode?: 'draft_or_publish' | 'draft' | 'publish';
}

export class TemplateAssetExportDto implements TemplateAssetExportPayload {
  templateId!: string;
  includeBinary!: boolean;
}

export class TemplateAssetImportDto implements TemplateAssetImportPayload {
  manifest!: TemplateAssetManifest;
  templateBinary?: string;
}

export class TemplateRenderDataDto {
  templateId!: string;
  userInput!: string;
  sourceLanguage?: string;
  targetLanguages?: string[];
  userOverrides?: Record<string, unknown>;
  termAssets?: WorkflowTermAssets;
}

export interface ValidateResponse {
  valid: boolean;
  missing: string[];
}
