import { Injectable, Optional } from '@nestjs/common';
import { resolveDeterministicEnumParams } from '@ops/backend-runtime-capability-contract';
import type { CompactCapabilityCardV1 } from '@ops/backend-deterministic-plan';
import type { RecognizeParamsResponseDTO } from '../../../interfaces';
import type { ParamsSchema } from '../../react-engine/interfaces';
import {
  createBuiltinRoutingPolicySnapshot,
  matchesCapabilityRole,
} from '../routing/routing-policy.matcher';
import { RoutingPolicyService } from '../routing/routing-policy.service';
import { extractUrlFromInput } from '../../recognizer/recognizer-url-extractor';

export interface DeterministicTextResolution {
  params: Record<string, string>;
  notes: string[];
}

@Injectable()
export class DeterministicParamResolverService {
  constructor(@Optional() private readonly routingPolicy?: RoutingPolicyService) {}

  resolve(
    userInput: string,
    schema: ParamsSchema,
    cardOrSkill?: any
  ): RecognizeParamsResponseDTO {
    const resolved = resolveDeterministicEnumParams(userInput, schema.properties || {});
    const resolvedFields = Object.keys(resolved.params);

    const textResolution = cardOrSkill
      ? this.resolveTextParams(
          userInput,
          {
            id: cardOrSkill.skillId || cardOrSkill.id || '',
            displayName: cardOrSkill.skillName || cardOrSkill.displayName || '',
            summary: cardOrSkill.description || cardOrSkill.summary || '',
            goals: cardOrSkill.triggerKeywords || cardOrSkill.goals || [],
            kind: 'skill',
            inputs: cardOrSkill.inputs || [],
            outputs: cardOrSkill.outputs || [],
          },
          (schema.properties as any) || {}
        )
      : { params: {}, notes: [] };

    const urlResolution = this.resolveUrlParams(
      userInput,
      (schema.properties as any) || {}
    );

    const mergedParams = {
      ...resolved.params,
      ...textResolution.params,
      ...urlResolution.params,
    };
    const fieldConfidences = {
      ...resolved.fieldConfidences,
      ...Object.fromEntries(Object.keys(textResolution.params).map((k) => [k, 1])),
      ...Object.fromEntries(Object.keys(urlResolution.params).map((k) => [k, 1])),
    };

    return {
      params: mergedParams,
      confidence: 1,
      field_confidences: fieldConfidences,
      uncertain_fields: [],
      debug: {
        notes: [
          ...(resolvedFields.length > 0
            ? [
                `能力契约别名已确定性解析字段: ${resolvedFields.join(', ')}`,
                `命中别名: ${JSON.stringify(resolved.matchedAliases)}`,
              ]
            : []),
          ...(textResolution.notes || []),
          ...(urlResolution.notes || []),
        ],
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
    const isSearchCapability =
      !card.id.includes('email') &&
      (card.category as any) !== 'communication' &&
      matchesCapabilityRole(
        [card.id, card.displayName, card.summary, card.goals, card.category],
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

    // 1. Strip leading slash commands like /doc, /workspace, /rag, /search, /web
    subject = subject.replace(/^\s*[/、][a-zA-Z0-9_-]+\s*/u, '');

    // 2. Local/attached document inspect intent disambiguation:
    // If the request is an inspection of a local attachment, document, or file (e.g. 查看附件内容, 查看文档),
    // it must not be treated as a web or knowledge search query.
    if (
      /^(?:查看|查阅|阅读|读取|浏览|看下|看一下|看看|检查|打开)\s*(?:附件|文档|文件|合同|协议|正文|内容)?$/iu.test(subject) ||
      /(?:附件|本地|已上传|刚刚|历史文件)/i.test(subject) && /^(?:查看|查阅|阅读|读取|浏览|看下|看一下|看看)/i.test(subject)
    ) {
      return undefined;
    }

    const sequentialAliases = [...policy.signals.sequential].sort((a, b) => b.length - a.length);
    const separatorPositions = sequentialAliases
      .map((alias) => ({ alias, index: subject.indexOf(alias) }))
      .filter((item) => item.index > 0)
      .sort((a, b) => a.index - b.index);
    const separator = separatorPositions[0];
    if (separator) subject = subject.slice(0, separator.index);

    subject = subject.replace(/^[\s，,。.!！?？:：;；]+|[\s，,。.!！?？:：;；]+$/gu, '');

    // Strip polite prefixes and search action verbs (aligned with personal-sandbox-runner normalize_search_query)
    subject = subject.replace(
      /^(?:帮我|请|给我|带我|麻烦|协助)?\s*(?:查一下|查下|查询|搜索|查找|看下|看一下|看看|检索|了解一下|获取|调研|调查|分析一下|分析|评测一下|评测|研究一下|调用|查看|search|find|lookup|research|investigate)\s*/iu,
      ''
    );
    subject = subject.replace(
      /^(?:关于他|关于她|关于它|关于其|关于这个|关于该|关于|有关|针对其|针对这个|针对|对于|对于这个)[的]?\s*/iu,
      ''
    );

    // Strip trailing processing verbs (e.g. 进行总结, 来总结, 给出总结, 并分析)
    subject = subject.replace(/\s*(?:来?进行|并|然后|接着|帮我|给出)?\s*(?:总结|分析|概括|归纳|汇总|整理|提炼|呈现).*$/u, '').trim();
    // Strip trailing question phrases like 是什么, 是啥, 有哪些, 怎么用
    subject = subject.replace(/\s*(?:是(?:什么|啥)|有哪些|有啥|怎么用|如何使用|具体内容)\s*[?？]*$/u, '').trim();
    // “X 的新闻/资讯” declares a source category, while “AI新闻” remains the query itself.
    subject = subject.replace(/\s*的(?:相关)?(?:新闻|资讯|最新消息)\s*$/u, '').trim();
    subject = subject.replace(/^[\s，,。.!！?？:：;；]+|[\s，,。.!！?？:：;；]+$/gu, '');

    // Discard bare generic document nouns that lack a concrete query topic
    if (
      /^(?:附件|附件内容|文档|文档内容|文件|文件内容|合同|合同内容|内容|正文)$/i.test(subject)
    ) {
      return undefined;
    }

    if (
      !subject ||
      policy.signals.search.some((alias) => subject === alias) ||
      policy.intentNormalization.stopWords.some((stopWord) => subject === stopWord)
    ) return undefined;
    return subject;
  }

  private resolveUrlParams(
    userInput: string,
    properties: Record<string, Record<string, unknown>>
  ): DeterministicTextResolution {
    const extractedUrl = extractUrlFromInput(userInput);
    if (!extractedUrl) return { params: {}, notes: [] };

    const urlFields = Object.entries(properties)
      .filter(([field, property]) => this.isUrlField(field, property))
      .map(([field]) => field);

    if (urlFields.length === 0) return { params: {}, notes: [] };

    // Prefer specific known URL field names like startUrl, url, targetUrl, pageUrl
    const targetField =
      urlFields.find((f) => /^(starturl|url|targeturl|pageurl|linkurl)$/i.test(f)) ||
      urlFields[0]!;

    return {
      params: { [targetField]: extractedUrl },
      notes: [
        `参数 '${targetField}' 已依据用户输入中检测到的显式有效 URL ('${extractedUrl}') 确定性解析，未调用参数识别模型。`,
      ],
    };
  }

  private isUrlField(field: string, property: Record<string, unknown>): boolean {
    const fieldLower = field.toLowerCase();
    if (
      fieldLower.includes('url') ||
      fieldLower.includes('link') ||
      fieldLower.includes('href') ||
      fieldLower.includes('website')
    ) {
      return true;
    }
    const type = String(property.type || 'string').toLowerCase();
    if (type !== 'string') return false;
    const format = String(property.format || '').toLowerCase();
    if (format === 'uri' || format === 'url') return true;
    const semanticRole = String(
      property.semanticRole || property['x-ops-input-role'] || ''
    ).toLowerCase();
    if (['url', 'target_url', 'start_url', 'web_url', 'link'].includes(semanticRole)) {
      return true;
    }
    const desc = String(property.description || '').toLowerCase();
    if (
      desc.includes('url') ||
      desc.includes('网址') ||
      desc.includes('页面地址') ||
      desc.includes('网页地址') ||
      desc.includes('链接')
    ) {
      return true;
    }
    return false;
  }
}
