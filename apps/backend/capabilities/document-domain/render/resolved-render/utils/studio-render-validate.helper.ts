import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

type ValidateTemplateMeta = {
  id: string;
  format: 'docx' | 'xlsx' | 'pptx' | 'html';
  fileName: string;
  size: number;
  variables: string[];
  loops: Array<{ arrayPath: string }>;
  templateConfig?: Record<string, any>;
  verifyResult?: {
    sampleData?: any;
    markedTemplateId?: string;
  };
  markedTemplateId?: string;
};

type ValidateTemplateInfo = {
  format: 'docx' | 'xlsx' | 'pptx' | 'html';
  fileName: string;
  size: number;
  variables: string[];
  loops: Array<{ arrayPath: string }>;
};

type ValidateRenderDeps = {
  templatesDir: string;
  outputsDir: string;
  getTemplateMetaWithDbFallback: (id: string) => Promise<ValidateTemplateMeta>;
  normalizeTemplateConfig: (config: any) => Record<string, any>;
  documentStructureService: {
    applyConfigToDocx: (buffer: Buffer, config: Record<string, any>) => Promise<Buffer>;
  };
  engine: {
    parseTemplateBuffer: (buffer: Buffer, fileName: string) => Promise<ValidateTemplateInfo>;
    render: (templateBuffer: Buffer, data: any, fileName: string) => Promise<Buffer>;
  };
  generateTemplateSampleData: (
    meta: ValidateTemplateMeta,
    templateInfo: ValidateTemplateInfo,
    config: Record<string, any>,
    rowCount: number
  ) => Promise<any>;
  syncRenderOutputToDb: (meta: Record<string, any>, filePath: string) => Promise<void>;
};

type ValidateRenderInput = {
  templateId: string;
  data?: Record<string, any>;
};

export async function validateStudioTemplateRender(
  deps: ValidateRenderDeps,
  input: ValidateRenderInput
): Promise<{
  valid: boolean;
  missing: string[];
  downloadUrl?: string;
  fileName?: string;
  sampleData?: any;
  markedTemplateId?: string;
}> {
  const meta = await deps.getTemplateMetaWithDbFallback(input.templateId);
  const verifyResult = meta.verifyResult;
  const savedSampleData = verifyResult?.sampleData;

  let templateBuffer: Buffer = fs.readFileSync(
    path.join(deps.templatesDir, `${input.templateId}.${meta.format}`)
  );
  let config = meta.templateConfig || {};
  let markedTemplateId =
    verifyResult?.markedTemplateId || meta.markedTemplateId || input.data?.markedTemplateId;

  if (markedTemplateId) {
    const markedMetaPath = path.join(deps.templatesDir, `${markedTemplateId}.json`);
    if (fs.existsSync(markedMetaPath)) {
      const markedMeta = JSON.parse(fs.readFileSync(markedMetaPath, 'utf-8'));
      const markedTemplatePath = path.join(deps.templatesDir, `${markedTemplateId}.${meta.format}`);
      if (fs.existsSync(markedTemplatePath)) {
        templateBuffer = fs.readFileSync(markedTemplatePath);
        config = markedMeta.templateConfig || config;
      }
    }
  } else if (config && Object.keys(config).length > 0) {
    const normalizedConfig = deps.normalizeTemplateConfig(config);
    templateBuffer = Buffer.from(
      await deps.documentStructureService.applyConfigToDocx(templateBuffer, normalizedConfig)
    );
    config = normalizedConfig;
  }

  const templateInfo = await deps.engine.parseTemplateBuffer(templateBuffer, meta.fileName);

  let sampleData = savedSampleData;
  if (!sampleData) {
    sampleData = await deps.generateTemplateSampleData(meta, templateInfo, config, 8);
  }

  try {
    const outputBuffer = await deps.engine.render(templateBuffer, sampleData, meta.fileName);
    const outputId = uuidv4();
    const outputPath = path.join(deps.outputsDir, `${outputId}.${meta.format}`);
    const outputMetaPath = path.join(deps.outputsDir, `${outputId}.json`);

    fs.writeFileSync(outputPath, outputBuffer);
    const outputMeta = {
      id: outputId,
      templateId: input.templateId,
      markedTemplateId,
      fileName: `validate_${meta.fileName}`,
      format: meta.format,
      createdAt: new Date().toISOString(),
      sampleData,
    };
    fs.writeFileSync(outputMetaPath, JSON.stringify(outputMeta));
    await deps.syncRenderOutputToDb(outputMeta, outputPath);

    return {
      valid: true,
      missing: [],
      downloadUrl: `/studio/download/${outputId}`,
      fileName: `validate_${meta.fileName}`,
      sampleData,
      markedTemplateId,
    };
  } catch {
    return {
      valid: false,
      missing: [],
      sampleData,
    };
  }
}
