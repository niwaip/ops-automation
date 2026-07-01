import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { Response } from 'express';
import type { AIIdentifierService } from '../../workflow-authoring/ai-identifier.service';
import type { DocumentStructureService } from '../../workflow-authoring/document-structure.service';
import type { TemplateInfoForValidation } from './studio-runtime.helper';
import { createSseEmitter, setupSseResponse } from './studio-ai-controller.helper';

type VerifyStreamEmitter = {
  progress: (step: string, progress: number, message: string) => void;
  result: (data: any) => void;
  error: (error: string) => void;
  end: () => void;
};

export type VerifyStreamDeps = {
  aiIdentifierService: Pick<AIIdentifierService, 'verifyTemplate'>;
  documentStructureService: Pick<DocumentStructureService, 'applyConfigToDocx'>;
  engine: {
    parseTemplateBuffer: (buffer: Buffer, fileName: string) => Promise<TemplateInfoForValidation>;
    generateSampleDataFromConfig: (
      config: Record<string, any>,
      rows: number,
      includeExamples: boolean
    ) => any;
    generateSampleData: (templateInfo: TemplateInfoForValidation, rows: number) => any;
    render: (templateBuffer: Buffer, data: any, fileName: string) => Promise<Buffer>;
  };
  syncTemplateMetaToDb: (
    id: string,
    meta: Record<string, any> & { format: string },
    filePath?: string
  ) => Promise<void>;
  syncRenderOutputToDb: (meta: Record<string, any>, filePath: string) => Promise<void>;
  templatesDir: string;
  outputsDir: string;
  verboseDebugEnabled: boolean;
  logger: {
    debug: (message: string) => void;
  };
};

type VerifyStreamInput = {
  id: string;
  meta: Record<string, any>;
  templatePath: string;
  prompt: string;
  rawTestData?: string;
  config: Record<string, any>;
  emitter: VerifyStreamEmitter;
};

function parseVerifyTestData(rawTestData: string | undefined): Record<string, any> {
  if (!rawTestData) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawTestData);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function buildGeneratedSampleData(input: {
  parsedTestData: Record<string, any>;
  config: Record<string, any>;
  templateInfo: TemplateInfoForValidation;
  verboseDebugEnabled: boolean;
  logger: { debug: (message: string) => void };
  engine: VerifyStreamDeps['engine'];
}): Record<string, any> {
  const { parsedTestData, config, templateInfo, verboseDebugEnabled, logger, engine } = input;

  if (parsedTestData && Object.keys(parsedTestData).length > 0) {
    return parsedTestData;
  }

  if (config && Object.keys(config).length > 0) {
    if (verboseDebugEnabled) {
      logger.debug('Generating sample data from config...');
    }
    const sampleData = engine.generateSampleDataFromConfig(
      config,
      config.tableLoops?.[0]?.dataRowCount || 5,
      true
    );
    if (verboseDebugEnabled) {
      logger.debug(`Generated sampleData keys: ${Object.keys(sampleData || {}).join(',')}`);
    }
    return sampleData;
  }

  if (verboseDebugEnabled) {
    logger.debug('Using fallback generateSampleData, config empty');
  }
  return engine.generateSampleData(templateInfo, 5);
}

export async function executeAiVerifyStream(
  deps: VerifyStreamDeps,
  input: VerifyStreamInput
): Promise<void> {
  const { aiIdentifierService, documentStructureService, engine } = deps;
  const { id, meta, templatePath, prompt, rawTestData, config, emitter } = input;

  try {
    emitter.progress('prepare', 10, '准备验证环境...');

    let parsedTestData: Record<string, any> = {};
    if (rawTestData) {
      try {
        parsedTestData = parseVerifyTestData(rawTestData);
      } catch {
        emitter.progress('prepare', 15, '测试数据解析失败，使用空对象');
      }
    }

    emitter.progress('prepare', 20, '获取模版配置...');

    if (deps.verboseDebugEnabled) {
      deps.logger.debug(`AI Verify config keys: ${Object.keys(config || {}).join(',')}`);
    }

    emitter.progress('ai_call', 30, '调用AI生成验证报告...');
    const aiResponse = await aiIdentifierService.verifyTemplate(
      templatePath,
      meta.format,
      prompt,
      rawTestData || '',
      config
    );
    emitter.progress('ai_call', 50, 'AI验证报告已生成');

    emitter.progress('generate_data', 55, '根据模版配置生成示例数据...');
    const templateBuffer = fs.readFileSync(templatePath);
    const markedBuffer = await documentStructureService.applyConfigToDocx(templateBuffer, config);
    const templateInfo = await engine.parseTemplateBuffer(markedBuffer, meta.fileName);
    const sampleData = buildGeneratedSampleData({
      parsedTestData,
      config,
      templateInfo,
      verboseDebugEnabled: deps.verboseDebugEnabled,
      logger: deps.logger,
      engine,
    });
    emitter.progress('generate_data', 65, '示例数据已生成');

    emitter.progress('render', 70, '渲染示例文档...');
    const outputBuffer = await engine.render(markedBuffer, sampleData, meta.fileName);
    emitter.progress('render', 85, '文档渲染完成');

    const markedTemplateId = uuidv4();
    const markedTemplatePath = path.join(deps.templatesDir, `${markedTemplateId}.${meta.format}`);
    const markedMetaPath = path.join(deps.templatesDir, `${markedTemplateId}.json`);

    fs.writeFileSync(markedTemplatePath, markedBuffer);
    const markedMeta = {
      id: markedTemplateId,
      originalTemplateId: id,
      fileName: `marked_${meta.fileName}`,
      format: meta.format,
      size: markedBuffer.length,
      variables: templateInfo.variables,
      loops: templateInfo.loops,
      createdAt: new Date().toISOString(),
      templateConfig: config,
      type: 'marked_template',
    };
    fs.writeFileSync(markedMetaPath, JSON.stringify(markedMeta));
    await deps.syncTemplateMetaToDb(markedTemplateId, markedMeta, markedTemplatePath);

    const outputId = uuidv4();
    const originalMetaPath = path.join(deps.templatesDir, `${id}.json`);
    if (fs.existsSync(originalMetaPath)) {
      const originalMeta = JSON.parse(fs.readFileSync(originalMetaPath, 'utf-8'));
      originalMeta.markedTemplateId = markedTemplateId;
      originalMeta.verifyResult = {
        report: aiResponse.report,
        downloadUrl: `/studio/download/${outputId}`,
        previewUrl: `/studio/preview-file/${outputId}`,
        markedTemplateId,
        markedTemplateUrl: `/studio/download-template/${markedTemplateId}`,
        sampleData,
        success: aiResponse.success,
        verifiedAt: new Date().toISOString(),
      };
      fs.writeFileSync(originalMetaPath, JSON.stringify(originalMeta, null, 2));
      await deps.syncTemplateMetaToDb(id, originalMeta);
    }

    emitter.progress('save_marked', 88, '保存注入后的模版...');

    const outputPath = path.join(deps.outputsDir, `${outputId}.${meta.format}`);
    const outputMetaPath = path.join(deps.outputsDir, `${outputId}.json`);

    fs.writeFileSync(outputPath, outputBuffer);
    const outputMeta = {
      id: outputId,
      templateId: id,
      markedTemplateId,
      fileName: `verify_${meta.fileName}`,
      format: meta.format,
      createdAt: new Date().toISOString(),
      sampleData,
    };
    fs.writeFileSync(outputMetaPath, JSON.stringify(outputMeta));
    await deps.syncRenderOutputToDb(outputMeta, outputPath);

    emitter.progress('save', 95, '保存渲染结果...');
    emitter.progress('complete', 100, '验证完成');
    emitter.result({
      report: aiResponse.report,
      downloadUrl: `/studio/download/${outputId}`,
      previewUrl: `/studio/preview-file/${outputId}`,
      markedTemplateId,
      markedTemplateUrl: `/studio/download-template/${markedTemplateId}`,
      sampleData,
      success: aiResponse.success,
    });
    emitter.end();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    emitter.error(message);
    emitter.end();
  }
}

export async function executeAiVerifyTemplateStreamResponse(
  deps: VerifyStreamDeps,
  input: {
    id: string;
    meta: Record<string, any>;
    prompt: string;
    rawTestData?: string;
    config: Record<string, any>;
    res: Response;
  }
): Promise<void> {
  const templatePath = path.join(deps.templatesDir, `${input.id}.${input.meta.format}`);

  if (!fs.existsSync(templatePath)) {
    input.res.status(404).json({ error: 'Template file not found' });
    return;
  }

  setupSseResponse(input.res);
  await executeAiVerifyStream(deps, {
    id: input.id,
    meta: input.meta,
    templatePath,
    prompt: input.prompt,
    rawTestData: input.rawTestData,
    config: input.config,
    emitter: createSseEmitter(input.res),
  });
}
