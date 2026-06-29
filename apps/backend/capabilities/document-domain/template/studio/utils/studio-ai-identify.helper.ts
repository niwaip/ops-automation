import * as fs from 'fs';
import * as path from 'path';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import type {
  AIIdentifierService,
  AIIdentifyResponse,
} from '../../workflow-authoring/ai-identifier.service';
import type {
  DocumentStructure,
  DocumentStructureService,
} from '../../workflow-authoring/document-structure.service';
import type { TemplateResponse } from '../studio.types';
import { setupSseResponse } from './studio-ai-controller.helper';

type TemplateAiIdentifyDeps = {
  templatesDir: string;
  aiIdentifierService: Pick<
    AIIdentifierService,
    'analyzeWithAIStream' | 'identifyVariables' | 'generateVariableSuggestions'
  >;
  documentStructureService: Pick<DocumentStructureService, 'parseDocx'>;
  cacheTemplateSuggestions: (
    id: string,
    meta: TemplateResponse,
    result: Pick<AIIdentifyResponse, 'suggestions' | 'rawSuggestions' | 'templateConfig'>
  ) => Promise<void>;
};

type TemplateAiIdentifyInput = {
  id: string;
  meta: TemplateResponse;
  dto: {
    context?: string;
    manualMarkings?: Record<string, string>;
    markingSummary?: string;
  };
};

async function loadTemplateDocumentStructure(
  documentStructureService: Pick<DocumentStructureService, 'parseDocx'>,
  templatePath: string,
  format: string
): Promise<DocumentStructure | undefined> {
  if (format !== 'docx') {
    return undefined;
  }

  const buffer = fs.readFileSync(templatePath);
  return documentStructureService.parseDocx(buffer);
}

export async function executeTemplateAiIdentifyStream(
  deps: TemplateAiIdentifyDeps,
  input: TemplateAiIdentifyInput & { res: Response }
): Promise<void> {
  const { id, meta, dto, res } = input;
  const templatePath = path.join(deps.templatesDir, `${id}.${meta.format}`);

  if (!fs.existsSync(templatePath)) {
    res.status(404).json({ error: 'Template file not found' });
    return;
  }

  setupSseResponse(res);

  try {
    const documentStructure = await loadTemplateDocumentStructure(
      deps.documentStructureService,
      templatePath,
      meta.format
    );
    const elements = documentStructure?.elements || [];
    const config = await deps.aiIdentifierService.analyzeWithAIStream(
      elements,
      dto.context,
      dto.manualMarkings,
      dto.markingSummary,
      (chunk: string) => {
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      }
    );

    if (!config) {
      res.write(`data: ${JSON.stringify({ error: 'AI分析失败，请检查AI服务是否正常' })}\n\n`);
      res.end();
      return;
    }

    const suggestions =
      deps.aiIdentifierService.generateVariableSuggestions?.(elements, config) || [];
    await deps.cacheTemplateSuggestions(id, meta, {
      templateConfig: config,
      suggestions,
    });

    res.write(
      `data: ${JSON.stringify({
        done: true,
        templateConfig: config,
        suggestions,
        loops: config.tableLoops || [],
        images: config.imageLoops || [],
        combinedVariables: config.combinedVariables || [],
      })}\n\n`
    );
    res.end();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    res.end();
  }
}

export async function executeTemplateAiIdentify(
  deps: TemplateAiIdentifyDeps,
  input: TemplateAiIdentifyInput
): Promise<AIIdentifyResponse> {
  const { id, meta, dto } = input;
  const templatePath = path.join(deps.templatesDir, `${id}.${meta.format}`);

  if (!fs.existsSync(templatePath)) {
    throw new HttpException('Template file not found', HttpStatus.NOT_FOUND);
  }

  try {
    const documentStructure = await loadTemplateDocumentStructure(
      deps.documentStructureService,
      templatePath,
      meta.format
    );
    const result = await deps.aiIdentifierService.identifyVariables(
      templatePath,
      meta.format,
      dto.context,
      documentStructure,
      dto.manualMarkings,
      dto.markingSummary
    );
    await deps.cacheTemplateSuggestions(id, meta, result);
    return result;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new HttpException(
      `Failed to identify variables: ${message}`,
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
}
