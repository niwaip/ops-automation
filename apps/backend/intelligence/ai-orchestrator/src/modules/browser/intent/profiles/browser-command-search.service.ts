import { Injectable } from '@nestjs/common';
import type { RuntimeSemanticRule } from '../../../../client/browser-semantics.client';
import { buildSearchProfile, canonicalizeSearchText } from './browser-command-search.profile';
import type {
  SearchIntentKind,
  SearchParseContext,
  SearchParseResult,
  SearchProfile,
  SearchProfileTermEntry,
} from './browser-command-search.types';
import type { BrowserCommand } from '../browser-command.types';

type MatchedSearchTerm = {
  term: string;
  ruleId?: string;
};

type SearchQueryMatch = {
  intentType: 'search' | 'smart_search';
  query: string;
  matchedTerm: MatchedSearchTerm;
  remaining: string;
};

type ClickResultMatch = {
  resultIndex: number;
  matchedTerm: MatchedSearchTerm;
};

type EngineSearchMatch = {
  engine: 'baidu' | 'google' | 'bing';
  engineLabel: '百度' | '谷歌' | '必应';
  query: string;
  triggerTerm: string;
};

@Injectable()
export class BrowserCommandSearchService {
  parseSearchCommandDetailed(
    input: string,
    _commandContext: SearchParseContext['commandContext'],
    options?: { runtimeRules?: RuntimeSemanticRule[] }
  ): SearchParseResult {
    const normalizedInput = input.replace(/\s+/g, ' ').trim();
    if (!normalizedInput) {
      return { status: 'no_match' };
    }

    const profile = buildSearchProfile(options?.runtimeRules || []);

    const engineSearchMatch = this.parseExplicitEngineSearch(normalizedInput);
    if (engineSearchMatch) {
      return {
        status: 'success',
        response: this.buildEngineSearchResponse(engineSearchMatch),
      };
    }

    const queryMatch = this.parseSearchQuery(normalizedInput, profile);
    if (queryMatch) {
      const followUpClickResult = queryMatch.remaining
        ? this.parseClickResult(queryMatch.remaining, profile)
        : null;
      if (queryMatch.remaining && !followUpClickResult) {
        return { status: 'no_match' };
      }

      return {
        status: 'success',
        response: this.buildSearchResponse(queryMatch, followUpClickResult),
      };
    }

    const listResultMatch = this.parseListResults(normalizedInput, profile);
    if (listResultMatch) {
      return {
        status: 'success',
        response: this.buildStandaloneResponse({
          intentType: 'list_results',
          command: {
            tool: 'list_search_results',
            params: { limit: 8 },
            description: '列出当前页面搜索结果候选',
          },
          explanation: '将列出当前页面可点击的搜索结果候选',
          matchedTerm: listResultMatch,
        }),
      };
    }

    const clickResultMatch = this.parseClickResult(normalizedInput, profile);
    if (clickResultMatch) {
      return {
        status: 'success',
        response: this.buildStandaloneResponse({
          intentType: 'click_result',
          command: {
            tool: 'click_result',
            params: { index: clickResultMatch.resultIndex },
            description: `点击第${clickResultMatch.resultIndex}个结果`,
          },
          explanation: `将点击第${clickResultMatch.resultIndex}个搜索结果`,
          matchedTerm: clickResultMatch.matchedTerm,
          resultIndex: clickResultMatch.resultIndex,
        }),
      };
    }

    return { status: 'no_match' };
  }

  private buildSearchResponse(
    queryMatch: SearchQueryMatch,
    followUpClickResult: ClickResultMatch | null
  ) {
    const searchCommand: BrowserCommand = {
      tool: queryMatch.intentType,
      params: { query: queryMatch.query },
      description:
        queryMatch.intentType === 'smart_search'
          ? `智搜 ${queryMatch.query}`
          : `搜索 ${queryMatch.query}`,
    };
    const commands: BrowserCommand[] = [searchCommand];
    const explanations = [`搜索 ${queryMatch.query}`];
    const matchedRuntimeRuleIds = new Set<string>();

    if (queryMatch.matchedTerm.ruleId) {
      matchedRuntimeRuleIds.add(queryMatch.matchedTerm.ruleId);
    }

    if (followUpClickResult) {
      commands.push({
        tool: 'click_result',
        params: { index: followUpClickResult.resultIndex },
        description: `点击第${followUpClickResult.resultIndex}个结果`,
      });
      explanations.push(`点击第${followUpClickResult.resultIndex}个结果`);
      if (followUpClickResult.matchedTerm.ruleId) {
        matchedRuntimeRuleIds.add(followUpClickResult.matchedTerm.ruleId);
      }
    }

    return {
      success: true,
      commands,
      explanation: followUpClickResult
        ? `将依次${explanations.join('，')}`
        : queryMatch.intentType === 'smart_search'
          ? `将智能查找当前页面的搜索入口并搜索 ${queryMatch.query}`
          : `将搜索 ${queryMatch.query}`,
      parserMetadata: {
        search: {
          status: 'success',
          reason: this.resolveSearchReason(queryMatch, followUpClickResult),
          intentType: queryMatch.intentType,
          query: queryMatch.query,
          resultIndex: followUpClickResult?.resultIndex,
          triggerTerm: queryMatch.matchedTerm.term,
          usedRuntimeProfile: Boolean(queryMatch.matchedTerm.ruleId || followUpClickResult?.matchedTerm.ruleId),
          matchedRuntimeRuleIds: Array.from(matchedRuntimeRuleIds),
        },
      },
    };
  }

  private buildEngineSearchResponse(input: EngineSearchMatch) {
    const searchUrls: Record<EngineSearchMatch['engine'], string> = {
      baidu: 'https://www.baidu.com/s?wd=',
      google: 'https://www.google.com/search?q=',
      bing: 'https://www.bing.com/search?q=',
    };
    const baseUrl = searchUrls[input.engine];

    return {
      success: true,
      commands: [
        {
          tool: 'navigate',
          params: { url: `${baseUrl}${encodeURIComponent(input.query)}` },
          description: `在${input.engineLabel}搜索 ${input.query}`,
        },
      ],
      explanation: `将在${input.engineLabel}搜索 ${input.query}`,
      parserMetadata: {
        search: {
          status: 'success',
          reason: 'search-default-engine',
          intentType: 'engine_search',
          query: input.query,
          triggerTerm: input.triggerTerm,
          engine: input.engine,
          usedRuntimeProfile: false,
          matchedRuntimeRuleIds: [],
        },
      },
    };
  }

  private buildStandaloneResponse(input: {
    intentType: SearchIntentKind;
    command: BrowserCommand;
    explanation: string;
    matchedTerm: MatchedSearchTerm;
    resultIndex?: number;
  }) {
    return {
      success: true,
      commands: [input.command],
      explanation: input.explanation,
      parserMetadata: {
        search: {
          status: 'success',
          reason: input.matchedTerm.ruleId
            ? `search-runtime-${input.intentType}`
            : `search-default-${input.intentType}`,
          intentType: input.intentType,
          resultIndex: input.resultIndex,
          triggerTerm: input.matchedTerm.term,
          usedRuntimeProfile: Boolean(input.matchedTerm.ruleId),
          matchedRuntimeRuleIds: input.matchedTerm.ruleId ? [input.matchedTerm.ruleId] : [],
        },
      },
    };
  }

  private resolveSearchReason(
    queryMatch: SearchQueryMatch,
    followUpClickResult: ClickResultMatch | null
  ): string {
    const usedRuntimeProfile = Boolean(
      queryMatch.matchedTerm.ruleId || followUpClickResult?.matchedTerm.ruleId
    );
    if (followUpClickResult) {
      return usedRuntimeProfile ? 'search-runtime-sequential' : 'search-default-sequential';
    }
    return usedRuntimeProfile ? 'search-runtime-query' : 'search-default-query';
  }

  private parseSearchQuery(input: string, profile: SearchProfile): SearchQueryMatch | null {
    const smartSearch = this.matchQueryPrefix(input, profile.smartSearchTerms);
    if (smartSearch) {
      return {
        intentType: 'smart_search',
        ...smartSearch,
      };
    }

    const search = this.matchQueryPrefix(input, profile.searchTerms);
    if (!search) {
      return null;
    }

    return {
      intentType: 'search',
      ...search,
    };
  }

  private parseExplicitEngineSearch(input: string): EngineSearchMatch | null {
    const patterns: Array<{
      pattern: RegExp;
      resolve: (match: RegExpMatchArray) => EngineSearchMatch | null;
    }> = [
      {
        pattern: /^(?:在?\s*(百度|baidu)\s*搜索)\s*(.+)$/i,
        resolve: (match) =>
          match[2]
            ? {
                engine: 'baidu',
                engineLabel: '百度',
                query: match[2].trim(),
                triggerTerm: match[1]?.trim() || '百度',
              }
            : null,
      },
      {
        pattern: /^(?:在?\s*(谷歌|google)\s*搜索)\s*(.+)$/i,
        resolve: (match) =>
          match[2]
            ? {
                engine: 'google',
                engineLabel: '谷歌',
                query: match[2].trim(),
                triggerTerm: match[1]?.trim() || '谷歌',
              }
            : null,
      },
      {
        pattern: /^(?:在?\s*(必应|bing)\s*搜索)\s*(.+)$/i,
        resolve: (match) =>
          match[2]
            ? {
                engine: 'bing',
                engineLabel: '必应',
                query: match[2].trim(),
                triggerTerm: match[1]?.trim() || '必应',
              }
            : null,
      },
      {
        pattern: /^(?:search\s+(?:on\s+)?(baidu|google|bing)\s*:?\s*)(.+)$/i,
        resolve: (match) => {
          const engine = match[1]?.toLowerCase();
          const query = match[2]?.trim();
          if (!engine || !query) {
            return null;
          }

          if (engine === 'baidu') {
            return { engine: 'baidu', engineLabel: '百度', query, triggerTerm: match[1]?.trim() || 'baidu' };
          }
          if (engine === 'google') {
            return { engine: 'google', engineLabel: '谷歌', query, triggerTerm: match[1]?.trim() || 'google' };
          }
          if (engine === 'bing') {
            return { engine: 'bing', engineLabel: '必应', query, triggerTerm: match[1]?.trim() || 'bing' };
          }
          return null;
        },
      },
    ];

    for (const { pattern, resolve } of patterns) {
      const match = input.match(pattern);
      if (!match) {
        continue;
      }
      const parsed = resolve(match);
      if (parsed?.query) {
        return parsed;
      }
    }

    return null;
  }

  private matchQueryPrefix(input: string, entries: SearchProfileTermEntry[]) {
    for (const entry of this.sortTerms(entries)) {
      const termRegex = new RegExp(`^${this.escapeRegex(entry.term)}\\s+(.+)$`, 'i');
      const match = input.match(termRegex);
      if (!match?.[1]) {
        continue;
      }

      const rawRest = match[1].trim();
      const clickResult = this.parseClickResult(rawRest, {
        searchTerms: [],
        smartSearchTerms: [],
        listResultTerms: [],
        clickResultTerms: [],
        localeHints: [],
      });
      const result = clickResult ? null : this.extractQueryAndRemaining(rawRest);
      if (!result?.query) {
        continue;
      }

      return {
        query: result.query,
        remaining: result.remaining,
        matchedTerm: { term: entry.term, ruleId: entry.ruleId },
      };
    }

    return null;
  }

  private extractQueryAndRemaining(rawRest: string): { query: string; remaining: string } | null {
    const match = rawRest.match(
      /^(.+?)(?=\s*(?:并|然后|再|后|接着)?\s*(?:点击|选择|打开|click|open)\s*(?:第?[一二三四五六七八九十\d]+|first|second|third|fourth|fifth)\s*(?:个?结果|条?结果|搜索结果|检索结果|result)?$|$)/i
    );
    if (!match?.[1]) {
      return null;
    }

    const query = match[1].trim();
    const remaining = this.stripLeadingConnector(rawRest.slice(match[0].length));
    if (!query) {
      return null;
    }

    return { query, remaining };
  }

  private parseListResults(input: string, profile: SearchProfile): MatchedSearchTerm | null {
    const normalizedInput = canonicalizeSearchText(input);
    if (!normalizedInput) {
      return null;
    }

    for (const entry of this.sortTerms(profile.listResultTerms)) {
      if (canonicalizeSearchText(entry.term) === normalizedInput) {
        return { term: entry.term, ruleId: entry.ruleId };
      }
    }

    return null;
  }

  private parseClickResult(input: string, profile: SearchProfile): ClickResultMatch | null {
    for (const entry of this.sortTerms(profile.clickResultTerms)) {
      const pattern = new RegExp(
        `^${this.escapeRegex(entry.term)}\\s*(第?[一二三四五六七八九十\\d]+|first|second|third|fourth|fifth)\\s*(?:个?结果|条?结果|搜索结果|检索结果|result)?$`,
        'i'
      );
      const match = input.match(pattern);
      if (!match?.[1]) {
        continue;
      }

      const resultIndex = this.resolveResultIndex(match[1]);
      if (resultIndex <= 0) {
        continue;
      }

      return {
        resultIndex,
        matchedTerm: {
          term: entry.term,
          ruleId: entry.ruleId,
        },
      };
    }

    return null;
  }

  private sortTerms(entries: SearchProfileTermEntry[]) {
    return [...entries].sort((left, right) => right.term.length - left.term.length);
  }

  private stripLeadingConnector(text: string): string {
    return text.replace(/^(?:\s|并且|并|然后|再|后|接着)+/i, '').trim();
  }

  private resolveResultIndex(value: string): number {
    const indexMap: Record<string, number> = {
      一: 1,
      二: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      七: 7,
      八: 8,
      九: 9,
      十: 10,
      first: 1,
      second: 2,
      third: 3,
      fourth: 4,
      fifth: 5,
    };
    const normalized = value.replace(/^第/, '').replace(/个|条/g, '').toLowerCase();
    return indexMap[normalized] || parseInt(normalized, 10) || 0;
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  }
}
