import * as fs from 'fs';
import * as path from 'path';
import { HttpException, HttpStatus } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import type { AIIdentifierService } from '../../workflow-authoring/ai-identifier.service';
import type { DocumentStructureService } from '../../workflow-authoring/document-structure.service';
import type { TemplateInfoForValidation } from './studio-runtime.helper';
import type { TemplateResponse } from '../studio.types';

type VerifyTemplateDeps = {
  templatesDir: string;
  outputsDir: string;
  aiIdentifierService: Pick<AIIdentifierService, 'verifyTemplate'>;
  documentStructureService: Pick<DocumentStructureService, 'applyConfigToDocx'>;
  engine: {
    parseTemplateBuffer: (buffer: Buffer, fileName: string) => Promise<TemplateInfoForValidation>;
    generateSampleData: (templateInfo: TemplateInfoForValidation, rows: number) => any;
    render: (templateBuffer: Buffer, data: any, fileName: string) => Promise<Buffer>;
  };
};

type VerifyTemplateInput = {
  id: string;
  meta: TemplateResponse;
  prompt?: string;
  testData?: string;
  templateConfig?: any;
};

function parseVerifyTemplateSampleData(testData?: string): Record<string, any> {
  if (!testData) {
    return {};
  }

  try {
    const parsed = JSON.parse(testData);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function executeAiVerifyTemplate(
  deps: VerifyTemplateDeps,
  input: VerifyTemplateInput
): Promise<{ report: string; success: boolean; downloadUrl?: string; previewUrl?: string }> {
  const { id, meta, prompt, testData, templateConfig } = input;
  const templatePath = path.join(deps.templatesDir, `${id}.${meta.format}`);

  if (!fs.existsSync(templatePath)) {
    throw new HttpException('Template file not found', HttpStatus.NOT_FOUND);
  }

  try {
    const config = templateConfig || meta.templateConfig || {};
    const result = await deps.aiIdentifierService.verifyTemplate(
      templatePath,
      meta.format,
      prompt || '生成一份示例报告用于验证模版配置',
      testData,
      config
    );

    const templateBuffer = fs.readFileSync(templatePath);
    const markedBuffer = await deps.documentStructureService.applyConfigToDocx(templateBuffer, config);
    const templateInfo = await deps.engine.parseTemplateBuffer(markedBuffer, meta.fileName);

    let sampleData = parseVerifyTemplateSampleData(testData);
    if (Object.keys(sampleData).length === 0) {
      sampleData = deps.engine.generateSampleData(templateInfo, 5);
    }

    const outputBuffer = await deps.engine.render(markedBuffer, sampleData, meta.fileName);
    const outputId = uuidv4();
    const outputPath = path.join(deps.outputsDir, `${outputId}.${meta.format}`);
    const outputMetaPath = path.join(deps.outputsDir, `${outputId}.json`);

    fs.writeFileSync(outputPath, outputBuffer);
    fs.writeFileSync(
      outputMetaPath,
      JSON.stringify({
        id: outputId,
        templateId: id,
        fileName: `verify_${meta.fileName}`,
        format: meta.format,
        createdAt: new Date().toISOString(),
        sampleData,
      })
    );

    return {
      ...result,
      downloadUrl: `/studio/download/${outputId}`,
      previewUrl: `/studio/preview-file/${outputId}`,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new HttpException(
      `Failed to verify template: ${message}`,
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
}
