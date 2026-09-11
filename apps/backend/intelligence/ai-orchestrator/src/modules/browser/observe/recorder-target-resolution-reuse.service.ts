import { Injectable } from '@nestjs/common';
import type { BrowserCommand, BrowserCommandCandidate, ParseBrowserCommandResponse } from '../intent';
import type { RecorderDebugObservation } from '../execute/recorder-debug.types';

type RecorderReuseEligibility = 'fresh' | 'stale' | 'reobserve-required';

export interface CachedIntentResolution {
  structuralKey: string;
  normalizedIntent: string;
  commands: BrowserCommand[];
  explanation: string;
  targetRef?: string;
  targetSelector?: string;
  hitCount: number;
  lastUsedAt: number;
}

@Injectable()
export class RecorderTargetResolutionReuseService {
  private readonly intentCache = new Map<string, CachedIntentResolution>();
  mergeReusableCandidates(input: {
    previousObservation?: RecorderDebugObservation;
    currentObservation: RecorderDebugObservation;
    currentSnapshotContentHash?: string;
    reuseEligibility: RecorderReuseEligibility;
  }): Pick<RecorderDebugObservation, 'candidates' | 'candidateTrace'> {
    const currentCandidates = input.currentObservation.candidates || [];
    const currentTrace = input.currentObservation.candidateTrace || [];
    const previousCandidates = input.previousObservation?.candidates || [];

    if (!previousCandidates.length || input.reuseEligibility === 'reobserve-required') {
      return {
        candidates: currentCandidates,
        candidateTrace: currentTrace,
      };
    }

    const currentUrl = this.pickString(
      input.currentObservation.currentPageUrl,
      input.currentObservation.page?.url
    );
    const previousUrl = this.pickString(
      input.previousObservation?.currentPageUrl,
      input.previousObservation?.page?.url
    );
    if (currentUrl && previousUrl && currentUrl !== previousUrl) {
      return {
        candidates: currentCandidates,
        candidateTrace: currentTrace,
      };
    }

    const previousSnapshotHash = this.pickString(
      input.previousObservation?.snapshotContentHash,
      input.previousObservation?.page?.snapshotContentHash
    );
    const canReuseRefLocator = Boolean(
      previousSnapshotHash &&
        input.currentSnapshotContentHash &&
        previousSnapshotHash === input.currentSnapshotContentHash
    );
    const reusableCandidates = previousCandidates.filter((candidate) =>
      this.isReusableCandidate(candidate, {
        reuseEligibility: input.reuseEligibility,
        canReuseRefLocator,
      })
    );

    if (!reusableCandidates.length || !this.shouldAugmentCandidates(currentCandidates, reusableCandidates)) {
      return {
        candidates: currentCandidates,
        candidateTrace: currentTrace,
      };
    }

    const seenSignatures = new Set(currentCandidates.map((candidate) => this.buildCandidateSignature(candidate)));
    const addedCandidates: BrowserCommandCandidate[] = [];

    for (const candidate of reusableCandidates) {
      const signature = this.buildCandidateSignature(candidate);
      if (!signature || seenSignatures.has(signature)) {
        continue;
      }
      seenSignatures.add(signature);
      addedCandidates.push(candidate);
    }

    if (!addedCandidates.length) {
      return {
        candidates: currentCandidates,
        candidateTrace: currentTrace,
      };
    }

    return {
      candidates: [...currentCandidates, ...addedCandidates],
      candidateTrace: [
        ...currentTrace,
        ...addedCandidates.map((candidate) => ({
          candidateId: candidate.candidateId,
          source: 'reuse',
          kind: candidate.kind,
          reasons: ['stable_target_reuse'],
          summary: candidate.summary,
        })),
      ],
    };
  }

  private shouldAugmentCandidates(
    currentCandidates: BrowserCommandCandidate[],
    reusableCandidates: BrowserCommandCandidate[]
  ): boolean {
    if (!currentCandidates.length) {
      return true;
    }

    const currentActionCount = this.countResolverReadyCandidates(currentCandidates, ['action']);
    const reusableActionCount = this.countResolverReadyCandidates(reusableCandidates, ['action']);
    if (reusableActionCount > currentActionCount) {
      return true;
    }

    const currentFieldCount = this.countResolverReadyCandidates(currentCandidates, ['field', 'input']);
    const reusableFieldCount = this.countResolverReadyCandidates(reusableCandidates, ['field', 'input']);
    return reusableFieldCount > currentFieldCount;
  }

  private countResolverReadyCandidates(
    candidates: BrowserCommandCandidate[],
    kinds: Array<BrowserCommandCandidate['kind']>
  ): number {
    return candidates.filter((candidate) => kinds.includes(candidate.kind) && this.hasLocator(candidate)).length;
  }

  private isReusableCandidate(
    candidate: BrowserCommandCandidate,
    options: {
      reuseEligibility: RecorderReuseEligibility;
      canReuseRefLocator: boolean;
    }
  ): boolean {
    const locator = candidate.preferredLocator;
    if (locator?.type === 'ref') {
      return options.reuseEligibility === 'fresh' && options.canReuseRefLocator;
    }
    if (locator?.value) {
      return true;
    }
    if (candidate.ref) {
      return options.reuseEligibility === 'fresh' && options.canReuseRefLocator;
    }
    return false;
  }

  private hasLocator(candidate: BrowserCommandCandidate): boolean {
    return Boolean(candidate.preferredLocator?.value || candidate.ref);
  }

  private buildCandidateSignature(candidate: BrowserCommandCandidate): string {
    const locator = candidate.preferredLocator
      ? `${candidate.preferredLocator.type}:${candidate.preferredLocator.value}`
      : candidate.ref
        ? `ref:${candidate.ref}`
        : '';
    return [
      candidate.kind,
      candidate.action || '',
      candidate.field || '',
      candidate.stableName || '',
      candidate.entityType || '',
      candidate.entityId || '',
      candidate.row?.index ?? '',
      candidate.row?.key || '',
      candidate.region?.name || '',
      candidate.semanticPath?.join('/') || '',
      locator,
      this.normalizeText(candidate.label),
      this.normalizeText(candidate.text),
    ].join('|');
  }

  private normalizeText(value?: string): string {
    if (typeof value !== 'string') {
      return '';
    }
    return value.trim().toLowerCase();
  }

  private pickString(...values: Array<string | undefined>): string | undefined {
    return values.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim();
  }

  tryResolveFromIntentCache(input: {
    message: string;
    observation: RecorderDebugObservation;
  }): ParseBrowserCommandResponse | null {
    const normalizedIntent = this.normalizeText(input.message);
    if (!normalizedIntent) {
      return null;
    }

    const structuralKey =
      input.observation.structuralHash ||
      this.pickString(input.observation.currentPageUrl, input.observation.page?.url) ||
      'unknown';
    const cacheKey = `${structuralKey}::${normalizedIntent}`;
    const entry = this.intentCache.get(cacheKey);
    if (!entry) {
      return null;
    }

    // Verify locator actionability/presence in current observation
    if (entry.targetRef || entry.targetSelector) {
      const candidates = input.observation.candidates || [];
      const hasTargetMatch = candidates.some((c) => {
        if (
          entry.targetRef &&
          (c.ref === entry.targetRef || c.preferredLocator?.value === entry.targetRef)
        ) {
          return true;
        }
        if (
          entry.targetSelector &&
          (c.preferredLocator?.value === entry.targetSelector ||
            c.stableName === entry.targetSelector)
        ) {
          return true;
        }
        return false;
      });

      const hasDirectElementMatch =
        (input.observation.buttons || []).some(
          (b) =>
            b.ref === entry.targetRef ||
            b.dataTestId === entry.targetSelector ||
            b.text === entry.targetSelector
        ) ||
        (input.observation.inputs || []).some(
          (inp) =>
            inp.ref === entry.targetRef ||
            inp.name === entry.targetSelector ||
            inp.id === entry.targetSelector ||
            inp.placeholder === entry.targetSelector
        );

      if (!hasTargetMatch && !hasDirectElementMatch) {
        this.intentCache.delete(cacheKey);
        return null;
      }
    }

    entry.hitCount++;
    entry.lastUsedAt = Date.now();
    return {
      success: true,
      commands: entry.commands,
      explanation: entry.explanation
        ? `[快速意图复用] ${entry.explanation}`
        : '从当前页面结构验证缓存复用动作',
      parserMetadata: {
        parserSource: 'intent-cache',
        structuralKey,
        hitCount: entry.hitCount,
      },
    };
  }

  recordSuccessfulIntentExecution(input: {
    message: string;
    observation: RecorderDebugObservation;
    commands: BrowserCommand[];
    explanation?: string;
  }): void {
    if (!input.commands?.length) {
      return;
    }
    const normalizedIntent = this.normalizeText(input.message);
    if (!normalizedIntent) {
      return;
    }

    const firstCommand = input.commands[0];
    const targetRef =
      typeof firstCommand?.params?.ref === 'string' ? firstCommand.params.ref : undefined;
    const targetSelector =
      typeof firstCommand?.params?.selector === 'string'
        ? firstCommand.params.selector
        : typeof firstCommand?.params?.target === 'string'
          ? firstCommand.params.target
          : undefined;

    const structuralKey =
      input.observation.structuralHash ||
      this.pickString(input.observation.currentPageUrl, input.observation.page?.url) ||
      'unknown';
    const cacheKey = `${structuralKey}::${normalizedIntent}`;

    if (this.intentCache.size >= 200) {
      const sorted = [...this.intentCache.entries()].sort(
        (a, b) => a[1].lastUsedAt - b[1].lastUsedAt
      );
      for (let i = 0; i < 40 && i < sorted.length; i++) {
        const keyToDelete = sorted[i]?.[0];
        if (keyToDelete) {
          this.intentCache.delete(keyToDelete);
        }
      }
    }

    this.intentCache.set(cacheKey, {
      structuralKey,
      normalizedIntent,
      commands: input.commands,
      explanation: input.explanation || '已验证动作执行',
      targetRef,
      targetSelector,
      hitCount: 1,
      lastUsedAt: Date.now(),
    });
  }

  invalidateIntentCache(input?: { structuralKey?: string; message?: string }): void {
    if (!input) {
      this.intentCache.clear();
      return;
    }
    if (input.structuralKey && input.message) {
      const key = `${input.structuralKey}::${this.normalizeText(input.message)}`;
      this.intentCache.delete(key);
      return;
    }
    if (input.structuralKey) {
      for (const [k, v] of this.intentCache.entries()) {
        if (v.structuralKey === input.structuralKey) {
          this.intentCache.delete(k);
        }
      }
    }
  }
}
