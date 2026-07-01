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
} from '../workflow-authoring/template-workflow.service';

export class UploadTemplateDto {
  fileName!: string;
}

export class ParseTemplateDto {
  templateId!: string;
}

export class AIIdentifyDto {
  templateId!: string;
  context?: string;
  manualMarkings?: Record<string, string>;
  markingSummary?: string;
}

export class DirectAIIdentifyDto {
  documentContent!: string;
  documentType!: 'docx' | 'xlsx' | 'pptx' | 'text';
  templateType?: string;
  skillId?: string;
  skill?: any;
  context?: string;
  customRules?: Array<{
    pattern: string;
    targetPath: string;
    description?: string;
  }>;
  underlineInfo?: Array<{
    text: string;
    underlineType: string;
    paragraphIndex?: number;
    paragraphText: string;
    position: { start: number; end: number };
  }>;
  paragraphFormats?: Array<{
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
    index?: number;
    type?: string;
    path?: string;
    text?: string;
    formatters?: string[];
  }>;
  ignoredElements?: number[];
  elementGroups?: Record<string, number[]>;
  ignoredGroups?: string[];
}

export class SaveTemplateConfigDto {
  templateId!: string;
  templateConfig!: any;
  suggestions?: any[];
  rawSuggestions?: any[];
}

export class AIVerifyDto {
  templateId!: string;
  prompt?: string;
  testData?: string;
  templateConfig?: any;
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
