import { HttpException, HttpStatus } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { buildDocumentRenderArtifacts } from '../../../runtime-facade/artifacts/document-artifact.helper';
import type { RenderResponse } from '../../contracts';
import { applyDirectRenderPaths } from './direct-render-path.helper';

type RenderWorkflowConfig = {
  sourceLanguage?: string;
  targetLanguages?: string[];
};

type ResolveRenderTargetDeps = {
  getSkillWithDbFallback: (id: string) => Promise<Record<string, unknown> | null>;
};

type ExecuteResolvedRenderDeps = {
  templatesDir: string;
  outputsDir: string;
  getTemplateMetaWithDbFallback: (id: string) => Promise<any>;
  readWorkflowConfig: (meta: Record<string, any>) => RenderWorkflowConfig;
  normalizeRenderData: (data: Record<string, any>) => Record<string, any>;
  documentStructureService: {
    applyConfigToDocx: (buffer: Buffer, config: Record<string, any>) => Promise<Buffer>;
  };
  engine: {
    render: (buffer: Buffer, data: Record<string, any>, fileName: string) => Promise<Buffer>;
  };
  generateOutputFileName: (
    templateName: string,
    format: string,
    data?: Record<string, any>
  ) => string;
  syncRenderOutputToDb: (meta: Record<string, any>, filePath: string) => Promise<void>;
  debugReport: (hypothesisId: string, msg: string, data?: Record<string, unknown>) => void;
  logger: {
    error: (message: string, stack?: string) => void;
  };
};

export function extractPartyAName(data?: Record<string, any>): string | undefined {
  if (!data || typeof data !== 'object') return undefined;

  const raw =
    data.partyA?.name ||
    data['partyA.name'] ||
    (typeof data.partyA === 'string' ? data.partyA : undefined) ||
    data.firstParty?.name ||
    data['firstParty.name'] ||
    (typeof data.firstParty === 'string' ? data.firstParty : undefined) ||
    data.client?.name ||
    data['client.name'] ||
    (typeof data.client === 'string' ? data.client : undefined) ||
    data.customer?.name ||
    data['customer.name'] ||
    (typeof data.customer === 'string' ? data.customer : undefined) ||
    data['甲方'] ||
    data['甲方名称'] ||
    data['甲方公司名称'];

  if (typeof raw === 'string') {
    const cleaned = raw.replace(/[\\/:*?"<>|\r\n\t]/g, '').trim();
    if (cleaned.length > 0) {
      return cleaned;
    }
  }
  return undefined;
}

export function extractDocumentVersion(data?: Record<string, any>): string {
  if (!data || typeof data !== 'object') return 'v1';

  const raw =
    data.version ||
    data.docVersion ||
    data.contractVersion ||
    data['version'] ||
    data['版本'];

  if (raw !== undefined && raw !== null) {
    const str = String(raw).replace(/[\\/:*?"<>|\r\n\t]/g, '').trim();
    if (str.length > 0) {
      return /^\d/.test(str) ? `v${str}` : str;
    }
  }
  return 'v1';
}

export function formatCreationDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

export function generateStudioRenderOutputFileName(
  templateName: string,
  format: string,
  data?: Record<string, any>
): string {
  const baseName = templateName
    .replace(/\.[^/.]+$/, '')
    .replace(/[\\/:*?"<>|\r\n\t]/g, '')
    .trim();
  const partyA = extractPartyAName(data);
  const version = extractDocumentVersion(data);
  const creationDate = formatCreationDate(new Date());

  const parts = [baseName || 'document'];
  if (partyA) {
    parts.push(partyA);
  }
  if (version) {
    parts.push(version);
  }
  parts.push(creationDate);

  const cleanFormat = format.replace(/^\./, '').trim();
  return `${parts.join('_')}.${cleanFormat}`;
}

export async function resolveStudioRenderTarget(
  deps: ResolveRenderTargetDeps,
  input: {
    templateId?: string;
    skillId?: string;
    publishedSkillId?: string;
  }
): Promise<{
  templateId: string;
  skillId?: string;
  publishedSkillId?: string;
}> {
  const requestedTemplateId =
    typeof input.templateId === 'string' && input.templateId.trim()
      ? input.templateId.trim()
      : undefined;
  const requestedSkillId =
    typeof input.skillId === 'string' && input.skillId.trim() ? input.skillId.trim() : undefined;
  const publishedSkillId =
    typeof input.publishedSkillId === 'string' && input.publishedSkillId.trim()
      ? input.publishedSkillId.trim()
      : undefined;

  if (!requestedTemplateId && !requestedSkillId) {
    throw new HttpException(
      'Missing render target: require templateId or skillId',
      HttpStatus.BAD_REQUEST
    );
  }

  if (!requestedSkillId) {
    return {
      templateId: requestedTemplateId as string,
      publishedSkillId,
    };
  }

  const skillMeta = await deps.getSkillWithDbFallback(requestedSkillId);
  if (!skillMeta) {
    if (requestedTemplateId) {
      return {
        templateId: requestedTemplateId,
        publishedSkillId,
      };
    }
    throw new HttpException(`Skill not found: ${requestedSkillId}`, HttpStatus.NOT_FOUND);
  }

  const resolvedTemplateId =
    typeof skillMeta.templateId === 'string' && skillMeta.templateId.trim()
      ? skillMeta.templateId.trim()
      : undefined;
  if (!resolvedTemplateId) {
    throw new HttpException(
      `Skill ${requestedSkillId} is not bound to a template`,
      HttpStatus.BAD_REQUEST
    );
  }

  if (requestedTemplateId && requestedTemplateId !== resolvedTemplateId) {
    throw new HttpException(
      `Skill ${requestedSkillId} resolves to template ${resolvedTemplateId}, but received templateId ${requestedTemplateId}`,
      HttpStatus.BAD_REQUEST
    );
  }

  return {
    templateId: resolvedTemplateId,
    skillId: requestedSkillId,
    publishedSkillId,
  };
}

export async function executeResolvedRender(
  deps: ExecuteResolvedRenderDeps,
  input: {
    templateId: string;
    data: Record<string, any>;
    workflowInputParams?: Record<string, unknown>;
    workflowInputPolicy?: Record<string, unknown>;
    outputFormat?: 'docx' | 'xlsx' | 'pptx' | 'pdf' | 'html';
    skillId?: string;
    publishedSkillId?: string;
    outputName?: string;
    sourceLanguage?: string;
    targetLanguages?: string[];
    prepareLocalizedRenderData?: boolean;
  }
): Promise<RenderResponse> {
  const meta = await deps.getTemplateMetaWithDbFallback(input.templateId);
  const workflow = deps.readWorkflowConfig(meta as Record<string, any>);
  const templatePath = path.join(deps.templatesDir, `${input.templateId}.${meta.format}`);

  if (!fs.existsSync(templatePath)) {
    throw new HttpException('Template file not found', HttpStatus.NOT_FOUND);
  }

  try {
    let renderInputData = input.data || {};
    const sourceLanguage = input.sourceLanguage || workflow.sourceLanguage || 'zh';
    const targetLanguages = Array.isArray(input.targetLanguages)
      ? input.targetLanguages
      : workflow.targetLanguages || [];

    if (input.prepareLocalizedRenderData === true) {
      renderInputData = applyDirectRenderPaths(input.data || {}, input.workflowInputParams);
    }

    const normalizedData = deps.normalizeRenderData(renderInputData);
    deps.debugReport('B', 'render-resolved normalized data prepared', {
      templateId: input.templateId,
      prepareLocalizedRenderData: input.prepareLocalizedRenderData === true,
      sourceLanguage,
      targetLanguages,
      signingDateCnType: typeof normalizedData?.contract?.signingDate_cn,
      signingDateJpType: typeof normalizedData?.contract?.signingDate_jp,
      signingDateCnValue: normalizedData?.contract?.signingDate_cn ?? null,
      signingDateJpValue: normalizedData?.contract?.signingDate_jp ?? null,
      itemRowCount: Array.isArray(normalizedData?.items) ? normalizedData.items.length : 0,
    });

    const templateBuffer = fs.readFileSync(templatePath);
    const config = meta.templateConfig || {};
    const markedBuffer = await deps.documentStructureService.applyConfigToDocx(templateBuffer, config);
    const outputBuffer = await deps.engine.render(markedBuffer, normalizedData, meta.fileName);

    const outputId = uuidv4();
    const outputFormat = input.outputFormat || meta.format;
    const outputFileName = deps.generateOutputFileName(
      input.outputName || meta.fileName,
      outputFormat,
      normalizedData
    );
    const outputPath = path.join(deps.outputsDir, `${outputId}.${outputFormat}`);
    fs.writeFileSync(outputPath, outputBuffer);

    const outputMeta = {
      id: outputId,
      templateId: input.templateId,
      ...(input.skillId ? { skillId: input.skillId } : {}),
      ...(input.publishedSkillId ? { publishedSkillId: input.publishedSkillId } : {}),
      ...(input.outputName ? { outputName: input.outputName } : {}),
      ...(sourceLanguage ? { sourceLanguage } : {}),
      ...(targetLanguages.length > 0 ? { targetLanguages } : {}),
      ...(input.prepareLocalizedRenderData === true ? { prepareLocalizedRenderData: true } : {}),
      fileName: outputFileName,
      format: outputFormat,
      size: outputBuffer.length,
      params: renderInputData,
      renderedAt: new Date().toISOString(),
    };
    const outputMetaPath = path.join(deps.outputsDir, `${outputId}.json`);
    fs.writeFileSync(outputMetaPath, JSON.stringify(outputMeta));
    await deps.syncRenderOutputToDb(outputMeta, outputPath);

    return {
      downloadUrl: `/studio/download/${outputId}`,
      fileName: outputFileName,
      format: outputFormat,
      size: outputBuffer.length,
      artifacts: buildDocumentRenderArtifacts({
        outputId,
        downloadUrl: `/studio/download/${outputId}`,
        fileName: outputFileName,
        format: outputFormat,
        sizeBytes: outputBuffer.length,
        templateId: input.templateId,
        skillId: input.skillId,
        publishedSkillId: input.publishedSkillId,
      }),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const stack = error instanceof Error ? error.stack : undefined;
    deps.logger.error(`render-resolved failed for template=${input.templateId}: ${message}`, stack);
    deps.debugReport('B', 'render-resolved failed', {
      templateId: input.templateId,
      skillId: input.skillId || null,
      publishedSkillId: input.publishedSkillId || null,
      sourceLanguage: input.sourceLanguage || null,
      targetLanguages: Array.isArray(input.targetLanguages) ? input.targetLanguages : [],
      prepareLocalizedRenderData: input.prepareLocalizedRenderData === true,
      inputKeyCount: input.data && typeof input.data === 'object' ? Object.keys(input.data).length : 0,
      inputKeysSample:
        input.data && typeof input.data === 'object' ? Object.keys(input.data).slice(0, 15) : [],
      workflowInputParamKeys:
        input.workflowInputParams && typeof input.workflowInputParams === 'object'
          ? Object.keys(input.workflowInputParams).slice(0, 15)
          : [],
      workflowInputPolicyKeys:
        input.workflowInputPolicy && typeof input.workflowInputPolicy === 'object'
          ? Object.keys(input.workflowInputPolicy).slice(0, 15)
          : [],
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: message,
    });
    throw new HttpException(
      `Failed to render resolved document: ${message}`,
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
}
