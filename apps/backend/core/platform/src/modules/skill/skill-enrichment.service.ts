import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { getCarboneServiceUrl } from '../../config/service-endpoints';
import { PrismaService } from '../../prisma/prisma.service';
import { ExecutionFlowTemplateService } from '../execution-flow/execution-flow-template.service';
import { SkillConfigDto, SkillRuntimeMetadata, SkillToolBinding, WorkflowInputPolicy } from './interfaces';
import { SkillToolBindingService } from './skill-tool-binding.service';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function isValidUUID(str: string): boolean {
  return UUID_REGEX.test(str);
}

type PublishedSkillReleaseMeta = {
  skillId: string;
  releaseId: string;
  releaseVersion: number;
  status: string;
  deploymentStatus: string;
  sourceType: string;
};

type CarboneSkillMeta = {
  id?: string;
  templateId?: string;
  parsingGuide?: Record<string, unknown>;
  dataParsing?: Record<string, unknown>;
  validation?: Record<string, unknown>;
  aiInstructions?: string;
  skillGuideMarkdown?: string;
  dataExampleJson?: unknown;
};

@Injectable()
export class SkillEnrichmentService {
  private readonly logger = new Logger(SkillEnrichmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly executionFlowService: ExecutionFlowTemplateService,
    private readonly skillToolBindingService: SkillToolBindingService,
  ) {}

  async enrichSkillsWithPublication(
    skills: any[],
    options?: { hideHistoricalPublishedVersions?: boolean },
  ): Promise<SkillConfigDto[]> {
    if (!skills.length) {
      return [];
    }
    const skillIds = skills.map((skill) => skill.id);
    const publicationMap = await this.getPublishedReleaseMap(skillIds);
    const publishedBindingSet = await this.getPublishedSkillBindingSet(skillIds);
    const toolBindingMap = await this.skillToolBindingService.getSkillToolBindingMap(skillIds);
    const visibleSkills = skills
      .filter((skill) => {
        if (!options?.hideHistoricalPublishedVersions) {
          return true;
        }
        const isCurrentPublished = publicationMap.has(skill.id);
        const hasPublishedHistory = publishedBindingSet.has(skill.id);
        return isCurrentPublished || !hasPublishedHistory;
      })
      .map((skill) => this.toDTO(skill, publicationMap.get(skill.id), toolBindingMap.get(skill.id) || []));
    const visibleRawSkills = skills.filter((skill) => visibleSkills.some((item) => item.id === skill.id));
    const skillsWithWorkflowInputPolicy = await this.enrichSkillsWithWorkflowInputPolicy(
      visibleSkills,
      visibleRawSkills,
    );
    return this.enrichDocumentSkillsWithCarboneGuide(
      skillsWithWorkflowInputPolicy,
      visibleRawSkills,
    );
  }

  async getPublishedReleaseMap(skillIds: string[]): Promise<Map<string, PublishedSkillReleaseMeta>> {
    const rows = await this.getCurrentPublishedReleaseRows();

    return new Map(
      rows
        .filter((row) => skillIds.includes(row.published_skill_id))
        .map((row) => [
          row.published_skill_id,
          {
            skillId: row.published_skill_id,
            releaseId: row.id,
            releaseVersion: Number(row.release_version || 0),
            status: row.status,
            deploymentStatus: row.deployment_status,
            sourceType: row.source_type,
          } satisfies PublishedSkillReleaseMeta,
        ]),
    );
  }

  private async enrichSkillsWithWorkflowInputPolicy(
    skills: SkillConfigDto[],
    rawSkills: any[],
  ): Promise<SkillConfigDto[]> {
    if (!skills.length) {
      return skills;
    }

    const rawSkillMap = new Map(rawSkills.map((skill) => [String(skill.id), skill]));
    return Promise.all(
      skills.map(async (skill) => {
        const rawSkill = rawSkillMap.get(skill.id);
        return this.enrichSkillWithWorkflowInputPolicy(skill, rawSkill);
      }),
    );
  }

  private async enrichSkillWithWorkflowInputPolicy(
    skill: SkillConfigDto,
    rawSkill: any,
  ): Promise<SkillConfigDto> {
    const templateIds = Array.isArray(rawSkill?.executionFlowTemplateIds)
      ? rawSkill.executionFlowTemplateIds
          .map((value: unknown) => String(value || '').trim())
          .filter(Boolean)
      : [];
    if (templateIds.length === 0) {
      return skill;
    }

    const currentRuntimeMetadata = (skill.apiEndpoints?.runtimeMetadata || {}) as Record<string, unknown>;
    const existingWorkflowInputPolicy = this.asRecord(currentRuntimeMetadata.workflowInputPolicy);
    const workflowInputPolicy = await this.loadWorkflowInputPolicyFromTemplates(templateIds);
    if (!workflowInputPolicy || Object.keys(workflowInputPolicy.params || {}).length === 0) {
      return skill;
    }

    const mergedWorkflowInputPolicy = this.mergeWorkflowInputPolicies(
      existingWorkflowInputPolicy as WorkflowInputPolicy | undefined,
      workflowInputPolicy,
    );

    return {
      ...skill,
      apiEndpoints: {
        ...(skill.apiEndpoints || {}),
        runtimeMetadata: {
          ...currentRuntimeMetadata,
          workflowInputPolicy: mergedWorkflowInputPolicy,
        } as SkillRuntimeMetadata,
      },
    };
  }

  private async loadWorkflowInputPolicyFromTemplates(
    templateIds: string[],
  ): Promise<WorkflowInputPolicy | undefined> {
    const mergedParams = (await Promise.all(
      templateIds.map(async (templateId) => {
        try {
          const template = await this.executionFlowService.getTemplate(templateId);
          return this.asRecord(template?.inputPolicy?.params) || {};
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown';
          this.logger.warn(`Failed to load workflow input policy from template ${templateId}: ${message}`);
          return {};
        }
      }),
    )).reduce<Record<string, unknown>>((acc, params) => ({
      ...acc,
      ...params,
    }), {});

    if (Object.keys(mergedParams).length === 0) {
      return undefined;
    }

    return {
      params: mergedParams as WorkflowInputPolicy['params'],
    };
  }

  private mergeWorkflowInputPolicies(
    existingPolicy: WorkflowInputPolicy | undefined,
    templatePolicy: WorkflowInputPolicy,
  ): WorkflowInputPolicy {
    const existingParams = this.asRecord(existingPolicy?.params) || {};
    const templateParams = this.asRecord(templatePolicy.params) || {};
    const mergedParams = Object.keys({
      ...existingParams,
      ...templateParams,
    }).reduce<Record<string, Record<string, unknown>>>((acc, key) => {
      const existingEntry = this.asRecord(existingParams[key]) || {};
      const templateEntry = this.asRecord(templateParams[key]) || {};
      acc[key] = {
        ...existingEntry,
        ...templateEntry,
      };
      return acc;
    }, {});

    return {
      params: mergedParams as WorkflowInputPolicy['params'],
    };
  }

  private async enrichDocumentSkillsWithCarboneGuide(
    skills: SkillConfigDto[],
    rawSkills: any[],
  ): Promise<SkillConfigDto[]> {
    if (!skills.length) {
      return skills;
    }

    const rawSkillMap = new Map(rawSkills.map((skill) => [String(skill.id), skill]));
    return Promise.all(
      skills.map(async (skill) => {
        const rawSkill = rawSkillMap.get(skill.id);
        return this.enrichDocumentSkillWithCarboneGuide(skill, rawSkill);
      }),
    );
  }

  private async enrichDocumentSkillWithCarboneGuide(
    skill: SkillConfigDto,
    rawSkill: any,
  ): Promise<SkillConfigDto> {
    const currentRuntimeMetadata = (skill.apiEndpoints?.runtimeMetadata || {}) as Record<string, unknown>;
    if (!this.shouldFetchCarboneGuide(rawSkill, currentRuntimeMetadata)) {
      return skill;
    }

    const carboneSkillId = this.resolveCarboneSkillId(rawSkill, currentRuntimeMetadata);
    if (!carboneSkillId) {
      return skill;
    }

    try {
      const carboneSkill = await this.fetchCarboneSkillMeta(carboneSkillId);
      const mergedRuntimeMetadata = this.mergeRuntimeMetadataWithCarboneGuide(
        currentRuntimeMetadata,
        carboneSkill,
      );

      return {
        ...skill,
        paramsSchema: this.hydrateParamsSchemaRenderPaths(
          skill.paramsSchema,
          mergedRuntimeMetadata,
        ),
        apiEndpoints: {
          ...(skill.apiEndpoints || {}),
          runtimeMetadata: mergedRuntimeMetadata,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      this.logger.warn(`Failed to enrich document skill ${skill.id} with carbone guide ${carboneSkillId}: ${message}`);
      return skill;
    }
  }

  private shouldFetchCarboneGuide(
    rawSkill: any,
    runtimeMetadata: Record<string, unknown>,
  ): boolean {
    const sourceType = typeof runtimeMetadata?.sourceType === 'string'
      ? runtimeMetadata.sourceType
      : '';
    const sourceTemplate = (runtimeMetadata?.sourceTemplate && typeof runtimeMetadata.sourceTemplate === 'object')
      ? runtimeMetadata.sourceTemplate as Record<string, unknown>
      : undefined;
    const isDocumentSkill =
      sourceType === 'document'
      || sourceType === 'execution_flow_template'
      || typeof sourceTemplate?.skillId === 'string'
      || typeof sourceTemplate?.templateId === 'string'
      || typeof rawSkill?.carboneSkillId === 'string';

    if (!isDocumentSkill) {
      return false;
    }

    return !runtimeMetadata.skillGuideMarkdown
      || !runtimeMetadata.dataExampleJson
      || !runtimeMetadata.extractionRules
      || !runtimeMetadata.mappingHints;
  }

  private resolveCarboneSkillId(
    rawSkill: any,
    runtimeMetadata: Record<string, unknown>,
  ): string | undefined {
    if (typeof rawSkill?.carboneSkillId === 'string' && rawSkill.carboneSkillId.trim()) {
      return rawSkill.carboneSkillId.trim();
    }

    const sourceTemplate = (runtimeMetadata?.sourceTemplate && typeof runtimeMetadata.sourceTemplate === 'object')
      ? runtimeMetadata.sourceTemplate as Record<string, unknown>
      : undefined;
    if (typeof sourceTemplate?.skillId === 'string' && sourceTemplate.skillId.trim()) {
      return sourceTemplate.skillId.trim();
    }

    return undefined;
  }

  private async fetchCarboneSkillMeta(skillId: string): Promise<CarboneSkillMeta> {
    const carboneBaseUrl = getCarboneServiceUrl();
    const response = await axios.get<CarboneSkillMeta>(`${carboneBaseUrl}/studio/skill/${skillId}`, {
      timeout: 15000,
    });
    return response.data || {};
  }

  private mergeRuntimeMetadataWithCarboneGuide(
    runtimeMetadata: Record<string, unknown>,
    carboneSkill: CarboneSkillMeta,
  ): Record<string, unknown> {
    const parsingGuide = this.asRecord(carboneSkill.parsingGuide);
    const dataParsing = this.asRecord(carboneSkill.dataParsing);
    const validation = this.asRecord(carboneSkill.validation);
    const currentOutputParams = this.asRecord(runtimeMetadata.outputParams);
    const mergedOutputExample = this.parseJsonRecord(carboneSkill.dataExampleJson) || currentOutputParams;

    return {
      ...runtimeMetadata,
      paramCollectionGuidance:
        this.readText(runtimeMetadata.paramCollectionGuidance)
        || this.readText(parsingGuide?.overview)
        || this.readText(carboneSkill.aiInstructions),
      validationRules:
        this.readText(runtimeMetadata.validationRules)
        || (validation ? JSON.stringify(validation, null, 2) : undefined),
      skillGuideMarkdown:
        this.readText(runtimeMetadata.skillGuideMarkdown)
        || this.readText(carboneSkill.skillGuideMarkdown),
      dataExampleJson:
        runtimeMetadata.dataExampleJson || mergedOutputExample,
      extractionRules:
        runtimeMetadata.extractionRules
        || (Array.isArray(parsingGuide?.extractionRules) ? parsingGuide.extractionRules : undefined),
      mappingHints:
        runtimeMetadata.mappingHints
        || (Array.isArray(dataParsing?.mappingHints) ? dataParsing.mappingHints : undefined),
      outputParams:
        currentOutputParams || mergedOutputExample,
    };
  }

  private hydrateParamsSchemaRenderPaths(
    paramsSchema: SkillConfigDto['paramsSchema'],
    runtimeMetadata: Record<string, unknown>,
  ): SkillConfigDto['paramsSchema'] {
    const properties = this.asRecord(paramsSchema?.properties);
    if (!properties) {
      return paramsSchema;
    }

    const mappingIndex = this.buildRuntimeMappingIndex(runtimeMetadata);
    if (mappingIndex.size === 0) {
      return paramsSchema;
    }

    let changed = false;
    const nextProperties = Object.fromEntries(
      Object.entries(properties).map(([name, rawProperty]) => {
        const property = this.asRecord(rawProperty) || {};
        const existingRenderPath = property.renderPath;
        const alreadyHasRenderPath = typeof existingRenderPath === 'string'
          ? existingRenderPath.trim().length > 0
          : Array.isArray(existingRenderPath)
            ? existingRenderPath.some((item) => typeof item === 'string' && item.trim().length > 0)
            : false;
        if (alreadyHasRenderPath) {
          return [name, rawProperty];
        }

        const renderPaths = this.resolveRuntimeRenderPathsForParam(name, mappingIndex);
        if (renderPaths.length === 0) {
          return [name, rawProperty];
        }

        changed = true;
        return [
          name,
          {
            ...property,
            renderPath: renderPaths.length === 1 ? renderPaths[0] : renderPaths,
          },
        ];
      }),
    );

    if (!changed) {
      return paramsSchema;
    }

    return {
      ...paramsSchema,
      properties: nextProperties as SkillConfigDto['paramsSchema']['properties'],
    };
  }

  private buildRuntimeMappingIndex(
    runtimeMetadata: Record<string, unknown>,
  ): Map<string, string[]> {
    const mappingIndex = new Map<string, string[]>();
    const mappingHints = Array.isArray(runtimeMetadata.mappingHints)
      ? runtimeMetadata.mappingHints
      : [];

    mappingHints.forEach((hint) => {
      const record = this.asRecord(hint);
      const parameterName = this.readText(record?.parameter);
      const renderPath = this.normalizeRuntimeMappingPath(this.readText(record?.path));
      if (!parameterName || !renderPath) {
        return;
      }

      const existing = mappingIndex.get(parameterName) || [];
      if (!existing.includes(renderPath)) {
        mappingIndex.set(parameterName, [...existing, renderPath]);
      }
    });

    return mappingIndex;
  }

  private resolveRuntimeRenderPathsForParam(
    paramName: string,
    mappingIndex: Map<string, string[]>,
  ): string[] {
    const directMatch = mappingIndex.get(paramName);
    if (directMatch?.length) {
      return directMatch;
    }

    const variantMatches = Array.from(mappingIndex.entries())
      .filter(([name]) => name.startsWith(`${paramName}_`))
      .flatMap(([, renderPaths]) => renderPaths);

    return Array.from(new Set(variantMatches));
  }

  private normalizeRuntimeMappingPath(path: string | undefined): string | undefined {
    if (!path) {
      return undefined;
    }

    const trimmed = path.trim();
    const carboneBindingMatch = trimmed.match(/^\{#?d\.([^}:]+)(?::[^}]*)?\}$/);
    if (carboneBindingMatch?.[1]) {
      return carboneBindingMatch[1].trim();
    }

    return trimmed.replace(/^data\./, '').trim() || undefined;
  }

  private asRecord(value: unknown): Record<string, any> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    return value as Record<string, any>;
  }

  private parseJsonRecord(value: unknown): Record<string, unknown> | undefined {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return this.asRecord(parsed);
      } catch {
        return undefined;
      }
    }
    return this.asRecord(value);
  }

  private readText(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  private async getPublishedSkillBindingSet(skillIds: string[]): Promise<Set<string>> {
    const uniqueSkillIds = Array.from(new Set(skillIds.filter((id) => isValidUUID(id))));
    if (uniqueSkillIds.length === 0) {
      return new Set();
    }

    const rows = await this.prisma.$queryRawUnsafe<Array<{ published_skill_id: string }>>(
      `SELECT DISTINCT published_skill_id
       FROM capability_releases
       WHERE archived_at IS NULL
         AND published_skill_id = ANY($1::uuid[])`,
      uniqueSkillIds,
    );

    return new Set(rows.map((row) => row.published_skill_id));
  }

  private async getCurrentPublishedReleaseRows(): Promise<any[]> {
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT DISTINCT ON (source_type, COALESCE(source_id::text, source_name, published_skill_id::text))
          id,
          published_skill_id,
          release_version,
          status,
          deployment_status,
          source_type,
          source_id,
          source_name,
          updated_at
       FROM capability_releases
       WHERE archived_at IS NULL
         AND published_skill_id IS NOT NULL
       ORDER BY source_type,
                COALESCE(source_id::text, source_name, published_skill_id::text),
                release_version DESC,
                updated_at DESC`
    );
  }

  private toDTO(
    skill: any,
    publication?: PublishedSkillReleaseMeta,
    bindings: SkillToolBinding[] = [],
  ): SkillConfigDto {
    return {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      triggerKeywords: skill.triggerKeywords as string[],
      paramsSchema: skill.paramsSchema as any,
      executionFlowTemplateIds: (skill.executionFlowTemplateIds as string[]) || [],
      executionFlow: (skill.executionFlow as any[]) || [],
      tools: skill.tools as string[],
      effectiveTools: bindings.map((item) => item.toolName),
      apiEndpoints: skill.apiEndpoints ? {
        runtimeMetadata: (skill.apiEndpoints as any).runtimeMetadata
      } : undefined,
      isActive: skill.isActive,
      configStatus: skill.configStatus || skill.config_status || undefined,
      isPublished: Boolean(publication),
      publishedReleaseId: publication?.releaseId || null,
    };
  }
}
