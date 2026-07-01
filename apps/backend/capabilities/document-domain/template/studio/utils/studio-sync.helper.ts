import * as path from 'path';
import type { RenderOutputRepository } from '../../repository/render-output.repository';
import type { SkillRepository } from '../../repository/skill.repository';
import type { TemplateRepository } from '../../repository/template.repository';

type WarnLogger = {
  warn: (message: string) => void;
};

export type StudioTemplateMetaSyncer = (
  id: string,
  meta: Record<string, any> & { format: string },
  filePath?: string
) => Promise<void>;
export type StudioTemplateMarkingsSyncer = (
  id: string,
  updatedMeta: Record<string, any>
) => Promise<void>;
export type StudioTemplateConfigSyncer = (
  id: string,
  templateConfig: unknown,
  savedAt: string
) => Promise<void>;
export type StudioSkillSyncer = (
  skill: Record<string, unknown>,
  templateId?: string
) => Promise<void>;
export type StudioRenderOutputSyncer = (
  meta: Record<string, any>,
  filePath: string
) => Promise<void>;

export function createStudioTemplateMetaSyncer(deps: {
  templateRepository: Pick<TemplateRepository, 'upsertFromMeta'>;
  templatesDir: string;
  logger: WarnLogger;
}): StudioTemplateMetaSyncer {
  return (id, meta, filePath) => syncStudioTemplateMetaToDb(deps, id, meta, filePath);
}

export async function syncStudioTemplateMetaToDb(
  deps: {
    templateRepository: Pick<TemplateRepository, 'upsertFromMeta'>;
    templatesDir: string;
    logger: WarnLogger;
  },
  id: string,
  meta: Record<string, any> & { format: string },
  filePath?: string
): Promise<void> {
  try {
    await deps.templateRepository.upsertFromMeta(
      id,
      filePath ?? path.join(deps.templatesDir, `${id}.${meta.format}`),
      meta
    );
  } catch (error) {
    deps.logger.warn(
      `Failed to sync template ${id} to database: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function createStudioTemplateMarkingsSyncer(deps: {
  templateRepository: Pick<TemplateRepository, 'updateMarkings'>;
  logger: WarnLogger;
}): StudioTemplateMarkingsSyncer {
  return (id, updatedMeta) => syncStudioTemplateMarkingsToDb(deps, id, updatedMeta);
}

export async function syncStudioTemplateMarkingsToDb(
  deps: {
    templateRepository: Pick<TemplateRepository, 'updateMarkings'>;
    logger: WarnLogger;
  },
  id: string,
  updatedMeta: Record<string, any>
): Promise<void> {
  try {
    await deps.templateRepository.updateMarkings(id, {
      markings: updatedMeta.markings,
      ignoredElements: updatedMeta.ignoredElements,
      elementGroups: updatedMeta.elementGroups,
      ignoredGroups: updatedMeta.ignoredGroups,
      savedAt: new Date(updatedMeta.savedAt),
    });
  } catch (error) {
    deps.logger.warn(
      `Failed to sync template markings for ${id} to database: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function createStudioTemplateConfigSyncer(deps: {
  templateRepository: Pick<TemplateRepository, 'updateConfig'>;
  logger: WarnLogger;
}): StudioTemplateConfigSyncer {
  return (id, templateConfig, savedAt) =>
    syncStudioTemplateConfigToDb(deps, id, templateConfig, savedAt);
}

export async function syncStudioTemplateConfigToDb(
  deps: {
    templateRepository: Pick<TemplateRepository, 'updateConfig'>;
    logger: WarnLogger;
  },
  id: string,
  templateConfig: unknown,
  savedAt: string
): Promise<void> {
  try {
    await deps.templateRepository.updateConfig(id, templateConfig, new Date(savedAt));
  } catch (error) {
    deps.logger.warn(
      `Failed to sync template config for ${id} to database: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function createStudioSkillSyncer(deps: {
  skillRepository: Pick<SkillRepository, 'upsertFromDocument'>;
  logger: WarnLogger;
}): StudioSkillSyncer {
  return (skill, templateId) => syncStudioSkillToDb(deps, skill, templateId);
}

export async function syncStudioSkillToDb(
  deps: {
    skillRepository: Pick<SkillRepository, 'upsertFromDocument'>;
    logger: WarnLogger;
  },
  skill: Record<string, unknown>,
  templateId?: string
): Promise<void> {
  try {
    await deps.skillRepository.upsertFromDocument(skill, templateId);
  } catch (error) {
    deps.logger.warn(
      `Failed to sync skill ${String(skill.id ?? '')} to database: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function createStudioRenderOutputSyncer(deps: {
  renderOutputRepository: Pick<RenderOutputRepository, 'createFromMeta'>;
  logger: WarnLogger;
}): StudioRenderOutputSyncer {
  return (meta, filePath) => syncStudioRenderOutputToDb(deps, meta, filePath);
}

export async function syncStudioRenderOutputToDb(
  deps: {
    renderOutputRepository: Pick<RenderOutputRepository, 'createFromMeta'>;
    logger: WarnLogger;
  },
  meta: Record<string, any>,
  filePath: string
): Promise<void> {
  try {
    await deps.renderOutputRepository.createFromMeta(
      meta as {
        id: string;
        templateId?: string;
        markedTemplateId?: string;
        skillId?: string;
        fileName: string;
        format: string;
        size?: number;
        params?: unknown;
        sampleData?: unknown;
        simulatedData?: unknown;
        debugLogs?: unknown;
        renderedAt?: string;
        createdAt?: string;
      },
      filePath
    );
  } catch (error) {
    deps.logger.warn(
      `Failed to sync render output ${String(meta.id ?? '')} to database: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
