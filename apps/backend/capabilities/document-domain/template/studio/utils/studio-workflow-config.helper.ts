import {
  DEFAULT_RENDER_PLAN_VERSION,
  TEMPLATE_ASSET_MANIFEST_VERSION,
  TEMPLATE_ASSET_SOURCE_WORKFLOW_FALLBACK,
  TEMPLATE_DOCUMENT_MODE_BILINGUAL,
  TEMPLATE_DOCUMENT_MODE_SINGLE_LANGUAGE,
  TEMPLATE_WORKFLOW_SCHEMA_VERSION,
  RenderPlan,
  TemplateAssetManifest,
} from '../studio.types';
import { TemplateSaveDto } from '../studio.dto';
import {
  WorkflowBindingPlan,
  WorkflowDocumentIR,
  WorkflowSaveResult,
  WorkflowTermAssets,
  WorkflowTemplateFieldSpec,
} from '../../workflow-authoring/template-workflow.service';

export interface StudioWorkflowConfigSnapshot {
  templateFieldSpecs: WorkflowTemplateFieldSpec[];
  carboneBindingPlan?: WorkflowBindingPlan;
  renderPlan?: RenderPlan;
  templateAssetManifest?: TemplateAssetManifest;
  sourceLanguage?: string;
  targetLanguages?: string[];
  termAssets?: WorkflowTermAssets;
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function resolveDocumentMode(targetLanguages?: string[], explicitDocumentMode?: string): string {
  if (typeof explicitDocumentMode === 'string' && explicitDocumentMode.trim()) {
    return explicitDocumentMode;
  }
  return Array.isArray(targetLanguages) && targetLanguages.length > 0
    ? TEMPLATE_DOCUMENT_MODE_BILINGUAL
    : TEMPLATE_DOCUMENT_MODE_SINGLE_LANGUAGE;
}

function resolveRenderPlanVersion(renderPlan?: RenderPlan, explicitVersion?: number): number {
  return Number(explicitVersion || renderPlan?.version || DEFAULT_RENDER_PLAN_VERSION);
}

export function buildStudioWorkflowMetaDocument(
  id: string,
  dto: Pick<TemplateSaveDto, 'templateMeta' | 'templateFieldSpecs'> & {
    templateDocumentIr?: WorkflowDocumentIR;
  },
  workflowResult: WorkflowSaveResult,
  existingMeta?: Record<string, any>
): Record<string, any> {
  const format = String(existingMeta?.format || 'docx');
  const templateName =
    dto.templateMeta?.templateName || existingMeta?.fileName || `draft-${id}.${format}`;
  const existingTemplateWorkflow = isPlainObject(existingMeta?.templateConfig?.templateWorkflow)
    ? existingMeta.templateConfig.templateWorkflow
    : undefined;
  const templateConfig = {
    ...(isPlainObject(existingMeta?.templateConfig) ? existingMeta.templateConfig : {}),
    templateWorkflow: {
      workflowVersion: TEMPLATE_WORKFLOW_SCHEMA_VERSION,
      templateDocumentIr: dto.templateDocumentIr || existingTemplateWorkflow?.templateDocumentIr,
      templateFieldSpecs: dto.templateFieldSpecs,
      carboneBindingPlan: workflowResult.carboneBindingPlan,
      renderPlan: workflowResult.renderPlan,
      languageProfile: {
        sourceLanguage: dto.templateMeta?.sourceLanguage || 'zh',
        targetLanguages: dto.templateMeta?.targetLanguages || [],
        documentMode: resolveDocumentMode(
          dto.templateMeta?.targetLanguages,
          dto.templateMeta?.documentMode
        ),
      },
      termAssets: dto.templateMeta?.termAssets,
      status: workflowResult.status,
      version: workflowResult.version,
      bindingPlanVersion: workflowResult.bindingPlanVersion,
    },
    templateAssetManifest: workflowResult.templateAssetManifest,
  };

  return {
    ...(existingMeta || {}),
    id,
    type: existingMeta?.type || 'template',
    format,
    fileName: templateName,
    hasValidFile: existingMeta?.hasValidFile ?? false,
    variables: workflowResult.carboneBindingPlan.bindings.map((binding) => binding.variablePath),
    loops: existingMeta?.loops || [],
    templateConfig,
    configSavedAt: workflowResult.updatedAt,
    createdAt: existingMeta?.createdAt || workflowResult.updatedAt,
    updatedAt: workflowResult.updatedAt,
  };
}

export function buildStudioFallbackTemplateAssetManifest(
  meta: Record<string, any>,
  workflow: Record<string, any> | undefined
): TemplateAssetManifest | undefined {
  if (
    !workflow ||
    !Array.isArray(workflow.templateFieldSpecs) ||
    workflow.templateFieldSpecs.length === 0
  ) {
    return undefined;
  }

  const sourceLanguage =
    typeof workflow?.languageProfile?.sourceLanguage === 'string'
      ? workflow.languageProfile.sourceLanguage
      : 'zh';
  const targetLanguages = Array.isArray(workflow?.languageProfile?.targetLanguages)
    ? (workflow.languageProfile.targetLanguages as string[])
    : [];
  const documentMode =
    typeof workflow?.languageProfile?.documentMode === 'string'
      ? workflow.languageProfile.documentMode
      : targetLanguages.length > 0
        ? TEMPLATE_DOCUMENT_MODE_BILINGUAL
        : TEMPLATE_DOCUMENT_MODE_SINGLE_LANGUAGE;
  const fallbackRenderPlan = isPlainObject(workflow?.renderPlan)
    ? (workflow.renderPlan as RenderPlan)
    : isPlainObject(workflow?.carboneBindingPlan)
      ? (workflow.carboneBindingPlan as RenderPlan)
      : undefined;

  if (!fallbackRenderPlan) {
    return undefined;
  }

  return {
    assetVersion: TEMPLATE_ASSET_MANIFEST_VERSION,
    templateId: String(meta?.id || ''),
    fileName: String(meta?.fileName || ''),
    format: String(meta?.format || 'docx'),
    fieldCount: workflow.templateFieldSpecs.length,
    templateFieldSpecs: workflow.templateFieldSpecs as WorkflowTemplateFieldSpec[],
    languageProfile: {
      sourceLanguage,
      targetLanguages,
      documentMode,
    },
    renderPlan: fallbackRenderPlan,
    renderPlanVersion: resolveRenderPlanVersion(
      fallbackRenderPlan,
      Number(workflow?.bindingPlanVersion || workflow?.version || DEFAULT_RENDER_PLAN_VERSION)
    ),
    termAssets: isPlainObject(workflow?.termAssets)
      ? (workflow.termAssets as WorkflowTermAssets)
      : undefined,
    metadata: {
      generatedAt: String(meta?.updatedAt || meta?.configSavedAt || new Date().toISOString()),
      source: TEMPLATE_ASSET_SOURCE_WORKFLOW_FALLBACK,
    },
  };
}

export function readStudioWorkflowConfig(meta: Record<string, any>): StudioWorkflowConfigSnapshot {
  const workflow = isPlainObject(meta?.templateConfig?.templateWorkflow)
    ? meta.templateConfig.templateWorkflow
    : undefined;

  const manifest = isPlainObject(meta?.templateConfig?.templateAssetManifest)
    ? (meta.templateConfig.templateAssetManifest as TemplateAssetManifest)
    : buildStudioFallbackTemplateAssetManifest(meta, workflow);

  return {
    templateFieldSpecs:
      manifest?.templateFieldSpecs ||
      (Array.isArray(workflow?.templateFieldSpecs)
        ? (workflow.templateFieldSpecs as WorkflowTemplateFieldSpec[])
        : []),
    carboneBindingPlan: isPlainObject(workflow?.carboneBindingPlan)
      ? (workflow.carboneBindingPlan as WorkflowBindingPlan)
      : undefined,
    renderPlan:
      manifest?.renderPlan ||
      (isPlainObject(workflow?.renderPlan) ? (workflow.renderPlan as RenderPlan) : undefined),
    templateAssetManifest: manifest,
    sourceLanguage:
      manifest?.languageProfile?.sourceLanguage ||
      (typeof workflow?.languageProfile?.sourceLanguage === 'string'
        ? workflow.languageProfile.sourceLanguage
        : undefined),
    targetLanguages:
      manifest?.languageProfile?.targetLanguages ||
      (Array.isArray(workflow?.languageProfile?.targetLanguages)
        ? (workflow.languageProfile.targetLanguages as string[])
        : undefined),
    termAssets:
      manifest?.termAssets ||
      (isPlainObject(workflow?.termAssets)
        ? (workflow.termAssets as WorkflowTermAssets)
        : undefined),
  };
}
