/**
 * Carbone Engine - Studio Controller Base
 */

import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { CarboneEngine } from '../../lib/engine';
import { PreviewService } from './preview.service';
import { AIIdentifierService, AIIdentifyResponse } from './ai-identifier.service';
import { DocumentStructureService } from './document-structure.service';
import {
  DEFAULT_RENDER_PLAN_VERSION,
  TEMPLATE_ASSET_MANIFEST_VERSION,
  TEMPLATE_ASSET_SOURCE_LEGACY,
  TEMPLATE_DOCUMENT_MODE_BILINGUAL,
  TEMPLATE_DOCUMENT_MODE_SINGLE_LANGUAGE,
  TEMPLATE_WORKFLOW_SCHEMA_VERSION,
  TemplateResponse,
  RenderPlan,
  TemplateAssetManifest,
} from './studio.types';
import { TemplateRepository } from './template.repository';
import { SkillRepository } from './skill.repository';
import { RenderOutputRepository } from './render-output.repository';
import {
  WorkflowBindingPlan,
  WorkflowDocumentIR,
  WorkflowSaveResult,
  WorkflowTermAssets,
  WorkflowTemplateFieldSpec,
  TemplateWorkflowService,
} from './template-workflow.service';
import { TemplateSaveDto } from './studio.dto';

export interface TemplateInfoForValidation {
  format: 'docx' | 'xlsx' | 'pptx' | 'html';
  fileName: string;
  size: number;
  variables: string[];
  loops: Array<{ arrayPath: string }>;
}

export abstract class StudioControllerBase {
  protected readonly logger = new Logger(StudioControllerBase.name);
  protected engine: CarboneEngine;
  protected templatesDir: string;
  protected outputsDir: string;

  constructor(
    protected readonly previewService: PreviewService,
    protected readonly aiIdentifierService: AIIdentifierService,
    protected readonly documentStructureService: DocumentStructureService,
    protected readonly templateRepository: TemplateRepository,
    protected readonly skillRepository: SkillRepository,
    protected readonly renderOutputRepository: RenderOutputRepository,
    protected readonly templateWorkflowService: TemplateWorkflowService
  ) {
    this.engine = new CarboneEngine();
    this.templatesDir = process.env.TEMPLATES_DIR || path.join(process.cwd(), 'templates');
    this.outputsDir = process.env.OUTPUTS_DIR || path.join(process.cwd(), 'outputs');

    if (!fs.existsSync(this.templatesDir)) {
      fs.mkdirSync(this.templatesDir, { recursive: true });
    }
    if (!fs.existsSync(this.outputsDir)) {
      fs.mkdirSync(this.outputsDir, { recursive: true });
    }
  }

  protected isPlainObject(value: unknown): value is Record<string, any> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  protected resolveDocumentMode(targetLanguages?: string[], explicitDocumentMode?: string): string {
    if (typeof explicitDocumentMode === 'string' && explicitDocumentMode.trim()) {
      return explicitDocumentMode;
    }
    return Array.isArray(targetLanguages) && targetLanguages.length > 0
      ? TEMPLATE_DOCUMENT_MODE_BILINGUAL
      : TEMPLATE_DOCUMENT_MODE_SINGLE_LANGUAGE;
  }

  protected resolveRenderPlanVersion(renderPlan?: RenderPlan, explicitVersion?: number): number {
    return Number(explicitVersion || renderPlan?.version || DEFAULT_RENDER_PLAN_VERSION);
  }

  protected parsePathSegments(pathValue: string): Array<string | number> {
    const segments: Array<string | number> = [];
    const matches = pathValue.match(/[^.[\]]+|\[(\d+)\]/g) || [];

    for (const match of matches) {
      if (match.startsWith('[') && match.endsWith(']')) {
        segments.push(Number(match.slice(1, -1)));
      } else {
        segments.push(match);
      }
    }

    return segments;
  }

  protected mergeObjects(
    target: Record<string, any>,
    source: Record<string, any>
  ): Record<string, any> {
    for (const [key, value] of Object.entries(source)) {
      if (this.isPlainObject(value) && this.isPlainObject(target[key])) {
        this.mergeObjects(target[key], value);
      } else {
        target[key] = value;
      }
    }

    return target;
  }

  protected setNestedValue(target: Record<string, any>, pathValue: string, value: unknown): void {
    const segments = this.parsePathSegments(pathValue);
    if (segments.length === 0) {
      return;
    }

    let current: any = target;
    for (let i = 0; i < segments.length; i += 1) {
      const segment = segments[i];
      const isLast = i === segments.length - 1;
      const nextSegment = segments[i + 1];

      if (isLast) {
        if (typeof segment === 'number') {
          if (!Array.isArray(current)) {
            return;
          }
          current[segment] = value;
        } else {
          current[segment] = value;
        }
        return;
      }

      const containerShouldBeArray = typeof nextSegment === 'number';
      if (typeof segment === 'number') {
        if (!Array.isArray(current)) {
          return;
        }
        if (current[segment] === undefined) {
          current[segment] = containerShouldBeArray ? [] : {};
        }
        current = current[segment];
      } else {
        if (current[segment] === undefined) {
          current[segment] = containerShouldBeArray ? [] : {};
        }
        current = current[segment];
      }
    }
  }

  protected normalizeRenderData(data: Record<string, any>): Record<string, any> {
    const normalized: Record<string, any> = {};
    const arrayGroups = new Map<string, Record<string, unknown>>();

    for (const [key, value] of Object.entries(data || {})) {
      // Some callers still send { d: {...} }; unwrap it so the renderer can
      // resolve template markers like {d.partyA.name} against root data.
      if (key === 'd' && this.isPlainObject(value)) {
        this.mergeObjects(normalized, this.normalizeRenderData(value));
        continue;
      }

      if (key.includes('[]')) {
        const [rawPrefix, rawSuffix] = key.split('[]', 2);
        const prefix = rawPrefix.replace(/\.$/, '').trim();
        const suffix = String(rawSuffix || '')
          .replace(/^\./, '')
          .trim();
        if (prefix && suffix) {
          const entry = arrayGroups.get(prefix) || {};
          entry[suffix] = this.normalizeRenderValue(value);
          arrayGroups.set(prefix, entry);
          continue;
        }
      }

      if (key.includes('.')) {
        normalized[key] = this.normalizeRenderValue(value);
        continue;
      }

      if (this.isPlainObject(value)) {
        const existing = normalized[key];
        if (this.isPlainObject(existing)) {
          this.mergeObjects(existing, this.normalizeRenderData(value));
        } else {
          normalized[key] = this.normalizeRenderData(value);
        }
        continue;
      }

      normalized[key] = value;
    }

    for (const [prefix, fields] of arrayGroups.entries()) {
      const fieldEntries = Object.entries(fields);
      if (fieldEntries.length === 0) {
        continue;
      }

      const maxLen = fieldEntries.reduce((acc, [, raw]) => {
        if (Array.isArray(raw)) {
          return Math.max(acc, raw.length);
        }
        return Math.max(acc, 1);
      }, 0);

      const rows: Array<Record<string, unknown>> = [];
      for (let i = 0; i < maxLen; i += 1) {
        const row: Record<string, unknown> = {};
        for (const [fieldPath, raw] of fieldEntries) {
          const valueAtIndex = Array.isArray(raw) ? raw[i] : i === 0 ? raw : undefined;
          if (valueAtIndex === undefined) {
            continue;
          }
          row[fieldPath] = valueAtIndex;
        }
        rows.push(row);
      }

      normalized[prefix] = rows;
    }

    return normalized;
  }

  protected normalizeRenderValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) =>
        this.isPlainObject(item) ? this.normalizeRenderData(item) : item
      );
    }
    if (this.isPlainObject(value)) {
      return this.normalizeRenderData(value);
    }
    return value;
  }

  protected getPreviewSeedDataFromSkill(skill: any): Record<string, any> | null {
    const raw = skill?.dataExampleJson;
    if (!raw) {
      return null;
    }

    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return this.isPlainObject(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }

    return this.isPlainObject(raw) ? raw : null;
  }

  protected buildHydratedSkillSampleData(skill: any): Record<string, any> | null {
    const seedData = this.getPreviewSeedDataFromSkill(skill);
    const generatedData = this.generateSimulatedData(skill);

    if (seedData && this.hasNonEmptySampleData(generatedData)) {
      const merged = this.normalizeRenderData(JSON.parse(JSON.stringify(seedData)));
      this.mergeObjects(merged, generatedData);
      return merged;
    }

    if (seedData) {
      return this.normalizeRenderData(seedData);
    }

    return this.hasNonEmptySampleData(generatedData) ? generatedData : null;
  }

  protected extractLoopsFromMeta(meta: Record<string, any>): Array<{ arrayPath: string }> {
    const seen = new Set<string>();
    const loops: Array<{ arrayPath: string }> = [];
    const addLoop = (arrayPath: unknown) => {
      if (typeof arrayPath !== 'string') {
        return;
      }
      const normalized = arrayPath.trim();
      if (!normalized || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      loops.push({ arrayPath: normalized });
    };

    const configs = [meta.templateConfig, meta.config];
    for (const config of configs) {
      if (!this.isPlainObject(config)) {
        continue;
      }

      if (Array.isArray(config.tableLoops)) {
        for (const loop of config.tableLoops) {
          if (this.isPlainObject(loop)) {
            addLoop(loop.arrayPath);
          }
        }
      }

      if (Array.isArray(config.loops)) {
        for (const loop of config.loops) {
          if (typeof loop === 'string') {
            addLoop(loop);
          } else if (this.isPlainObject(loop)) {
            addLoop(loop.arrayPath);
          }
        }
      }
    }

    if (Array.isArray(meta.suggestions)) {
      for (const suggestion of meta.suggestions) {
        if (!this.isPlainObject(suggestion) || suggestion.type !== 'loop') {
          continue;
        }
        if (this.isPlainObject(suggestion.details)) {
          addLoop(suggestion.details.arrayPath);
        }
      }
    }

    return loops;
  }

  protected hasNonEmptySampleData(value: unknown): boolean {
    return this.isPlainObject(value) && Object.keys(value).length > 0;
  }

  protected countDeclaredVariables(meta: TemplateResponse): number {
    return Array.isArray(meta.variables) ? meta.variables.length : 0;
  }

  protected hasUsableTemplateConfig(config: Record<string, any>): boolean {
    return (
      Array.isArray(config.variableMappings) ||
      Array.isArray(config.tableLoops) ||
      Array.isArray(config.combinedVariables) ||
      Array.isArray(config.mappings)
    );
  }

  protected async generateTemplateSampleData(
    meta: TemplateResponse,
    templateInfo: TemplateInfoForValidation,
    config: Record<string, any>,
    rowCount: number
  ): Promise<Record<string, any>> {
    if (config && Object.keys(config).length > 0 && this.hasUsableTemplateConfig(config)) {
      return this.engine.generateSampleDataFromConfig(
        config,
        config.tableLoops?.[0]?.dataRowCount || rowCount,
        true
      );
    }

    const parsedSampleData = this.engine.generateSampleData(templateInfo, rowCount);
    const parsedVariableCount = Array.isArray(templateInfo.variables)
      ? templateInfo.variables.length
      : 0;
    const declaredVariableCount = this.countDeclaredVariables(meta);
    const hasComparableCoverage =
      declaredVariableCount === 0 || parsedVariableCount >= declaredVariableCount;

    if (this.hasNonEmptySampleData(parsedSampleData) && hasComparableCoverage) {
      return parsedSampleData;
    }

    if (typeof meta.skillId === 'string') {
      const skill = await this.getSkillWithDbFallback(meta.skillId);
      if (skill) {
        const seedData = this.buildHydratedSkillSampleData(skill);
        if (seedData) {
          return seedData;
        }

        const simulatedData = this.generateSimulatedData(skill);
        if (this.hasNonEmptySampleData(simulatedData)) {
          return simulatedData;
        }
      }
    }

    return parsedSampleData;
  }

  protected listTemplateMetasFromFiles(): TemplateResponse[] {
    const templates: TemplateResponse[] = [];
    const files = fs.readdirSync(this.templatesDir);

    for (const file of files) {
      if (file.endsWith('.json') && !file.startsWith('skill_')) {
        const meta = JSON.parse(fs.readFileSync(path.join(this.templatesDir, file), 'utf-8'));
        templates.push(meta);
      }
    }

    return templates;
  }

  protected async getTemplateMetaWithDbFallback(id: string): Promise<TemplateResponse> {
    const dbMeta = await this.templateRepository.findById(id);
    if (!dbMeta) {
      return this.getTemplateMeta(id);
    }

    try {
      const fileMeta = this.getTemplateMeta(id);
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

  protected async listTemplateMetasWithDbFallback(): Promise<TemplateResponse[]> {
    const dbTemplates = await this.templateRepository.list();
    return dbTemplates.length > 0 ? dbTemplates : this.listTemplateMetasFromFiles();
  }

  protected async getSkillWithDbFallback(id: string): Promise<Record<string, unknown> | null> {
    const dbSkill = await this.skillRepository.findById(id);
    if (dbSkill) {
      return dbSkill;
    }

    const legacyCandidates = [
      path.join(this.templatesDir, `skill_${id}.json`),
      path.join(this.templatesDir, 'skills', `${id}.json`),
    ];

    for (const skillPath of legacyCandidates) {
      if (fs.existsSync(skillPath)) {
        return JSON.parse(fs.readFileSync(skillPath, 'utf-8')) as Record<string, unknown>;
      }
    }

    return null;
  }

  protected async syncTemplateMetaToDb(
    id: string,
    meta: Record<string, any> & { format: string },
    filePath?: string
  ): Promise<void> {
    try {
      await this.templateRepository.upsertFromMeta(
        id,
        filePath ?? path.join(this.templatesDir, `${id}.${meta.format}`),
        meta
      );
    } catch (error) {
      this.logger.warn(
        `Failed to sync template ${id} to database: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  protected async syncTemplateMarkingsToDb(
    id: string,
    updatedMeta: Record<string, any>
  ): Promise<void> {
    try {
      await this.templateRepository.updateMarkings(id, {
        markings: updatedMeta.markings,
        ignoredElements: updatedMeta.ignoredElements,
        elementGroups: updatedMeta.elementGroups,
        ignoredGroups: updatedMeta.ignoredGroups,
        savedAt: new Date(updatedMeta.savedAt),
      });
    } catch (error) {
      this.logger.warn(
        `Failed to sync template markings for ${id} to database: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  protected async syncTemplateConfigToDb(
    id: string,
    templateConfig: unknown,
    savedAt: string
  ): Promise<void> {
    try {
      await this.templateRepository.updateConfig(id, templateConfig, new Date(savedAt));
    } catch (error) {
      this.logger.warn(
        `Failed to sync template config for ${id} to database: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  protected async syncSkillToDb(
    skill: Record<string, unknown>,
    templateId?: string
  ): Promise<void> {
    try {
      await this.skillRepository.upsertFromDocument(skill, templateId);
    } catch (error) {
      this.logger.warn(
        `Failed to sync skill ${String(skill.id ?? '')} to database: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  protected async syncRenderOutputToDb(meta: Record<string, any>, filePath: string): Promise<void> {
    try {
      await this.renderOutputRepository.createFromMeta(
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
      this.logger.warn(
        `Failed to sync render output ${String(meta.id ?? '')} to database: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  protected buildWorkflowMetaDocument(
    id: string,
    dto: Pick<TemplateSaveDto, 'templateMeta' | 'templateFieldSpecs'> & {
      templateDocumentIr?: WorkflowDocumentIR;
    },
    workflowResult: WorkflowSaveResult,
    existingMeta?: Record<string, any>
  ): Record<string, any> {
    const format = String(existingMeta?.format || 'docx');
    const templateName =
      dto.templateMeta?.templateName || existingMeta?.fileName || `draft-${id}.${format}`;
    const existingTemplateWorkflow = this.isPlainObject(
      existingMeta?.templateConfig?.templateWorkflow
    )
      ? existingMeta.templateConfig.templateWorkflow
      : undefined;
    const templateConfig = {
      ...(this.isPlainObject(existingMeta?.templateConfig) ? existingMeta.templateConfig : {}),
      templateWorkflow: {
        workflowVersion: TEMPLATE_WORKFLOW_SCHEMA_VERSION,
        templateDocumentIr: dto.templateDocumentIr || existingTemplateWorkflow?.templateDocumentIr,
        templateFieldSpecs: dto.templateFieldSpecs,
        carboneBindingPlan: workflowResult.carboneBindingPlan,
        renderPlan: workflowResult.renderPlan,
        languageProfile: {
          sourceLanguage: dto.templateMeta?.sourceLanguage || 'zh',
          targetLanguages: dto.templateMeta?.targetLanguages || [],
          documentMode: this.resolveDocumentMode(
            dto.templateMeta?.targetLanguages,
            dto.templateMeta?.documentMode
          ),
        },
        termAssets: dto.templateMeta?.termAssets,
        status: workflowResult.status,
        version: workflowResult.version,
        bindingPlanVersion: workflowResult.bindingPlanVersion,
      },
      templateAssetManifest: workflowResult.templateAssetManifest,
    };

    return {
      ...(existingMeta || {}),
      id,
      type: existingMeta?.type || 'template',
      format,
      fileName: templateName,
      hasValidFile: existingMeta?.hasValidFile ?? false,
      variables: workflowResult.carboneBindingPlan.bindings.map((binding) => binding.variablePath),
      loops: existingMeta?.loops || [],
      templateConfig,
      configSavedAt: workflowResult.updatedAt,
      createdAt: existingMeta?.createdAt || workflowResult.updatedAt,
      updatedAt: workflowResult.updatedAt,
    };
  }

  protected buildLegacyTemplateAssetManifest(
    meta: Record<string, any>,
    workflow: Record<string, any> | undefined
  ): TemplateAssetManifest | undefined {
    if (
      !workflow ||
      !Array.isArray(workflow.templateFieldSpecs) ||
      workflow.templateFieldSpecs.length === 0
    ) {
      return undefined;
    }

    const sourceLanguage =
      typeof workflow?.languageProfile?.sourceLanguage === 'string'
        ? workflow.languageProfile.sourceLanguage
        : 'zh';
    const targetLanguages = Array.isArray(workflow?.languageProfile?.targetLanguages)
      ? (workflow.languageProfile.targetLanguages as string[])
      : [];
    const documentMode =
      typeof workflow?.languageProfile?.documentMode === 'string'
        ? workflow.languageProfile.documentMode
        : targetLanguages.length > 0
          ? 'single_or_bilingual'
          : 'single_language';
    const legacyRenderPlan = this.isPlainObject(workflow?.renderPlan)
      ? (workflow.renderPlan as RenderPlan)
      : this.isPlainObject(workflow?.carboneBindingPlan)
        ? (workflow.carboneBindingPlan as RenderPlan)
        : undefined;

    if (!legacyRenderPlan) {
      return undefined;
    }

    return {
      assetVersion: TEMPLATE_ASSET_MANIFEST_VERSION,
      templateId: String(meta?.id || ''),
      fileName: String(meta?.fileName || ''),
      format: String(meta?.format || 'docx'),
      fieldCount: workflow.templateFieldSpecs.length,
      templateFieldSpecs: workflow.templateFieldSpecs as WorkflowTemplateFieldSpec[],
      languageProfile: {
        sourceLanguage,
        targetLanguages,
        documentMode,
      },
      renderPlan: legacyRenderPlan,
      renderPlanVersion: this.resolveRenderPlanVersion(
        legacyRenderPlan,
        Number(workflow?.bindingPlanVersion || workflow?.version || DEFAULT_RENDER_PLAN_VERSION)
      ),
      termAssets: this.isPlainObject(workflow?.termAssets)
        ? (workflow.termAssets as WorkflowTermAssets)
        : undefined,
      metadata: {
        generatedAt: String(meta?.updatedAt || meta?.configSavedAt || new Date().toISOString()),
        source: TEMPLATE_ASSET_SOURCE_LEGACY,
      },
    };
  }

  protected readWorkflowConfig(meta: Record<string, any>): {
    templateFieldSpecs: WorkflowTemplateFieldSpec[];
    carboneBindingPlan?: WorkflowBindingPlan;
    renderPlan?: RenderPlan;
    templateAssetManifest?: TemplateAssetManifest;
    sourceLanguage?: string;
    targetLanguages?: string[];
    termAssets?: WorkflowTermAssets;
  } {
    const workflow = this.isPlainObject(meta?.templateConfig?.templateWorkflow)
      ? meta.templateConfig.templateWorkflow
      : undefined;

    const manifest = this.isPlainObject(meta?.templateConfig?.templateAssetManifest)
      ? (meta.templateConfig.templateAssetManifest as TemplateAssetManifest)
      : this.buildLegacyTemplateAssetManifest(meta, workflow);

    return {
      templateFieldSpecs:
        manifest?.templateFieldSpecs ||
        (Array.isArray(workflow?.templateFieldSpecs)
          ? (workflow.templateFieldSpecs as WorkflowTemplateFieldSpec[])
          : []),
      carboneBindingPlan: this.isPlainObject(workflow?.carboneBindingPlan)
        ? (workflow.carboneBindingPlan as WorkflowBindingPlan)
        : undefined,
      renderPlan:
        manifest?.renderPlan ||
        (this.isPlainObject(workflow?.renderPlan)
          ? (workflow.renderPlan as RenderPlan)
          : undefined),
      templateAssetManifest: manifest,
      sourceLanguage:
        manifest?.languageProfile?.sourceLanguage ||
        (typeof workflow?.languageProfile?.sourceLanguage === 'string'
          ? workflow.languageProfile.sourceLanguage
          : undefined),
      targetLanguages:
        manifest?.languageProfile?.targetLanguages ||
        (Array.isArray(workflow?.languageProfile?.targetLanguages)
          ? (workflow.languageProfile.targetLanguages as string[])
          : undefined),
      termAssets:
        manifest?.termAssets ||
        (this.isPlainObject(workflow?.termAssets)
          ? (workflow.termAssets as WorkflowTermAssets)
          : undefined),
    };
  }

  /**
   * 获取模板信息
   */

  // Helper methods
  protected getTemplateMeta(id: string): TemplateResponse {
    const metaPath = path.join(this.templatesDir, `${id}.json`);
    if (!fs.existsSync(metaPath)) {
      throw new HttpException('Template not found', HttpStatus.NOT_FOUND);
    }
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));

    // 规范化模版配置中的变量路径（使用参数对照表）
    if (meta.templateConfig) {
      meta.templateConfig = this.aiIdentifierService.normalizeTemplateConfig(meta.templateConfig);
    }

    if (!Array.isArray(meta.suggestions)) {
      meta.suggestions = [];
    }

    if (!Array.isArray(meta.rawSuggestions)) {
      meta.rawSuggestions = [];
    }

    // 如果 config.variables 是对象而非数组，从 suggestions 中提取变量列表
    if (!meta.variables || !Array.isArray(meta.variables)) {
      if (meta.suggestions && Array.isArray(meta.suggestions)) {
        meta.variables = meta.suggestions
          .filter((s: any) => s.applied && s.suggestedName)
          .map((s: any) => s.suggestedName);
      } else {
        meta.variables = [];
      }
    }

    if (!Array.isArray(meta.loops) || meta.loops.length === 0) {
      meta.loops = this.extractLoopsFromMeta(meta);
    }

    const workflow = this.readWorkflowConfig(meta as Record<string, any>);
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
      meta.variables = workflow.renderPlan.bindings.map((binding) => binding.variablePath);
    }

    return meta;
  }

  protected async cacheTemplateSuggestions(
    id: string,
    meta: TemplateResponse,
    result: Pick<AIIdentifyResponse, 'suggestions' | 'rawSuggestions' | 'templateConfig'>
  ): Promise<void> {
    const nextSuggestions = Array.isArray(result.suggestions) ? result.suggestions : [];
    const nextRawSuggestions = Array.isArray(result.rawSuggestions) ? result.rawSuggestions : [];
    if (nextSuggestions.length === 0 && nextRawSuggestions.length === 0) {
      return;
    }

    const metaPath = path.join(this.templatesDir, `${id}.json`);
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
    await this.syncTemplateMetaToDb(id, updatedMeta);
  }

  protected mergeSkillGuideSuggestions(
    cachedSuggestions?: any[],
    incomingSuggestions?: any[]
  ): any[] {
    const merged = new Map<string, any>();

    const upsertSuggestion = (suggestion: any) => {
      if (!suggestion || typeof suggestion !== 'object') {
        return;
      }

      const key = this.buildSkillGuideSuggestionKey(suggestion);
      if (!key) {
        return;
      }

      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, suggestion);
        return;
      }

      merged.set(key, {
        ...existing,
        ...suggestion,
        details: {
          ...(existing.details || {}),
          ...(suggestion.details || {}),
        },
        applied: Boolean(existing.applied || suggestion.applied),
      });
    };

    for (const suggestion of Array.isArray(cachedSuggestions) ? cachedSuggestions : []) {
      upsertSuggestion(suggestion);
    }

    for (const suggestion of Array.isArray(incomingSuggestions) ? incomingSuggestions : []) {
      upsertSuggestion(suggestion);
    }

    return Array.from(merged.values());
  }

  protected buildSkillGuideSuggestionKey(suggestion: any): string | null {
    const candidates = [
      suggestion?.id,
      suggestion?.suggestedName,
      suggestion?.details?.variableName,
      suggestion?.details?.arrayPath,
      suggestion?.variablePath,
    ];

    for (const candidate of candidates) {
      const normalized = String(candidate || '').trim();
      if (normalized) {
        return normalized;
      }
    }

    const originalText = String(suggestion?.originalText || '').trim();
    const elementPath = String(suggestion?.elementPath || '').trim();
    if (originalText || elementPath) {
      return `${suggestion?.type || 'variable'}:${originalText}:${elementPath}`;
    }

    return null;
  }

  protected mergeSkillGuideTemplateConfig(
    cachedTemplateConfig?: any,
    incomingTemplateConfig?: any
  ): any {
    const cachedConfig =
      cachedTemplateConfig && typeof cachedTemplateConfig === 'object' ? cachedTemplateConfig : {};
    const incomingConfig =
      incomingTemplateConfig && typeof incomingTemplateConfig === 'object'
        ? incomingTemplateConfig
        : {};

    return {
      ...cachedConfig,
      ...incomingConfig,
    };
  }

  protected generateOutputFileName(templateName: string, format: string): string {
    const baseName = templateName.replace(/\.[^/.]+$/, '');
    return `${baseName}_${this.formatOutputTimestamp(new Date())}.${format}`;
  }

  protected formatOutputTimestamp(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}${month}${day}${hours}${minutes}`;
  }

  protected getContentType(format: string): string {
    switch (format) {
      case 'docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case 'xlsx':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case 'pptx':
        return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      case 'pdf':
        return 'application/pdf';
      case 'html':
        return 'text/html';
      default:
        return 'application/octet-stream';
    }
  }

  // Helper methods for skill generation
  protected generateExampleValue(fieldType: string, name: string): string {
    const normalizedName = String(name || '')
      .replace(/^\{/, '')
      .replace(/\}$/, '')
      .replace(/^d\./, '')
      .toLowerCase();

    const exactPatterns: Array<[RegExp, string]> = [
      [/(^|\.)(seq|serialno|serialnumber|lineno)$/, '1'],
      [/(^|\.)(materialcode|itemcode|productcode|sku|code)$/, 'RB-6A-001'],
      [/(^|\.)(devicename|productname|itemname|goodsname)$/, '工业机器人'],
      [/(^|\.)(model|spec|specification)$/, 'XR-600'],
      [/(^|\.)(unit)$/, '台'],
      [/(^|\.)(quantity|qty|count|num)$/, '4'],
      [/(^|\.)(unitprice|price)$/, '185,000.00'],
      [/(^|\.)(subtotal|amount|total)$/, '740,000.00'],
      [/(^|\.)(contractno|contractnumber)$/, 'PC-2026-001'],
      [/(^|\.)(projectname)$/, '智能制造产线升级项目'],
    ];

    for (const [pattern, value] of exactPatterns) {
      if (pattern.test(normalizedName)) {
        return value;
      }
    }

    switch (fieldType) {
      case 'date':
        return '2026-05-10';
      case 'amount':
      case 'number':
        return fieldType === 'number' ? '4' : '740,000.00';
      case 'phone':
        return '13800138000';
      case 'email':
        return 'procurement@example.com';
      case 'address':
        return '北京市朝阳区望京东路 1 号';
      case 'name':
        return '北京智造科技有限公司';
      default:
        if (name.includes('金额') || name.includes('价格')) return '740,000.00';
        if (name.includes('日期') || name.includes('时间')) return '2026-05-10';
        if (name.includes('电话') || name.includes('手机')) return '13800138000';
        if (name.includes('地址')) return '北京市朝阳区望京东路 1 号';
        if (name.includes('名称') || name.includes('姓名')) return '北京智造科技有限公司';
        return `示例${name}`;
    }
  }

  protected generateAIInstructions(
    templateType: string,
    variables: any[],
    description?: string
  ): string {
    const varList = variables
      .map((v) => `- **${v.name}**: ${v.aiHint || v.meaning || '填写对应值'}`)
      .join('\n');
    const exampleData = variables
      .slice(0, 5)
      .map((v) => `  "${v.name}": "${v.example}"`)
      .join(',\n');

    const baseInstructions = `# ${templateType}模板AI使用指南

## 模板概述
${description || '这是一个模板，用于生成标准化文档。'}

## 变量列表
${varList}

## 数据处理规则
1. **日期格式**: 使用 YYYY年MM月DD日 格式
2. **金额格式**: 保留两位小数，使用千分位分隔
3. **文本内容**: 直接填充，无需特殊处理

## AI处理流程
1. 接收用户提供的原始数据
2. 根据字段映射规则解析数据
3. 按格式要求处理特殊字段（日期、金额等）
4. 使用处理后的数据渲染模板
5. 输出最终文档供用户下载

## 示例数据结构
{ "d": {
${exampleData}
} }
`;

    return baseInstructions;
  }

  protected coerceSkillExampleValue(rawValue: unknown, fieldType?: string): unknown {
    const normalizedType = String(fieldType || '').toLowerCase();
    if (rawValue === null || rawValue === undefined) {
      return rawValue;
    }

    if (normalizedType === 'boolean') {
      if (typeof rawValue === 'boolean') {
        return rawValue;
      }
      const normalized = String(rawValue).trim().toLowerCase();
      if (['true', '1', 'yes', 'y', '是'].includes(normalized)) {
        return true;
      }
      if (['false', '0', 'no', 'n', '否'].includes(normalized)) {
        return false;
      }
      return Boolean(rawValue);
    }

    if (normalizedType === 'number' || normalizedType === 'amount') {
      if (typeof rawValue === 'number') {
        return rawValue;
      }
      const normalized = String(rawValue).replace(/,/g, '').trim();
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : rawValue;
    }

    if (normalizedType === 'date') {
      if (rawValue instanceof Date && !Number.isNaN(rawValue.getTime())) {
        return rawValue.toISOString().slice(0, 10);
      }
      const normalized = String(rawValue).trim();
      const parsed = new Date(normalized);
      return Number.isNaN(parsed.getTime()) ? normalized : parsed.toISOString().slice(0, 10);
    }

    return rawValue;
  }

  protected generateSimulatedData(skill: any): any {
    const data: any = {}; // 数据直接在根层级，不需要 d 包装
    // 使用新的parameters结构
    const variables = skill.parameters || skill.parameterization?.variables || [];
    for (const variable of variables) {
      const rawExampleValue =
        variable.example ??
        this.generateExampleValue(variable.dataType || variable.fieldType, variable.name);
      const exampleValue = this.coerceSkillExampleValue(
        rawExampleValue,
        variable.dataType || variable.fieldType
      );

      // 解析变量路径，支持多种格式：
      // 1. {d.partyA.name} -> partyA.name (带花括号)
      // 2. d.partyA.name -> partyA.name (不带花括号)
      // 3. partyA.name -> partyA.name (无d前缀)
      let varPath = variable.name;
      // 移除花括号 { }
      varPath = varPath.replace(/^\{/, '').replace(/\}$/, '');
      // 移除 d. 或 c. 或 t. 前缀
      varPath = varPath.replace(/^([cdt])\./, '');
      // 将数组占位路径转换为首项路径，便于生成预览示例数据
      varPath = varPath.replace(/\[\]/g, '[0]');

      if (varPath && (varPath.includes('.') || varPath.includes('['))) {
        this.setNestedValue(data, varPath, exampleValue);
      } else {
        // 单层路径，直接赋值
        data[varPath || variable.name] = exampleValue;
      }
    }
    return data;
  }
}
