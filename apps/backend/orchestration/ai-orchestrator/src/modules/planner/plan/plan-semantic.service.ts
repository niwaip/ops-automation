import { Injectable } from '@nestjs/common';
import {
  PlanSemanticDTO,
  RequiredInputDTO,
  SemanticGroupedMissingDTO,
} from '../../../interfaces';
import { SkillMatchResult } from '../../react-engine/interfaces';

const DOCUMENT_SEMANTIC_ENABLED =
  (process.env.DOCUMENT_SEMANTIC_SUBAGENT_ENABLED || 'true').toLowerCase() !== 'false';
const DOCUMENT_COMPLEX_PARAM_THRESHOLD = Number(process.env.DOCUMENT_SEMANTIC_PARAM_THRESHOLD || 8);
const DOCUMENT_COMPLEX_MISSING_THRESHOLD = Number(
  process.env.DOCUMENT_SEMANTIC_MISSING_THRESHOLD || 4
);
const DOCUMENT_COMPLEX_ARRAY_GROUP_THRESHOLD = Number(
  process.env.DOCUMENT_SEMANTIC_ARRAY_GROUP_THRESHOLD || 2
);
const BUSINESS_GROUP_LABELS: Record<string, string> = {
  items: '标的清单',
  deliveryItems: '交付计划',
  paymentSchedule: '付款计划',
};

export interface DocumentSemanticContext {
  requiredInputs: RequiredInputDTO[];
  semantic?: PlanSemanticDTO;
  debug: Record<string, unknown>;
}

@Injectable()
export class PlanSemanticService {
  buildDocumentSemanticContext(input: {
    matchedSkill: SkillMatchResult;
    requiredInputs: RequiredInputDTO[];
  }): DocumentSemanticContext {
    const { matchedSkill, requiredInputs } = input;
    const isDocumentTask = this.isDocumentTask(matchedSkill);
    if (!isDocumentTask) {
      return {
        requiredInputs,
        semantic: undefined,
        debug: {
          enabled: DOCUMENT_SEMANTIC_ENABLED,
          isDocumentTask: false,
        },
      };
    }

    const cleanedRequiredInputs = this.cleanRequiredInputs(requiredInputs);
    const complexity = this.analyzeDocumentComplexity(cleanedRequiredInputs);
    const shouldUseSemanticBypass =
      DOCUMENT_SEMANTIC_ENABLED && complexity.category === 'complex_document';
    const semantic = DOCUMENT_SEMANTIC_ENABLED
      ? this.buildPlanSemantic(cleanedRequiredInputs, complexity, shouldUseSemanticBypass)
      : undefined;

    return {
      requiredInputs: cleanedRequiredInputs,
      semantic,
      debug: {
        enabled: DOCUMENT_SEMANTIC_ENABLED,
        isDocumentTask: true,
        shouldUseSemanticBypass,
        complexity,
        originalFieldCount: requiredInputs.length,
        cleanedFieldCount: cleanedRequiredInputs.length,
      },
    };
  }

  isDocumentTask(matchedSkill: SkillMatchResult): boolean {
    if (matchedSkill.executionType === 'document') {
      return true;
    }

    const schemaProperties = matchedSkill.paramsSchema?.properties || {};
    const hasTemplateLoopMarkers = Object.entries(schemaProperties).some(([name, schema]) => {
      const description =
        schema && typeof schema === 'object'
          ? String((schema as unknown as { description?: unknown }).description || '')
          : '';
      return [name, description].some((value) => /\{#.+\}|\{\/.+\}/.test(value));
    });

    return (
      matchedSkill.apiEndpoints?.runtimeMetadata?.sourceType === 'document' ||
      matchedSkill.executionFlow?.includes('document_render') ||
      Boolean(matchedSkill.carboneTemplateId) ||
      Boolean(matchedSkill.executionFlowTemplateIds?.length) ||
      hasTemplateLoopMarkers
    );
  }

  analyzeDocumentComplexity(requiredInputs: RequiredInputDTO[]): PlanSemanticDTO['complexity'] {
    const requiredFields = requiredInputs.filter((item) => item.required).length;
    const missingFields = requiredInputs.filter((item) => item.required && item.missing).length;
    const arrayGroups = new Set(
      requiredInputs
        .map((item) => this.extractArrayGroupKey(item.name, item.type))
        .filter((item): item is string => Boolean(item))
    ).size;
    const reasonCodes: string[] = [];

    if (requiredInputs.length >= DOCUMENT_COMPLEX_PARAM_THRESHOLD) {
      reasonCodes.push('param_count_threshold');
    }
    if (missingFields >= DOCUMENT_COMPLEX_MISSING_THRESHOLD) {
      reasonCodes.push('missing_input_threshold');
    }
    if (arrayGroups >= DOCUMENT_COMPLEX_ARRAY_GROUP_THRESHOLD) {
      reasonCodes.push('array_group_threshold');
    }

    return {
      category: reasonCodes.length > 0 ? 'complex_document' : 'simple',
      totalFields: requiredInputs.length,
      requiredFields,
      missingFields,
      arrayGroups,
      reasonCodes,
    };
  }

  cleanRequiredInputs(requiredInputs: RequiredInputDTO[]): RequiredInputDTO[] {
    const seen = new Set<string>();

    return requiredInputs.reduce<RequiredInputDTO[]>((acc, item) => {
      if (this.isTemplateLoopMarker(item) || this.isTechnicalNoiseField(item)) {
        return acc;
      }

      if (seen.has(item.name)) {
        return acc;
      }
      seen.add(item.name);

      acc.push({
        ...item,
        type: this.normalizeRequiredInputType(item.name, item.type),
      });
      return acc;
    }, []);
  }

  isTemplateLoopMarker(item: RequiredInputDTO): boolean {
    const values = [item.name, item.description || ''];
    return values.some((value) => /\{#.+\}|\{\/.+\}/.test(value));
  }

  isTechnicalNoiseField(item: RequiredInputDTO): boolean {
    const normalizedName = item.name.toLowerCase();
    if (
      normalizedName.includes('__') ||
      normalizedName.includes('loop') ||
      normalizedName.includes('foreach')
    ) {
      return true;
    }

    return /(^|\.)(index|idx|rowindex|colindex|length)$/.test(normalizedName);
  }

  normalizeRequiredInputType(name: string, rawType: string): RequiredInputDTO['type'] {
    const normalizedType = String(rawType || 'string').toLowerCase();
    if (this.extractArrayGroupKey(name, normalizedType)) {
      return 'array';
    }
    if (normalizedType === 'int' || normalizedType === 'integer' || normalizedType === 'float') {
      return 'number';
    }
    if (normalizedType === 'bool') {
      return 'boolean';
    }
    if (normalizedType === 'json') {
      return 'object';
    }
    if (['string', 'number', 'boolean', 'object', 'array', 'date'].includes(normalizedType)) {
      return normalizedType;
    }
    return 'string';
  }

  buildPlanSemantic(
    requiredInputs: RequiredInputDTO[],
    complexity: PlanSemanticDTO['complexity'],
    shouldUseSemanticBypass: boolean
  ): PlanSemanticDTO {
    const groupedMissing = this.buildGroupedMissing(requiredInputs);
    const blockingGroups = groupedMissing.filter((item) => item.blocking);
    const previewReady = blockingGroups.length === 0;
    const finalReady = groupedMissing.length === 0;
    const mode = shouldUseSemanticBypass ? 'complex_document' : 'field_level';

    return {
      enabled: true,
      mode,
      previewReady,
      finalReady,
      fallbackToFieldLevel: !shouldUseSemanticBypass,
      summary: this.buildSemanticSummary(
        mode,
        finalReady,
        previewReady,
        groupedMissing.length,
        blockingGroups.length
      ),
      groupedMissing,
      complexity,
    };
  }

  buildSemanticSummary(
    mode: 'field_level' | 'complex_document',
    finalReady: boolean,
    previewReady: boolean,
    groupedMissingCount: number,
    blockingGroupCount: number
  ): string {
    if (mode === 'complex_document') {
      return finalReady
        ? '文档参数已满足最终渲染要求。'
        : previewReady
          ? `文档可以先进入预览，但仍缺少 ${groupedMissingCount} 个业务组。`
          : `文档仍缺少 ${blockingGroupCount} 个关键业务组。`;
    }

    return finalReady ? '执行参数已满足要求。' : `仍缺少 ${blockingGroupCount} 个必填参数。`;
  }

  buildGroupedMissing(requiredInputs: RequiredInputDTO[]): SemanticGroupedMissingDTO[] {
    const missingRequiredInputs = requiredInputs.filter((item) => item.required && item.missing);
    const groups = new Map<string, SemanticGroupedMissingDTO>();

    missingRequiredInputs.forEach((item) => {
      const arrayGroupKey = this.extractArrayGroupKey(item.name, item.type);
      const key = arrayGroupKey || this.normalizeSemanticMissingKey(item.name);
      const existing = groups.get(key);
      const kind = arrayGroupKey ? ('array_group' as const) : ('field' as const);
      const label = arrayGroupKey
        ? this.normalizeSemanticMissingLabel(this.resolveBusinessGroupLabel(arrayGroupKey, item))
        : this.normalizeSemanticMissingLabel(item.display_name || item.description || item.name);
      const blocking = this.resolvePreviewBlocking(key, item);

      if (existing) {
        existing.fieldNames.push(item.name);
        existing.missingFieldNames.push(item.name);
        if (item.preview_blocking === true) {
          existing.blocking = true;
        }
        return;
      }

      groups.set(key, {
        key,
        label,
        kind,
        blocking,
        required: true,
        fieldNames: [item.name],
        missingFieldNames: [item.name],
        description:
          kind === 'array_group' ? `请按业务组补充 ${label}` : item.description || `请补充 ${label}`,
      });
    });

    return Array.from(groups.values());
  }

  normalizeSemanticMissingKey(value: string): string {
    const normalized = String(value || '').trim();
    if (!normalized) {
      return '';
    }

    return normalized.replace(/[._-](?:zh|ja|cn|jp)$/iu, '').trim();
  }

  normalizeSemanticMissingLabel(value: string): string {
    const normalized = String(value || '').trim();
    if (!normalized) {
      return '';
    }

    return normalized
      .replace(/\s*[（(](?:中文|日文|日语|中文格式|日文格式|日语格式|zh|ja|cn|jp)[）)]\s*$/iu, '')
      .replace(
        /(.*?)(?:中文|日文|日语)(名称|姓名|地址|电话|联系电话|传真号码|邮政编码|签字人|项目名称|服务名称|日期|期限|地点|金额|费率|费用|编号|信息|场所|份数)$/u,
        '$1$2'
      )
      .replace(/[._-](?:zh|ja|cn|jp)$/iu, '')
      .trim();
  }

  extractArrayGroupKey(name: string, type?: string): string | undefined {
    const arrayPathMatch = name.match(/^([a-zA-Z0-9_]+)\[\]/);
    if (arrayPathMatch?.[1]) {
      return arrayPathMatch[1];
    }

    if (String(type || '').toLowerCase() === 'array') {
      return name;
    }

    return undefined;
  }

  resolveBusinessGroupLabel(groupKey: string, item?: RequiredInputDTO): string {
    return item?.group_label || BUSINESS_GROUP_LABELS[groupKey] || groupKey;
  }

  resolvePreviewBlocking(groupKey: string, item?: RequiredInputDTO): boolean {
    if (typeof item?.preview_blocking === 'boolean') {
      return item.preview_blocking;
    }
    return this.isPreviewBlockingGroup(groupKey);
  }

  isPreviewBlockingGroup(groupKey: string): boolean {
    return !['paymentSchedule', 'supplementaryTerms', 'notes', 'remarks'].includes(groupKey);
  }
}
