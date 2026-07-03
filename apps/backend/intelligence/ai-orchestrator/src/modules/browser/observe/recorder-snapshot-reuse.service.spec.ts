jest.mock(
  '@nestjs/common',
  () => ({
    Injectable: () => () => undefined,
  }),
  { virtual: true }
);

import { RecorderSnapshotReuseService } from './recorder-snapshot-reuse.service';

describe('RecorderSnapshotReuseService', () => {
  const service = new RecorderSnapshotReuseService();

  it('returns reobserve-required when snapshot structure is missing', () => {
    expect(
      service.assessReuse({
        currentObservation: {
          currentPageUrl: 'https://example.com/list',
          title: '列表页',
        },
        hasSnapshotNodes: false,
      })
    ).toEqual({
      reuseEligibility: 'reobserve-required',
      staleReason: '缺少可复用快照结构，下一轮应重新 observe。',
    });
  });

  it('returns fresh for the first captured observation with snapshot identity', () => {
    expect(
      service.assessReuse({
        currentObservation: {
          currentPageUrl: 'https://example.com/list',
          title: '列表页',
        },
        snapshotContentHash: 'hash-1',
        observationFingerprint: 'fingerprint-1',
        hasSnapshotNodes: true,
      })
    ).toEqual({
      reuseEligibility: 'fresh',
    });
  });

  it('returns stale when page url changes', () => {
    expect(
      service.assessReuse({
        previousObservation: {
          currentPageUrl: 'https://example.com/list',
          title: '列表页',
          text: '',
          inputs: [],
          buttons: [],
          headings: [],
          links: [],
          suggestedParameters: [],
          snapshotContentHash: 'hash-1',
          observationFingerprint: 'fingerprint-1',
        },
        currentObservation: {
          currentPageUrl: 'https://example.com/detail',
          title: '列表页',
        },
        snapshotContentHash: 'hash-2',
        observationFingerprint: 'fingerprint-2',
        hasSnapshotNodes: true,
      })
    ).toEqual({
      reuseEligibility: 'stale',
      staleReason: '页面 URL 已变化，旧 observation 不能直接复用。',
    });
  });

  it('keeps reuse fresh when semantic fingerprint remains stable', () => {
    expect(
      service.assessReuse({
        previousObservation: {
          currentPageUrl: 'https://example.com/list',
          title: '列表页',
          text: '',
          inputs: [],
          buttons: [],
          headings: [],
          links: [],
          suggestedParameters: [],
          snapshotContentHash: 'hash-1',
          observationFingerprint: 'fingerprint-1',
        },
        currentObservation: {
          currentPageUrl: 'https://example.com/list',
          title: '列表页',
        },
        snapshotContentHash: 'hash-2',
        observationFingerprint: 'fingerprint-1',
        hasSnapshotNodes: true,
      })
    ).toEqual({
      reuseEligibility: 'fresh',
    });
  });

  it('requires reobserve when both snapshot hash and semantic fingerprint drift', () => {
    expect(
      service.assessReuse({
        previousObservation: {
          currentPageUrl: 'https://example.com/list',
          title: '列表页',
          text: '',
          inputs: [],
          buttons: [],
          headings: [],
          links: [],
          suggestedParameters: [],
          snapshotContentHash: 'hash-1',
          observationFingerprint: 'fingerprint-1',
        },
        currentObservation: {
          currentPageUrl: 'https://example.com/list',
          title: '列表页',
        },
        snapshotContentHash: 'hash-2',
        observationFingerprint: 'fingerprint-2',
        hasSnapshotNodes: true,
      })
    ).toEqual({
      reuseEligibility: 'reobserve-required',
      staleReason: '页面结构和语义指纹都已变化，应重新 observe 后再复用旧目标。',
    });
  });
});
