import * as fs from 'fs';
import * as path from 'path';
import type { AIIdentifierService } from '../../workflow-authoring/ai-identifier.service';
import type { TemplateResponse } from '../studio.types';
import {
  mergeStudioSkillGuideSuggestions,
  mergeStudioSkillGuideTemplateConfig,
} from './studio-ai-skill-merge.helper';

type GenerateAiSkillDeps = {
  templatesDir: string;
  skillDebugEnabled: boolean;
  logger: {
    debug: (message: string) => void;
  };
  aiIdentifierService: Pick<AIIdentifierService, 'generateAISkillGuide'>;
  getTemplateMeta: (id: string) => TemplateResponse;
  syncSkillToDb: (skill: Record<string, unknown>, templateId?: string) => Promise<void>;
  syncTemplateMetaToDb: (id: string, meta: Record<string, any> & { format: string }) => Promise<void>;
};

type GenerateAiSkillInput = {
  templateId?: string;
  suggestions?: any[];
  templateConfig?: any;
  templateType?: string;
  documentDescription?: string;
};

function buildMergedSuggestionNames(suggestions: any[]): string {
  return (
    suggestions
      .map((suggestion) =>
        String(suggestion?.suggestedName || suggestion?.details?.variableName || '').trim()
      )
      .filter(Boolean)
      .join(', ') || 'none'
  );
}

export async function executeGenerateAiSkill(
  deps: GenerateAiSkillDeps,
  body: GenerateAiSkillInput
): Promise<{
  success: boolean;
  skill?: any;
  skillId?: string;
  error?: string;
}> {
  try {
    const templateMeta = body.templateId ? deps.getTemplateMeta(body.templateId) : undefined;
    const suggestions = mergeStudioSkillGuideSuggestions(templateMeta?.suggestions, body.suggestions);
    const templateType = body.templateType || 'custom';
    const templateConfig = mergeStudioSkillGuideTemplateConfig(
      templateMeta?.templateConfig,
      body.templateConfig
    );

    if (deps.skillDebugEnabled) {
      deps.logger.debug(
        `[skill-debug] generate-skill templateId=${body.templateId || 'none'} incomingSuggestions=${Array.isArray(body.suggestions) ? body.suggestions.length : 0} cachedSuggestions=${Array.isArray(templateMeta?.suggestions) ? templateMeta.suggestions.length : 0} mergedSuggestions=${suggestions.length} templateType=${templateType}`
      );
      deps.logger.debug(`[skill-debug] mergedSuggestionNames=${buildMergedSuggestionNames(suggestions)}`);
    }

    const skill = await deps.aiIdentifierService.generateAISkillGuide(
      suggestions,
      templateConfig,
      templateType,
      body.documentDescription
    );

    if (deps.skillDebugEnabled) {
      deps.logger.debug(
        `[skill-debug] generatedSkillParameters=${Array.isArray(skill?.parameters) ? skill.parameters.length : 0}`
      );
    }

    const skillId = skill.id;
    const skillPath = path.join(deps.templatesDir, `skill_${skillId}.json`);
    fs.writeFileSync(skillPath, JSON.stringify(skill, null, 2));
    await deps.syncSkillToDb(skill as Record<string, unknown>, body.templateId);

    if (body.templateId) {
      const metaPath = path.join(deps.templatesDir, `${body.templateId}.json`);
      if (fs.existsSync(metaPath)) {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        meta.skillId = skillId;
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
        await deps.syncTemplateMetaToDb(body.templateId, meta);
      }
    }

    return {
      success: true,
      skill,
      skillId,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}
