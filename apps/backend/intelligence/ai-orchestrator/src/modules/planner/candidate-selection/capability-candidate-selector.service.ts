import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  projectOutputSchemaV1,
  type CompactCapabilityCardV1,
  type SkillPlanNodeV1,
} from '@ops/backend-deterministic-plan';
import { resolveParamEnumValues } from '../params/param-enum-constraint';
import { LlmOperationCatalogProjector } from '../../llm-operation/llm-operation-catalog.projector';

@Injectable()
export class CapabilityCandidateSelectorService {
  private readonly logger = new Logger(CapabilityCandidateSelectorService.name);

  constructor(@Optional() private readonly catalogProjector?: LlmOperationCatalogProjector) {}

  public async selectCandidates(
    _userRequest: string,
    availableSkills: Array<{
      id: string;
      name?: string;
      description?: string;
      category?: string;
      inputSchema?: any;
      outputSchema?: any;
      executionType?: string;
      skillId?: string;
      skillName?: string;
      publishedSkillId?: string;
      executableVersion?: string;
      publishedVersion?: string;
      version?: string;
      publishedReleaseVersion?: string | number;
      publishedReleaseStatus?: string;
      publishedDeploymentStatus?: string;
      isPublished?: boolean;
      isDeployed?: boolean;
      source?: string;
      capabilitySource?: string;
      supportsArtifact?: boolean;
      paramsSchema?: any;
      params?: any;
      outputParams?: any;
      runtimeHints?: { outputParams?: any };
      apiEndpoints?: { runtimeMetadata?: any };
    }> = [],
  ): Promise<{
    skillCards: CompactCapabilityCardV1[];
    llmOperationCards: CompactCapabilityCardV1[];
  }> {
    const skillCards: CompactCapabilityCardV1[] = [];
    const validSkills: any[] = [];

    for (const skill of (availableSkills || []) as any[]) {
      const skillId = skill.skillId || skill.id || skill.skillName || skill.name;
      const publishedSkillId = skill.publishedSkillId || skill.id || skillId;
      const executableVersion =
        skill.executableVersion ||
        skill.publishedVersion ||
        skill.version ||
        (skill.publishedReleaseVersion != null ? String(skill.publishedReleaseVersion) : undefined) ||
        '1.0.0';

      const publishedReleaseStatus =
        typeof skill.publishedReleaseStatus === 'string'
          ? skill.publishedReleaseStatus.trim().toLowerCase()
          : '';
      const publishedDeploymentStatus =
        typeof skill.publishedDeploymentStatus === 'string'
          ? skill.publishedDeploymentStatus.trim().toLowerCase()
          : '';

      const isBuiltin =
        skill.source === 'builtin_skill' ||
        skill.capabilitySource === 'builtin_skill' ||
        (typeof skillId === 'string' && skillId.startsWith('platform.'));

      if (!skillId || !executableVersion) {
        this.logger.warn(`Skipping skill ${skillId || 'unknown'} from candidate selection: missing published executable version.`);
        continue;
      }

      if (!isBuiltin && skill.isPublished === false) {
        this.logger.warn(`Skipping skill ${skillId}: isPublished is false.`);
        continue;
      }

      if (!isBuiltin && (publishedReleaseStatus !== 'published' || publishedDeploymentStatus !== 'deployed')) {
        this.logger.warn(
          `Skipping skill ${skillId}: published status=${publishedReleaseStatus || 'unknown'}, deployment status=${publishedDeploymentStatus || 'unknown'}.`,
        );
        continue;
      }

      if (!isBuiltin) {
        const authoritativeOutput =
          skill.outputSchema ||
          skill.outputParams ||
          skill.runtimeHints?.outputParams ||
          skill.apiEndpoints?.runtimeMetadata?.outputParams;
        if (
          !authoritativeOutput ||
          typeof authoritativeOutput !== 'object' ||
          Array.isArray(authoritativeOutput) ||
          Object.keys(authoritativeOutput).length === 0
        ) {
          this.logger.warn(
            `Skipping skill ${skillId}: no output schema declared — 无输出 Schema 不能进入确定性候选集 (P0).`,
          );
          continue;
        }
      }

      validSkills.push(skill);
    }

    // Intent matching belongs to the topology LLM. This layer only applies
    // deterministic publication/deployment/contract gates and a stable token cap.
    for (const skill of validSkills.slice(0, 12)) {
      const skillId = skill.skillId || skill.id || skill.skillName || skill.name;
      const publishedSkillId = skill.publishedSkillId || skill.id || skillId;
      const executableVersion =
        skill.executableVersion ||
        skill.publishedVersion ||
        skill.version ||
        (skill.publishedReleaseVersion != null ? String(skill.publishedReleaseVersion) : undefined) ||
        '1.0.0';

      const summary = (skill.description || skill.skillName || skill.name || '').substring(0, 200);
      const inputSchema = skill.paramsSchema || skill.inputSchema || skill.params;
      const outputSchema =
        skill.outputSchema ||
        skill.outputParams ||
        skill.runtimeHints?.outputParams ||
        skill.apiEndpoints?.runtimeMetadata?.outputParams;
      const runtimeMetadata = skill.apiEndpoints?.runtimeMetadata;

      const runtimeType = this.mapExecutionTypeToRuntimeType(
        skill.executionType || skill.category,
        runtimeMetadata,
      );
      const executionRuntimeType = runtimeMetadata?.runtimeType || undefined;
      const outputProjection = projectOutputSchemaV1(outputSchema);
      const supportsArtifactOutput = this.detectArtifactSupport(
        outputProjection.outputContract,
        runtimeMetadata,
        skill.supportsArtifact,
      );

      const card: CompactCapabilityCardV1 = {
        id: skillId,
        kind: 'skill',
        displayName: skill.skillName || skill.name || skillId,
        summary,
        goals: [runtimeType, skill.skillName || skill.name || skillId],
        inputs: this.extractSchemaSummary(inputSchema),
        outputs: outputProjection.outputContract,
        primaryOutput: outputProjection.primaryOutput,
        category: runtimeType,
        executionRuntimeType,
        supportsArtifactOutput,
        publishedSkillId,
        executableVersion,
        // Store the original required[] array so the parameter binder can correctly
        // distinguish required vs optional fields without relying on compressed summary strings.
        _rawInputSchema: inputSchema ? {
          required: Array.isArray(inputSchema.required) ? inputSchema.required : [],
          defaults: this.extractParamDefaults(inputSchema),
          properties: this.extractRecognizerProperties(inputSchema),
        } : undefined,
      } as any;
      skillCards.push(this.truncateCard(card));
    }

    const llmOperationCards = await this.projectLlmOperationCards();
    return { skillCards, llmOperationCards };
  }

  /**
   * Project LLM Operation cards from the catalog projector.
   * Returns empty array on error (fail-open) to avoid breaking planner flow.
   */
  private async projectLlmOperationCards(): Promise<CompactCapabilityCardV1[]> {
    if (!this.catalogProjector) {
      this.logger.warn('LlmOperationCatalogProjector not available, returning empty LLM Operation cards');
      return [];
    }

    try {
      const projections = await this.catalogProjector.projectAll();
      return projections.map((projection) => {
        const outputProjection = projectOutputSchemaV1(projection.outputSchema);
        const card: CompactCapabilityCardV1 = {
          id: projection.capabilityRef.id,
          kind: 'llm_operation',
          displayName: projection.displayName,
          summary: projection.summary,
          goals: projection.goals,
          inputs: this.extractSchemaSummary(projection.inputSchema),
          outputs: outputProjection.outputContract,
          primaryOutput: outputProjection.primaryOutput,
          _rawInputSchema: {
            required: Array.isArray((projection.inputSchema as any)?.required)
              ? (projection.inputSchema as any).required
              : [],
            defaults: this.extractParamDefaults(projection.inputSchema),
            properties: this.extractRecognizerProperties(projection.inputSchema),
          },
        } as any;
        return this.truncateCard(card);
      });
    } catch (error) {
      this.logger.warn(`Failed to project LLM Operation cards: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  private mapExecutionTypeToRuntimeType(
    executionType?: string,
    runtimeMetadata?: any,
  ): SkillPlanNodeV1['runtimeType'] {
    switch (executionType) {
      case 'flow':
        return 'workflow';
      case 'query':
        return 'api';
      case 'document':
      case 'artifact':
        return 'artifact';
      default:
        return 'workflow';
    }
  }

  private detectArtifactSupport(
    outputContract: Record<string, string>,
    runtimeMetadata?: any,
    supportsArtifactFlag?: boolean,
  ): boolean {
    if (supportsArtifactFlag === true) return true;
    if (runtimeMetadata?.supportsArtifact || runtimeMetadata?.producesArtifact) return true;
    return Object.values(outputContract).includes('artifact_ref');
  }

  private extractSchemaSummary(schema: any): Record<string, string> {
    // Return an empty object when the schema is absent or not an object.
    // Callers (normalizeSkillOutputContract) treat an empty outputs map as
    // "no declared outputs" and leave the node's outputContract untouched.
    // DO NOT fall back to { data: 'string' } — that phantom field would
    // propagate into the outputContract and cause runtime missing-field errors.
    if (!schema || typeof schema !== 'object') return {};
    const props = schema.properties || schema;
    const res: Record<string, string> = {};

    if (Array.isArray(props)) {
      for (const param of props) {
        if (!param || typeof param !== 'object') continue;
        const k = param.name || param.fieldName || param.key;
        if (!k || typeof k !== 'string' || this.isSensitiveFieldName(k)) continue;
        const enumVals =
          resolveParamEnumValues(param) ||
          param.enum ||
          param.enumValues ||
          param.enum_values;
        res[k] = this.encodeSchemaSummaryValue(
          k,
          param.type || param.valueType || 'string',
          enumVals,
          param.default ?? param.defaultValue
        );
      }
    } else {
      for (const [k, v] of Object.entries(props)) {
        if (this.isSensitiveFieldName(k)) {
          continue;
        }
        if (typeof v === 'object' && v !== null) {
          const enumVals =
            resolveParamEnumValues(v as any) ||
            (v as any).enum ||
            (v as any).enumValues ||
            (v as any).enum_values;
          res[k] = this.encodeSchemaSummaryValue(
            k,
            (v as any).type || (v as any).valueType || 'string',
            enumVals,
            (v as any).default ?? (v as any).defaultValue
          );
        } else if (typeof v === 'string') {
          res[k] = this.normalizeOutputValueType(k, v);
        } else {
          res[k] = this.normalizeOutputValueType(k, 'string');
        }
      }
    }
    // Return the parsed result as-is (may be empty).
    // An empty map signals "no declared outputs" to callers; it must NOT be
    // replaced with { data: 'string' } which would create a phantom field.
    return res;
  }

  /**
   * 把 schema 参数的 type/enum/defaultValue 编码成单个 string，供下游
   * (deterministic-plan-generator 后处理) parse 出 enum 做 inputBindings literal 校验。
   *
   * 编码格式: '<type>' 或 '<type>[enum=v1,v2,v3]' 或 '<type>[enum=v1,v2,v3][default=v1]'
   * 没有 enum 的参数仍返纯 type string，保持与旧版 'string' 断言兼容。
   */
  private encodeSchemaSummaryValue(
    fieldName: string,
    declaredType: string,
    enumValues: unknown,
    defaultValue: unknown,
  ): string {
    const type = this.normalizeOutputValueType(fieldName, declaredType);
    const parts: string[] = [type];
    const normalizedEnum = this.normalizeEnumTokens(enumValues);
    if (normalizedEnum.length > 0) {
      parts.push(`[enum=${normalizedEnum.join(',')}]`);
      const normalizedDefault = this.normalizeDefaultToken(defaultValue);
      if (normalizedDefault !== undefined && normalizedEnum.includes(normalizedDefault)) {
        parts.push(`[default=${normalizedDefault}]`);
      }
    }
    return parts.join('');
  }

  private normalizeEnumTokens(enumValues: unknown): Array<string | number> {
    if (!Array.isArray(enumValues) || enumValues.length === 0) {
      return [];
    }
    return enumValues
      .filter(
        (item): item is string | number =>
          (typeof item === 'string' && item.trim().length > 0) ||
          (typeof item === 'number' && Number.isFinite(item))
      )
      .map((item) => (typeof item === 'string' ? item.trim() : item));
  }

  private normalizeDefaultToken(defaultValue: unknown): string | number | undefined {
    if (typeof defaultValue === 'string') {
      const trimmed = defaultValue.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    if (typeof defaultValue === 'number' && Number.isFinite(defaultValue)) {
      return defaultValue;
    }
    return undefined;
  }

  /**
   * Parse the inverse of encodeSchemaSummaryValue. Returns enum/defaultValue if present.
   * Used by deterministic-plan-generator to validate inputBindings literal values.
   */
  static decodeSchemaSummaryEnum(value: string): {
    enumValues?: Array<string | number>;
    defaultValue?: string | number;
  } {
    if (typeof value !== 'string' || value.length === 0) {
      return {};
    }
    const result: { enumValues?: Array<string | number>; defaultValue?: string | number } = {};
    const enumMatch = value.match(/\[enum=([^\]]*)\]/);
    if (enumMatch && enumMatch[1] !== undefined) {
      const tokens = enumMatch[1]
        .split(',')
        .map((token) => token.trim())
        .filter((token) => token.length > 0);
      const parsed: Array<string | number> = [];
      for (const token of tokens) {
        if (/^-?\d+(\.\d+)?$/.test(token)) {
          parsed.push(Number(token));
        } else {
          parsed.push(token);
        }
      }
      if (parsed.length > 0) {
        result.enumValues = parsed;
      }
    }
    const defaultMatch = value.match(/\[default=([^\]]*)\]/);
    if (defaultMatch && defaultMatch[1] !== undefined) {
      const token = defaultMatch[1].trim();
      if (token.length > 0) {
        if (/^-?\d+(\.\d+)?$/.test(token)) {
          result.defaultValue = Number(token);
        } else {
          result.defaultValue = token;
        }
      }
    }
    return result;
  }

  private normalizeOutputValueType(fieldName: string, declaredType: string): string {
    if (['searchResults', 'results', 'news_item_list'].includes(fieldName)) {
      return 'news_item_list';
    }
    return declaredType;
  }

  private isSensitiveFieldName(fieldName: string): boolean {
    return /api[_-]?key|token|secret|password|credential|authorization/i.test(fieldName);
  }

  private truncateCard(card: CompactCapabilityCardV1): CompactCapabilityCardV1 {
    const jsonStr = JSON.stringify(card);
    if (jsonStr.length > 800) {
      return {
        ...card,
        summary: card.summary.substring(0, 100),
      };
    }
    return card;
  }

  private extractParamDefaults(inputSchema: any): Record<string, unknown> {
    const defaults: Record<string, unknown> = {};
    if (!inputSchema || typeof inputSchema !== 'object') return defaults;
    const props = inputSchema.properties || inputSchema;
    if (Array.isArray(props)) {
      for (const param of props) {
        const k = param?.name || param?.fieldName || param?.key;
        if (!k || this.isSensitiveFieldName(k)) continue;
        const defVal = param?.default ?? param?.defaultValue;
        if (defVal !== undefined) defaults[k] = defVal;
      }
    } else if (typeof props === 'object') {
      for (const [k, v] of Object.entries(props)) {
        if (this.isSensitiveFieldName(k)) continue;
        const defVal = (v as any)?.default ?? (v as any)?.defaultValue;
        if (defVal !== undefined) defaults[k] = defVal;
      }
    }
    return defaults;
  }

  private extractRecognizerProperties(inputSchema: any): Record<string, Record<string, unknown>> {
    if (!inputSchema || typeof inputSchema !== 'object') return {};
    const props = inputSchema.properties || inputSchema;
    const result: Record<string, Record<string, unknown>> = {};

    if (Array.isArray(props)) {
      for (const param of props) {
        const key = param?.name || param?.fieldName || param?.key;
        if (!key || this.isSensitiveFieldName(key)) continue;
        result[key] = this.toRecognizerProperty(param);
      }
      return result;
    }

    for (const [key, value] of Object.entries(props)) {
      if (this.isSensitiveFieldName(key)) continue;
      result[key] = this.toRecognizerProperty(value);
    }
    return result;
  }

  private toRecognizerProperty(value: unknown): Record<string, unknown> {
    const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    const enumValues = resolveParamEnumValues(source);
    return {
      type: source.type || source.valueType || (typeof value === 'string' ? value : 'string'),
      ...(typeof source.description === 'string' ? { description: source.description } : {}),
      ...(typeof source.displayName === 'string' ? { displayName: source.displayName } : {}),
      ...(typeof source.extractionPrompt === 'string'
        ? { extractionPrompt: source.extractionPrompt }
        : {}),
      ...(typeof source.semanticRole === 'string' ? { semanticRole: source.semanticRole } : {}),
      ...(Array.isArray(source.extractionHints)
        ? { extractionHints: source.extractionHints }
        : {}),
      ...(enumValues ? { enum: enumValues } : {}),
    };
  }
}
