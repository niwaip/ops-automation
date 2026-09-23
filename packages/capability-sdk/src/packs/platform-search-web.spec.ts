import {
  assertCapabilityPackManifest,
  digestCapabilityContract,
  validateCapabilityPackManifest,
} from '../manifest';
import { runCapabilityFixtures } from '../test-kit';
import {
  platformSearchWebCapabilityPack,
  platformSearchWebContract,
} from './platform-search-web';

describe('platform.search.web capability pack', () => {
  it('is a fully certified production capability pack with zero validation errors', () => {
    const result = validateCapabilityPackManifest(platformSearchWebCapabilityPack);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(() => assertCapabilityPackManifest(platformSearchWebCapabilityPack)).not.toThrow();
  });

  it('maintains strict contract digest integrity', () => {
    const computedDigest = digestCapabilityContract(platformSearchWebContract);
    expect(platformSearchWebCapabilityPack.metadata.contractDigest).toBe(computedDigest);
  });

  it('passes schema fixture execution for input and output', () => {
    const fixtures = [
      {
        name: 'valid-search-request',
        input: {
          query: '2026 年最新大模型架构',
          maxResults: 5,
          topic: 'general',
          searchDepth: 'basic',
        },
        output: {
          query: '2026 年最新大模型架构',
          provider: 'tavily',
          results: [
            {
              title: 'AI 架构演进',
              url: 'https://example.com/ai-arch',
              snippet: '大模型系统架构深度解析',
              score: 0.98,
            },
          ],
          resultCount: 1,
          searchedAt: '2026-09-23T12:00:00.000Z',
          warnings: [],
        },
        expectInputValid: true,
        expectOutputValid: true,
      },
      {
        name: 'invalid-missing-query',
        input: {
          maxResults: 5,
        },
        expectInputValid: false,
      },
      {
        name: 'invalid-out-of-range-max-results',
        input: {
          query: 'test',
          maxResults: 999, // maximum is 10
        },
        expectInputValid: false,
      },
    ];

    const { failures } = runCapabilityFixtures(platformSearchWebCapabilityPack, fixtures);
    expect(failures).toEqual([]);
  });

  it('fulfills governance and observability requirements', () => {
    expect(platformSearchWebCapabilityPack.governance.riskLevel).toBe('L0');
    expect(platformSearchWebCapabilityPack.governance.sideEffectClass).toBe('read');
    expect(platformSearchWebCapabilityPack.governance.idempotency).toBe('naturally_idempotent');
    expect(platformSearchWebCapabilityPack.runtime.probe).toBe('/health');
    expect(platformSearchWebCapabilityPack.governance.runbook).toContain('platform.search.web');
    expect(platformSearchWebCapabilityPack.routing.aliases.length).toBeGreaterThan(10);
  });
});
