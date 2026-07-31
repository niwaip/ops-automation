import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { getAuthServiceUrl } from '../../../config/service-endpoints';
import { TRACE_ID_HEADER } from '../../../common/trace.util';
import { AvailableSkillDefinition } from '../../react-engine/interfaces';

type SkillListResponse = {
  skills?: Array<Record<string, unknown>>;
};

type SkillCacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const PLANNER_SKILL_CACHE_TTL_MS = Number(process.env.PLANNER_SKILL_CACHE_TTL_MS || 60_000);

@Injectable()
export class SkillCacheService {
  private readonly logger = new Logger(SkillCacheService.name);
  private readonly authServiceUrl = getAuthServiceUrl();
  private readonly availableSkillsCache = new Map<
    string,
    SkillCacheEntry<AvailableSkillDefinition[]>
  >();
  private readonly skillByIdCache = new Map<
    string,
    SkillCacheEntry<AvailableSkillDefinition | null>
  >();

  async loadAvailableSkills(
    authToken?: string,
    traceId?: string,
    targetSkillId?: string
  ): Promise<AvailableSkillDefinition[]> {
    if (targetSkillId) {
      const skill = await this.loadSkillById(targetSkillId, authToken, traceId);
      if (skill) {
        return [skill];
      }
      this.logger.warn(
        `Target skill ${targetSkillId} could not be loaded directly, falling back to full skill list`
      );
    }

    const cacheKey = this.buildAuthCacheKey(authToken);
    const cachedSkills = this.getCacheValue(this.availableSkillsCache, cacheKey);
    if (cachedSkills) {
      return cachedSkills;
    }

    try {
      let rawSkills: any[] = [];
      try {
        const catalogRes = await axios.get(`${this.authServiceUrl}/internal/builtin-skills/catalog`, {
          headers: this.buildRequestHeaders(authToken, traceId),
        });
        const catalogData = catalogRes.data as any;
        if (Array.isArray(catalogData?.capabilities) && catalogData.capabilities.length > 0) {
          rawSkills = catalogData.capabilities.map((cap: any) => ({
            id: cap.capabilityRef?.id,
            skillId: cap.capabilityRef?.id,
            skillName: cap.displayName,
            name: cap.displayName,
            description: cap.description,
            category: cap.category,
            executionType: cap.runtimeType,
            executableVersion: cap.capabilityRef?.version || '1.0.0',
            version: cap.capabilityRef?.version || '1.0.0',
            source: cap.capabilityRef?.source,
            supportsArtifact: cap.supportsArtifact,
            paramsSchema: cap.inputSchema,
            outputSchema: cap.outputSchema,
            runtimeHints: cap.runtimeHints,
          }));
        }
      } catch (err: any) {
        this.logger.debug(`Unified catalog endpoint unavailable, falling back to /skills: ${err.message}`);
      }

      if (rawSkills.length === 0) {
        const response = await axios.get<SkillListResponse>(`${this.authServiceUrl}/skills`, {
          headers: this.buildRequestHeaders(authToken, traceId),
        });
        rawSkills = Array.isArray(response.data.skills) ? response.data.skills : [];
      }

      const normalizedSkills = rawSkills
        .map((item) => this.mapRawSkillDefinition(item))
        .filter((item) => item.skillId && item.skillName);
      this.setCacheValue(this.availableSkillsCache, cacheKey, normalizedSkills);
      normalizedSkills.forEach((skill) => {
        this.setCacheValue(
          this.skillByIdCache,
          this.buildSkillCacheKey(cacheKey, skill.skillId),
          skill
        );
      });
      return normalizedSkills;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      this.logger.warn(`Failed to load available skills for planner: ${message}`);
      return [];
    }
  }

  async loadSkillById(
    skillId: string,
    authToken?: string,
    traceId?: string
  ): Promise<AvailableSkillDefinition | null> {
    const trimmedSkillId = skillId.trim();
    if (!trimmedSkillId) {
      return null;
    }

    const authCacheKey = this.buildAuthCacheKey(authToken);
    const cachedSkill = this.getCacheValue(
      this.skillByIdCache,
      this.buildSkillCacheKey(authCacheKey, trimmedSkillId)
    );
    if (cachedSkill !== undefined) {
      return cachedSkill;
    }

    try {
      if (trimmedSkillId.startsWith('platform.')) {
        const resolveRes = await axios.post(`${this.authServiceUrl}/internal/builtin-skills/resolve`, {
          capabilityKey: trimmedSkillId,
          action: 'discover',
        }, {
          headers: this.buildRequestHeaders(authToken, traceId),
        });
        const data = resolveRes.data as any;
        if (data?.found && data?.capabilityView) {
          const cap = data.capabilityView;
          const mappedSkill = this.mapRawSkillDefinition({
            id: cap.capabilityRef?.id,
            skillId: cap.capabilityRef?.id,
            skillName: cap.displayName,
            name: cap.displayName,
            description: cap.description,
            category: cap.category,
            executionType: cap.runtimeType,
            executableVersion: cap.capabilityRef?.version || '1.0.0',
            version: cap.capabilityRef?.version || '1.0.0',
            source: cap.capabilityRef?.source,
            supportsArtifact: cap.supportsArtifact,
            paramsSchema: cap.inputSchema,
            outputSchema: cap.outputSchema,
            runtimeHints: cap.runtimeHints,
          });
          this.setCacheValue(
            this.skillByIdCache,
            this.buildSkillCacheKey(authCacheKey, trimmedSkillId),
            mappedSkill
          );
          return mappedSkill;
        }
      }

      const response = await axios.get<Record<string, unknown>>(
        `${this.authServiceUrl}/skills/${trimmedSkillId}`,
        {
          headers: this.buildRequestHeaders(authToken, traceId),
        }
      );
      const mappedSkill = this.mapRawSkillDefinition(response.data);
      if (!mappedSkill.skillId || !mappedSkill.skillName) {
        this.setCacheValue(
          this.skillByIdCache,
          this.buildSkillCacheKey(authCacheKey, trimmedSkillId),
          null
        );
        return null;
      }

      this.setCacheValue(
        this.skillByIdCache,
        this.buildSkillCacheKey(authCacheKey, trimmedSkillId),
        mappedSkill
      );
      return mappedSkill;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      this.logger.warn(`Failed to load planner target skill ${trimmedSkillId}: ${message}`);
      return null;
    }
  }

  normalizeParamsSchema(
    schema?: Partial<AvailableSkillDefinition['paramsSchema']>
  ): AvailableSkillDefinition['paramsSchema'] {
    const properties = Object.fromEntries(
      Object.entries(schema?.properties || {}).map(([name, value]) => {
        const property = (value || {}) as any;
        return [
          name,
          {
            type: (property.type ||
              'string') as AvailableSkillDefinition['paramsSchema']['properties'][string]['type'],
            description: property.description || name,
            required: Boolean(property.required),
            ...(property.default !== undefined ? { default: property.default } : {}),
            ...(property.extractionPrompt !== undefined
              ? { extractionPrompt: property.extractionPrompt }
              : {}),
            ...(typeof property.semanticRole === 'string'
              ? { semanticRole: property.semanticRole }
              : {}),
            ...(Array.isArray(property.extractionHints)
              ? { extractionHints: property.extractionHints }
              : {}),
            ...(typeof property.displayName === 'string'
              ? { displayName: property.displayName }
              : {}),
            ...(typeof property.groupLabel === 'string' ? { groupLabel: property.groupLabel } : {}),
            ...(typeof property.renderPath === 'string' ||
            (Array.isArray(property.renderPath) &&
              property.renderPath.every((item: unknown) => typeof item === 'string'))
              ? { renderPath: property.renderPath }
              : {}),
            ...(typeof property.previewBlocking === 'boolean'
              ? { previewBlocking: property.previewBlocking }
              : {}),
            ...(typeof property.confirmationThreshold === 'number'
              ? { confirmationThreshold: property.confirmationThreshold }
              : {}),
            ...(Array.isArray(property.enum) && property.enum.length > 0
              ? { enum: property.enum }
              : {}),
          },
        ];
      })
    );

    const required = Array.isArray(schema?.required)
      ? schema.required.filter(
          (item): item is string => typeof item === 'string' && item.length > 0
        )
      : [];

    required.forEach((name) => {
      if (properties[name]) {
        properties[name] = {
          ...properties[name],
          required: true,
        };
      }
    });

    return { properties, required };
  }

  hydrateParamsSchemaRenderPaths(
    schema: AvailableSkillDefinition['paramsSchema'],
    runtimeMetadata?: Record<string, unknown>
  ): AvailableSkillDefinition['paramsSchema'] {
    const mappingIndex = this.buildRuntimeMappingIndex(runtimeMetadata);
    if (mappingIndex.size === 0) {
      return schema;
    }

    let changed = false;
    const nextProperties = Object.fromEntries(
      Object.entries(schema.properties || {}).map(([name, property]) => {
        const existingRenderPath = property.renderPath;
        const alreadyHasRenderPath =
          typeof existingRenderPath === 'string'
            ? existingRenderPath.trim().length > 0
            : Array.isArray(existingRenderPath)
              ? existingRenderPath.some(
                  (item) => typeof item === 'string' && item.trim().length > 0
                )
              : false;
        if (alreadyHasRenderPath) {
          return [name, property];
        }

        const renderPaths = this.resolveRuntimeRenderPathsForParam(name, mappingIndex);
        if (renderPaths.length === 0) {
          return [name, property];
        }

        changed = true;
        return [
          name,
          {
            ...property,
            renderPath: renderPaths.length === 1 ? renderPaths[0] : renderPaths,
          },
        ];
      })
    ) as AvailableSkillDefinition['paramsSchema']['properties'];

    if (!changed) {
      return schema;
    }

    return {
      ...schema,
      properties: nextProperties,
    };
  }

  normalizeExecutionFlow(
    executionFlow: string[] | undefined,
    sourceType?: string
  ): string[] {
    const normalized = (executionFlow || []).filter(
      (step) => step && !['document_intake', 'generate_parameters'].includes(step)
    );

    if (normalized.length > 0) {
      return normalized;
    }

    return sourceType === 'document' ? ['document_render'] : [];
  }

  private mapRawSkillDefinition(item: Record<string, unknown>): AvailableSkillDefinition {
    const apiEndpoints =
      typeof item.apiEndpoints === 'object' && item.apiEndpoints
        ? (item.apiEndpoints as AvailableSkillDefinition['apiEndpoints'])
        : undefined;
    const runtimeMetadata =
      apiEndpoints?.runtimeMetadata && typeof apiEndpoints.runtimeMetadata === 'object'
        ? (apiEndpoints.runtimeMetadata as Record<string, unknown>)
        : undefined;
    const sourceTemplate = apiEndpoints?.runtimeMetadata?.sourceTemplate;
    const sourceType = apiEndpoints?.runtimeMetadata?.sourceType;
    const executionType = this.resolveExecutionType(
      typeof item.executionType === 'string' ? item.executionType : undefined,
      sourceType
    );

    const publishedSkillId = String(item.id || item.skillId || '');

    const publishedReleaseVersion =
      typeof item.publishedReleaseVersion === 'number'
        ? item.publishedReleaseVersion
        : typeof item.publishedReleaseVersion === 'string'
          ? Number(item.publishedReleaseVersion)
          : undefined;

    const executableVersion =
      typeof item.executableVersion === 'string'
        ? item.executableVersion
        : typeof item.publishedVersion === 'string'
          ? item.publishedVersion
          : typeof item.version === 'string'
            ? item.version
            : Number.isFinite(publishedReleaseVersion)
              ? String(publishedReleaseVersion)
              : typeof (runtimeMetadata as any)?.version === 'string'
                ? (runtimeMetadata as any).version
                : undefined;

    const outputParams =
      (item.outputParams as Record<string, unknown>) ||
      (runtimeMetadata?.outputParams as Record<string, unknown>) ||
      (item.outputSchema as Record<string, unknown>);

    return {
      skillId: String(item.id || item.skillId || ''),
      publishedSkillId,
      executableVersion,
      version: executableVersion,
      publishedVersion: executableVersion,
      isPublished: typeof item.isPublished === 'boolean' ? item.isPublished : true,
      publishedReleaseId: typeof item.publishedReleaseId === 'string' ? item.publishedReleaseId : undefined,
      publishedReleaseVersion,
      publishedReleaseStatus: typeof item.publishedReleaseStatus === 'string' ? item.publishedReleaseStatus : undefined,
      publishedDeploymentStatus: typeof item.publishedDeploymentStatus === 'string' ? item.publishedDeploymentStatus : undefined,
      skillName: String(item.name || item.skillName || ''),
      description: typeof item.description === 'string' ? item.description : undefined,
      triggerKeywords: Array.isArray(item.triggerKeywords) ? item.triggerKeywords.map(String) : [],
      outputParams,
      publishedSourceType:
        typeof item.publishedSourceType === 'string' ? item.publishedSourceType : undefined,
      paramsSchema: this.hydrateParamsSchemaRenderPaths(
        this.normalizeParamsSchema(
          (item.paramsSchema as AvailableSkillDefinition['paramsSchema']) || {
            properties: {},
            required: [],
          }
        ),
        runtimeMetadata
      ),
      executionType,
      templateId:
        typeof item.templateId === 'string'
          ? item.templateId
          : typeof sourceTemplate?.templateId === 'string'
            ? sourceTemplate.templateId
            : undefined,
      carboneTemplateId:
        typeof item.carboneTemplateId === 'string'
          ? item.carboneTemplateId
          : typeof sourceTemplate?.templateId === 'string'
            ? sourceTemplate.templateId
            : undefined,
      carboneSkillId:
        typeof item.carboneSkillId === 'string'
          ? item.carboneSkillId
          : typeof sourceTemplate?.skillId === 'string'
            ? sourceTemplate.skillId
            : undefined,
      executionFlowTemplateIds: Array.isArray(item.executionFlowTemplateIds)
        ? item.executionFlowTemplateIds.map(String)
        : [],
      executionFlow: this.normalizeExecutionFlow(
        Array.isArray(item.executionFlow)
          ? item.executionFlow
              .map((step) =>
                step && typeof step === 'object'
                  ? String(
                      (step as Record<string, unknown>).name ||
                        (step as Record<string, unknown>).type ||
                        ''
                    )
                  : String(step || '')
              )
              .filter(Boolean)
          : [],
        sourceType
      ),
      apiEndpoints,
      goal: typeof item.goal === 'string' ? item.goal : undefined,
      expectedResult: typeof item.expectedResult === 'string' ? item.expectedResult : undefined,
    };
  }

  private resolveExecutionType(
    executionType?: string,
    sourceType?: string
  ): AvailableSkillDefinition['executionType'] {
    if (executionType === 'document' || executionType === 'flow' || executionType === 'query') {
      return executionType;
    }
    if (sourceType === 'document' || sourceType === 'execution_flow_template') {
      return 'document';
    }
    return undefined;
  }

  private buildRuntimeMappingIndex(
    runtimeMetadata?: Record<string, unknown>
  ): Map<string, string[]> {
    const mappingIndex = new Map<string, string[]>();
    const mappingHints = Array.isArray(runtimeMetadata?.mappingHints)
      ? runtimeMetadata.mappingHints
      : [];

    mappingHints.forEach((hint) => {
      if (!hint || typeof hint !== 'object' || Array.isArray(hint)) {
        return;
      }

      const parameterName = typeof hint.parameter === 'string' ? hint.parameter.trim() : '';
      const renderPath = this.normalizeRuntimeMappingPath(
        typeof hint.path === 'string' ? hint.path : undefined
      );
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
    mappingIndex: Map<string, string[]>
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

  private buildRequestHeaders(authToken?: string, traceId?: string): Record<string, string> {
    return {
      ...(authToken ? { Authorization: authToken } : {}),
      ...(traceId ? { [TRACE_ID_HEADER]: traceId } : {}),
    };
  }

  private buildAuthCacheKey(authToken?: string): string {
    return createHash('sha1').update(authToken || 'anonymous').digest('hex');
  }

  private buildSkillCacheKey(authCacheKey: string, skillId: string): string {
    return `${authCacheKey}:skill:${skillId}`;
  }

  private getCacheValue<T>(cache: Map<string, SkillCacheEntry<T>>, key: string): T | undefined {
    const entry = cache.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt < Date.now()) {
      cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  private setCacheValue<T>(cache: Map<string, SkillCacheEntry<T>>, key: string, value: T): void {
    cache.set(key, {
      value,
      expiresAt: Date.now() + PLANNER_SKILL_CACHE_TTL_MS,
    });
  }
}
