import * as fs from 'fs';
import * as path from 'path';
import type { TemplateRepository } from '../../repository/template.repository';
import type { TemplateResponse } from '../studio.types';

export type StudioTemplateMetaWithDbFallbackReader = (id: string) => Promise<TemplateResponse>;
export type StudioTemplateMetaListReader = () => Promise<TemplateResponse[]>;

export function listStudioTemplateMetasFromFiles(templatesDir: string): TemplateResponse[] {
  const templates: TemplateResponse[] = [];
  const files = fs.readdirSync(templatesDir);

  for (const file of files) {
    if (file.endsWith('.json') && !file.startsWith('skill_')) {
      const meta = JSON.parse(fs.readFileSync(path.join(templatesDir, file), 'utf-8'));
      templates.push(meta);
    }
  }

  return templates;
}

export function createStudioTemplateMetaWithDbFallbackReader(deps: {
  templateRepository: Pick<TemplateRepository, 'findById'>;
  getTemplateMeta: (id: string) => TemplateResponse;
}): StudioTemplateMetaWithDbFallbackReader {
  return (id: string) => getStudioTemplateMetaWithDbFallback(deps, id);
}

export async function getStudioTemplateMetaWithDbFallback(
  deps: {
    templateRepository: Pick<TemplateRepository, 'findById'>;
    getTemplateMeta: (id: string) => TemplateResponse;
  },
  id: string
): Promise<TemplateResponse> {
  const dbMeta = await deps.templateRepository.findById(id);
  if (!dbMeta) {
    return deps.getTemplateMeta(id);
  }

  try {
    const fileMeta = deps.getTemplateMeta(id);
    return {
      ...dbMeta,
      skillId: dbMeta.skillId || fileMeta.skillId,
      templateConfig: dbMeta.templateConfig ?? fileMeta.templateConfig,
      templateAssetManifest: dbMeta.templateAssetManifest ?? fileMeta.templateAssetManifest,
      configSavedAt: dbMeta.configSavedAt || fileMeta.configSavedAt,
      suggestions: dbMeta.suggestions ?? fileMeta.suggestions,
      rawSuggestions: dbMeta.rawSuggestions ?? fileMeta.rawSuggestions,
      savedAt: dbMeta.savedAt || fileMeta.savedAt,
      verifyResult: dbMeta.verifyResult ?? fileMeta.verifyResult,
    };
  } catch {
    return dbMeta;
  }
}

export function createStudioTemplateMetaListReader(deps: {
  templateRepository: Pick<TemplateRepository, 'list'>;
  templatesDir: string;
}): StudioTemplateMetaListReader {
  return () => listStudioTemplateMetasWithDbFallback(deps);
}

export async function listStudioTemplateMetasWithDbFallback(
  deps: {
    templateRepository: Pick<TemplateRepository, 'list'>;
    templatesDir: string;
  }
): Promise<TemplateResponse[]> {
  const dbTemplates = await deps.templateRepository.list();
  return dbTemplates.length > 0 ? dbTemplates : listStudioTemplateMetasFromFiles(deps.templatesDir);
}
