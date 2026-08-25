import { Injectable, Optional } from '@nestjs/common';
import { resolveDeterministicEnumParams } from '@ops/backend-runtime-capability-contract';
import type { CompactCapabilityCardV1 } from '@ops/backend-deterministic-plan';
import type { RecognizeParamsResponseDTO } from '../../../interfaces';
import type { ParamsSchema } from '../../react-engine/interfaces';
import {
  containsRoutingAlias,
  createBuiltinRoutingPolicySnapshot,
  matchesCapabilityRole,
} from '../routing/routing-policy.matcher';
import { RoutingPolicyService } from '../routing/routing-policy.service';

export interface DeterministicTextResolution {
  params: Record<string, string>;
  notes: string[];
}

@Injectable()
export class DeterministicParamResolverService {
  constructor(@Optional() private readonly routingPolicy?: RoutingPolicyService) {}

  resolve(userInput: string, schema: ParamsSchema): RecognizeParamsResponseDTO {
    const resolved = resolveDeterministicEnumParams(userInput, schema.properties || {});
    const resolvedFields = Object.keys(resolved.params);
    return {
      params: resolved.params,
      confidence: 1,
      field_confidences: resolved.fieldConfidences,
      uncertain_fields: [],
      debug: {
        notes:
          resolvedFields.length > 0
            ? [
                `能力契约别名已确定性解析字段: ${resolvedFields.join(', ')}`,
                `命中别名: ${JSON.stringify(resolved.matchedAliases)}`,
              ]
            : [],
      },
    };
  }

  /**
   * Resolve free-text fields only when both the capability contract and routing
   * policy declare an unambiguous semantic role. This is deliberately narrower
   * than generic regex extraction: unresolved or generic requests remain model/
   * user-input concerns.
   */
  resolveTextParams(
    userInput: string,
    card: CompactCapabilityCardV1,
    properties: Record<string, Record<string, unknown>>,
  ): DeterministicTextResolution {
    const policy = this.routingPolicy?.getSnapshot() || createBuiltinRoutingPolicySnapshot();
    const isSearchCapability = matchesCapabilityRole(
      [card.id, card.displayName, card.summary, card.goals],
      'search',
      policy,
    );
    if (!isSearchCapability) return { params: {}, notes: [] };

    const queryFields = Object.entries(properties)
      .filter(([field, property]) => this.isSearchQueryField(field, property))
      .map(([field]) => field);
    if (queryFields.length !== 1) return { params: {}, notes: [] };

    const query = this.extractSearchSubject(userInput, policy);
    if (!query) return { params: {}, notes: [] };

    return {
      params: { [queryFields[0]!]: query },
      notes: [
        `参数 '${queryFields[0]}' 已依据能力语义角色和路由策略确定性解析，未调用参数识别模型。`,
      ],
    };
  }

  private isSearchQueryField(field: string, property: Record<string, unknown>): boolean {
    if (String(property.type || 'string').toLowerCase() !== 'string') return false;
    const semanticRole = String(
      property.semanticRole || property['x-ops-input-role'] || '',
    ).toLowerCase();
    if (['search_query', 'query', 'keyword', 'question'].includes(semanticRole)) return true;
    return ['query', 'search_query', 'searchquery'].includes(field.toLowerCase());
  }

  private extractSearchSubject(
    input: string,
    policy: ReturnType<typeof createBuiltinRoutingPolicySnapshot>,
  ): string | undefined {
    let subject = String(input || '').normalize('NFKC').trim();
    if (!subject) return undefined;

    const sequentialAliases = [...policy.signals.sequential].sort((a, b) => b.length - a.length);
    const separatorPositions = sequentialAliases
      .map((alias) => ({ alias, index: subject.indexOf(alias) }))
      .filter((item) => item.index > 0)
      .sort((a, b) => a.index - b.index);
    const separator = separatorPositions[0];
    if (separator) subject = subject.slice(0, separator.index);

    subject = subject.replace(/^[\s，,。.!！?？:：;；]+|[\s，,。.!！?？:：;；]+$/gu, '');
    subject = subject.replace(/^(?:请(?:帮我)?|帮我|麻烦(?:帮我)?|给我)\s*/u, '');

    const searchAliases = [...policy.signals.search].sort((a, b) => b.length - a.length);
    const leadingAlias = searchAliases.find((alias) =>
      containsRoutingAlias(subject, alias) &&
      subject.toLocaleLowerCase().startsWith(alias.toLocaleLowerCase()),
    );
    if (leadingAlias) subject = subject.slice(leadingAlias.length).trim();

    // “X 的新闻/资讯” declares a source category, while “AI新闻” remains the query itself.
    subject = subject.replace(/\s*的(?:相关)?(?:新闻|资讯|最新消息)\s*$/u, '').trim();
    subject = subject.replace(/^[\s，,。.!！?？:：;；]+|[\s，,。.!！?？:：;；]+$/gu, '');

    if (
      !subject ||
      policy.signals.search.some((alias) => subject === alias) ||
      policy.intentNormalization.stopWords.some((stopWord) => subject === stopWord)
    ) return undefined;
    return subject;
  }
}
