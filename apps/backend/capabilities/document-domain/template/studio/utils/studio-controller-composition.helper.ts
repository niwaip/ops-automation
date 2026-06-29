import type { AIIdentifierService } from '../../workflow-authoring/ai-identifier.service';
import type { RenderOutputRepository } from '../../repository/render-output.repository';
import type { SkillRepository } from '../../repository/skill.repository';
import type { TemplateRepository } from '../../repository/template.repository';
import {
  createStudioTemplateMetaListReader,
  createStudioTemplateMetaWithDbFallbackReader,
  type StudioTemplateMetaListReader,
  type StudioTemplateMetaWithDbFallbackReader,
} from './studio-template-access.helper';
import {
  createStudioTemplateMetaReader,
  type StudioTemplateMetaReader,
} from './studio-template-meta.helper';
import {
  createStudioRenderOutputSyncer,
  createStudioSkillSyncer,
  createStudioTemplateConfigSyncer,
  createStudioTemplateMarkingsSyncer,
  createStudioTemplateMetaSyncer,
  type StudioRenderOutputSyncer,
  type StudioSkillSyncer,
  type StudioTemplateConfigSyncer,
  type StudioTemplateMarkingsSyncer,
  type StudioTemplateMetaSyncer,
} from './studio-sync.helper';
import {
  createStudioSkillWithDbFallbackReader,
  type StudioSkillWithDbFallbackReader,
} from './studio-skill-storage.helper';

type WarnLogger = {
  warn: (message: string) => void;
};

export type StudioTemplateSupport = {
  getTemplateMeta: StudioTemplateMetaReader;
  getTemplateMetaWithDbFallback: StudioTemplateMetaWithDbFallbackReader;
  listTemplateMetasWithDbFallback: StudioTemplateMetaListReader;
  syncTemplateMetaToDb: StudioTemplateMetaSyncer;
  syncTemplateMarkingsToDb: StudioTemplateMarkingsSyncer;
  syncTemplateConfigToDb: StudioTemplateConfigSyncer;
};

export function createStudioTemplateSupport(deps: {
  templatesDir: string;
  aiIdentifierService: Pick<AIIdentifierService, 'normalizeTemplateConfig'>;
  templateRepository: Pick<
    TemplateRepository,
    'findById' | 'list' | 'upsertFromMeta' | 'updateMarkings' | 'updateConfig'
  >;
  logger: WarnLogger;
}): StudioTemplateSupport {
  const getTemplateMeta = createStudioTemplateMetaReader({
    templatesDir: deps.templatesDir,
    aiIdentifierService: deps.aiIdentifierService,
  });

  return {
    getTemplateMeta,
    getTemplateMetaWithDbFallback: createStudioTemplateMetaWithDbFallbackReader({
      templateRepository: deps.templateRepository,
      getTemplateMeta,
    }),
    listTemplateMetasWithDbFallback: createStudioTemplateMetaListReader({
      templateRepository: deps.templateRepository,
      templatesDir: deps.templatesDir,
    }),
    syncTemplateMetaToDb: createStudioTemplateMetaSyncer({
      templateRepository: deps.templateRepository,
      templatesDir: deps.templatesDir,
      logger: deps.logger,
    }),
    syncTemplateMarkingsToDb: createStudioTemplateMarkingsSyncer({
      templateRepository: deps.templateRepository,
      logger: deps.logger,
    }),
    syncTemplateConfigToDb: createStudioTemplateConfigSyncer({
      templateRepository: deps.templateRepository,
      logger: deps.logger,
    }),
  };
}

export type StudioSkillSupport = {
  getSkillWithDbFallback: StudioSkillWithDbFallbackReader;
  syncSkillToDb: StudioSkillSyncer;
};

export function createStudioSkillSupport(deps: {
  skillRepository: Pick<SkillRepository, 'findById' | 'upsertFromDocument'>;
  templatesDir: string;
  logger: WarnLogger;
}): StudioSkillSupport {
  return {
    getSkillWithDbFallback: createStudioSkillWithDbFallbackReader(
      deps.skillRepository,
      deps.templatesDir
    ),
    syncSkillToDb: createStudioSkillSyncer({
      skillRepository: deps.skillRepository,
      logger: deps.logger,
    }),
  };
}

export type StudioRenderOutputSupport = {
  syncRenderOutputToDb: StudioRenderOutputSyncer;
};

export function createStudioRenderOutputSupport(deps: {
  renderOutputRepository: Pick<RenderOutputRepository, 'createFromMeta'>;
  logger: WarnLogger;
}): StudioRenderOutputSupport {
  return {
    syncRenderOutputToDb: createStudioRenderOutputSyncer({
      renderOutputRepository: deps.renderOutputRepository,
      logger: deps.logger,
    }),
  };
}
