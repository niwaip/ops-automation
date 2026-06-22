import { BadRequestException, Injectable } from '@nestjs/common';
import type { SemanticRuleCategory, SemanticRuleType } from '../../types/semantic-rule.types';
import { PrismaService } from '../../prisma/prisma.service';
import { SemanticRuleSetService } from '../rule-set/semantic-rule-set.service';
import type {
  CommitSemanticRuleSetDraftDto,
  GenerateSemanticRuleSetDraftResponse,
  GenerateSemanticRuleSetDraftDto,
  SemanticRuleGenerationDraftRuleSet,
} from './semantic-rule-generation.dto';
import { buildLoginProfileDraftOutputs } from './semantic-rule-generation.login-profile';
import { buildNavigationProfileDraftOutputs } from './semantic-rule-generation.navigation-profile';
import { buildReadProfileDraftOutputs } from './semantic-rule-generation.read-profile';
import { buildActionProfileDraftOutputs } from './semantic-rule-generation.action-profile';
import { buildSearchProfileDraftOutputs } from './semantic-rule-generation.search-profile';
import { buildFieldFillProfileDraftOutputs } from './semantic-rule-generation.field-fill-profile';

type ErrorLogRecord = Awaited<
  ReturnType<PrismaService['semanticRuleErrorLog']['findMany']>
>[number];

type DraftRuleGroup = {
  groupKey: string;
  semanticKey: string;
  ruleType: SemanticRuleType;
  category: SemanticRuleCategory;
  name: string;
  sampleInputs: Set<string>;
  samplePatterns: Set<string>;
  errorTypes: Set<string>;
  sources: Set<string>;
  hosts: Set<string>;
  pageTypes: Set<string>;
  sourceErrorLogIds: string[];
  fallbackOnly: boolean;
};

@Injectable()
export class SemanticRuleGenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly semanticRuleSetService: SemanticRuleSetService
  ) {}

  async generateDraft(
    dto: GenerateSemanticRuleSetDraftDto
  ): Promise<GenerateSemanticRuleSetDraftResponse> {
    const generationTraceId = `draft-${Date.now()}`;
    const domain = await this.prisma.semanticRuleDomain.findUnique({
      where: { code: dto.domain_code },
    });

    if (!domain) {
      return this.buildEmptyResponse({
        dto,
        generationTraceId,
        reason: `Unknown domain: ${dto.domain_code}`,
      });
    }

    const selectedLogs = await this.loadErrorLogs(domain.id, dto);

    if (!selectedLogs.length) {
      return this.buildEmptyResponse({
        dto,
        generationTraceId,
        reason: 'No matching error logs found for draft generation',
      });
    }

    const filteredLogs = dto.category
      ? selectedLogs.filter((log) => this.classifySample(log).category === dto.category)
      : selectedLogs;

    if (!filteredLogs.length) {
      return this.buildEmptyResponse({
        dto,
        generationTraceId,
        reason: `No matching error logs found for category ${dto.category}`,
      });
    }

    const groupedRules = this.buildDraftRuleGroups(filteredLogs, dto.category);
    const draftRuleSet = this.buildDraftRuleSet(dto, groupedRules, filteredLogs, generationTraceId);
    const summary = this.buildSummary(dto.domain_code, filteredLogs, draftRuleSet.rules.length);

    return {
      generated: true,
      generation_trace_id: generationTraceId,
      summary,
      draft_rule_set: draftRuleSet,
      explanations: this.buildExplanations(filteredLogs, groupedRules, dto),
      risks: this.buildRisks(filteredLogs, groupedRules),
      source_error_logs: filteredLogs.map((log) => ({
        id: log.id,
        created_at: log.createdAt.toISOString(),
        source: log.source,
        error_type: log.errorType,
        error_message: log.errorMessage,
        input_text: log.inputText,
        normalized_input: log.normalizedInput,
        trace_id: log.traceId,
        host: log.host,
        page_type: log.pageType,
      })),
      generation_metadata: {
        mode: 'heuristic_preview',
        source_filter: {
          error_log_ids: dto.error_log_ids,
          rule_set_id: dto.rule_set_id,
          trace_id: dto.trace_id,
          source: dto.source,
          error_type: dto.error_type,
          host: dto.host,
          page_type: dto.page_type,
          category: dto.category,
          max_logs: dto.max_logs ?? 20,
        },
      },
    };
  }

  async commitDraft(dto: CommitSemanticRuleSetDraftDto) {
    if (!dto.draft_rule_set.rules.length) {
      throw new BadRequestException('Draft rule set must contain at least one rule');
    }

    const mergedReviewNotes = dto.review_notes?.filter((note) => note.trim().length) || [];
    const sourceErrorLogIds = dto.source_error_log_ids?.length ? dto.source_error_log_ids : [];
    const reviewSummaryParts = [
      `generation_trace_id=${dto.generation_trace_id}`,
      sourceErrorLogIds.length
        ? `source_error_log_ids=${sourceErrorLogIds.join(',')}`
        : undefined,
      mergedReviewNotes.length ? `review_notes=${mergedReviewNotes.join(' | ')}` : undefined,
    ].filter((part): part is string => Boolean(part));

    const created = await this.semanticRuleSetService.create({
      ...dto.draft_rule_set,
      based_on_rule_set_id: dto.based_on_rule_set_id,
      change_summary: reviewSummaryParts.join('; '),
      description: this.mergeDescriptions(
        dto.draft_rule_set.description,
        `AI reviewed draft committed from ${dto.generation_trace_id}.`
      ),
      rules: dto.draft_rule_set.rules.map((rule) => ({
        ...rule,
        outputs: {
          ...rule.outputs,
          generation_trace_id: dto.generation_trace_id,
          source_error_log_ids: sourceErrorLogIds.length
            ? sourceErrorLogIds
            : this.pickRuleSourceErrorLogIds(rule.outputs),
        },
      })),
    });

    return {
      committed: true,
      generation_trace_id: dto.generation_trace_id,
      rule_set: created,
    };
  }

  private async loadErrorLogs(domainId: string, dto: GenerateSemanticRuleSetDraftDto) {
    const maxLogs = this.clamp(dto.max_logs ?? 20, 1, 50);

    return this.prisma.semanticRuleErrorLog.findMany({
      where: {
        domainId,
        id: dto.error_log_ids?.length ? { in: dto.error_log_ids } : undefined,
        ruleSetId: dto.rule_set_id,
        traceId: dto.trace_id,
        source: dto.source,
        errorType: dto.error_type,
        host: dto.host,
        pageType: dto.page_type,
      },
      orderBy: [{ createdAt: 'desc' }],
      take: maxLogs,
    });
  }

  private buildDraftRuleGroups(logs: ErrorLogRecord[], category?: SemanticRuleCategory) {
    const groups = new Map<string, DraftRuleGroup>();

    for (const log of logs) {
      const sampleText = this.pickSampleText(log);
      const classification = this.classifySample(log);

      if (category && classification.category !== category) {
        continue;
      }

      const existing = groups.get(classification.groupKey);

      if (existing) {
        this.appendToGroup(existing, log, sampleText);
        continue;
      }

      const nextGroup: DraftRuleGroup = {
        groupKey: classification.groupKey,
        semanticKey: classification.semanticKey,
        ruleType: classification.ruleType,
        category: classification.category,
        name: classification.name,
        sampleInputs: new Set<string>(),
        samplePatterns: new Set<string>(),
        errorTypes: new Set<string>(),
        sources: new Set<string>(),
        hosts: new Set<string>(),
        pageTypes: new Set<string>(),
        sourceErrorLogIds: [],
        fallbackOnly: classification.fallbackOnly,
      };

      this.appendToGroup(nextGroup, log, sampleText);
      groups.set(classification.groupKey, nextGroup);
    }

    return Array.from(groups.values()).sort(
      (left, right) => right.sourceErrorLogIds.length - left.sourceErrorLogIds.length
    );
  }

  private appendToGroup(group: DraftRuleGroup, log: ErrorLogRecord, sampleText: string) {
    if (sampleText.trim()) {
      group.sampleInputs.add(sampleText);
      group.samplePatterns.add(this.buildExactPattern(sampleText));
    }

    group.errorTypes.add(log.errorType);
    group.sources.add(log.source);
    group.sourceErrorLogIds.push(log.id);

    if (log.host) {
      group.hosts.add(log.host);
    }

    if (log.pageType) {
      group.pageTypes.add(log.pageType);
    }
  }

  private buildDraftRuleSet(
    dto: GenerateSemanticRuleSetDraftDto,
    groups: DraftRuleGroup[],
    logs: ErrorLogRecord[],
    generationTraceId: string
  ): SemanticRuleGenerationDraftRuleSet {
    const dateCode = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 17);
    const rules = groups.slice(0, 8).map((group, index) => ({
      type: group.ruleType,
      category: group.category,
      name: group.name,
      enabled: true,
      priority: 1000 - index * 10,
      stop_on_match: group.ruleType === 'LOGIN_PHRASE',
      flags: 'AI_GENERATED_DRAFT',
      patterns: this.buildRulePatterns(group),
      outputs: {
        ...(group.category === 'LOGIN'
          ? buildLoginProfileDraftOutputs({
              sources: logs
                .filter((log) => this.classifySample(log).groupKey === group.groupKey)
                .map((log) => ({
                  sampleText: this.pickSampleText(log),
                  errorMessage: log.errorMessage,
                  observationSummary: log.observationSummary,
                })),
            })
          : group.category === 'NAVIGATION' && group.semanticKey === 'navigation_profile'
            ? (buildNavigationProfileDraftOutputs({
                sources: logs
                  .filter((log) => this.classifySample(log).groupKey === group.groupKey)
                  .map((log) => ({
                    sampleText: this.pickSampleText(log),
                    errorMessage: log.errorMessage,
                    observationSummary: log.observationSummary,
                    pageUrl: log.pageUrl,
                    normalizedSemantic: log.normalizedSemantic,
                    parserOutput: log.parserOutput,
                  })),
              }) || {})
          : group.category === 'READ_VALUE' && group.semanticKey === 'read_profile'
            ? (buildReadProfileDraftOutputs({
                sources: logs
                  .filter((log) => this.classifySample(log).groupKey === group.groupKey)
                  .map((log) => ({
                    sampleText: this.pickSampleText(log),
                    errorMessage: log.errorMessage,
                    observationSummary: log.observationSummary,
                    normalizedSemantic: log.normalizedSemantic,
                    parserOutput: log.parserOutput,
                  })),
              }) || {})
          : (group.category === 'DETAIL_OPEN' ||
                group.category === 'ROW_ACTION' ||
                group.category === 'MENU_SELECTION') &&
              group.semanticKey === 'action_profile'
            ? (buildActionProfileDraftOutputs({
                sources: logs
                  .filter((log) => this.classifySample(log).groupKey === group.groupKey)
                  .map((log) => ({
                    sampleText: this.pickSampleText(log),
                    errorMessage: log.errorMessage,
                    observationSummary: log.observationSummary,
                    normalizedSemantic: log.normalizedSemantic,
                    parserOutput: log.parserOutput,
                  })),
              }) || {})
          : group.category === 'SEARCH' && group.semanticKey === 'search_profile'
            ? (buildSearchProfileDraftOutputs({
                sources: logs
                  .filter((log) => this.classifySample(log).groupKey === group.groupKey)
                  .map((log) => ({
                    sampleText: this.pickSampleText(log),
                    normalizedSemantic: log.normalizedSemantic,
                    parserOutput: log.parserOutput,
                  })),
              }) || {})
          : group.category === 'FIELD_FILL' && group.semanticKey === 'field_fill_profile'
            ? (buildFieldFillProfileDraftOutputs({
                sources: logs
                  .filter((log) => this.classifySample(log).groupKey === group.groupKey)
                  .map((log) => ({
                    sampleText: this.pickSampleText(log),
                    normalizedSemantic: log.normalizedSemantic,
                    parserOutput: log.parserOutput,
                  })),
              }) || {})
          : {}),
        semantic_key: group.semanticKey,
        source_error_log_ids: group.sourceErrorLogIds.slice(0, 20),
        source_error_types: Array.from(group.errorTypes),
        source_sources: Array.from(group.sources),
        sample_inputs: Array.from(group.sampleInputs).slice(0, 5),
        suggested_hosts: Array.from(group.hosts),
        suggested_page_types: Array.from(group.pageTypes),
        generation_trace_id: generationTraceId,
      },
    }));

    const hosts = this.collectDistinctValues(logs, (log) => log.host);
    const pageTypes = this.collectDistinctValues(logs, (log) => log.pageType);

    return {
      domain_code: dto.domain_code,
      key: `ai-draft-${dto.domain_code}-${dateCode}`,
      name: `AI Draft ${dto.domain_code} ${dateCode}`,
      version: `draft-${dateCode}`,
      description: `Generated from ${logs.length} semantic rule error logs for review before publish.`,
      created_by: dto.created_by || 'ai-generation-preview',
      rules,
      targetings: [
        {
          enabled: true,
          hosts: hosts.length ? hosts : undefined,
          page_types: pageTypes.length ? pageTypes : undefined,
        },
      ],
    };
  }

  private buildSummary(domainCode: string, logs: ErrorLogRecord[], ruleCount: number) {
    return {
      domain_code: domainCode,
      sample_count: logs.length,
      rule_count: ruleCount,
      source_count: this.collectDistinctValues(logs, (log) => log.source).length,
      error_type_count: this.collectDistinctValues(logs, (log) => log.errorType).length,
      host_count: this.collectDistinctValues(logs, (log) => log.host).length,
      page_type_count: this.collectDistinctValues(logs, (log) => log.pageType).length,
      source_error_log_ids: logs.map((log) => log.id),
    };
  }

  private buildExplanations(
    logs: ErrorLogRecord[],
    groups: DraftRuleGroup[],
    dto: GenerateSemanticRuleSetDraftDto
  ) {
    const explanations = [
      `Selected ${logs.length} error logs from domain ${dto.domain_code}.`,
      `Collapsed the samples into ${groups.length} candidate rule groups for review.`,
      'Derived targeting hints from hosts and page types observed in the selected logs.',
    ];

    if (dto.error_log_ids?.length) {
      explanations.push('Generation was limited to the explicit error_log_ids passed from the review flow.');
    }

    if (dto.category) {
      explanations.push(`Generation was narrowed to category ${dto.category}.`);
    }

    if (groups.some((group) => group.category === 'LOGIN')) {
      explanations.push(
        'Detected login-related samples and proposed a dedicated LOGIN profile rule with login_terms outputs.'
      );
    }

    if (groups.some((group) => group.semanticKey === 'navigation_profile')) {
      explanations.push(
        'Detected navigation samples with resolvable targets and proposed a dedicated NAVIGATION profile rule with navigation_target outputs.'
      );
    }

    if (groups.some((group) => group.semanticKey === 'read_profile')) {
      explanations.push(
        'Detected read samples with resolvable targets and proposed a dedicated READ profile rule with read_target outputs.'
      );
    } else if (groups.some((group) => group.ruleType === 'READ_INTENT')) {
      explanations.push(
        'Detected read-style intents and proposed READ_INTENT patterns instead of generic aliases.'
      );
    }

    if (groups.some((group) => group.semanticKey === 'action_profile')) {
      explanations.push(
        'Detected action samples with resolvable targets and proposed dedicated action profile rules with action_target outputs.'
      );
    }

    if (groups.some((group) => group.semanticKey === 'search_profile')) {
      explanations.push(
        'Detected search samples with resolvable search intents and proposed dedicated SEARCH profile rules with search_intent outputs.'
      );
    }

    if (groups.some((group) => group.semanticKey === 'field_fill_profile')) {
      explanations.push(
        'Detected field fill samples with resolvable field targets and proposed dedicated FIELD_FILL profile rules with field_fill_terms outputs.'
      );
    }

    return explanations;
  }

  private buildRisks(logs: ErrorLogRecord[], groups: DraftRuleGroup[]) {
    const risks: string[] = [];

    if (groups.some((group) => group.sourceErrorLogIds.length === 1)) {
      risks.push('Some candidate rules are supported by only one error sample and may be overfitted.');
    }

    if (this.collectDistinctValues(logs, (log) => log.host).length > 1) {
      risks.push('Samples span multiple hosts; review targeting carefully before promoting beyond DRAFT.');
    }

    if (this.collectDistinctValues(logs, (log) => log.pageType).length > 2) {
      risks.push('Samples span several page types; a single rule set may need narrower targetings.');
    }

    if (logs.some((log) => !this.pickSampleText(log).trim())) {
      risks.push('Some source logs do not include meaningful input text, so part of the draft relies on fallback heuristics.');
    }

    if (groups.some((group) => group.fallbackOnly)) {
      risks.push('At least one rule uses fallback exact-match patterns because no common semantic intent was inferred.');
    }

    return risks;
  }

  private buildRulePatterns(group: DraftRuleGroup) {
    const patterns = new Set<string>(this.getHeuristicPatterns(group.semanticKey));

    for (const pattern of group.samplePatterns) {
      patterns.add(pattern);
      if (patterns.size >= 8) {
        break;
      }
    }

    return Array.from(patterns);
  }

  private classifySample(log: ErrorLogRecord) {
    const sampleText = this.pickSampleText(log);
    const normalized = sampleText.toLowerCase();
    const loginMetadata = this.extractLoginMetadata(log);
    const navigationMetadata = this.extractNavigationMetadata(log);
    const readMetadata = this.extractReadMetadata(log);
    const actionMetadata = this.extractActionMetadata(log);
    const searchMetadata = this.extractSearchMetadata(log);
    const fieldFillMetadata = this.extractFieldFillMetadata(log);

    if (loginMetadata || /(登录|log\s*in|signin|sign\s*in)/i.test(normalized)) {
      return {
        groupKey: 'login',
        semanticKey: 'login_profile',
        ruleType: 'LOGIN_PHRASE' as SemanticRuleType,
        category: 'LOGIN' as SemanticRuleCategory,
        name: 'ai_login_profile',
        fallbackOnly: false,
      };
    }

    if (
      actionMetadata &&
      Boolean(actionMetadata.resolvedTarget) &&
      (Boolean(actionMetadata.semanticHint) || Boolean(actionMetadata.resolvedActionTerm))
    ) {
      const category =
        actionMetadata.categoryHint === 'DETAIL_OPEN' ||
        actionMetadata.categoryHint === 'ROW_ACTION' ||
        actionMetadata.categoryHint === 'MENU_SELECTION'
          ? (actionMetadata.categoryHint as SemanticRuleCategory)
          : 'ROW_ACTION';
      return {
        groupKey: `action_profile_${category.toLowerCase()}`,
        semanticKey: 'action_profile',
        ruleType: 'INTENT_ALIAS' as SemanticRuleType,
        category,
        name:
          category === 'DETAIL_OPEN'
            ? 'ai_detail_action_profile'
            : category === 'MENU_SELECTION'
              ? 'ai_menu_action_profile'
              : 'ai_row_action_profile',
        fallbackOnly: false,
      };
    }

    if (
      readMetadata &&
      Boolean(readMetadata.resolvedTarget) &&
      (Boolean(readMetadata.resolvedField) || Boolean(readMetadata.resolvedRegion))
    ) {
      return {
        groupKey: 'read_profile',
        semanticKey: 'read_profile',
        ruleType: 'READ_INTENT' as SemanticRuleType,
        category: 'READ_VALUE' as SemanticRuleCategory,
        name: 'ai_read_profile',
        fallbackOnly: false,
      };
    }

    if (searchMetadata && typeof searchMetadata.intentType === 'string') {
      return {
        groupKey: 'search_profile',
        semanticKey: 'search_profile',
        ruleType: 'INTENT_ALIAS' as SemanticRuleType,
        category: 'SEARCH' as SemanticRuleCategory,
        name: 'ai_search_profile',
        fallbackOnly: false,
      };
    }

    if (fieldFillMetadata && Boolean(fieldFillMetadata.resolvedField || fieldFillMetadata.resolvedCanonicalField)) {
      return {
        groupKey: 'field_fill_profile',
        semanticKey: 'field_fill_profile',
        ruleType: 'FIELD_ALIAS' as SemanticRuleType,
        category: 'FIELD_FILL' as SemanticRuleCategory,
        name: 'ai_field_fill_profile',
        fallbackOnly: false,
      };
    }

    if (/(读取|查看|获取|提取|read|extract|get value)/i.test(normalized)) {
      return {
        groupKey: 'read',
        semanticKey: 'read',
        ruleType: 'READ_INTENT' as SemanticRuleType,
        category: 'READ_VALUE' as SemanticRuleCategory,
        name: 'ai_read_intent',
        fallbackOnly: false,
      };
    }

    if (/(打开|进入|访问|前往|navigate|go to|open|visit)/i.test(normalized)) {
      const canBuildNavigationProfile =
        Boolean(navigationMetadata?.resolvedTarget) &&
        (Boolean(navigationMetadata?.resolvedUrl) || /^(?:\/|#)/.test(String(navigationMetadata?.resolvedUrl || ''))) ||
        /(https?:\/\/|[#/][\w-])/i.test(sampleText);
      return {
        groupKey: canBuildNavigationProfile ? 'navigation_profile' : 'navigate',
        semanticKey: canBuildNavigationProfile ? 'navigation_profile' : 'navigate',
        ruleType: 'INTENT_ALIAS' as SemanticRuleType,
        category: 'NAVIGATION' as SemanticRuleCategory,
        name: canBuildNavigationProfile ? 'ai_navigation_profile' : 'ai_navigate_intent',
        fallbackOnly: false,
      };
    }

    if (/(列表|一览|list)/i.test(normalized)) {
      return {
        groupKey: 'list',
        semanticKey: 'list',
        ruleType: 'INTENT_ALIAS' as SemanticRuleType,
        category: 'MENU_SELECTION' as SemanticRuleCategory,
        name: 'ai_list_intent',
        fallbackOnly: false,
      };
    }

    if (/(详情|明细|detail)/i.test(normalized)) {
      return {
        groupKey: 'detail',
        semanticKey: 'detail',
        ruleType: 'INTENT_ALIAS' as SemanticRuleType,
        category: 'DETAIL_OPEN' as SemanticRuleCategory,
        name: 'ai_detail_intent',
        fallbackOnly: false,
      };
    }

    if (/(选择|选中|勾选|select|choose|pick)/i.test(normalized)) {
      return {
        groupKey: 'select',
        semanticKey: 'select',
        ruleType: 'INTENT_ALIAS' as SemanticRuleType,
        category: 'MENU_SELECTION' as SemanticRuleCategory,
        name: 'ai_select_intent',
        fallbackOnly: false,
      };
    }

    return {
      groupKey: `fallback-${log.errorType.toLowerCase()}`,
      semanticKey: log.errorType.toLowerCase(),
      ruleType: 'INTENT_ALIAS' as SemanticRuleType,
      category: 'GENERIC_ALIAS' as SemanticRuleCategory,
      name: `ai_${this.toSafeName(log.errorType)}`,
      fallbackOnly: true,
    };
  }

  private pickSampleText(log: ErrorLogRecord) {
    return (log.normalizedInput || log.inputText || log.errorMessage || '').trim();
  }

  private extractLoginMetadata(log: ErrorLogRecord): Record<string, unknown> | null {
    const normalizedSemantic = this.asRecord(log.normalizedSemantic);
    const parserOutput = this.asRecord(log.parserOutput);
    const normalizedLogin = this.asRecord(this.asRecord(normalizedSemantic?.parser_metadata)?.login);
    const parserLogin = this.asRecord(this.asRecord(parserOutput?.metadata)?.login);
    return normalizedLogin || parserLogin;
  }

  private extractNavigationMetadata(log: ErrorLogRecord): Record<string, unknown> | null {
    const normalizedSemantic = this.asRecord(log.normalizedSemantic);
    const parserOutput = this.asRecord(log.parserOutput);
    const normalizedNavigation = this.asRecord(
      this.asRecord(normalizedSemantic?.parser_metadata)?.navigation
    );
    const parserNavigation = this.asRecord(this.asRecord(parserOutput?.metadata)?.navigation);
    return normalizedNavigation || parserNavigation;
  }

  private extractReadMetadata(log: ErrorLogRecord): Record<string, unknown> | null {
    const normalizedSemantic = this.asRecord(log.normalizedSemantic);
    const parserOutput = this.asRecord(log.parserOutput);
    const normalizedRead = this.asRecord(this.asRecord(normalizedSemantic?.parser_metadata)?.read);
    const parserRead = this.asRecord(this.asRecord(parserOutput?.metadata)?.read);
    return normalizedRead || parserRead;
  }

  private extractActionMetadata(log: ErrorLogRecord): Record<string, unknown> | null {
    const normalizedSemantic = this.asRecord(log.normalizedSemantic);
    const parserOutput = this.asRecord(log.parserOutput);
    const normalizedAction = this.asRecord(this.asRecord(normalizedSemantic?.parser_metadata)?.action);
    const parserAction = this.asRecord(this.asRecord(parserOutput?.metadata)?.action);
    return normalizedAction || parserAction;
  }

  private extractSearchMetadata(log: ErrorLogRecord): Record<string, unknown> | null {
    const normalizedSemantic = this.asRecord(log.normalizedSemantic);
    const parserOutput = this.asRecord(log.parserOutput);
    const normalizedSearch = this.asRecord(this.asRecord(normalizedSemantic?.parser_metadata)?.search);
    const parserSearch = this.asRecord(this.asRecord(parserOutput?.metadata)?.search);
    return normalizedSearch || parserSearch;
  }

  private extractFieldFillMetadata(log: ErrorLogRecord): Record<string, unknown> | null {
    const normalizedSemantic = this.asRecord(log.normalizedSemantic);
    const parserOutput = this.asRecord(log.parserOutput);
    const normalizedFieldFill = this.asRecord(
      this.asRecord(normalizedSemantic?.parser_metadata)?.fieldFill
    );
    const parserFieldFill = this.asRecord(this.asRecord(parserOutput?.metadata)?.fieldFill);
    return normalizedFieldFill || parserFieldFill;
  }

  private buildExactPattern(value: string) {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    return `^${escaped}$`;
  }

  private getHeuristicPatterns(semanticKey: string) {
    switch (semanticKey) {
      case 'login':
        return ['^(?:登录|log\\s*in|sign\\s*in)$'];
      case 'read':
      case 'read_profile':
        return ['^(?:读取|查看|获取|提取|read|extract).*$'];
      case 'navigate':
        return ['^(?:打开|进入|访问|前往|go\\s*to|open|visit).*$'];
      case 'list':
        return ['^(?:(?:打开|进入|查看)\\s*)?(?:列表|一览|list).*$'];
      case 'detail':
        return ['^(?:(?:打开|进入|查看)\\s*)?(?:详情|明细|detail).*$'];
      case 'search_profile':
        return ['^(?:搜索|智搜|智能搜索|search|smart\\s*search).*$'];
      case 'field_fill_profile':
        return ['^(?:填写|输入|写入|设置|set).*$'];
      case 'select':
        return ['^(?:选择|选中|勾选|select|choose|pick).*$'];
      default:
        return [];
    }
  }

  private collectDistinctValues(logs: ErrorLogRecord[], pick: (log: ErrorLogRecord) => string | null) {
    return Array.from(
      new Set(
        logs
          .map((log) => pick(log))
          .filter((value): value is string => Boolean(value && value.trim().length))
      )
    );
  }

  private toSafeName(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'fallback_intent';
  }

  private clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private mergeDescriptions(baseDescription?: string, appendedNote?: string) {
    if (!baseDescription) {
      return appendedNote;
    }

    if (!appendedNote) {
      return baseDescription;
    }

    return `${baseDescription} ${appendedNote}`.trim();
  }

  private pickRuleSourceErrorLogIds(outputs: Record<string, unknown>) {
    const sourceErrorLogIds = outputs.source_error_log_ids;

    if (!Array.isArray(sourceErrorLogIds)) {
      return [];
    }

    return sourceErrorLogIds.filter((value): value is string => typeof value === 'string');
  }

  private buildEmptyResponse(input: {
    dto: GenerateSemanticRuleSetDraftDto;
    generationTraceId: string;
    reason: string;
  }): GenerateSemanticRuleSetDraftResponse {
    return {
      generated: false,
      reason: input.reason,
      generation_trace_id: input.generationTraceId,
      summary: {
        domain_code: input.dto.domain_code,
        sample_count: 0,
        rule_count: 0,
        source_count: 0,
        error_type_count: 0,
        host_count: 0,
        page_type_count: 0,
        source_error_log_ids: [],
      },
      draft_rule_set: {
        domain_code: input.dto.domain_code,
        key: '',
        name: '',
        version: '',
        description: input.reason,
        created_by: input.dto.created_by || 'ai-generation-preview',
        rules: [],
        targetings: [],
      },
      explanations: [],
      risks: [],
      source_error_logs: [],
      generation_metadata: {
        mode: 'heuristic_preview',
        source_filter: {
          category: input.dto.category,
        },
      },
    };
  }
}
