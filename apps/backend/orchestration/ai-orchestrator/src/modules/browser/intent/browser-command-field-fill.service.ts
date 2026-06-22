import { Injectable } from '@nestjs/common';
import type { RuntimeSemanticRule } from '../../../client/browser-semantics.client';
import {
  buildFieldFillProfile,
  canonicalizeFieldFillText,
} from './browser-command-field-fill.profile';
import type {
  FieldFillCommandHelpers,
  FieldFillParseContext,
  FieldFillParseResult,
  FieldFillProfileEntry,
  ParsedFieldFillCandidate,
} from './browser-command-field-fill.types';
import type { BrowserCommandCandidate } from './browser-command.types';

@Injectable()
export class BrowserCommandFieldFillService {
  parseFieldFillCommandDetailed(
    input: string,
    commandContext: FieldFillParseContext['commandContext'],
    helpers: FieldFillCommandHelpers,
    options?: { runtimeRules?: RuntimeSemanticRule[] }
  ): FieldFillParseResult {
    const normalizedInput = input.replace(/\s+/g, ' ').trim();
    if (!normalizedInput) {
      return { status: 'no_match' };
    }

    const candidates = this.collectCandidates(commandContext, helpers);
    if (!candidates.length) {
      return { status: 'no_match' };
    }

    const profile = buildFieldFillProfile(options?.runtimeRules || []);
    const fillIntent = this.extractFillIntent(normalizedInput, profile.intentTerms);
    if (!fillIntent) {
      return { status: 'no_match' };
    }

    const runtimeResolved = this.resolveRuntimeCandidate(fillIntent.remainder, fillIntent.regionHint, candidates, profile.entries);
    if (runtimeResolved) {
      return {
        status: 'success',
        response: this.buildResponse(fillIntent.verb, runtimeResolved.rawField, runtimeResolved.value, runtimeResolved.selector, runtimeResolved.locator, {
          fieldFill: {
            status: 'success',
            reason: runtimeResolved.reason,
            resolvedField: runtimeResolved.candidate.label || runtimeResolved.rawField,
            resolvedCanonicalField: runtimeResolved.candidate.field || runtimeResolved.rawField,
            resolvedRegion: runtimeResolved.candidate.region,
            selector: runtimeResolved.selector,
            value: runtimeResolved.value,
            usedRuntimeProfile: true,
            matchedRuntimeRuleIds: runtimeResolved.ruleId ? [runtimeResolved.ruleId] : [],
          },
        })
      };
    }

    const defaultResolved = this.resolveDefaultCandidate(fillIntent.remainder, fillIntent.regionHint, candidates);
    if (!defaultResolved) {
      return { status: 'no_match' };
    }

    return {
      status: 'success',
      response: this.buildResponse(fillIntent.verb, defaultResolved.rawField, defaultResolved.value, defaultResolved.selector, defaultResolved.locator, {
        fieldFill: {
          status: 'success',
          reason: 'field-fill-default-candidate',
          resolvedField: defaultResolved.candidate.label || defaultResolved.rawField,
          resolvedCanonicalField: defaultResolved.candidate.field || defaultResolved.rawField,
          resolvedRegion: defaultResolved.candidate.region,
          selector: defaultResolved.selector,
          value: defaultResolved.value,
          usedRuntimeProfile: false,
          matchedRuntimeRuleIds: [],
        },
      }),
    };
  }

  private extractFillIntent(
    input: string,
    intentTerms: string[]
  ): { verb: string; remainder: string; regionHint?: string } | null {
    const normalizedInput = input.replace(/\s+/g, ' ').trim();

    const scoped = this.extractScopedFillIntent(normalizedInput, intentTerms);
    if (scoped) {
      return scoped;
    }

    return this.extractDirectFillIntent(normalizedInput, intentTerms);
  }

  private extractScopedFillIntent(
    input: string,
    intentTerms: string[]
  ): { verb: string; remainder: string; regionHint?: string } | null {
    if (!input.startsWith('在')) {
      return null;
    }

    const scopedBody = input.slice(1).trim();
    if (!scopedBody) {
      return null;
    }

    const sortedIntentTerms = [...intentTerms].sort((left, right) => right.length - left.length);
    for (const intentTerm of sortedIntentTerms) {
      const regex = new RegExp(
        `^(.+?)(?:里|中)?\\s*(?:把|将)?\\s*${this.escapeRegex(intentTerm)}\\s*(.+)$`,
        'i'
      );
      const match = scopedBody.match(regex);
      if (!match?.[1] || !match[2]) {
        continue;
      }

      const regionHint = match[1].trim();
      const remainder = match[2].trim();
      if (!regionHint || !remainder) {
        continue;
      }

      return {
        verb: intentTerm,
        remainder,
        regionHint,
      };
    }

    return null;
  }

  private extractDirectFillIntent(
    input: string,
    intentTerms: string[]
  ): { verb: string; remainder: string } | null {
    const sortedIntentTerms = [...intentTerms].sort((left, right) => right.length - left.length);
    for (const intentTerm of sortedIntentTerms) {
      const regex = new RegExp(`^(?:把|将)?\\s*${this.escapeRegex(intentTerm)}\\s*(.+)$`, 'i');
      const match = input.match(regex);
      if (!match?.[1]) {
        continue;
      }

      const remainder = match[1].trim();
      if (!remainder) {
        continue;
      }

      return {
        verb: intentTerm,
        remainder,
      };
    }

    return null;
  }

  private resolveRuntimeCandidate(
    remainder: string,
    regionHint: string | undefined,
    candidates: ParsedFieldFillCandidate[],
    entries: FieldFillProfileEntry[]
  ) {
    const sortedEntries = [...entries].sort(
      (left, right) =>
        Math.max(...right.fieldTerms.map((term) => term.length)) -
        Math.max(...left.fieldTerms.map((term) => term.length))
    );

    for (const entry of sortedEntries) {
      const matchedTerm = entry.fieldTerms.find((term) => this.startsWithFieldTerm(remainder, term));
      if (!matchedTerm) {
        continue;
      }

      const value = this.extractValueFromRemainder(remainder, matchedTerm);
      if (!value) {
        continue;
      }

      const candidate = this.pickBestCandidate(candidates, matchedTerm, regionHint, entry);
      if (!candidate) {
        continue;
      }

      const built = this.buildSelectorFromCandidate(candidate);
      if (!built.selector) {
        continue;
      }

      return {
        candidate,
        rawField: matchedTerm,
        value,
        selector: built.selector,
        locator: built.locator,
        ruleId: entry.ruleId,
        reason: entry.regionTerms.length > 0 ? 'field-fill-runtime-field-region' : 'field-fill-runtime-field',
      };
    }

    return null;
  }

  private resolveDefaultCandidate(
    remainder: string,
    regionHint: string | undefined,
    candidates: ParsedFieldFillCandidate[]
  ) {
    const aliases = this.collectDefaultAliases(candidates);
    for (const alias of aliases) {
      if (!this.startsWithFieldTerm(remainder, alias.alias)) {
        continue;
      }

      const value = this.extractValueFromRemainder(remainder, alias.alias);
      if (!value) {
        continue;
      }

      const candidate = this.pickBestDefaultCandidate(candidates, alias.candidate, regionHint);
      if (!candidate) {
        continue;
      }

      const built = this.buildSelectorFromCandidate(candidate);
      if (!built.selector) {
        continue;
      }

      return {
        candidate,
        rawField: alias.alias,
        value,
        selector: built.selector,
        locator: built.locator,
      };
    }

    return null;
  }

  private pickBestCandidate(
    candidates: ParsedFieldFillCandidate[],
    fieldTerm: string,
    regionHint: string | undefined,
    entry: FieldFillProfileEntry
  ): ParsedFieldFillCandidate | null {
    const normalizedFieldTerm = this.normalizeMatchText(fieldTerm);
    const normalizedRegionHint = this.normalizeMatchText(regionHint || '');

    const scored = candidates
      .map((candidate) => ({
        candidate,
        score: this.scoreCandidate(
          candidate,
          normalizedFieldTerm,
          normalizedRegionHint,
          entry.regionTerms.map((term) => this.normalizeMatchText(term)),
          entry.canonicalField ? this.normalizeMatchText(entry.canonicalField) : undefined
        ),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score);

    return scored[0]?.candidate || null;
  }

  private pickBestDefaultCandidate(
    candidates: ParsedFieldFillCandidate[],
    targetCandidate: ParsedFieldFillCandidate,
    regionHint: string | undefined
  ): ParsedFieldFillCandidate | null {
    const normalizedRegionHint = this.normalizeMatchText(regionHint || '');
    const targetField = this.normalizeMatchText(targetCandidate.field || targetCandidate.label || '');

    const scored = candidates
      .map((candidate) => ({
        candidate,
        score: this.scoreCandidate(candidate, targetField, normalizedRegionHint, [], targetField),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score);

    return scored[0]?.candidate || null;
  }

  private scoreCandidate(
    candidate: ParsedFieldFillCandidate,
    normalizedFieldTerm: string,
    normalizedRegionHint: string,
    regionTerms: string[],
    canonicalField?: string
  ): number {
    let score = 0;

    for (const token of this.getCandidateTokens(candidate)) {
      if (token === normalizedFieldTerm) {
        score = Math.max(score, 220);
      } else if (token.includes(normalizedFieldTerm) || normalizedFieldTerm.includes(token)) {
        score = Math.max(score, 140);
      }
    }

    const candidateField = this.normalizeMatchText(candidate.field || '');
    if (canonicalField && candidateField === canonicalField) {
      score += 160;
    }

    const candidateRegion = this.normalizeMatchText(candidate.region || '');
    if (normalizedRegionHint && candidateRegion === normalizedRegionHint) {
      score += 100;
    }
    if (
      regionTerms.some(
        (term) => term && candidateRegion && (candidateRegion === term || candidateRegion.includes(term))
      )
    ) {
      score += 90;
    }

    if (candidate.kind === 'input') {
      score += 20;
    }
    if (candidate.preferredLocator) {
      score += 10;
    }

    return score;
  }

  private collectDefaultAliases(candidates: ParsedFieldFillCandidate[]) {
    return candidates
      .flatMap((candidate) => {
        const aliases = [candidate.label, candidate.field, candidate.summary]
          .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          .flatMap((value) => this.buildDefaultAliasVariants(value));
        return Array.from(new Set(aliases)).map((alias) => ({ alias, candidate }));
      })
      .sort((left, right) => right.alias.length - left.alias.length);
  }

  private collectCandidates(
    commandContext: FieldFillParseContext['commandContext'],
    helpers: FieldFillCommandHelpers
  ): ParsedFieldFillCandidate[] {
    const directCandidates = helpers
      .getAvailableCandidates()
      .filter(
        (candidate): candidate is BrowserCommandCandidate & { kind: 'input' | 'field' } =>
          candidate.kind === 'input' || candidate.kind === 'field'
      )
      .map((candidate) => this.toParsedCandidate(candidate));

    const inputCandidates = (helpers.getAvailableInputs() || []).map((input, index) => ({
      candidateId: `available_input_${index + 1}`,
      kind: 'input' as const,
      label: input,
      summary: input,
      selector: `role=textbox[name="${input.replace(/"/g, '\\"')}"]`,
    }));

    return this.dedupeCandidates([...directCandidates, ...inputCandidates, ...(commandContext.availableInputs || []).map((input, index) => ({
      candidateId: `context_input_${index + 1}`,
      kind: 'input' as const,
      label: input,
      summary: input,
      selector: `role=textbox[name="${input.replace(/"/g, '\\"')}"]`,
    }))]);
  }

  private dedupeCandidates(candidates: ParsedFieldFillCandidate[]) {
    return [
      ...candidates
        .reduce((map, candidate) => {
          const key = [
            candidate.kind,
            candidate.field || '',
            candidate.region || '',
            candidate.label || '',
            candidate.selector || '',
          ].join('|');
          if (!map.has(key)) {
            map.set(key, candidate);
          }
          return map;
        }, new Map<string, ParsedFieldFillCandidate>())
        .values(),
    ];
  }

  private buildDefaultAliasVariants(value: string): string[] {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    const strippedTrailingSeparator = trimmed.replace(/[\s:：=]+$/g, '').trim();
    return Array.from(new Set([trimmed, strippedTrailingSeparator].filter(Boolean)));
  }

  private startsWithFieldTerm(remainder: string, fieldTerm: string): boolean {
    const normalizedRemainder = remainder.replace(/^(?:把|将)\s*/i, '').trim();
    const regex = new RegExp(`^${this.escapeRegex(fieldTerm)}(?:\\s|$|为|是|=|:|：)`, 'i');
    return regex.test(normalizedRemainder);
  }

  private extractValueFromRemainder(remainder: string, fieldTerm: string): string | null {
    const normalizedRemainder = remainder.replace(/^(?:把|将)\s*/i, '').trim();
    const regex = new RegExp(`^${this.escapeRegex(fieldTerm)}\\s*(.*)$`, 'i');
    const match = normalizedRemainder.match(regex);
    if (!match?.[1]) {
      return null;
    }

    const value = match[1]
      .replace(/^(?:设置为|设为|填为|写为|写成|填成|内容为|值为|为|是|=|:|：)\s*/i, '')
      .trim();
    return value || null;
  }

  private getCandidateTokens(candidate: ParsedFieldFillCandidate): string[] {
    return [candidate.field, candidate.label, candidate.summary, candidate.text]
      .map((value) => this.normalizeMatchText(value || ''))
      .filter((value): value is string => Boolean(value));
  }

  private normalizeMatchText(value: string): string {
    return canonicalizeFieldFillText(value);
  }

  private buildSelectorFromCandidate(candidate: ParsedFieldFillCandidate): {
    selector?: string;
    locator?: Record<string, unknown>;
  } {
    if (candidate.selector) {
      return {
        selector: candidate.selector,
        locator: {
          strategy: candidate.selector.startsWith('role=') ? 'role' : 'css',
          value: candidate.selector,
          generatedBy: 'candidate-first',
          confidence: 0.9,
          matchedCandidateId: candidate.candidateId,
          resolutionMode: 'preferred-locator',
        },
      };
    }

    const locator = candidate.preferredLocator;
    if (locator?.type === 'css' || locator?.type === 'text') {
      return {
        selector: locator.value,
        locator: {
          strategy: locator.type,
          value: locator.value,
          generatedBy: 'candidate-first',
          confidence: 0.96,
          matchedCandidateId: candidate.candidateId,
          resolutionMode: 'preferred-locator',
        },
      };
    }
    if (locator?.type === 'testid') {
      return {
        selector: `[data-testid="${locator.value}"]`,
        locator: {
          strategy: 'css',
          value: `[data-testid="${locator.value}"]`,
          generatedBy: 'candidate-first',
          confidence: 0.96,
          matchedCandidateId: candidate.candidateId,
          resolutionMode: 'preferred-locator',
        },
      };
    }
    if (locator?.type === 'ref') {
      return {
        selector: locator.value,
        locator: {
          strategy: 'ref',
          value: locator.value,
          generatedBy: 'candidate-first',
          confidence: 0.98,
          matchedCandidateId: candidate.candidateId,
          resolutionMode: 'preferred-locator',
        },
      };
    }
    if (locator?.type === 'role') {
      const roleSelector = locator.value.startsWith('role=') ? locator.value : `role=${locator.value}`;
      return {
        selector: roleSelector,
        locator: {
          strategy: 'role',
          value: roleSelector,
          generatedBy: 'candidate-first',
          confidence: 0.95,
          matchedCandidateId: candidate.candidateId,
          resolutionMode: 'preferred-locator',
        },
      };
    }
    if (candidate.dataTestId) {
      return {
        selector: `[data-testid="${candidate.dataTestId}"]`,
        locator: {
          strategy: 'css',
          value: `[data-testid="${candidate.dataTestId}"]`,
          generatedBy: 'context',
          confidence: 0.9,
          matchedCandidateId: candidate.candidateId,
          resolutionMode: 'context-derived',
        },
      };
    }
    if (candidate.elementId) {
      return {
        selector: `#${candidate.elementId}`,
        locator: {
          strategy: 'css',
          value: `#${candidate.elementId}`,
          generatedBy: 'context',
          confidence: 0.9,
          matchedCandidateId: candidate.candidateId,
          resolutionMode: 'context-derived',
        },
      };
    }
    if (candidate.field && candidate.region) {
      return {
        selector: `[data-ai-region="${candidate.region}"] [data-ai-field="${candidate.field}"]`,
        locator: {
          strategy: 'css',
          value: `[data-ai-region="${candidate.region}"] [data-ai-field="${candidate.field}"]`,
          generatedBy: 'context',
          confidence: 0.88,
          matchedCandidateId: candidate.candidateId,
          resolutionMode: 'context-derived',
        },
      };
    }
    if (candidate.field) {
      return {
        selector: `[data-ai-field="${candidate.field}"]`,
        locator: {
          strategy: 'css',
          value: `[data-ai-field="${candidate.field}"]`,
          generatedBy: 'context',
          confidence: 0.84,
          matchedCandidateId: candidate.candidateId,
          resolutionMode: 'context-derived',
        },
      };
    }
    if (candidate.label) {
      const labelSelector = `role=textbox[name="${candidate.label.replace(/"/g, '\\"')}"]`;
      return {
        selector: labelSelector,
        locator: {
          strategy: 'role',
          value: labelSelector,
          generatedBy: 'context',
          confidence: 0.78,
          matchedCandidateId: candidate.candidateId,
          resolutionMode: 'label-fallback',
        },
      };
    }

    return {};
  }

  private buildResponse(
    verb: string,
    rawField: string,
    value: string,
    selector: string,
    locator: Record<string, unknown> | undefined,
    parserMetadata: Record<string, unknown>
  ) {
    return {
      success: true,
      commands: [
        {
          tool: 'fill',
          params: {
            selector,
            value,
          },
          description: `${verb}${rawField}`,
          locator,
        },
      ],
      explanation: `将${verb}${rawField}`,
      parserMetadata,
    };
  }

  private toParsedCandidate(candidate: BrowserCommandCandidate): ParsedFieldFillCandidate {
    return {
      candidateId: candidate.candidateId,
      kind: candidate.kind === 'field' ? 'field' : 'input',
      label: candidate.label,
      summary: candidate.summary,
      field: candidate.field,
      region: candidate.region?.name,
      text: candidate.text,
      elementId: candidate.elementId,
      dataTestId: candidate.dataTestId,
      preferredLocator: candidate.preferredLocator,
    };
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
