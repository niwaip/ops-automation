import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

type GenerateTemplateLogger = {
  debug: (message: string) => void;
  warn: (message: string) => void;
};

type GenerateTemplateDeps = {
  templatesDir: string;
  syncTemplateMetaToDb: (
    id: string,
    meta: Record<string, any> & { format: string },
    filePath?: string
  ) => Promise<void>;
  logger: GenerateTemplateLogger;
};

type GenerateTemplateInput = {
  documentContent: string;
  suggestions: any[];
  templateConfig?: any;
  format?: string;
};

export async function generateStudioTemplateFromContent(
  deps: GenerateTemplateDeps,
  input: GenerateTemplateInput
): Promise<{
  success: boolean;
  generatedTemplate?: string;
  templateId?: string;
  downloadUrl?: string;
  hasValidFile?: boolean;
  error?: string;
}> {
  try {
    const variableMappings: Record<string, string> = {};
    for (const suggestion of input.suggestions || []) {
      if (suggestion.applied && suggestion.originalText && suggestion.suggestedName) {
        variableMappings[suggestion.originalText] = suggestion.suggestedName;
      }
    }

    const format = input.format || 'docx';
    const templateConfig = input.templateConfig || {
      templateType: 'custom',
      variableMappings,
      outputPath: '',
      formatType: format,
    };

    const templateId = uuidv4();
    const templateMetaPath = path.join(deps.templatesDir, `${templateId}.json`);
    const templateFilePath = path.join(deps.templatesDir, `${templateId}.${format}`);

    let templateBuffer: Buffer;
    let hasValidFile = true;

    deps.logger.debug(`generateTemplate received documentContent length: ${input.documentContent.length}`);
    deps.logger.debug(`documentContent prefix: ${input.documentContent.substring(0, 20)}`);

    if (input.documentContent.startsWith('base64:')) {
      const base64Data = input.documentContent.substring(7);
      deps.logger.debug(`base64 data length: ${base64Data.length}`);
      templateBuffer = Buffer.from(base64Data, 'base64');
      deps.logger.debug(`decoded buffer length: ${templateBuffer.length}`);
    } else if (input.documentContent.startsWith('{')) {
      templateBuffer = Buffer.from(input.documentContent, 'utf-8');
      hasValidFile = false;
    } else {
      try {
        templateBuffer = Buffer.from(input.documentContent, 'base64');
      } catch {
        templateBuffer = Buffer.from(input.documentContent, 'utf-8');
        hasValidFile = false;
      }
    }

    if (format === 'docx' && templateBuffer.length > 4) {
      const header = templateBuffer.slice(0, 4).toString();
      deps.logger.debug(`file header: ${header}`);
      if (!header.startsWith('PK')) {
        deps.logger.warn('Not a valid docx file (not PK header), but will save metadata');
        hasValidFile = false;
      }
    }

    let persistedTemplatePath = templateFilePath;

    if (hasValidFile && templateBuffer.length > 0) {
      fs.writeFileSync(templateFilePath, templateBuffer);
    } else {
      deps.logger.debug('Saving metadata only (no valid docx file)');
      const textPath = path.join(deps.templatesDir, `${templateId}_content.txt`);
      fs.writeFileSync(textPath, templateBuffer.toString('utf-8'));
      persistedTemplatePath = textPath;
    }

    const templateMeta = {
      id: templateId,
      format,
      fileName: `template_${templateId}.${format}`,
      config: templateConfig,
      templateConfig,
      suggestions: input.suggestions,
      hasValidFile,
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(templateMetaPath, JSON.stringify(templateMeta));
    await deps.syncTemplateMetaToDb(templateId, templateMeta, persistedTemplatePath);

    return {
      success: true,
      templateId,
      generatedTemplate: JSON.stringify(templateConfig),
      downloadUrl: hasValidFile ? `/studio/download-template/${templateId}` : undefined,
      hasValidFile,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}
