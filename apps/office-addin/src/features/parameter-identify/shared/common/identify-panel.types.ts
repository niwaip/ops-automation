import type { TemplateFieldSpec, WorkflowTermAssets } from '../../../../api/carbone-api';

export interface DraftInfo {
  templateType: string;
  parameterCount: number;
  savedAt: string;
}

export interface LatestBackendDraftInfo {
  id: string;
  fileName: string;
  savedAt: string;
}

export interface TemplateAssetDraftInfo {
  fieldCount: number;
  status?: string;
  sourceLanguage?: string;
  targetLanguages?: string[];
  bindingPlanVersion?: number;
  fields: TemplateFieldSpec[];
  termAssets?: WorkflowTermAssets;
}

export interface TemplateAssetNotice {
  type: 'success' | 'error' | 'info';
  message: string;
  lines?: string[];
}

export interface ActionResult {
  success: boolean;
  message: string;
}

export interface PreviewResult extends ActionResult {
  previewUrl?: string;
  downloadUrl?: string;
  generatedData?: any;
}
