import { Injectable } from '@nestjs/common';
import type { BrowserCommandCandidate } from '../intent';
import type { RecorderDebugObservation } from '../execute/recorder-debug.types';

type RecorderReuseEligibility = 'fresh' | 'stale' | 'reobserve-required';

@Injectable()
export class RecorderTargetResolutionReuseService {
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
}
