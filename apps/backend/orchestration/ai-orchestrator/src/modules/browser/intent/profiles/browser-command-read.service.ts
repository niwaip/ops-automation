import { Injectable } from '@nestjs/common';
import { buildReadProfile, canonicalizeReadText } from './browser-command-read.profile';
import type {
  ReadCommandHelpers,
  ReadParseContext,
  ReadParseResult,
  ReadProfileEntry,
} from './browser-command-read.types';
import type {
  BrowserCommandCandidate,
  BrowserCommandCandidateLocator,
} from '../browser-command.types';
import type { RuntimeSemanticRule } from '../../../../client/browser-semantics.client';

interface ParsedReadCandidate {
  candidateId: string;
  kind: 'field' | 'region' | 'input';
  label?: string;
  summary?: string;
  field?: string;
  region?: string;
  text?: string;
  role?: string;
  elementId?: string;
  dataTestId?: string;
  preferredLocator?: BrowserCommandCandidateLocator;
}

@Injectable()
export class BrowserCommandReadService {
  parseReadCommandDetailed(
    input: string,
    _commandContext: ReadParseContext['commandContext'],
    helpers: ReadCommandHelpers,
    options?: { runtimeRules?: RuntimeSemanticRule[] }
  ): ReadParseResult {
    const normalizedInput = input.replace(/\s+/g, ' ').trim();
    if (!normalizedInput) {
      return { status: 'no_match' };
    }

    const candidates = helpers
      .getAvailableCandidates()
      .filter(
        (candidate): candidate is BrowserCommandCandidate & { kind: 'field' | 'region' | 'input' } =>
          candidate.kind === 'field' || candidate.kind === 'region' || candidate.kind === 'input'
      );
    if (!candidates.length) {
      return { status: 'no_match' };
    }

    const profile = buildReadProfile(options?.runtimeRules || []);
    const readIntent = this.extractReadIntent(normalizedInput, profile.intentTerms);
    if (!readIntent) {
      return { status: 'no_match' };
    }

    const parsedCandidates = candidates.map((candidate) => this.toParsedCandidate(candidate));

    const matchedEntry = this.matchReadEntry(readIntent.requestedTarget, profile.entries);
    if (matchedEntry) {
      const resolved = this.resolveProfileCandidate(matchedEntry, parsedCandidates, readIntent.requestedTarget);
      if (resolved) {
        return {
          status: 'success',
          response: this.buildResponse(
            readIntent.verb,
            readIntent.rawTarget,
            resolved.selector,
            resolved.locator,
            resolved.candidate.kind === 'input' ? 'value' : undefined,
            {
              read: {
                status: 'success',
                reason: resolved.reason,
                resolvedTarget: readIntent.requestedTarget,
                resolvedField: resolved.candidate.field,
                resolvedRegion: resolved.candidate.region,
                selector: resolved.selector,
                usedRuntimeProfile: true,
                matchedRuntimeRuleIds: matchedEntry.ruleId ? [matchedEntry.ruleId] : [],
              },
            }
          ),
        };
      }
    }

    const resolvedDefault = this.resolveDefaultCandidate(parsedCandidates, readIntent.requestedTarget);
    if (!resolvedDefault) {
      return { status: 'no_match' };
    }

    return {
      status: 'success',
      response: this.buildResponse(
        readIntent.verb,
        readIntent.rawTarget,
        resolvedDefault.selector,
        resolvedDefault.locator,
        resolvedDefault.candidate.kind === 'input' ? 'value' : undefined,
        {
          read: {
            status: 'success',
            reason: 'read-default-candidate',
            resolvedTarget: readIntent.requestedTarget,
            resolvedField: resolvedDefault.candidate.field,
            resolvedRegion: resolvedDefault.candidate.region,
            selector: resolvedDefault.selector,
            usedRuntimeProfile: false,
            matchedRuntimeRuleIds: [],
          },
        }
      ),
    };
  }

  private extractReadIntent(
    input: string,
    intentTerms: string[]
  ): { verb: string; rawTarget: string; requestedTarget: string } | null {
    const normalizedInput = input.replace(/\s+/g, ' ').trim();
    const sortedIntentTerms = [...intentTerms].sort((left, right) => right.length - left.length);

    for (const intentTerm of sortedIntentTerms) {
      if (!intentTerm) {
        continue;
      }

      const regex = new RegExp(`^${this.escapeRegex(intentTerm)}\\s*(.+)$`, 'i');
      const match = normalizedInput.match(regex);
      if (!match?.[1]) {
        continue;
      }

      const rawTarget = match[1].trim();
      const requestedTarget = canonicalizeReadText(rawTarget);
      if (!requestedTarget) {
        continue;
      }

      return {
        verb: intentTerm,
        rawTarget,
        requestedTarget,
      };
    }

    return null;
  }

  private matchReadEntry(target: string, entries: ReadProfileEntry[]): ReadProfileEntry | null {
    const normalizedTarget = this.normalizeMatchText(target);
    if (!normalizedTarget) {
      return null;
    }

    const scoredEntries = entries
      .map((entry) => ({
        entry,
        score: Math.max(
          ...entry.targetTerms.map((term) => {
            const normalizedTerm = this.normalizeMatchText(term);
            if (!normalizedTerm) {
              return 0;
            }
            if (normalizedTerm === normalizedTarget) {
              return 300;
            }
            if (normalizedTarget.includes(normalizedTerm) || normalizedTerm.includes(normalizedTarget)) {
              return 150;
            }
            return 0;
          })
        ),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score);

    return scoredEntries[0]?.entry || null;
  }

  private resolveProfileCandidate(
    entry: ReadProfileEntry,
    candidates: ParsedReadCandidate[],
    requestedTarget: string
  ): {
    candidate: ParsedReadCandidate;
    selector: string;
    locator?: Record<string, unknown>;
    reason: string;
  } | null {
    const scored = this.dedupeScoredCandidates(
      candidates
      .map((candidate) => ({
        candidate,
        ...this.buildLocatorFromCandidate(candidate),
        score: this.scoreProfileCandidate(candidate, entry, requestedTarget),
      }))
      .filter((item) => item.score > 0 && Boolean(item.selector))
    ).sort((left, right) => right.score - left.score);

    const best = scored[0];
    const nextScore = scored[1]?.score || 0;
    if (!best?.selector || best.score < 100 || (scored.length > 1 && best.score - nextScore < 15)) {
      return null;
    }

    return {
      candidate: best.candidate,
      selector: best.selector,
      locator: best.locator,
      reason: this.resolveProfileReason(entry),
    };
  }

  private resolveDefaultCandidate(
    candidates: ParsedReadCandidate[],
    requestedTarget: string
  ): { candidate: ParsedReadCandidate; selector: string; locator?: Record<string, unknown> } | null {
    const scored = this.dedupeScoredCandidates(
      candidates
      .map((candidate) => ({
        candidate,
        ...this.buildLocatorFromCandidate(candidate),
        score: this.scoreDefaultCandidate(candidate, requestedTarget),
      }))
      .filter((item) => item.score > 0 && Boolean(item.selector))
    ).sort((left, right) => right.score - left.score);

    const best = scored[0];
    const nextScore = scored[1]?.score || 0;
    if (!best?.selector || best.score < 90 || (scored.length > 1 && best.score - nextScore < 15)) {
      return null;
    }

    return {
      candidate: best.candidate,
      selector: best.selector,
      locator: best.locator,
    };
  }

  private resolveProfileReason(entry: ReadProfileEntry): string {
    if (entry.fieldTerms.length > 0 && entry.regionTerms.length > 0) {
      return 'read-runtime-field-region';
    }
    if (entry.fieldTerms.length > 0) {
      return 'read-runtime-field';
    }
    if (entry.regionTerms.length > 0) {
      return 'read-runtime-region';
    }
    return 'read-runtime-target';
  }

  private scoreProfileCandidate(
    candidate: ParsedReadCandidate,
    entry: ReadProfileEntry,
    requestedTarget: string
  ): number {
    let score = 0;

    const targetToken = this.normalizeMatchText(requestedTarget);
    if (targetToken) {
      const tokens = this.getCandidateTokens(candidate);
      for (const token of tokens) {
        if (token === targetToken) {
          score = Math.max(score, 120);
        } else if (token.includes(targetToken) || targetToken.includes(token)) {
          score = Math.max(score, 90);
        }
      }
    }

    for (const term of entry.fieldTerms) {
      const normalizedTerm = this.normalizeMatchText(term);
      const candidateField = this.normalizeMatchText(candidate.field || '');
      if (candidateField && candidateField === normalizedTerm) {
        score += 220;
        break;
      }
      if (candidateField && (candidateField.includes(normalizedTerm) || normalizedTerm.includes(candidateField))) {
        score += 140;
        break;
      }
    }

    for (const term of entry.regionTerms) {
      const normalizedTerm = this.normalizeMatchText(term);
      const candidateRegion = this.normalizeMatchText(candidate.region || '');
      if (candidateRegion && candidateRegion === normalizedTerm) {
        score += 90;
        break;
      }
      if (
        candidateRegion &&
        (candidateRegion.includes(normalizedTerm) || normalizedTerm.includes(candidateRegion))
      ) {
        score += 55;
        break;
      }
    }

    if (candidate.kind === 'field') {
      score += 20;
    }
    if (candidate.preferredLocator?.type === 'testid' || candidate.preferredLocator?.type === 'css') {
      score += 10;
    }

    return score;
  }

  private scoreDefaultCandidate(candidate: ParsedReadCandidate, requestedTarget: string): number {
    const normalizedRequestedTarget = this.normalizeMatchText(requestedTarget);
    if (!normalizedRequestedTarget) {
      return 0;
    }

    let score = 0;
    for (const token of this.getCandidateTokens(candidate)) {
      if (token === normalizedRequestedTarget) {
        score = Math.max(score, 140);
      } else if (token.includes(normalizedRequestedTarget)) {
        score = Math.max(score, 115);
      } else if (normalizedRequestedTarget.includes(token) && token.length >= 3) {
        score = Math.max(score, 95);
      }
    }

    if (candidate.kind === 'field') {
      score += 20;
    }
    if (candidate.preferredLocator?.type === 'testid' || candidate.preferredLocator?.type === 'css') {
      score += 10;
    }

    return score;
  }

  private getCandidateTokens(candidate: ParsedReadCandidate): string[] {
    return [
      candidate.field,
      candidate.region,
      candidate.label,
      candidate.text,
      candidate.summary,
    ]
      .map((value) => this.normalizeCandidateText(value))
      .filter((value): value is string => Boolean(value));
  }

  private normalizeMatchText(value: string): string {
    return this.normalizeCandidateText(canonicalizeReadText(value));
  }

  private dedupeScoredCandidates(
    items: Array<{
      candidate: ParsedReadCandidate;
      selector?: string;
      locator?: Record<string, unknown>;
      score: number;
    }>
  ) {
    return [
      ...items
        .reduce((map, item) => {
          const key = item.selector || item.candidate.candidateId;
          const existing = map.get(key);
          if (!existing || item.score > existing.score) {
            map.set(key, item);
          }
          return map;
        }, new Map<string, (typeof items)[number]>())
        .values(),
    ];
  }

  private buildLocatorFromCandidate(candidate: ParsedReadCandidate): {
    selector?: string;
    locator?: Record<string, unknown>;
  } {
    const roleSelector = this.buildRoleSelector(candidate);
    if (roleSelector) {
      return {
        selector: roleSelector,
        locator: {
          strategy: 'role',
          value: roleSelector,
          generatedBy: 'context',
          confidence: candidate.role ? 0.9 : 0.78,
        },
      };
    }

    if (candidate.preferredLocator?.type === 'css' || candidate.preferredLocator?.type === 'text') {
      return {
        selector: candidate.preferredLocator.value,
        locator: {
          strategy: candidate.preferredLocator.type,
          value: candidate.preferredLocator.value,
          generatedBy: 'context',
          confidence: 0.9,
        },
      };
    }
    if (candidate.preferredLocator?.type === 'testid') {
      return {
        selector: `[data-testid="${candidate.preferredLocator.value}"]`,
        locator: {
          strategy: 'css',
          value: `[data-testid="${candidate.preferredLocator.value}"]`,
          generatedBy: 'context',
          confidence: 0.9,
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
          confidence: 0.9,
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
          confidence: 0.9,
        },
      };
    }
    if (candidate.region) {
      return {
        selector: `[data-ai-region="${candidate.region}"]`,
        locator: {
          strategy: 'css',
          value: `[data-ai-region="${candidate.region}"]`,
          generatedBy: 'context',
          confidence: 0.9,
        },
      };
    }
    return {};
  }

  private buildResponse(
    verb: string,
    rawTarget: string,
    selector: string,
    locator: Record<string, unknown> | undefined,
    method: 'value' | undefined,
    parserMetadata: Record<string, unknown>
  ) {
    return {
      success: true,
      commands: [
        {
          tool: 'get_text',
          params: {
            selector,
            max_length: 1000,
            ...(method ? { method } : {}),
          },
          description: `${verb}${rawTarget}`,
          locator,
        },
      ],
      explanation: `将${verb}${rawTarget}`,
      parserMetadata,
    };
  }

  private toParsedCandidate(candidate: BrowserCommandCandidate): ParsedReadCandidate {
    return {
      candidateId: candidate.candidateId,
      kind:
        candidate.kind === 'field' ? 'field' : candidate.kind === 'input' ? 'input' : 'region',
      label: candidate.label,
      summary: candidate.summary,
      field: candidate.field,
      region: candidate.region?.name,
      text: candidate.text,
      role: candidate.role,
      elementId: candidate.elementId,
      dataTestId: candidate.dataTestId,
      preferredLocator: candidate.preferredLocator,
    };
  }

  private buildRoleSelector(candidate: ParsedReadCandidate): string | undefined {
    if (!candidate.label) {
      return undefined;
    }

    const role = candidate.role || (candidate.kind === 'input' ? 'textbox' : undefined);
    if (!role) {
      return undefined;
    }

    return `role=${role}[name="${candidate.label.replace(/"/g, '\\"')}"]`;
  }

  private normalizeCandidateText(value: unknown): string {
    if (typeof value !== 'string') {
      return '';
    }

    return value
      .toLowerCase()
      .replace(/\(.*?\)/g, '')
      .replace(/案件粗利率|粗利率|毛利率|gross[\s_-]*margin/g, 'grossmargin')
      .replace(/[的"'\s:=|]/g, '')
      .trim();
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
