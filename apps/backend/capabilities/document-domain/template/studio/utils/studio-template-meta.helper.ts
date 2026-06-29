import { HttpException, HttpStatus } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import type { AIIdentifyResponse, AIIdentifierService } from '../../workflow-authoring/ai-identifier.service';
import type { TemplateResponse } from '../studio.types';
import { extractStudioLoopsFromMeta } from './studio-controller-data.helper';
import { readStudioWorkflowConfig } from './studio-workflow-config.helper';

type ReadTemplateMetaDeps = {
  templatesDir: string;
  aiIdentifierService: Pick<AIIdentifierService, 'normalizeTemplateConfig'>;
};

export type StudioTemplateMetaReader = (id: string) => TemplateResponse;

export function createStudioTemplateMetaReader(
  deps: ReadTemplateMetaDeps
): StudioTemplateMetaReader {
  return (id: string) => readStudioTemplateMeta(deps, id);
}

export function readStudioTemplateMeta(
  deps: ReadTemplateMetaDeps,
  id: string
): TemplateResponse {
  const metaPath = path.join(deps.templatesDir, `${id}.json`);
  if (!fs.existsSync(metaPath)) {
    throw new HttpException('Template not found', HttpStatus.NOT_FOUND);
  }
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));

  if (meta.templateConfig) {
    meta.templateConfig = deps.aiIdentifierService.normalizeTemplateConfig(meta.templateConfig);
  }

  if (!Array.isArray(meta.suggestions)) {
    meta.suggestions = [];
  }

  if (!Array.isArray(meta.rawSuggestions)) {
    meta.rawSuggestions = [];
  }

  if (!meta.variables || !Array.isArray(meta.variables)) {
    if (meta.suggestions && Array.isArray(meta.suggestions)) {
      meta.variables = meta.suggestions
        .filter((suggestion: any) => suggestion.applied && suggestion.suggestedName)
        .map((suggestion: any) => suggestion.suggestedName);
    } else {
      meta.variables = [];
    }
  }

  if (!Array.isArray(meta.loops) || meta.loops.length === 0) {
    meta.loops = extractStudioLoopsFromMeta(meta);
  }

  const workflow = readStudioWorkflowConfig(meta as Record<string, any>);
  if (workflow.templateAssetManifest) {
    meta.templateAssetManifest = workflow.templateAssetManifest;
  }
  if (Array.isArray(workflow.templateFieldSpecs) && workflow.templateFieldSpecs.length > 0) {
    meta.parameterCount = workflow.templateFieldSpecs.length;
  }
  if (
    (!meta.variables || !Array.isArray(meta.variables) || meta.variables.length === 0) &&
    workflow.renderPlan?.bindings?.length
  ) {
    meta.variables = workflow.renderPlan.bindings.map(
      (binding: { variablePath: string }) => binding.variablePath
    );
  }

  return meta;
}

export async function cacheStudioTemplateSuggestions(
  deps: {
    templatesDir: string;
    syncTemplateMetaToDb: (
      id: string,
      meta: Record<string, any> & { format: string },
      filePath?: string
    ) => Promise<void>;
  },
  id: string,
  meta: TemplateResponse,
  result: Pick<AIIdentifyResponse, 'suggestions' | 'rawSuggestions' | 'templateConfig'>
): Promise<void> {
  const nextSuggestions = Array.isArray(result.suggestions) ? result.suggestions : [];
  const nextRawSuggestions = Array.isArray(result.rawSuggestions) ? result.rawSuggestions : [];
  if (nextSuggestions.length === 0 && nextRawSuggestions.length === 0) {
    return;
  }

  const metaPath = path.join(deps.templatesDir, `${id}.json`);
  const updatedMeta = {
    ...meta,
    suggestions:
      nextSuggestions.length > 0
        ? nextSuggestions
        : Array.isArray(meta.suggestions)
          ? meta.suggestions
          : [],
    rawSuggestions:
      nextRawSuggestions.length > 0
        ? nextRawSuggestions
        : Array.isArray(meta.rawSuggestions)
          ? meta.rawSuggestions
          : [],
    templateConfig: result.templateConfig ?? meta.templateConfig,
  };

  fs.writeFileSync(metaPath, JSON.stringify(updatedMeta, null, 2));
  await deps.syncTemplateMetaToDb(id, updatedMeta);
}
