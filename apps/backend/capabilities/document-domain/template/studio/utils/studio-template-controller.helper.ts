import { HttpException, HttpStatus } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

type LoggerLike = {
  error: (message: string) => void;
};

type DeleteTemplateDeps = {
  templatesDir: string;
  getTemplateMetaWithDbFallback: (id: string) => Promise<any>;
  deleteTemplateRecord: (id: string) => Promise<void>;
  logger: LoggerLike;
};

type RenameTemplateDeps = {
  templatesDir: string;
  getTemplateMeta: (id: string) => any;
  syncTemplateMetaToDb: (
    id: string,
    meta: Record<string, any> & { format: string },
    filePath?: string
  ) => Promise<void>;
};

type SaveMarkingsDeps = {
  templatesDir: string;
  getTemplateMeta: (id: string) => any;
  syncTemplateMarkingsToDb: (id: string, meta: Record<string, any>) => Promise<void>;
};

type SaveTemplateConfigDeps = {
  templatesDir: string;
  getTemplateMeta: (id: string) => any;
  syncTemplateConfigToDb: (id: string, templateConfig: unknown, savedAt: string) => Promise<void>;
  syncTemplateMetaToDb: (
    id: string,
    meta: Record<string, any> & { format: string },
    filePath?: string
  ) => Promise<void>;
};

export async function deleteStoredTemplate(
  deps: DeleteTemplateDeps,
  id: string
): Promise<{ success: boolean }> {
  try {
    const meta = await deps.getTemplateMetaWithDbFallback(id);
    const templatePath = path.join(deps.templatesDir, `${id}.${meta.format}`);
    const metaPath = path.join(deps.templatesDir, `${id}.json`);

    if (fs.existsSync(templatePath)) {
      fs.unlinkSync(templatePath);
    }
    if (fs.existsSync(metaPath)) {
      fs.unlinkSync(metaPath);
    }

    if (meta.skillId) {
      const skillPath = path.join(deps.templatesDir, `skill_${meta.skillId}.json`);
      if (fs.existsSync(skillPath)) {
        fs.unlinkSync(skillPath);
      }
    }

    await deps.deleteTemplateRecord(id);
    return { success: true };
  } catch (error: unknown) {
    deps.logger.error(
      `Failed to delete template ${id}: ${error instanceof Error ? error.message : String(error)}`
    );
    throw new HttpException(
      `Failed to delete template: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
}

export async function renameStoredTemplate(
  deps: RenameTemplateDeps,
  input: { id: string; newName: string }
): Promise<{ success: boolean; fileName: string }> {
  const meta = deps.getTemplateMeta(input.id);
  const metaPath = path.join(deps.templatesDir, `${input.id}.json`);
  const ext = path.extname(meta.fileName || `${input.id}.${meta.format}`);
  const newFileName = input.newName.endsWith(ext) ? input.newName : `${input.newName}.${ext}`;

  const existingMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  existingMeta.fileName = newFileName;
  existingMeta.updatedAt = new Date().toISOString();

  fs.writeFileSync(metaPath, JSON.stringify(existingMeta, null, 2));
  await deps.syncTemplateMetaToDb(input.id, existingMeta);

  return { success: true, fileName: newFileName };
}

export async function readTemplateSourcePreview(input: {
  templatesDir: string;
  meta: { format: string };
  id: string;
}): Promise<{
  content: string;
  format: string;
  type: 'xml' | 'html';
}> {
  const templatePath = path.join(input.templatesDir, `${input.id}.${input.meta.format}`);

  if (!fs.existsSync(templatePath)) {
    throw new HttpException('Template file not found', HttpStatus.NOT_FOUND);
  }

  try {
    const JSZip = require('jszip');
    const buffer = fs.readFileSync(templatePath);
    const zip = await JSZip.loadAsync(buffer);

    let mainXmlPath = '';
    switch (input.meta.format) {
      case 'docx':
        mainXmlPath = 'word/document.xml';
        break;
      case 'xlsx':
        mainXmlPath = 'xl/worksheets/sheet1.xml';
        break;
      case 'pptx':
        mainXmlPath = 'ppt/slides/slide1.xml';
        break;
      case 'html':
        return {
          content: buffer.toString('utf-8'),
          format: input.meta.format,
          type: 'html',
        };
      default:
        throw new HttpException('Unsupported format', HttpStatus.BAD_REQUEST);
    }

    const file = zip.file(mainXmlPath);
    if (!file) {
      throw new HttpException('Main content not found in template', HttpStatus.NOT_FOUND);
    }

    const content = await file.async('text');
    return {
      content,
      format: input.meta.format,
      type: 'xml',
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new HttpException(`Failed to read template: ${message}`, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

export async function saveStoredTemplateMarkings(
  deps: SaveMarkingsDeps,
  input: {
    id: string;
    dto: {
      markings: Array<{
        index?: number;
        type?: string;
        path?: string;
        text?: string;
        formatters?: string[];
      }>;
      ignoredElements?: number[];
      elementGroups?: Record<string, number[]>;
      ignoredGroups?: string[];
    };
  }
): Promise<{ success: boolean; savedAt: string }> {
  const meta = deps.getTemplateMeta(input.id);
  const metaPath = path.join(deps.templatesDir, `${input.id}.json`);
  const updatedMeta = {
    ...meta,
    markings: input.dto.markings,
    ignoredElements: input.dto.ignoredElements || [],
    elementGroups: input.dto.elementGroups || {},
    ignoredGroups: input.dto.ignoredGroups || [],
    savedAt: new Date().toISOString(),
  };

  fs.writeFileSync(metaPath, JSON.stringify(updatedMeta, null, 2));
  await deps.syncTemplateMarkingsToDb(input.id, updatedMeta);

  return {
    success: true,
    savedAt: updatedMeta.savedAt,
  };
}

export async function saveStoredTemplateConfig(
  deps: SaveTemplateConfigDeps,
  input: {
    id: string;
    dto: {
      templateConfig: unknown;
      suggestions?: any[];
      rawSuggestions?: any[];
    };
  }
): Promise<{ success: boolean; savedAt: string }> {
  const meta = deps.getTemplateMeta(input.id);
  const metaPath = path.join(deps.templatesDir, `${input.id}.json`);
  const updatedMeta = {
    ...meta,
    templateConfig: input.dto.templateConfig,
    suggestions: Array.isArray(input.dto.suggestions) ? input.dto.suggestions : meta.suggestions,
    rawSuggestions: Array.isArray(input.dto.rawSuggestions)
      ? input.dto.rawSuggestions
      : meta.rawSuggestions,
    configSavedAt: new Date().toISOString(),
  };

  fs.writeFileSync(metaPath, JSON.stringify(updatedMeta, null, 2));
  await deps.syncTemplateConfigToDb(input.id, input.dto.templateConfig, updatedMeta.configSavedAt);
  await deps.syncTemplateMetaToDb(input.id, updatedMeta);

  return {
    success: true,
    savedAt: updatedMeta.configSavedAt,
  };
}
