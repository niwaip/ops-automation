import { Injectable } from '@nestjs/common';
import type { RecorderDebugObservation } from '../execute/recorder-debug.types';

type RecorderReuseEligibility = 'fresh' | 'stale' | 'reobserve-required';

interface RecorderSnapshotReuseAssessment {
  reuseEligibility: RecorderReuseEligibility;
  staleReason?: string;
}

interface RecorderSnapshotReuseInput {
  previousObservation?: RecorderDebugObservation;
  currentObservation: Pick<RecorderDebugObservation, 'currentPageUrl' | 'title'>;
  snapshotContentHash?: string;
  observationFingerprint?: string;
  hasSnapshotNodes: boolean;
}

@Injectable()
export class RecorderSnapshotReuseService {
  assessReuse(input: RecorderSnapshotReuseInput): RecorderSnapshotReuseAssessment {
    if (!input.hasSnapshotNodes || !input.snapshotContentHash) {
      return {
        reuseEligibility: 'reobserve-required',
        staleReason: '缺少可复用快照结构，下一轮应重新 observe。',
      };
    }

    const previous = input.previousObservation;
    if (!previous) {
      return { reuseEligibility: 'fresh' };
    }

    const previousUrl = this.pickString(previous.currentPageUrl, previous.page?.url);
    const currentUrl = this.pickString(input.currentObservation.currentPageUrl);
    if (previousUrl && currentUrl && previousUrl !== currentUrl) {
      return {
        reuseEligibility: 'stale',
        staleReason: '页面 URL 已变化，旧 observation 不能直接复用。',
      };
    }

    const previousTitle = this.pickString(previous.title, previous.page?.title);
    const currentTitle = this.pickString(input.currentObservation.title);
    if (previousTitle && currentTitle && previousTitle !== currentTitle) {
      return {
        reuseEligibility: 'stale',
        staleReason: '页面标题已变化，旧 observation 不能直接复用。',
      };
    }

    const previousHash = this.pickString(previous.snapshotContentHash, previous.page?.snapshotContentHash);
    const previousFingerprint = this.pickString(
      previous.observationFingerprint,
      previous.page?.observationFingerprint
    );
    const currentFingerprint = this.pickString(input.observationFingerprint);

    if (previousHash && previousHash === input.snapshotContentHash) {
      return { reuseEligibility: 'fresh' };
    }

    if (previousFingerprint && currentFingerprint && previousFingerprint === currentFingerprint) {
      return { reuseEligibility: 'fresh' };
    }

    if (previousHash && previousHash !== input.snapshotContentHash) {
      if (previousFingerprint && currentFingerprint && previousFingerprint !== currentFingerprint) {
        return {
          reuseEligibility: 'reobserve-required',
          staleReason: '页面结构和语义指纹都已变化，应重新 observe 后再复用旧目标。',
        };
      }

      return {
        reuseEligibility: 'stale',
        staleReason: '页面结构快照已变化，复用旧 ref 前应重新确认目标。',
      };
    }

    if (previousFingerprint && currentFingerprint && previousFingerprint !== currentFingerprint) {
      return {
        reuseEligibility: 'reobserve-required',
        staleReason: '页面语义指纹已变化，应重新 observe 后再复用旧目标。',
      };
    }

    return { reuseEligibility: 'fresh' };
  }

  private pickString(...values: Array<string | undefined>): string | undefined {
    return values.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim();
  }
}
