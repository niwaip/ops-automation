import type { ArtifactRef } from '@ops/backend-runtime-capability-contract';

export const TEMPLATE_ASSET_MANIFEST_VERSION = '1.0';
export const TEMPLATE_WORKFLOW_SCHEMA_VERSION = 'p0-template-workflow';
export const TEMPLATE_ASSET_SOURCE_OFFICE_ADDIN = 'office-addin';
export const TEMPLATE_ASSET_SOURCE_WORKFLOW_FALLBACK = 'legacy-template-workflow';
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
  ignoredElements?: number[];
  elementGroups?: Record<string, number[]>;
  ignoredGroups?: string[];
  savedAt?: string;
  templateConfig?: any;
  configSavedAt?: string;
  skillId?: string;
  markedTemplateId?: string;
  templateAssetManifest?: TemplateAssetManifest;
  verifyResult?: {
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

export interface TemplateAssetManifest {
  assetVersion: string;
  templateId: string;
  fileName: string;
  format: string;
  fieldCount: number;
  templateFieldSpecs: any[];
  languageProfile: any;
  renderPlan: RenderPlan;
  renderPlanVersion: number;
  termAssets?: any;
  metadata: {
    generatedAt: string;
    source: string;
    addinVersion?: string;
  };
}

export interface TemplateAssetExportPayload {
  templateId: string;
  includeBinary: boolean;
}

export interface TemplateAssetImportPayload {
  manifest: TemplateAssetManifest;
  templateBinary?: string;
}

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
  artifacts?: ArtifactRef[];
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
