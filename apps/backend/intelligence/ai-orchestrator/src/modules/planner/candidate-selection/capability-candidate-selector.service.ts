import { Injectable, Logger } from '@nestjs/common';
import type { CompactCapabilityCardV1, SkillPlanNodeV1 } from '@ops/backend-deterministic-plan';
import { resolveParamEnumValues } from '../params/param-enum-constraint';

const LLM_OPERATION_CARDS: CompactCapabilityCardV1[] = [
  {
    id: 'summarize_list',
    kind: 'llm_operation',
    displayName: '列表摘要',
    summary: '对列表文本、搜索结果或文章项集合做精炼要点总结',
    goals: ['summarize', 'news_summary', 'list_summary'],
    inputs: { items: 'text_list|news_item_list' },
    outputs: { markdown_content: 'markdown_content' },
  },
  {
    id: 'rewrite_to_markdown',
    kind: 'llm_operation',
    displayName: 'Markdown 格式化',
    summary: '将结构化或非结构化内容重写格式化为干净规范的 Markdown 文本',
    goals: ['format_markdown', 'rewrite'],
    inputs: { content: 'string|json' },
    outputs: { markdown_content: 'markdown_content' },
  },
  {
    id: 'summarize_text',
    kind: 'llm_operation',
    displayName: '文本摘要',
    summary: '对长文本段落做关键摘要提取',
    goals: ['summarize_text'],
    inputs: { text: 'string' },
    outputs: { summary: 'string' },
  },
  {
    id: 'extract_structured_fields',
    kind: 'llm_operation',
    displayName: '结构化字段提取',
    summary: '从非结构化文本中提取结构化 JSON 字段',
    goals: ['extract_fields'],
    inputs: { text: 'string' },
    outputs: { fields: 'json' },
  },
];

@Injectable()
export class CapabilityCandidateSelectorService {
  private readonly logger = new Logger(CapabilityCandidateSelectorService.name);

  public selectCandidates(
    userRequest: string,
    availableSkills: Array<{
      id: string;
      name: string;
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
  ): {
    skillCards: CompactCapabilityCardV1[];
    llmOperationCards: CompactCapabilityCardV1[];
  } {
    const skillCards: CompactCapabilityCardV1[] = [];

    for (const skill of availableSkills.slice(0, 12) as any[]) {
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

      const summary = (skill.description || skill.skillName || skill.name || '').substring(0, 200);
      const inputSchema = skill.paramsSchema || skill.inputSchema || skill.params;
      const outputSchema =
        skill.outputParams ||
        skill.runtimeHints?.outputParams ||
        skill.apiEndpoints?.runtimeMetadata?.outputParams ||
        skill.outputSchema;
      const runtimeMetadata = skill.apiEndpoints?.runtimeMetadata;

      const runtimeType = this.mapExecutionTypeToRuntimeType(
        skill.executionType || skill.category,
        runtimeMetadata,
      );
      const executionRuntimeType = runtimeMetadata?.runtimeType || undefined;
      const supportsArtifactOutput = this.detectArtifactSupport(
        outputSchema,
        runtimeMetadata,
        skill.skillName || skill.name,
        skill.supportsArtifact,
      );

      const card: CompactCapabilityCardV1 = {
        id: skillId,
        kind: 'skill',
        displayName: skill.skillName || skill.name || skillId,
        summary,
        goals: [runtimeType, skill.skillName || skill.name || skillId],
        inputs: this.extractSchemaSummary(inputSchema),
        outputs: this.extractSchemaSummary(outputSchema),
        category: runtimeType,
        executionRuntimeType,
        supportsArtifactOutput,
        publishedSkillId,
        executableVersion,
      };
      skillCards.push(this.truncateCard(card));
    }

    return {
      skillCards,
      llmOperationCards: LLM_OPERATION_CARDS.slice(0, 8),
    };
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
    outputSchema: any,
    runtimeMetadata?: any,
    skillName?: string,
    supportsArtifactFlag?: boolean,
  ): boolean {
    if (supportsArtifactFlag === true) return true;
    if (skillName === 'markdown_artifact_writer' || skillName === 'platform.document.markdown-artifact-writer') return true;
    if (runtimeMetadata?.supportsArtifact || runtimeMetadata?.producesArtifact) return true;
    if (!outputSchema || typeof outputSchema !== 'object') return false;
    const props = outputSchema.properties || outputSchema;
    if (typeof props !== 'object') return false;
    return Object.keys(props).some(
      (k) =>
        k === 'artifact' ||
        k === 'artifacts' ||
        k === 'artifact_ref' ||
        (typeof props[k] === 'object' && props[k]?.valueType === 'artifact_ref'),
    );
  }

  private extractSchemaSummary(schema: any): Record<string, string> {
    if (!schema || typeof schema !== 'object') return { data: 'string' };
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
    return Object.keys(res).length > 0 ? res : { data: 'string' };
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
}
