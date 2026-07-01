import { HttpException, HttpStatus } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type {
  TemplateAssetImportPayload,
  TemplateResponse,
  RenderPlan,
} from '../studio.types';
import type {
  TemplateAssetExportDto,
  TemplateAssetImportDto,
  TemplateRenderDataDto,
  TemplateSaveDto,
} from '../studio.dto';
import type {
  TemplateWorkflowService,
  WorkflowSaveResult,
} from '../../workflow-authoring/template-workflow.service';
import {
  buildStudioWorkflowMetaDocument,
  readStudioWorkflowConfig,
} from './studio-workflow-config.helper';

type SaveWorkflowDeps = {
  templatesDir: string;
  templateWorkflowService: Pick<TemplateWorkflowService, 'compileAndPersistTemplate'>;
  syncTemplateMetaToDb: (
    id: string,
    meta: Record<string, any> & { format: string },
    filePath?: string
  ) => Promise<void>;
};

export async function saveStudioTemplateWorkflow(
  deps: SaveWorkflowDeps,
  dto: TemplateSaveDto
): Promise<{
  templateId: string;
  version: number;
  bindingPlanVersion: number;
  status: string;
  updatedAt: string;
  templateAssetManifest?: Record<string, any>;
}> {
  if (!Array.isArray(dto.templateFieldSpecs) || dto.templateFieldSpecs.length === 0) {
    throw new HttpException('TPL_001: templateFieldSpecs 不能为空', HttpStatus.BAD_REQUEST);
  }

  const templateId = dto.templateId || uuidv4();
  const metaPath = path.join(deps.templatesDir, `${templateId}.json`);
  const existingMeta = fs.existsSync(metaPath)
    ? JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
    : undefined;

  const format = String(existingMeta?.format || 'docx');
  const workflowResult: WorkflowSaveResult = deps.templateWorkflowService.compileAndPersistTemplate(
    templateId,
    dto.templateMeta,
    dto.templateFieldSpecs,
    dto.saveMode,
    format
  );

  const nextMeta = buildStudioWorkflowMetaDocument(templateId, dto, workflowResult, existingMeta);

  fs.writeFileSync(metaPath, JSON.stringify(nextMeta, null, 2));
  await deps.syncTemplateMetaToDb(
    templateId,
    nextMeta as Record<string, any> & { format: string },
    fs.existsSync(path.join(deps.templatesDir, `${templateId}.${nextMeta.format}`))
      ? path.join(deps.templatesDir, `${templateId}.${nextMeta.format}`)
      : metaPath
  );

  return {
    templateId: workflowResult.templateId,
    version: workflowResult.version,
    bindingPlanVersion: workflowResult.bindingPlanVersion,
    status: workflowResult.status,
    updatedAt: workflowResult.updatedAt,
    templateAssetManifest: workflowResult.templateAssetManifest,
  };
}

type ExportWorkflowDeps = {
  templatesDir: string;
  getTemplateMetaWithDbFallback: (id: string) => Promise<TemplateResponse>;
};

export async function exportStudioTemplateAsset(
  deps: ExportWorkflowDeps,
  dto: TemplateAssetExportDto
): Promise<TemplateAssetImportPayload> {
  const meta = await deps.getTemplateMetaWithDbFallback(dto.templateId);
  const workflow = readStudioWorkflowConfig(meta as Record<string, any>);
  if (!workflow.templateAssetManifest) {
    throw new HttpException('TPL_003: 当前模板缺少可导出的模板资产清单', HttpStatus.BAD_REQUEST);
  }

  let templateBinary: string | undefined;
  if (dto.includeBinary) {
    const templatePath = path.join(deps.templatesDir, `${dto.templateId}.${meta.format}`);
    if (!fs.existsSync(templatePath)) {
      throw new HttpException(
        'TPL_004: 模板二进制文件不存在，无法导出完整资产包',
        HttpStatus.BAD_REQUEST
      );
    }
    templateBinary = fs.readFileSync(templatePath).toString('base64');
  }

  return {
    manifest: workflow.templateAssetManifest,
    templateBinary,
  };
}

type ImportWorkflowDeps = {
  templatesDir: string;
  syncTemplateMetaToDb: (
    id: string,
    meta: Record<string, any> & { format: string },
    filePath?: string
  ) => Promise<void>;
  getTemplateMeta: (id: string) => TemplateResponse;
  resolveRenderPlanVersion: (renderPlan?: RenderPlan, explicitVersion?: number) => number;
  isPlainObject: (value: unknown) => value is Record<string, any>;
};

export async function importStudioTemplateAsset(
  deps: ImportWorkflowDeps,
  dto: TemplateAssetImportDto,
  schemaVersion: string
): Promise<TemplateResponse> {
  if (!deps.isPlainObject(dto?.manifest)) {
    throw new HttpException('TPL_005: manifest 不能为空', HttpStatus.BAD_REQUEST);
  }

  const manifest = dto.manifest;
  const templateId = String(manifest.templateId || uuidv4()).trim() || uuidv4();
  const format = String(manifest.format || 'docx');
  const renderPlan = manifest.renderPlan;
  const metaPath = path.join(deps.templatesDir, `${templateId}.json`);
  const filePath = path.join(deps.templatesDir, `${templateId}.${format}`);
  const existingMeta = fs.existsSync(metaPath)
    ? JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
    : undefined;

  if (dto.templateBinary) {
    fs.writeFileSync(filePath, Buffer.from(dto.templateBinary, 'base64'));
  }

  const nextMeta = {
    ...(existingMeta || {}),
    id: templateId,
    type: existingMeta?.type || 'template',
    format,
    fileName: String(manifest.fileName || existingMeta?.fileName || `imported-${templateId}.${format}`),
    hasValidFile: dto.templateBinary ? true : (existingMeta?.hasValidFile ?? false),
    variables: Array.isArray(renderPlan?.bindings)
      ? renderPlan.bindings.map((binding) => binding.variablePath)
      : [],
    loops: existingMeta?.loops || [],
    templateConfig: {
      ...(deps.isPlainObject(existingMeta?.templateConfig) ? existingMeta.templateConfig : {}),
      templateWorkflow: {
        workflowVersion: schemaVersion,
        templateFieldSpecs: Array.isArray(manifest.templateFieldSpecs)
          ? manifest.templateFieldSpecs
          : [],
        carboneBindingPlan: renderPlan,
        renderPlan,
        languageProfile: manifest.languageProfile,
        termAssets: manifest.termAssets,
        status: 'ready',
        version: deps.resolveRenderPlanVersion(renderPlan),
        bindingPlanVersion: deps.resolveRenderPlanVersion(renderPlan, manifest.renderPlanVersion),
      },
      templateAssetManifest: manifest,
    },
    configSavedAt: String(manifest.metadata?.generatedAt || new Date().toISOString()),
    createdAt:
      existingMeta?.createdAt || String(manifest.metadata?.generatedAt || new Date().toISOString()),
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(metaPath, JSON.stringify(nextMeta, null, 2));
  await deps.syncTemplateMetaToDb(
    templateId,
    nextMeta as Record<string, any> & { format: string },
    fs.existsSync(filePath) ? filePath : metaPath
  );

  return deps.getTemplateMeta(templateId);
}

type RenderWorkflowDeps = {
  getTemplateMetaWithDbFallback: (id: string) => Promise<TemplateResponse>;
  templateWorkflowService: Pick<TemplateWorkflowService, 'renderData'>;
};

export async function renderStudioTemplateData(
  deps: RenderWorkflowDeps,
  dto: TemplateRenderDataDto
): Promise<{
  data: Record<string, unknown>;
  sourceTrace: Record<string, unknown>;
  warnings: string[];
  missingFields: string[];
  needsReviewFields: string[];
}> {
  const meta = await deps.getTemplateMetaWithDbFallback(dto.templateId);
  const workflow = readStudioWorkflowConfig(meta as Record<string, any>);
  if (workflow.templateFieldSpecs.length === 0) {
    throw new HttpException(
      'TPL_002: 当前模板尚未保存 TemplateFieldSpec',
      HttpStatus.BAD_REQUEST
    );
  }

  return (await deps.templateWorkflowService.renderData(
    dto.userInput,
    workflow.templateFieldSpecs,
    workflow.carboneBindingPlan,
    dto.sourceLanguage || workflow.sourceLanguage || 'zh',
    dto.targetLanguages || workflow.targetLanguages || [],
    dto.userOverrides,
    dto.termAssets || workflow.termAssets
  )) as {
    data: Record<string, unknown>;
    sourceTrace: Record<string, unknown>;
    warnings: string[];
    missingFields: string[];
    needsReviewFields: string[];
  };
}
