import { Injectable, Logger } from '@nestjs/common';
import {
  BrowserSemanticsClient,
  type RuntimeResolvedSemanticRuleSet,
  type RuntimeSemanticRule,
} from '../../../client/browser-semantics.client';
import type { BrowserCommandContext } from './browser-command.types';

export type ResolvedSemanticRuntime = {
  ruleSet: RuntimeResolvedSemanticRuleSet | null;
  matchedRuleIds: string[];
  normalizedInput: string;
};

@Injectable()
export class BrowserCommandSemanticRuntimeService {
  private readonly logger = new Logger(BrowserCommandSemanticRuntimeService.name);

  constructor(private readonly browserSemanticsClient: BrowserSemanticsClient) {}

  async resolveSemanticRuntime(
    input: string,
    context: BrowserCommandContext
  ): Promise<ResolvedSemanticRuntime> {
    const ruleSet = await this.browserSemanticsClient.resolveRuntimeRuleSet({
      domain_code: 'browser_recorder',
      environment: process.env.NODE_ENV,
      host: this.extractHostFromUrl(context.currentPageUrl),
      page_type: context.pageType,
    });

    if (!ruleSet?.rules?.length) {
      return {
        ruleSet,
        matchedRuleIds: [],
        normalizedInput: input,
      };
    }

    return this.applySemanticRulesToInput(input, ruleSet);
  }

  private applySemanticRulesToInput(
    input: string,
    ruleSet: RuntimeResolvedSemanticRuleSet
  ): ResolvedSemanticRuntime {
    let normalizedInput = input;
    const matchedRuleIds: string[] = [];

    for (const rule of [...ruleSet.rules].sort(
      (left, right) => (right.priority || 0) - (left.priority || 0)
    )) {
      const patterns = Array.isArray(rule.patterns)
        ? rule.patterns.filter(
            (item): item is string => typeof item === 'string' && item.trim().length > 0
          )
        : [];

      if (patterns.length === 0) {
        continue;
      }

      for (const pattern of patterns) {
        const regex = this.buildSemanticRuleRegex(pattern, rule.flags);
        if (!regex || !regex.test(normalizedInput)) {
          continue;
        }

        if (typeof rule.id === 'string' && rule.id.trim()) {
          matchedRuleIds.push(rule.id);
        }

        normalizedInput = this.rewriteInputWithSemanticRule(normalizedInput, regex, rule);
        if (rule.stopOnMatch) {
          break;
        }
      }
    }

    return {
      ruleSet,
      matchedRuleIds: [...new Set(matchedRuleIds)],
      normalizedInput,
    };
  }

  private buildSemanticRuleRegex(pattern: string, flags?: string): RegExp | null {
    try {
      return new RegExp(pattern, flags || 'i');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Invalid semantic rule regex "${pattern}": ${message}`);
      return null;
    }
  }

  private rewriteInputWithSemanticRule(
    input: string,
    regex: RegExp,
    rule: RuntimeSemanticRule
  ): string {
    const outputs = rule.outputs || {};
    const normalizedOverride =
      typeof outputs.normalized_input === 'string' ? outputs.normalized_input.trim() : '';
    if (normalizedOverride) {
      return normalizedOverride;
    }

    const replaceWith = typeof outputs.replace_with === 'string' ? outputs.replace_with : '';
    if (replaceWith) {
      return input.replace(regex, replaceWith);
    }

    const prependTerms = this.extractSemanticTerms(outputs.prepend_terms);
    const appendTerms = this.extractSemanticTerms(outputs.append_terms);
    if (prependTerms.length === 0 && appendTerms.length === 0) {
      return input;
    }

    const prefix = prependTerms.join(' ').trim();
    const suffix = appendTerms.join(' ').trim();
    return [prefix, input, suffix].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }

  private extractSemanticTerms(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }

  private extractHostFromUrl(url?: string): string | undefined {
    if (!url?.trim()) {
      return undefined;
    }

    try {
      return new URL(url).hostname || undefined;
    } catch {
      return undefined;
    }
  }
}
