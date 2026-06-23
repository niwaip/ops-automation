import { Injectable } from '@nestjs/common';
import {
  BrowserSemanticsClient,
  type RuntimeResolvedSemanticRuleSet,
} from '../../../client/browser-semantics.client';
import type {
  BrowserCommandContext,
  ParseBrowserCommandResponse,
} from './browser-command.types';

const PROFILE_METADATA_KEYS = [
  'login',
  'navigation',
  'read',
  'action',
  'search',
  'fieldFill',
] as const;

type ProfileMetadataKey = (typeof PROFILE_METADATA_KEYS)[number];

type SemanticRuntimeContext = {
  ruleSet: RuntimeResolvedSemanticRuleSet | null;
  matchedRuleIds: string[];
  normalizedInput: string;
};

export type FinalizeParseResultOptions = {
  originalInput: string;
  normalizedInput: string;
  context: BrowserCommandContext;
  semanticRuntime: SemanticRuntimeContext;
  parserSource: string;
  result: ParseBrowserCommandResponse;
};

@Injectable()
export class BrowserCommandSemanticLogService {
  constructor(private readonly browserSemanticsClient: BrowserSemanticsClient) {}

  async finalizeParseResult(
    options: FinalizeParseResultOptions
  ): Promise<ParseBrowserCommandResponse> {
    await this.recordSemanticRuleHit(options);
    await this.recordSemanticError(options);
    return options.result;
  }

  private async recordSemanticRuleHit(options: FinalizeParseResultOptions): Promise<void> {
    if (!options.semanticRuntime.ruleSet && options.semanticRuntime.matchedRuleIds.length === 0) {
      return;
    }

    const profileMetadata = this.collectProfileMetadata(options.result.parserMetadata);
    const loginMetadata = profileMetadata.login || null;
    const effectiveProfileVersions = this.buildEffectiveProfileVersions(
      profileMetadata,
      options.semanticRuntime.ruleSet
    );
    const effectiveMatchedRuleIds = this.mergeProfileMatchedRuleIds(
      options.semanticRuntime.matchedRuleIds,
      options.result.parserMetadata
    );

    await this.browserSemanticsClient.createHitLog({
      domain_code: 'browser_recorder',
      rule_set_id: options.semanticRuntime.ruleSet?.rule_set_id,
      matched_rule_ids: effectiveMatchedRuleIds,
      input_text: options.originalInput,
      normalized_input:
        options.normalizedInput !== options.originalInput ? options.normalizedInput : undefined,
      page_type: options.context.pageType,
      trace_id: options.context.traceId,
      used_ai_fallback: this.isAiFallbackSource(options.parserSource),
      final_execution_success: options.result.success,
      normalized_semantic: {
        parser_source: options.parserSource,
        command_count: options.result.commands.length,
        command_tools: options.result.commands.map((command) => command.tool),
        effective_login_profile_version: effectiveProfileVersions.login,
        effective_navigation_profile_version: effectiveProfileVersions.navigation,
        effective_profile_versions:
          Object.keys(effectiveProfileVersions).length > 0 ? effectiveProfileVersions : undefined,
        filled_fields: Array.isArray(loginMetadata?.filledFields) ? loginMetadata.filledFields : [],
        parser_metadata: options.result.parserMetadata,
      },
    });
  }

  private async recordSemanticError(options: FinalizeParseResultOptions): Promise<void> {
    const failureContext = options.context.lastFailureContext;
    const shouldRecord =
      !options.result.success ||
      (!!failureContext?.errorMessage && failureContext.errorMessage.trim().length > 0);

    if (!shouldRecord) {
      return;
    }

    const availableCandidates = options.context.availableCandidates || [];
    const matchedCommand = options.result.commands[0];
    const profileMetadata = this.collectProfileMetadata(options.result.parserMetadata);
    const loginMetadata = profileMetadata.login || null;
    const effectiveProfileVersions = this.buildEffectiveProfileVersions(
      profileMetadata,
      options.semanticRuntime.ruleSet
    );
    const effectiveMatchedRuleIds = this.mergeProfileMatchedRuleIds(
      options.semanticRuntime.matchedRuleIds,
      options.result.parserMetadata
    );

    await this.browserSemanticsClient.createErrorLog({
      domain_code: 'browser_recorder',
      rule_set_id: options.semanticRuntime.ruleSet?.rule_set_id,
      source: failureContext ? 'execution' : 'parse',
      error_type: failureContext?.errorType || 'COMMAND_PARSE_FAILED',
      error_message:
        failureContext?.errorMessage?.trim() ||
        options.result.explanation ||
        `Unable to parse browser command: ${options.originalInput}`,
      input_text: options.originalInput,
      normalized_input:
        options.normalizedInput !== options.originalInput ? options.normalizedInput : undefined,
      trace_id: options.context.traceId,
      page_url: options.context.currentPageUrl,
      host: this.extractHostFromUrl(options.context.currentPageUrl),
      page_type: options.context.pageType,
      observation_summary: options.context.observationSummary || options.context.lastObservationText,
      candidate_summary: {
        candidate_count: availableCandidates.length,
        candidate_ids: availableCandidates.map((candidate) => candidate.candidateId).slice(0, 20),
        available_inputs: options.context.availableInputs?.slice(0, 20),
        available_buttons: options.context.availableButtons?.slice(0, 20),
      },
      matched_rule_ids: effectiveMatchedRuleIds,
      normalized_semantic: {
        parser_source: options.parserSource,
        command_count: options.result.commands.length,
        command_tools: options.result.commands.map((command) => command.tool),
        effective_login_profile_version: effectiveProfileVersions.login,
        effective_navigation_profile_version: effectiveProfileVersions.navigation,
        effective_profile_versions:
          Object.keys(effectiveProfileVersions).length > 0 ? effectiveProfileVersions : undefined,
        filled_fields: Array.isArray(loginMetadata?.filledFields) ? loginMetadata.filledFields : [],
        parser_metadata: options.result.parserMetadata,
      },
      parser_output: {
        success: options.result.success,
        explanation: options.result.explanation,
        commands: options.result.commands,
        metadata: options.result.parserMetadata,
      },
      ai_fallback_input: this.isAiFallbackSource(options.parserSource)
        ? {
            normalized_input: options.normalizedInput,
            parser_source: options.parserSource,
          }
        : undefined,
      ai_fallback_output: this.isAiFallbackSource(options.parserSource)
        ? {
            success: options.result.success,
            explanation: options.result.explanation,
            command_count: options.result.commands.length,
          }
        : undefined,
      locator_info:
        matchedCommand?.locator && typeof matchedCommand.locator === 'object'
          ? { ...matchedCommand.locator }
          : undefined,
      metadata: {
        source_stage: 'browser-command-service',
        has_last_failure_context: Boolean(failureContext),
        retryable: failureContext?.retryable,
        failed_step_index: failureContext?.failedStepIndex,
        last_action: failureContext?.lastAction || undefined,
      },
    });
  }

  private isAiFallbackSource(parserSource: string): boolean {
    return (
      parserSource === 'ai' || parserSource === 'ai-plan' || parserSource === 'login-ai-plan'
    );
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

  private extractProfileMetadata(
    parserMetadata: Record<string, unknown> | undefined,
    key: ProfileMetadataKey
  ): Record<string, unknown> | null {
    if (!parserMetadata || typeof parserMetadata[key] !== 'object' || parserMetadata[key] === null) {
      return null;
    }

    return parserMetadata[key] as Record<string, unknown>;
  }

  private collectProfileMetadata(
    parserMetadata?: Record<string, unknown>
  ): Partial<Record<ProfileMetadataKey, Record<string, unknown>>> {
    const collected: Partial<Record<ProfileMetadataKey, Record<string, unknown>>> = {};
    for (const key of PROFILE_METADATA_KEYS) {
      const metadata = this.extractProfileMetadata(parserMetadata, key);
      if (metadata) {
        collected[key] = metadata;
      }
    }
    return collected;
  }

  private buildEffectiveProfileVersions(
    profileMetadata: Partial<Record<ProfileMetadataKey, Record<string, unknown>>>,
    ruleSet: RuntimeResolvedSemanticRuleSet | null
  ): Partial<Record<ProfileMetadataKey, string>> {
    const versions: Partial<Record<ProfileMetadataKey, string>> = {};
    for (const key of PROFILE_METADATA_KEYS) {
      const version = this.resolveEffectiveProfileVersion(profileMetadata[key], ruleSet);
      if (version) {
        versions[key] = version;
      }
    }
    return versions;
  }

  private resolveEffectiveProfileVersion(
    metadata: Record<string, unknown> | undefined,
    ruleSet: RuntimeResolvedSemanticRuleSet | null
  ): string | undefined {
    if (!metadata) {
      return undefined;
    }

    return metadata.usedRuntimeProfile ? ruleSet?.version || 'runtime' : 'default';
  }

  private mergeProfileMatchedRuleIds(
    matchedRuleIds: string[],
    parserMetadata?: Record<string, unknown>
  ): string[] {
    return Array.from(
      new Set([
        ...matchedRuleIds,
        ...PROFILE_METADATA_KEYS.flatMap((key) =>
          this.extractRuntimeMatchedRuleIdsFromMetadata(parserMetadata?.[key])
        ),
      ])
    );
  }

  private extractRuntimeMatchedRuleIdsFromMetadata(metadata: unknown): string[] {
    if (typeof metadata !== 'object' || metadata === null) {
      return [];
    }

    const matchedRuleIds = (metadata as Record<string, unknown>).matchedRuntimeRuleIds;
    if (!Array.isArray(matchedRuleIds)) {
      return [];
    }

    return matchedRuleIds.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0
    );
  }
}
